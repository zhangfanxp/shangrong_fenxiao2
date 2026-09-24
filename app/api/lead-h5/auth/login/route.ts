import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createLeadH5Session, leadH5SessionCookie } from "@/lib/lead-h5-auth";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";
import { hasRolePlatformAccess } from "@/lib/role-permissions";

const input = z.object({ username: z.string().trim().min(1, "请输入账号"), password: z.string().min(1, "请输入密码") });

export async function POST(request: Request) {
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0].message }, { status: 400 });
  const user = await db.user.findUnique({ where: { username: parsed.data.username }, include: { role: true } });
  if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
    await writeOperationLog({ userId: user?.id, username: parsed.data.username, client: "运营移动端", page: "登录页面", action: "登录", result: "失败", detail: "账号或密码错误", request }).catch(() => undefined);
    return NextResponse.json({ message: "账号或密码错误，请重新输入" }, { status: 401 });
  }
  if (user.status !== "ENABLED" || user.role.status !== "ENABLED") {
    await writeOperationLog({ userId: user.id, username: user.username, client: "运营移动端", page: "登录页面", action: "登录", result: "失败", detail: "账号或角色已禁用", request }).catch(() => undefined);
    return NextResponse.json({ message: "当前账号已被禁用，请联系平台管理员" }, { status: 403 });
  }
  const permissions = Array.isArray(user.role.permissions) ? user.role.permissions.filter((item): item is string => typeof item === "string") : [];
  if (!hasRolePlatformAccess(permissions, "lead-h5")) {
    await writeOperationLog({ userId: user.id, username: user.username, client: "运营移动端", page: "登录页面", action: "登录", result: "失败", detail: "所属角色未配置运营H5移动端权限", request }).catch(() => undefined);
    return NextResponse.json({ message: "当前账号暂无运营H5移动端使用权限" }, { status: 403 });
  }
  const token = await createLeadH5Session(user.id);
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await writeOperationLog({ userId: user.id, username: user.username, client: "运营移动端", page: "登录页面", action: "登录", result: "成功", detail: "登录运营H5移动端", request }).catch(() => undefined);
  const response = NextResponse.json({ redirectTo: "/lead_h5" });
  response.cookies.set(leadH5SessionCookie.name, token, leadH5SessionCookie.options);
  return response;
}

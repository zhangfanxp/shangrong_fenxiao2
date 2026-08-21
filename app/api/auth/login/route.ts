import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession, sessionCookie } from "@/lib/auth";
import { firstAccessiblePath } from "@/lib/access-control";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";
import { getPlatformConfig, userHasAnyLoginTag } from "@/lib/platform-config";

const input = z.object({ username: z.string().trim().min(1, "请输入账号"), password: z.string().min(1, "请输入密码") });

export async function POST(request: Request) {
  const body = input.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ message: body.error.issues[0].message }, { status: 400 });
  const user = await db.user.findUnique({ where: { username: body.data.username }, include: { role: true } });
  if (!user || !(await bcrypt.compare(body.data.password, user.passwordHash))) {
    await writeOperationLog({ userId: user?.id, username: body.data.username, page: "登录页面", action: "登录", result: "失败", detail: "账号或密码错误", request }).catch(() => undefined);
    return NextResponse.json({ message: "账号或密码错误，请重新输入" }, { status: 401 });
  }
  if (user.status !== "ENABLED" || user.role.status !== "ENABLED") {
    await writeOperationLog({ userId: user.id, username: user.username, page: "登录页面", action: "登录", result: "失败", detail: "账号或角色已禁用", request }).catch(() => undefined);
    return NextResponse.json({ message: "该账号已被禁用，请联系平台管理员" }, { status: 403 });
  }
  const platform = await getPlatformConfig();
  const isSystemAdministrator = user.role.code === "SUPER_ADMIN" || user.role.name === "系统管理员" || user.role.name === "超级管理员";
  if (!isSystemAdministrator && !userHasAnyLoginTag(user.tags, platform.leadPcLoginTags)) {
    await writeOperationLog({ userId: user.id, username: user.username, page: "登录页面", action: "登录", result: "失败", detail: "用户标签不符合运营PC端登录要求", request }).catch(() => undefined);
    return NextResponse.json({ message: "当前账号不具备运营PC端登录权限，请联系平台管理员" }, { status: 403 });
  }
  const permissions = Array.isArray(user.role.permissions) ? user.role.permissions.filter((item): item is string => typeof item === "string") : [];
  const token = await createSession({ userId: user.id, username: user.username, realName: user.realName, role: user.role.code, permissions });
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await writeOperationLog({ userId: user.id, username: user.username, page: "登录页面", action: "登录", result: "成功", detail: "登录运营管理PC端", request }).catch(() => undefined);
  const response = NextResponse.json({ realName: user.realName, redirectTo: firstAccessiblePath(permissions) });
  response.cookies.set(sessionCookie.name, token, sessionCookie.options);
  return response;
}

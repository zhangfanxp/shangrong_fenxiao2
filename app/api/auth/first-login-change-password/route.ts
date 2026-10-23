import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession, sessionCookie } from "@/lib/auth";
import { firstAccessiblePath } from "@/lib/access-control";
import { db } from "@/lib/db";
import { firstLoginChangeCookie, getFirstLoginChangePayload } from "@/lib/first-login-change";
import { createLeadH5Session, leadH5SessionCookie } from "@/lib/lead-h5-auth";
import { writeOperationLog } from "@/lib/operation-log";
import { hasRolePlatformAccess } from "@/lib/role-permissions";
import { createStoreH5Session, storeH5SessionCookie } from "@/lib/store-h5-auth";

const input = z.object({
  oldPassword: z.string().min(1, "请输入当前密码"),
  newPassword: z.string().min(8, "新密码至少需要 8 位"),
}).refine(value => value.oldPassword !== value.newPassword, { path: ["newPassword"], message: "新密码不能与当前密码相同" });

export async function POST(request: Request) {
  const pending = await getFirstLoginChangePayload();
  if (!pending) return NextResponse.json({ message: "首次登录修改密码状态已过期，请重新登录" }, { status: 401 });
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0].message }, { status: 400 });

  const user = await db.user.findUnique({ where: { id: pending.userId }, include: { role: true } });
  if (!user || user.status !== "ENABLED" || user.role.status !== "ENABLED" || !user.mustChangePassword) {
    return NextResponse.json({ message: "当前账号不可用，请重新登录" }, { status: 403 });
  }
  if (!(await bcrypt.compare(parsed.data.oldPassword, user.passwordHash))) {
    return NextResponse.json({ message: "当前密码输入不正确" }, { status: 400 });
  }

  const permissions = Array.isArray(user.role.permissions) ? user.role.permissions.filter((item): item is string => typeof item === "string") : [];
  const platform = pending.channel === "lead_pc" ? "lead-pc" : pending.channel === "lead_h5" ? "lead-h5" : "store-h5";
  if (!hasRolePlatformAccess(permissions, platform)) {
    return NextResponse.json({ message: "账号角色已没有对应平台权限，请联系管理员" }, { status: 403 });
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  const updated = await db.user.updateMany({
    where: { id: user.id, passwordHash: user.passwordHash, status: "ENABLED", mustChangePassword: true },
    data: { passwordHash, mustChangePassword: false },
  });
  if (updated.count !== 1) return NextResponse.json({ message: "账号状态已变化，请重新登录后再试" }, { status: 409 });

  let token: string;
  let cookie: typeof sessionCookie | typeof leadH5SessionCookie | typeof storeH5SessionCookie;
  let redirectTo: string;
  if (pending.channel === "lead_pc") {
    token = await createSession({ userId: user.id });
    cookie = sessionCookie;
    redirectTo = firstAccessiblePath(permissions);
  } else if (pending.channel === "lead_h5") {
    token = await createLeadH5Session(user.id);
    cookie = leadH5SessionCookie;
    redirectTo = "/lead_h5";
  } else {
    token = await createStoreH5Session(user.id);
    cookie = storeH5SessionCookie;
    redirectTo = "/store_h5";
  }

  await writeOperationLog({ userId: user.id, username: user.username, client: pending.channel === "lead_pc" ? "运营PC端" : pending.channel === "lead_h5" ? "运营移动端" : "门店员工移动端", page: "个人信息", action: "修改密码", result: "成功", detail: "完成首次登录密码修改", request }).catch(() => undefined);
  const response = NextResponse.json({ ok: true, redirectTo });
  response.cookies.set(cookie.name, token, cookie.options);
  response.cookies.set(firstLoginChangeCookie.name, "", { ...firstLoginChangeCookie.options, maxAge: 0 });
  return response;
}

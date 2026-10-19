import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession, sessionCookie } from "@/lib/auth";
import { firstAccessiblePath } from "@/lib/access-control";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";
import { hasRolePlatformAccess } from "@/lib/role-permissions";

const input = z.object({ username: z.string().trim().min(1, "请输入账号"), password: z.string().min(1, "请输入密码") });

const duration = (startedAt: number) => Number((performance.now() - startedAt).toFixed(1));
const serverTiming = (timings: Record<string, number>) => Object.entries(timings).map(([name, value]) => `${name};dur=${value}`).join(", ");

export async function POST(request: Request) {
  const totalStartedAt = performance.now();
  const body = input.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ message: body.error.issues[0].message }, { status: 400 });

  const userLookupStartedAt = performance.now();
  const user = await db.user.findUnique({ where: { username: body.data.username }, include: { role: true } });
  const userLookupDuration = duration(userLookupStartedAt);
  const passwordStartedAt = performance.now();
  const passwordMatches = user ? await bcrypt.compare(body.data.password, user.passwordHash) : false;
  const passwordDuration = duration(passwordStartedAt);
  if (!user || !passwordMatches) {
    await writeOperationLog({ userId: user?.id, username: body.data.username, page: "登录页面", action: "登录", result: "失败", detail: "账号或密码错误", request }).catch(() => undefined);
    return NextResponse.json({ message: "账号或密码错误，请重新输入" }, { status: 401 });
  }
  if (user.status !== "ENABLED" || user.role.status !== "ENABLED") {
    await writeOperationLog({ userId: user.id, username: user.username, page: "登录页面", action: "登录", result: "失败", detail: "账号或角色已禁用", request }).catch(() => undefined);
    return NextResponse.json({ message: "该账号已被禁用，请联系平台管理员" }, { status: 403 });
  }
  const permissions = Array.isArray(user.role.permissions) ? user.role.permissions.filter((item): item is string => typeof item === "string") : [];
  if (!hasRolePlatformAccess(permissions, "lead-pc")) {
    await writeOperationLog({ userId: user.id, username: user.username, page: "登录页面", action: "登录", result: "失败", detail: "所属角色未配置运营PC端权限", request }).catch(() => undefined);
    return NextResponse.json({ message: "当前账号不具备运营PC端登录权限，请联系平台管理员" }, { status: 403 });
  }
  const sessionStartedAt = performance.now();
  const token = await createSession({ userId: user.id });
  const sessionDuration = duration(sessionStartedAt);
  const writesStartedAt = performance.now();
  await Promise.all([
    db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
    writeOperationLog({ userId: user.id, username: user.username, page: "登录页面", action: "登录", result: "成功", detail: "登录运营管理PC端", request }).catch(() => undefined),
  ]);
  const writesDuration = duration(writesStartedAt);
  const response = NextResponse.json({ realName: user.realName, redirectTo: user.mustChangePassword ? "/lead_pc/change-password" : firstAccessiblePath(permissions) });
  response.cookies.set(sessionCookie.name, token, sessionCookie.options);
  response.headers.set("Server-Timing", serverTiming({ user_lookup: userLookupDuration, password_verify: passwordDuration, session_sign: sessionDuration, login_writes: writesDuration, total: duration(totalStartedAt) }));
  return response;
}

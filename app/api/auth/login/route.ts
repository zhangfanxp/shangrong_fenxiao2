import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession, sessionCookie } from "@/lib/auth";
import { firstAccessiblePath } from "@/lib/access-control";
import { db } from "@/lib/db";

const input = z.object({ username: z.string().trim().min(1, "请输入账号"), password: z.string().min(1, "请输入密码") });

export async function POST(request: Request) {
  const body = input.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ message: body.error.issues[0].message }, { status: 400 });
  const user = await db.user.findUnique({ where: { username: body.data.username }, include: { role: true } });
  if (!user || !(await bcrypt.compare(body.data.password, user.passwordHash))) return NextResponse.json({ message: "账号或密码错误，请重新输入" }, { status: 401 });
  if (user.status !== "ENABLED" || user.role.status !== "ENABLED") return NextResponse.json({ message: "该账号已被禁用，请联系平台管理员" }, { status: 403 });
  const permissions = Array.isArray(user.role.permissions) ? user.role.permissions.filter((item): item is string => typeof item === "string") : [];
  const token = await createSession({ userId: user.id, username: user.username, realName: user.realName, role: user.role.code, permissions });
  await db.$transaction([db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }), db.operationLog.create({ data: { userId: user.id, page: "登录页面", action: "登录", result: "成功" } })]);
  const response = NextResponse.json({ realName: user.realName, redirectTo: firstAccessiblePath(permissions) });
  response.cookies.set(sessionCookie.name, token, sessionCookie.options);
  return response;
}

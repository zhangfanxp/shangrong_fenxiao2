import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";

const input = z.object({
  oldPassword: z.string().min(1, "请输入旧密码"),
  newPassword: z.string().min(8, "新密码至少需要 8 位"),
}).refine(value => value.oldPassword !== value.newPassword, { path: ["newPassword"], message: "新密码不能与旧密码相同" });

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  const body = input.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ message: body.error.issues[0].message }, { status: 400 });
  const user = await db.user.findUnique({ where: { id: session.userId }, select: { id: true, passwordHash: true, status: true } });
  if (!user || user.status !== "ENABLED") return NextResponse.json({ message: "当前账号不可用，请重新登录" }, { status: 403 });
  if (!(await bcrypt.compare(body.data.oldPassword, user.passwordHash))) return NextResponse.json({ message: "旧密码输入不正确" }, { status: 400 });
  const passwordHash = await bcrypt.hash(body.data.newPassword, 12);
  await db.user.update({ where: { id: user.id }, data: { passwordHash } });
  await writeOperationLog({ userId: user.id, username: session.username, page: "个人信息", action: "修改密码", result: "成功", detail: "用户修改本人登录密码", request }).catch(() => undefined);
  return NextResponse.json({ ok: true });
}

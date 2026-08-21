import { RecordStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession, sessionHasPermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";

const roleSchema = z.object({
  name: z.string().trim().min(1, "请输入角色名称").max(30, "角色名称不能超过30个字符"),
  code: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{1,29}$/, "英文名称须为2-30位大写字母、数字或下划线，且以字母开头"),
  permissions: z.array(z.string()).default([]),
  status: z.nativeEnum(RecordStatus),
  updatedAt: z.string().min(1),
});
const statusSchema = z.object({ action: z.literal("status"), status: z.nativeEnum(RecordStatus), updatedAt: z.string().min(1) });
const sameTimestamp = (first: Date, second: string) => first.getTime() === new Date(second).getTime();

async function findRole(id: string) { return db.role.findUnique({ where: { id }, include: { _count: { select: { users: true } } } }); }
function duplicateMessage(error: unknown) { return (error as { code?: string }).code === "P2002" ? "角色名称或英文名称已存在，请重新输入" : "角色保存失败，请稍后重试"; }

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!sessionHasPermission(session, "settings:roles")) return NextResponse.json({ message: "暂无角色管理权限" }, { status: 403 });
  const role = await findRole((await params).id);
  if (!role) return NextResponse.json({ message: "角色不存在或已被删除" }, { status: 404 });
  await writeOperationLog({ userId: session.userId, username: session.username, page: "角色管理", action: "查看", result: "成功", detail: `查看角色：${role.name}`, request });
  return NextResponse.json(role);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!sessionHasPermission(session, "settings:roles")) return NextResponse.json({ message: "暂无角色管理权限" }, { status: 403 });
  const { id } = await params; const role = await findRole(id);
  if (!role) return NextResponse.json({ message: "角色不存在或已被删除" }, { status: 404 });
  const body = await request.json(); const changingStatus = body.action === "status";
  let action: "编辑" | "启用" | "禁用";
  let data: { name?: string; code?: string; permissions?: string[]; status: RecordStatus };
  if (changingStatus) {
    const parsed = statusSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0].message }, { status: 400 });
    if (!sameTimestamp(role.updatedAt, parsed.data.updatedAt)) return NextResponse.json({ message: "角色已被其他用户修改，请刷新后重新操作。" }, { status: 409 });
    if (role.code === "SUPER_ADMIN" && parsed.data.status === RecordStatus.DISABLED) return NextResponse.json({ message: "超级管理员角色不可禁用" }, { status: 400 });
    action = parsed.data.status === RecordStatus.ENABLED ? "启用" : "禁用"; data = { status: parsed.data.status };
  } else {
    const parsed = roleSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0].message }, { status: 400 });
    if (!sameTimestamp(role.updatedAt, parsed.data.updatedAt)) return NextResponse.json({ message: "角色已被其他用户修改，请刷新后重新操作。" }, { status: 409 });
    if (role.type === "SYSTEM" && parsed.data.code !== role.code) return NextResponse.json({ message: "系统内置角色的英文名称不可修改" }, { status: 400 });
    action = "编辑"; data = { name: parsed.data.name, code: parsed.data.code, permissions: parsed.data.permissions, status: parsed.data.status };
  }
  try {
    const result = await db.role.updateMany({ where: { id, updatedAt: role.updatedAt }, data });
    if (!result.count) return NextResponse.json({ message: "角色已被其他用户修改，请刷新后重新操作。" }, { status: 409 });
    await writeOperationLog({ userId: session.userId, username: session.username, page: "角色管理", action, result: "成功", detail: `${action}角色：${role.name}`, request });
    return NextResponse.json({ message: `角色${action}成功` });
  } catch (error) {
    const message = duplicateMessage(error);
    await writeOperationLog({ userId: session.userId, username: session.username, page: "角色管理", action: changingStatus ? "状态变更" : "编辑", result: "失败", detail: `角色：${role.name}；${message}`, request });
    return NextResponse.json({ message }, { status: 400 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!sessionHasPermission(session, "settings:roles")) return NextResponse.json({ message: "暂无角色管理权限" }, { status: 403 });
  const role = await findRole((await params).id);
  if (!role) return NextResponse.json({ message: "角色不存在或已被删除" }, { status: 404 });
  if (role.type === "SYSTEM") return NextResponse.json({ message: "系统内置角色不可删除" }, { status: 400 });
  if (role._count.users) return NextResponse.json({ message: `该角色仍关联 ${role._count.users} 个用户，暂不能删除。请先为相关用户更换角色。` }, { status: 400 });
  await db.role.delete({ where: { id: role.id } });
  await writeOperationLog({ userId: session.userId, username: session.username, page: "角色管理", action: "删除", result: "成功", detail: `删除角色：${role.name}`, request });
  return NextResponse.json({ message: "角色删除成功" });
}

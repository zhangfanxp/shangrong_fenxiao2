import { RecordStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession, sessionHasPermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";
import { isFixedSystemRoleIdentity } from "@/lib/system-roles";

const roleSchema = z.object({
  name: z.string().trim().min(1, "请输入角色名称").max(30, "角色名称不能超过30个字符"),
  code: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{1,29}$/, "英文名称须为2-30位大写字母、数字或下划线，且以字母开头"),
  permissions: z.array(z.string()).default([]),
  status: z.nativeEnum(RecordStatus).default(RecordStatus.ENABLED),
});

function duplicateMessage(error: unknown) {
  return (error as { code?: string; meta?: { target?: string[] } }).code === "P2002" ? "角色名称或英文名称已存在，请重新输入" : "角色新增失败，请稍后重试";
}

export async function GET(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!sessionHasPermission(session, "settings:roles")) return NextResponse.json({ message: "暂无角色管理权限" }, { status: 403 });
  const url = new URL(request.url);
  const keyword = (url.searchParams.get("keyword") || "").trim();
  const type = url.searchParams.get("type") || "";
  const status = url.searchParams.get("status") || "";
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(10, Number(url.searchParams.get("pageSize")) || 10));
  const where = {
    ...(keyword ? { OR: [{ name: { contains: keyword } }, { code: { contains: keyword } }] } : {}),
    ...(type === "SYSTEM" || type === "CUSTOM" ? { type } : {}),
    ...(Object.values(RecordStatus).includes(status as RecordStatus) ? { status: status as RecordStatus } : {}),
  };
  const [total, roles] = await db.$transaction([
    db.role.count({ where }),
    db.role.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, include: { _count: { select: { users: true } } } }),
  ]);
  return NextResponse.json({ rows: roles, total, page, pageSize });
}

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!sessionHasPermission(session, "settings:roles")) return NextResponse.json({ message: "暂无角色管理权限" }, { status: 403 });
  const parsed = roleSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0].message }, { status: 400 });
  if (isFixedSystemRoleIdentity(parsed.data.name, parsed.data.code)) return NextResponse.json({ message: "该名称或英文名称属于系统固定角色，不可用于新增自定义角色" }, { status: 400 });
  try {
    const role = await db.role.create({ data: { ...parsed.data, type: "CUSTOM" } });
    await writeOperationLog({ userId: session.userId, username: session.username, page: "角色管理", action: "新增", result: "成功", detail: `新增角色：${role.name}`, request });
    return NextResponse.json(role, { status: 201 });
  } catch (error) {
    const message = duplicateMessage(error);
    await writeOperationLog({ userId: session.userId, username: session.username, page: "角色管理", action: "新增", result: "失败", detail: message, request });
    return NextResponse.json({ message }, { status: 400 });
  }
}

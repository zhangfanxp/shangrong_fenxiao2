import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { writeOperationLog, type OperationLogResult } from "@/lib/operation-log";
import { r2ErrorResponse } from "@/lib/r2-api";
import { deleteR2Config, publicR2Detail, updateR2Config } from "@/lib/r2-config-service";
import { canR2Storage, type R2StoragePermission } from "@/lib/r2-permissions";
import { editR2Schema, versionedActionSchema } from "@/lib/r2-validation";

function forbidden() { return NextResponse.json({ message: "暂无此操作权限" }, { status: 403 }); }
async function log(userId: string, username: string, action: string, result: OperationLogResult, detail: string, request: Request) { await writeOperationLog({ userId, username, page: "R2存储空间", action, result, detail, request }).catch(() => undefined); }

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  const intent = new URL(request.url).searchParams.get("intent") === "edit" ? "edit" : "view";
  if (!canR2Storage(session, intent as R2StoragePermission)) return forbidden();
  const { id } = await params;
  const row = await db.r2StorageConfig.findFirst({ where: { id, deletedAt: null }, include: { createdBy: { select: { realName: true } }, _count: { select: { references: true } } } });
  if (!row) return NextResponse.json({ message: "R2存储空间不存在或已删除" }, { status: 404 });
  await log(session.userId, session.username, intent === "edit" ? "编辑" : "查看", "成功", `${intent === "edit" ? "打开编辑" : "查看"}R2存储空间：${row.recordNo}`, request);
  return NextResponse.json(publicR2Detail(row));
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canR2Storage(session, "edit")) return forbidden();
  const parsed = editR2Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0].message }, { status: 400 });
  const { id } = await params;
  try {
    const row = await updateR2Config(id, parsed.data);
    await log(session.userId, session.username, "编辑", "成功", `编辑R2存储空间：${row.recordNo}${parsed.data.accessKeyId || parsed.data.secretAccessKey ? "；R2访问凭证已更新" : ""}`, request);
    return NextResponse.json(publicR2Detail(row));
  } catch (error) {
    await log(session.userId, session.username, "编辑", "失败", "R2存储空间编辑失败", request);
    return r2ErrorResponse(error, "R2存储空间保存失败，请稍后重试");
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canR2Storage(session, "delete")) return forbidden();
  const parsed = versionedActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "请求参数无效，请刷新后重试" }, { status: 400 });
  const { id } = await params;
  try {
    await deleteR2Config(id, parsed.data.updatedAt);
    await log(session.userId, session.username, "删除", "成功", `删除R2存储空间配置：${id}`, request);
    return NextResponse.json({ message: "R2存储空间删除成功" });
  } catch (error) {
    await log(session.userId, session.username, "删除", "失败", "R2存储空间删除失败", request);
    return r2ErrorResponse(error, "R2存储空间删除失败，请稍后重试");
  }
}

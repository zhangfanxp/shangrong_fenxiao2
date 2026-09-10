import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  canItemRequisition, itemRequisitionDataScope, itemRequisitionLog, itemRequisitionSelect,
  serializeItemRequisition,
} from "@/lib/item-requisitions";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  const editing = new URL(request.url).searchParams.get("mode") === "edit";
  const action = editing ? "edit" : "view";
  if (!canItemRequisition(session, action)) return NextResponse.json({ message: editing ? "无领用管理编辑权限" : "无领用管理查看权限" }, { status: 403 });
  const { id } = await params;
  const row = await db.itemRequisition.findFirst({
    where: { AND: [{ id }, await itemRequisitionDataScope(session)] }, select: itemRequisitionSelect,
  });
  if (!row) return NextResponse.json({ message: "领用记录不存在或无权访问" }, { status: 404 });
  await itemRequisitionLog(session, editing ? "编辑加载" : "查看", "成功", `领用单号：${row.requisitionNo}`, request);
  return NextResponse.json(serializeItemRequisition(row));
}

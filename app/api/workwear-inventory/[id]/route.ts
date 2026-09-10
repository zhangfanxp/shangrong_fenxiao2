import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  canWorkwearInventory, inventoryData, inventoryEditSchema, resolveInventoryItemType,
  safeInventoryError, serializeInventoryItem, workwearInventoryLog,
} from "@/lib/workwear-inventory";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  const editing = new URL(request.url).searchParams.get("mode") === "edit";
  if (!canWorkwearInventory(session, editing ? "edit" : "view")) return NextResponse.json({ message: editing ? "无物品管理编辑权限" : "无物品管理查看权限" }, { status: 403 });
  const { id } = await params;
  const row = await db.inventoryItem.findUnique({ where: { id }, include: { _count: { select: { transactions: true } } } });
  if (!row) return NextResponse.json({ message: "物品不存在或已被删除" }, { status: 404 });
  await workwearInventoryLog(session.userId, session.username, editing ? "编辑加载" : "查看", "成功", `${editing ? "编辑加载" : "查看"}物品：${row.recordNo}`, request);
  return NextResponse.json(serializeInventoryItem(row));
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canWorkwearInventory(session, "edit")) return NextResponse.json({ message: "无物品管理编辑权限" }, { status: 403 });
  const parsed = inventoryEditSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0].message }, { status: 400 });
  const { id } = await params;
  try {
    const [current, itemType] = await Promise.all([db.inventoryItem.findUnique({ where: { id } }), resolveInventoryItemType(parsed.data.itemTypeCode)]);
    if (!current) return NextResponse.json({ message: "物品不存在或已被删除" }, { status: 404 });
    if (current.version !== parsed.data.version) return NextResponse.json({ message: "当前物品已被其他用户修改，请刷新后重新操作" }, { status: 409 });
    const updated = await db.inventoryItem.updateMany({
      where: { id, version: parsed.data.version },
      data: { ...inventoryData(parsed.data, itemType), updatedByUserId: session.userId, version: { increment: 1 } },
    });
    if (!updated.count) return NextResponse.json({ message: "当前物品已被其他用户修改，请刷新后重新操作" }, { status: 409 });
    const row = await db.inventoryItem.findUniqueOrThrow({ where: { id } });
    await workwearInventoryLog(session.userId, session.username, "编辑", "成功", `编辑物品：${row.recordNo} ${row.itemName}`, request);
    return NextResponse.json(serializeInventoryItem(row));
  } catch (error) {
    const message = safeInventoryError(error, "物品信息保存失败，请稍后重试");
    await workwearInventoryLog(session.userId, session.username, "编辑", "失败", message, request);
    return NextResponse.json({ message }, { status: message.includes("已存在") || message.includes("其他用户") ? 409 : 400 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canWorkwearInventory(session, "delete")) return NextResponse.json({ message: "无物品管理删除权限" }, { status: 403 });
  const { id } = await params;
  try {
    const row = await db.$transaction(async tx => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT \`id\` FROM \`InventoryItem\` WHERE \`id\` = ${id} FOR UPDATE`);
      if (!locked.length) throw new Error("物品不存在或已被删除");
      const current = await tx.inventoryItem.findUniqueOrThrow({ where: { id }, include: { _count: { select: { transactions: true, requisitions: true } } } });
      if (current._count.transactions || current._count.requisitions || (current.stockQuantity !== null && current.stockQuantity > 0n)) throw new Error("当前物品已产生库存业务记录，不支持删除，请使用禁用功能");
      await tx.inventoryItem.delete({ where: { id } });
      return current;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    await workwearInventoryLog(session.userId, session.username, "删除", "成功", `删除物品：${row.recordNo} ${row.itemName}`, request);
    return NextResponse.json({ message: "物品删除成功" });
  } catch (error) {
    const message = safeInventoryError(error, "物品删除失败，请稍后重试");
    await workwearInventoryLog(session.userId, session.username, "删除", "失败", message, request);
    return NextResponse.json({ message }, { status: message.includes("不存在") ? 404 : 400 });
  }
}

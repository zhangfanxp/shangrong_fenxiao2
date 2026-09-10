import { InventoryDirection, Prisma, RecordStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  canWorkwearInventory, inboundBusinessType, inventoryInboundSchema, nextInventoryTransactionNo,
  safeInventoryError, workwearInventoryLog,
} from "@/lib/workwear-inventory";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canWorkwearInventory(session, "inbound")) return NextResponse.json({ message: "无物品管理入库权限" }, { status: 403 });
  const parsed = inventoryInboundSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0].message }, { status: 400 });
  const { id } = await params;
  try {
    const result = await db.$transaction(async tx => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT \`id\` FROM \`InventoryItem\` WHERE \`id\` = ${id} FOR UPDATE`);
      if (!locked.length) throw new Error("物品不存在或已被删除");
      const item = await tx.inventoryItem.findUniqueOrThrow({ where: { id }, include: { _count: { select: { transactions: true } } } });
      if (item.manageStock !== "MANAGED") throw new Error("当前物品不管理库存，无需执行入库操作");
      if (item.status !== RecordStatus.ENABLED) throw new Error("当前物品已禁用，不支持入库");
      if (item.stockQuantity === null) throw new Error("当前物品库存数量异常，请联系系统管理员");
      if (parsed.data.inboundType === "INITIAL" && item._count.transactions > 0) throw new Error("当前物品已产生库存记录，不允许再次录入期初库存");
      const quantity = BigInt(parsed.data.quantity);
      const stockBefore = item.stockQuantity;
      const stockAfter = stockBefore + quantity;
      const transactionNo = await nextInventoryTransactionNo(tx);
      const operatedAt = new Date();
      await tx.inventoryItem.update({ where: { id }, data: { stockQuantity: stockAfter, version: { increment: 1 }, updatedByUserId: session.userId } });
      await tx.inventoryTransaction.create({ data: {
        transactionNo, itemId: item.id, itemRecordNoSnapshot: item.recordNo, itemNameSnapshot: item.itemName,
        itemTypeCodeSnapshot: item.itemTypeCode, itemTypeNameSnapshot: item.itemTypeNameSnapshot,
        specificationSnapshot: item.specification, unitSnapshot: item.unit,
        businessType: inboundBusinessType(parsed.data.inboundType), direction: InventoryDirection.IN, quantity,
        stockBefore, stockAfter, operatorUserId: session.userId, operatorNameSnapshot: session.realName, operatedAt,
      } });
      return { transactionNo, itemId: item.id, recordNo: item.recordNo, itemName: item.itemName, stockBefore, stockAfter, quantity, operatedAt };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 15000 });
    await workwearInventoryLog(session.userId, session.username, "入库", "成功", `物品：${result.recordNo} ${result.itemName}；类型：${parsed.data.inboundType === "INITIAL" ? "期初库存" : "采购入库"}；数量：${result.quantity}；变更前：${result.stockBefore}；变更后：${result.stockAfter}`, request);
    return NextResponse.json({
      transactionNo: result.transactionNo, itemId: result.itemId, previousStock: result.stockBefore.toString(),
      inboundQuantity: result.quantity.toString(), currentStock: result.stockAfter.toString(), createdAt: result.operatedAt.toISOString(),
    });
  } catch (error) {
    const message = safeInventoryError(error, "物品入库失败，请稍后重试");
    await workwearInventoryLog(session.userId, session.username, "入库", "失败", message, request);
    return NextResponse.json({ message }, { status: message.includes("不存在") ? 404 : 400 });
  }
}

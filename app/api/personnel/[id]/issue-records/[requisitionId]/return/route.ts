import {
  InventoryBusinessType, InventoryDirection, InventoryManageStock, ItemRequisitionStatus, Prisma,
} from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { itemRequisitionReturnSchema } from "@/lib/item-requisitions";
import { writeOperationLogWithTransaction } from "@/lib/operation-log";
import { canPersonnel, personnelLog } from "@/lib/personnel-service";
import { nextInventoryTransactionNo } from "@/lib/workwear-inventory";

type ReturnRow = {
  id: string;
  requestId: string;
  requisitionId: string;
  quantity: number;
  operatorUserId: string | null;
  operatorNameSnapshot: string;
  returnedAt: Date;
};

function serializeReturn(row: ReturnRow, duplicate = false) {
  return {
    id: row.id,
    requisitionId: row.requisitionId,
    returnQuantity: row.quantity,
    operatorName: row.operatorNameSnapshot,
    operatedAt: row.returnedAt.toISOString(),
    duplicate,
  };
}

function returnError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2025") return "领用记录或物品不存在";
    return "物品返还失败，请稍后重试";
  }
  if (error instanceof Error) {
    const allowed = [
      "领用记录不存在或与当前人员不匹配", "已撤销的领用记录不能返还", "该领用记录已全部返还",
      "当前物品库存数量异常，请联系系统管理员", "物品不存在或已被删除", "当日库存流水编号已达到上限",
    ];
    if (allowed.includes(error.message) || error.message.startsWith("返还数量不能超过当前可返还数量")) return error.message;
  }
  return "物品返还失败，请稍后重试";
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string; requisitionId: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canPersonnel(session, "return")) return NextResponse.json({ message: "无人员物品返还权限" }, { status: 403 });
  const parsed = itemRequisitionReturnSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message || "返还参数不正确" }, { status: 400 });
  const { id: personnelId, requisitionId } = await params;

  const duplicate = await db.itemRequisitionReturn.findUnique({
    where: { requestId: parsed.data.requestId },
    select: { id: true, requestId: true, requisitionId: true, quantity: true, operatorUserId: true, operatorNameSnapshot: true, returnedAt: true },
  });
  if (duplicate) {
    if (duplicate.requisitionId !== requisitionId || duplicate.operatorUserId !== session.userId) {
      return NextResponse.json({ message: "返还请求标识已被使用，请重新操作" }, { status: 409 });
    }
    return NextResponse.json(serializeReturn(duplicate, true));
  }

  try {
    const result = await db.$transaction(async tx => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT \`id\` FROM \`ItemRequisition\` WHERE \`id\` = ${requisitionId} FOR UPDATE`);
      if (!locked.length) throw new Error("领用记录不存在或与当前人员不匹配");
      const requisition = await tx.itemRequisition.findFirst({
        where: { id: requisitionId, personnelId, personnel: { is: { deletedAt: null } } },
        select: {
          id: true, requisitionNo: true, personnelNameSnapshot: true, itemId: true, itemRecordNoSnapshot: true,
          itemNameSnapshot: true, itemTypeCodeSnapshot: true, itemTypeNameSnapshot: true, specificationSnapshot: true,
          unitSnapshot: true, manageStockSnapshot: true, quantity: true, status: true,
        },
      });
      if (!requisition) throw new Error("领用记录不存在或与当前人员不匹配");
      if (requisition.status !== ItemRequisitionStatus.NORMAL) throw new Error("已撤销的领用记录不能返还");

      const returned = await tx.itemRequisitionReturn.aggregate({
        where: { requisitionId },
        _sum: { quantity: true },
      });
      const returnedQuantity = returned._sum.quantity || 0;
      const returnableQuantity = requisition.quantity - returnedQuantity;
      if (returnableQuantity <= 0) throw new Error("该领用记录已全部返还");
      if (parsed.data.quantity > returnableQuantity) {
        throw new Error(`返还数量不能超过当前可返还数量${returnableQuantity}${requisition.unitSnapshot}`);
      }

      const returnedAt = new Date();
      const returnRow = await tx.itemRequisitionReturn.create({
        data: {
          requestId: parsed.data.requestId,
          requisitionId,
          quantity: parsed.data.quantity,
          operatorUserId: session.userId,
          operatorUsernameSnapshot: session.username,
          operatorNameSnapshot: session.realName,
          returnedAt,
        },
        select: { id: true, requestId: true, requisitionId: true, quantity: true, operatorUserId: true, operatorNameSnapshot: true, returnedAt: true },
      });

      let currentStock: bigint | null = null;
      let transactionNo: string | null = null;
      if (requisition.manageStockSnapshot === InventoryManageStock.MANAGED) {
        const lockedItems = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT \`id\` FROM \`InventoryItem\` WHERE \`id\` = ${requisition.itemId} FOR UPDATE`);
        if (!lockedItems.length) throw new Error("物品不存在或已被删除");
        const item = await tx.inventoryItem.findUnique({ where: { id: requisition.itemId } });
        if (!item) throw new Error("物品不存在或已被删除");
        if (item.stockQuantity === null) throw new Error("当前物品库存数量异常，请联系系统管理员");
        const quantity = BigInt(parsed.data.quantity);
        const stockBefore = item.stockQuantity;
        const stockAfter = stockBefore + quantity;
        transactionNo = await nextInventoryTransactionNo(tx);
        await tx.inventoryItem.update({
          where: { id: item.id },
          data: { stockQuantity: stockAfter, version: { increment: 1 }, updatedByUserId: session.userId },
        });
        await tx.inventoryTransaction.create({ data: {
          transactionNo,
          itemId: item.id,
          itemRecordNoSnapshot: item.recordNo,
          itemNameSnapshot: item.itemName,
          itemTypeCodeSnapshot: item.itemTypeCode,
          itemTypeNameSnapshot: item.itemTypeNameSnapshot,
          specificationSnapshot: item.specification,
          unitSnapshot: item.unit,
          businessType: InventoryBusinessType.REQUISITION_RETURN,
          direction: InventoryDirection.IN,
          quantity,
          stockBefore,
          stockAfter,
          relatedBusinessId: returnRow.id,
          operatorUserId: session.userId,
          operatorNameSnapshot: session.realName,
          operatedAt: returnedAt,
        } });
        currentStock = stockAfter;
      }

      await writeOperationLogWithTransaction(tx, {
        userId: session.userId,
        username: session.username,
        page: "人员档案",
        action: "物品返还",
        result: "成功",
        detail: `人员：${requisition.personnelNameSnapshot}；领用单号：${requisition.requisitionNo}；物品：${requisition.itemRecordNoSnapshot} ${requisition.itemNameSnapshot}；返还数量：${parsed.data.quantity}${requisition.unitSnapshot}${transactionNo ? `；库存流水：${transactionNo}` : "；不管理库存"}`,
        request,
        createdAt: returnedAt,
      });

      return {
        ...serializeReturn(returnRow),
        returnedQuantity: returnedQuantity + parsed.data.quantity,
        returnableQuantity: returnableQuantity - parsed.data.quantity,
        inventoryUpdated: requisition.manageStockSnapshot === InventoryManageStock.MANAGED,
        currentStock: currentStock?.toString() ?? null,
        transactionNo,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 15000 });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const repeated = await db.itemRequisitionReturn.findUnique({
        where: { requestId: parsed.data.requestId },
        select: { id: true, requestId: true, requisitionId: true, quantity: true, operatorUserId: true, operatorNameSnapshot: true, returnedAt: true },
      });
      if (repeated && repeated.requisitionId === requisitionId && repeated.operatorUserId === session.userId) {
        return NextResponse.json(serializeReturn(repeated, true));
      }
    }
    const message = returnError(error);
    await personnelLog(session.userId, "物品返还", "失败", `领用记录ID：${requisitionId}；${message}`);
    const status = message === "物品返还失败，请稍后重试" ? 500
      : message.includes("不存在") ? 404
        : message.includes("超过") || message.includes("已全部返还") ? 409 : 400;
    return NextResponse.json({ message }, { status });
  }
}

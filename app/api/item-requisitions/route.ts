import { InventoryBusinessType, InventoryDirection, InventoryManageStock, Prisma, RecordStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  canItemRequisition, itemRequisitionCreateSchema, itemRequisitionFilterWhere, itemRequisitionLog,
  itemRequisitionListSelect, itemRequisitionSelect, itemSnapshot, nextItemRequisitionNo, personnelSnapshot,
  readItemRequisitionFilters, requisitionPersonnelDataScope, safeItemRequisitionError,
  serializeItemRequisition, serializeItemRequisitionListRow,
} from "@/lib/item-requisitions";
import { nextInventoryTransactionNo } from "@/lib/workwear-inventory";
import { writeOperationLogWithTransaction } from "@/lib/operation-log";

export async function GET(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canItemRequisition(session, "query")) return NextResponse.json({ message: "无领用管理查询权限" }, { status: 403 });
  try {
    const search = new URL(request.url).searchParams;
    const filters = readItemRequisitionFilters(search);
    const page = Math.max(1, Number(search.get("page")) || 1);
    const requestedPageSize = Number(search.get("pageSize"));
    const pageSize = [20, 50, 100].includes(requestedPageSize) ? requestedPageSize : 20;
    const personnelScope = await requisitionPersonnelDataScope(session);
    const where: Prisma.ItemRequisitionWhereInput = {
      AND: [{ personnel: { is: personnelScope } }, itemRequisitionFilterWhere(filters)],
    };
    const [total, rows] = await db.$transaction([
      db.itemRequisition.count({ where }),
      db.itemRequisition.findMany({ where, select: itemRequisitionListSelect, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    void itemRequisitionLog(session, "筛选", "成功", `领用日期：${filters.startDate || "不限"} 至 ${filters.endDate || "不限"}；物品：${filters.itemNameKeyword || "全部"}；规格：${filters.specificationKeyword || "全部"}；领用人：${filters.personnelKeyword || "全部"}；结果：${total}条`, request);
    return NextResponse.json({ rows: rows.map(serializeItemRequisitionListRow), total, page, pageSize });
  } catch (error) {
    const message = error instanceof Error && ["领用日期格式不正确", "领用开始日期不能晚于领用截止日期"].includes(error.message)
      ? error.message : "领用记录加载失败，请稍后重试";
    return NextResponse.json({ message }, { status: message.includes("日期") ? 400 : 500 });
  }
}

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canItemRequisition(session, "create")) return NextResponse.json({ message: "无领用管理新增权限" }, { status: 403 });
  const parsed = itemRequisitionCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message || "新增参数不正确" }, { status: 400 });

  const existing = await db.itemRequisition.findFirst({
    where: { requestId: parsed.data.requestId, createdByUserId: session.userId }, select: itemRequisitionSelect,
  });
  if (existing) return NextResponse.json({ ...serializeItemRequisition(existing), duplicate: true });

  try {
    const personnelScope = await requisitionPersonnelDataScope(session);
    const row = await db.$transaction(async tx => {
      const lockedPersonnel = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT \`id\` FROM \`Personnel\` WHERE \`id\` = ${parsed.data.personnelId} FOR UPDATE`);
      if (!lockedPersonnel.length) throw new Error("所选人员不存在、不在职或无权访问");
      const personnel = await tx.personnel.findFirst({
        where: { AND: [{ id: parsed.data.personnelId, deletedAt: null, status: "ACTIVE" }, personnelScope] },
        select: { id: true, name: true, organization: true, department: true, store: { select: { name: true } } },
      });
      if (!personnel) throw new Error("所选人员不存在、不在职或无权访问");

      const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT \`id\` FROM \`InventoryItem\` WHERE \`id\` = ${parsed.data.itemId} FOR UPDATE`);
      if (!locked.length) throw new Error("所选物品不存在或已被删除");
      const item = await tx.inventoryItem.findUnique({ where: { id: parsed.data.itemId } });
      if (!item) throw new Error("所选物品不存在或已被删除");
      if (item.status !== RecordStatus.ENABLED) throw new Error("所选物品已禁用，无法领用");

      const quantity = BigInt(parsed.data.quantity);
      const requisitionNo = await nextItemRequisitionNo(tx);
      const now = new Date();
      const requisition = await tx.itemRequisition.create({ data: {
        requisitionNo,
        requestId: parsed.data.requestId,
        requisitionedAt: now,
        ...personnelSnapshot(personnel),
        ...itemSnapshot(item),
        quantity: parsed.data.quantity,
        remark: parsed.data.remark?.trim() || null,
        createdByUserId: session.userId,
        createdByUsername: session.username,
        createdByNameSnapshot: session.realName,
        createdAt: now,
      }, select: itemRequisitionSelect });

      if (item.manageStock === InventoryManageStock.MANAGED) {
        if (item.stockQuantity === null) throw new Error("当前物品库存数量异常，请联系系统管理员");
        if (item.stockQuantity < quantity) throw new Error(`当前库存不足，最新可用库存为${item.stockQuantity}，请重新确认领用数量`);
        const stockAfter = item.stockQuantity - quantity;
        const updated = await tx.inventoryItem.updateMany({
          where: { id: item.id, status: RecordStatus.ENABLED, stockQuantity: { gte: quantity } },
          data: { stockQuantity: stockAfter, version: { increment: 1 }, updatedByUserId: session.userId },
        });
        if (!updated.count) {
          const latest = await tx.inventoryItem.findUnique({ where: { id: item.id }, select: { stockQuantity: true } });
          throw new Error(`当前库存不足，最新可用库存为${latest?.stockQuantity ?? 0n}，请重新确认领用数量`);
        }
        await tx.inventoryTransaction.create({ data: {
          transactionNo: await nextInventoryTransactionNo(tx),
          itemId: item.id,
          itemRecordNoSnapshot: item.recordNo,
          itemNameSnapshot: item.itemName,
          itemTypeCodeSnapshot: item.itemTypeCode,
          itemTypeNameSnapshot: item.itemTypeNameSnapshot,
          specificationSnapshot: item.specification,
          unitSnapshot: item.unit,
          businessType: InventoryBusinessType.EMPLOYEE_REQUISITION,
          direction: InventoryDirection.OUT,
          quantity,
          stockBefore: item.stockQuantity,
          stockAfter,
          relatedBusinessId: requisition.id,
          operatorUserId: session.userId,
          operatorNameSnapshot: session.realName,
          operatedAt: now,
        } });
      }

      await writeOperationLogWithTransaction(tx, {
        userId: session.userId, username: session.username, page: "领用管理", action: "新增", result: "成功", request,
        detail: `领用单号：${requisitionNo}；领用人：${personnel.name}；物品：${item.recordNo} ${item.itemName}；数量：${parsed.data.quantity}${item.unit}`,
      });
      return requisition;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 15000 });
    return NextResponse.json(serializeItemRequisition(row), { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const duplicate = await db.itemRequisition.findFirst({
        where: { requestId: parsed.data.requestId, createdByUserId: session.userId }, select: itemRequisitionSelect,
      });
      if (duplicate) return NextResponse.json({ ...serializeItemRequisition(duplicate), duplicate: true });
    }
    const message = safeItemRequisitionError(error, "领用记录保存失败，请稍后重试");
    await itemRequisitionLog(session, "新增", "失败", message, request);
    return NextResponse.json({ message }, { status: message.includes("不存在") ? 404 : message.includes("库存不足") ? 409 : 400 });
  }
}

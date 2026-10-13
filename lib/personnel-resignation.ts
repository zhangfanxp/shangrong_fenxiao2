import { PersonnelStatus, Prisma, RecordStatus } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { shanghaiDate } from "@/lib/item-requisitions";
import { personnelInclude, toDate } from "@/lib/personnel-service";

export const personnelResignationSchema = z.object({
  resignationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "请选择离职日期"),
  reason: z.string().trim().min(1, "请输入离职原因").max(200),
  disablePlatformUser: z.boolean().default(true),
});

export type OutstandingReturn = {
  requisitionId: string;
  requisitionNo: string;
  requisitionDate: string;
  itemName: string;
  specification: string | null;
  unit: string;
  requisitionQuantity: number;
  returnedQuantity: number;
  outstandingQuantity: number;
};

export class OutstandingReturnsError extends Error {
  constructor(readonly rows: OutstandingReturn[]) {
    super("该员工仍有离职需返还物品尚未全部返还，请完成返还后再办理离职");
  }
}

async function outstandingReturns(tx: Prisma.TransactionClient, personnelId: string): Promise<OutstandingReturn[]> {
  const requisitions = await tx.itemRequisition.findMany({
    where: {
      personnelId,
      status: "NORMAL",
      item: { is: { requiresReturnOnResignation: true } },
    },
    select: {
      id: true,
      requisitionNo: true,
      requisitionedAt: true,
      itemNameSnapshot: true,
      specificationSnapshot: true,
      unitSnapshot: true,
      quantity: true,
      returns: { select: { quantity: true } },
    },
    orderBy: [{ requisitionedAt: "desc" }, { id: "desc" }],
  });

  return requisitions.flatMap(row => {
    const returnedQuantity = row.returns.reduce((total, item) => total + item.quantity, 0);
    const outstandingQuantity = Math.max(0, row.quantity - returnedQuantity);
    return outstandingQuantity ? [{
      requisitionId: row.id,
      requisitionNo: row.requisitionNo,
      requisitionDate: shanghaiDate(row.requisitionedAt),
      itemName: row.itemNameSnapshot,
      specification: row.specificationSnapshot,
      unit: row.unitSnapshot,
      requisitionQuantity: row.quantity,
      returnedQuantity,
      outstandingQuantity,
    }] : [];
  });
}

export async function checkPersonnelResignation(personnelId: string, storeId?: string) {
  return db.$transaction(async tx => {
    const personnel = await tx.personnel.findFirst({
      where: { id: personnelId, deletedAt: null, ...(storeId ? { storeId } : {}) },
      select: { recordNo: true, name: true, status: true },
    });
    if (!personnel) return null;
    const rows = await outstandingReturns(tx, personnelId);
    return { personnel, rows, canResign: personnel.status === PersonnelStatus.ACTIVE && rows.length === 0 };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}

export async function resignPersonnel(input: { personnelId: string; resignationDate: string; reason: string; disablePlatformUser: boolean; storeId?: string }) {
  return db.$transaction(async tx => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT \`id\` FROM \`Personnel\` WHERE \`id\` = ${input.personnelId} FOR UPDATE`);
    if (!locked.length) throw new Error("人员档案不存在或已删除");
    const current = await tx.personnel.findFirst({
      where: { id: input.personnelId, deletedAt: null, ...(input.storeId ? { storeId: input.storeId } : {}) },
    });
    if (!current) throw new Error("人员档案不存在或已删除");
    if (current.status === PersonnelStatus.RESIGNED) throw new Error("该员工已经离职，不能重复操作");
    if (toDate(input.resignationDate) < current.hireDate) throw new Error("离职日期不能早于入职日期");

    const outstanding = await outstandingReturns(tx, input.personnelId);
    if (outstanding.length) throw new OutstandingReturnsError(outstanding);

    await tx.personnel.update({
      where: { id: input.personnelId },
      data: {
        status: PersonnelStatus.RESIGNED,
        resignationDate: toDate(input.resignationDate),
        resignationReason: input.reason,
        version: { increment: 1 },
      },
    });
    if (input.disablePlatformUser && current.platformUserId) {
      await tx.user.update({ where: { id: current.platformUserId }, data: { status: RecordStatus.DISABLED } });
    }
    const row = await tx.personnel.findUniqueOrThrow({ where: { id: input.personnelId }, include: personnelInclude });
    return { row, platformUserDisabled: Boolean(input.disablePlatformUser && current.platformUserId) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 15000 });
}

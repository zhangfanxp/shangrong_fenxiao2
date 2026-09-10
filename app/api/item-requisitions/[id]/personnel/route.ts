import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  canItemRequisition, itemRequisitionDataScope, itemRequisitionLog, itemRequisitionPersonnelSchema,
  itemRequisitionSelect, personnelSnapshot, requisitionPersonnelDataScope, safeItemRequisitionError,
  serializeItemRequisition,
} from "@/lib/item-requisitions";
import { writeOperationLogWithTransaction } from "@/lib/operation-log";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canItemRequisition(session, "edit")) return NextResponse.json({ message: "无领用管理编辑权限" }, { status: 403 });
  const parsed = itemRequisitionPersonnelSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message || "编辑参数不正确" }, { status: 400 });
  const { id } = await params;
  try {
    const [recordScope, personnelScope] = await Promise.all([
      itemRequisitionDataScope(session), requisitionPersonnelDataScope(session),
    ]);
    const row = await db.$transaction(async tx => {
      const current = await tx.itemRequisition.findFirst({ where: { AND: [{ id }, recordScope] }, select: itemRequisitionSelect });
      if (!current) throw new Error("领用记录不存在或无权访问");
      if (current.version !== parsed.data.version) throw new Error("当前领用记录已被其他用户修改，请刷新后重新操作");
      const lockedPersonnel = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT \`id\` FROM \`Personnel\` WHERE \`id\` = ${parsed.data.personnelId} FOR UPDATE`);
      if (!lockedPersonnel.length) throw new Error("所选人员不存在、不在职或无权访问");
      const personnel = await tx.personnel.findFirst({
        where: { AND: [{ id: parsed.data.personnelId, deletedAt: null, status: "ACTIVE" }, personnelScope] },
        select: { id: true, name: true, organization: true, department: true, store: { select: { name: true } } },
      });
      if (!personnel) throw new Error("所选人员不存在、不在职或无权访问");
      const updated = await tx.itemRequisition.updateMany({
        where: { id, version: parsed.data.version },
        data: {
          ...personnelSnapshot(personnel),
          updatedByUserId: session.userId,
          updatedByNameSnapshot: session.realName,
          version: { increment: 1 },
        },
      });
      if (!updated.count) throw new Error("当前领用记录已被其他用户修改，请刷新后重新操作");
      await writeOperationLogWithTransaction(tx, {
        userId: session.userId, username: session.username, page: "领用管理", action: "编辑", result: "成功", request,
        detail: `领用单号：${current.requisitionNo}；原领用人：${current.personnelNameSnapshot}；新领用人：${personnel.name}；编辑人：${session.realName}`,
      });
      return tx.itemRequisition.findUniqueOrThrow({ where: { id }, select: itemRequisitionSelect });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    return NextResponse.json(serializeItemRequisition(row));
  } catch (error) {
    const message = safeItemRequisitionError(error, "领用人修改失败，请稍后重试");
    await itemRequisitionLog(session, "编辑", "失败", message, request);
    return NextResponse.json({ message }, { status: message.includes("不存在") ? 404 : message.includes("其他用户") ? 409 : 400 });
  }
}

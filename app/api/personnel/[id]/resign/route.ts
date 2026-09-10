import { PersonnelStatus, Prisma, RecordStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { shanghaiDate } from "@/lib/item-requisitions";
import { canPersonnel, personnelInclude, personnelLog, toDate } from "@/lib/personnel-service";

const schema = z.object({
  resignationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "请选择离职日期"),
  reason: z.string().trim().min(1, "请输入离职原因").max(200),
  disablePlatformUser: z.boolean().default(true),
});

type OutstandingReturn = {
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

class OutstandingReturnsError extends Error {
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

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canPersonnel(session, "resign")) return NextResponse.json({ message: "无人员离职权限" }, { status: 403 });
  const { id } = await params;

  try {
    const result = await db.$transaction(async tx => {
      const personnel = await tx.personnel.findFirst({ where: { id, deletedAt: null }, select: { recordNo: true, name: true } });
      if (!personnel) return null;
      return { personnel, rows: await outstandingReturns(tx, id) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    if (!result) return NextResponse.json({ message: "人员档案不存在或已删除" }, { status: 404 });
    await personnelLog(session.userId, "离职返还检查", "成功", `人员：${result.personnel.recordNo} ${result.personnel.name}；待返还${result.rows.length}项`);
    return NextResponse.json({ rows: result.rows, canResign: result.rows.length === 0 });
  } catch {
    await personnelLog(session.userId, "离职返还检查", "失败", `人员ID：${id}；检查失败`);
    return NextResponse.json({ message: "离职物品返还情况检查失败，请稍后重试" }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canPersonnel(session, "resign")) return NextResponse.json({ message: "无人员离职权限" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message || "离职参数不正确" }, { status: 400 });
  const { id } = await params;

  try {
    const result = await db.$transaction(async tx => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT \`id\` FROM \`Personnel\` WHERE \`id\` = ${id} FOR UPDATE`);
      if (!locked.length) throw new Error("人员档案不存在或已删除");
      const current = await tx.personnel.findFirst({ where: { id, deletedAt: null } });
      if (!current) throw new Error("人员档案不存在或已删除");
      if (current.status === PersonnelStatus.RESIGNED) throw new Error("该员工已经离职，不能重复操作");
      if (toDate(parsed.data.resignationDate) < current.hireDate) throw new Error("离职日期不能早于入职日期");

      const outstanding = await outstandingReturns(tx, id);
      if (outstanding.length) throw new OutstandingReturnsError(outstanding);

      await tx.personnel.update({
        where: { id },
        data: {
          status: PersonnelStatus.RESIGNED,
          resignationDate: toDate(parsed.data.resignationDate),
          resignationReason: parsed.data.reason,
          version: { increment: 1 },
        },
      });
      if (parsed.data.disablePlatformUser && current.platformUserId) {
        await tx.user.update({ where: { id: current.platformUserId }, data: { status: RecordStatus.DISABLED } });
      }
      const row = await tx.personnel.findUniqueOrThrow({ where: { id }, include: personnelInclude });
      return { row, platformUserDisabled: Boolean(parsed.data.disablePlatformUser && current.platformUserId) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 15000 });

    await personnelLog(session.userId, "离职", "成功", `人员：${result.row.recordNo}；离职需返还物品已全部返还；平台账号${result.platformUserDisabled ? "已禁用" : "未变更"}`);
    return NextResponse.json(result.row);
  } catch (error) {
    if (error instanceof OutstandingReturnsError) {
      await personnelLog(session.userId, "离职", "失败", `人员ID：${id}；存在${error.rows.length}项离职待返还物品`);
      return NextResponse.json({ message: error.message, outstandingReturns: error.rows }, { status: 409 });
    }
    const message = error instanceof Error && [
      "人员档案不存在或已删除", "该员工已经离职，不能重复操作", "离职日期不能早于入职日期",
    ].includes(error.message) ? error.message : "员工离职办理失败，请稍后重试";
    await personnelLog(session.userId, "离职", "失败", `人员ID：${id}；${message}`);
    return NextResponse.json({ message }, { status: message.includes("不存在") ? 404 : 400 });
  }
}

import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { writeOperationLog, writeOperationLogWithTransaction } from "@/lib/operation-log";
import { canRevenueTarget, revenueTargetDataScope, weekdayText } from "@/lib/revenue-targets";

function dateText(value: Date) {
  return value.toISOString().slice(0, 10);
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canRevenueTarget(session, "view")) return NextResponse.json({ message: "暂无目标营业额查看权限" }, { status: 403 });
  const { id } = await params;
  try {
    const row = await db.storeMonthlyTarget.findFirst({
      where: { AND: [{ id }, await revenueTargetDataScope(session)] },
      include: { dailyTargets: { orderBy: { targetDate: "asc" } } },
    });
    if (!row) return NextResponse.json({ message: "该目标营业额记录已不存在或无权查看" }, { status: 404 });
    await writeOperationLog({ userId: session.userId, username: session.username, page: "目标营业额", action: "查看", result: "成功", detail: `记录编号：${row.recordNo}`, request }).catch(() => undefined);
    return NextResponse.json({
      overview: {
        id: row.id,
        recordNo: row.recordNo,
        targetMonth: row.targetMonth,
        brandName: row.brandNameSnapshot,
        storeName: row.storeNameSnapshot,
        regionName: row.regionNameSnapshot || "-",
        previousActualMonth: row.previousActualMonth,
        previousActualRevenue: row.previousActualRevenueSnapshot.toFixed(2),
        targetAmount: row.targetAmount.toFixed(2),
        remark: row.remark || "-",
        dailyTargetStatus: row.dailyTargetStatus,
      },
      dailyTargets: row.dailyTargets.map(item => ({
        id: item.id,
        targetDate: dateText(item.targetDate),
        weekday: weekdayText(item.targetDate),
        targetAmount: item.targetAmount.toFixed(2),
      })),
    });
  } catch {
    await writeOperationLog({ userId: session.userId, username: session.username, page: "目标营业额", action: "查看", result: "失败", detail: `记录ID：${id}`, request }).catch(() => undefined);
    return NextResponse.json({ message: "目标营业额详情加载失败，请稍后重试" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canRevenueTarget(session, "delete")) return NextResponse.json({ message: "暂无目标营业额删除权限" }, { status: 403 });
  const { id } = await params;
  try {
    const scope = await revenueTargetDataScope(session);
    await db.$transaction(async tx => {
      const current = await tx.storeMonthlyTarget.findFirst({ where: { AND: [{ id }, scope] }, include: { _count: { select: { dailyTargets: true } } } });
      if (!current) throw new Error("TARGET_NOT_FOUND");
      if (current.dailyTargetStatus !== "PENDING" || current._count.dailyTargets > 0) throw new Error("DAILY_TARGET_EXISTS");
      const deleted = await tx.storeMonthlyTarget.deleteMany({ where: { id: current.id, dailyTargetStatus: "PENDING", dailyTargets: { none: {} } } });
      if (deleted.count !== 1) throw new Error("DAILY_TARGET_EXISTS");
      await tx.actualRevenueMonthly.update({ where: { id: current.sourceActualRevenueId }, data: { dailyTargetStatus: "NOT_GENERATED" } });
      await writeOperationLogWithTransaction(tx, {
        userId: session.userId,
        username: session.username,
        page: "目标营业额",
        action: "删除",
        result: "成功",
        detail: `原记录编号：${current.recordNo}；目标月份：${current.targetMonth}；品牌：${current.brandNameSnapshot}；门店ID：${current.storeId}；门店：${current.storeNameSnapshot}；上月实际营业额：${current.previousActualRevenueSnapshot.toFixed(2)}；目标营业额：${current.targetAmount.toFixed(2)}；删除人：${session.realName}`,
        request,
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ message: "目标营业额记录删除成功" });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const blocked = code === "DAILY_TARGET_EXISTS";
    const missing = code === "TARGET_NOT_FOUND" || (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025");
    const message = blocked ? "当前记录已生成每日目标，不支持删除" : missing ? "该目标营业额记录已不存在或已被删除" : "目标营业额删除失败，请稍后重试";
    await writeOperationLog({ userId: session.userId, username: session.username, page: "目标营业额", action: "删除", result: "失败", detail: `${message}；记录ID：${id}`, request }).catch(() => undefined);
    return NextResponse.json({ message }, { status: blocked ? 409 : missing ? 404 : 500 });
  }
}

import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { writeOperationLog, writeOperationLogWithTransaction } from "@/lib/operation-log";
import {
  calculateRevenueDailyTargets, canRevenueTarget, revenueTargetDataScope,
  RevenueTargetCalculationError,
} from "@/lib/revenue-targets";

const weekdayNames = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canRevenueTarget(session, "calculate")) return NextResponse.json({ message: "暂无目标营业额立即计算权限" }, { status: 403 });
  const { id } = await params;
  try {
    const scope = await revenueTargetDataScope(session);
    const result = await db.$transaction(async tx => {
      const target = await tx.storeMonthlyTarget.findFirst({
        where: { AND: [{ id }, scope] },
        include: {
          sourceActualRevenue: { select: { id: true, statMonth: true, dailyDetails: { select: { businessDate: true, revenueAmount: true }, orderBy: { businessDate: "asc" } } } },
          _count: { select: { dailyTargets: true } },
        },
      });
      if (!target) throw new Error("TARGET_NOT_FOUND");
      if (target.dailyTargetStatus !== "PENDING" || target._count.dailyTargets > 0) throw new Error("DAILY_TARGET_ALREADY_GENERATED");
      if (target.sourceActualRevenue.statMonth !== target.previousActualMonth) throw new RevenueTargetCalculationError("目标记录关联的上月实际营业额月份不一致，无法计算每日目标");

      const claimed = await tx.storeMonthlyTarget.updateMany({
        where: { id: target.id, dailyTargetStatus: "PENDING", dailyTargets: { none: {} } },
        data: { dailyTargetStatus: "CALCULATING" },
      });
      if (claimed.count !== 1) throw new Error("DAILY_TARGET_ALREADY_GENERATED");

      const calculated = calculateRevenueDailyTargets({
        targetMonth: target.targetMonth,
        targetAmount: target.targetAmount,
        previousDaily: target.sourceActualRevenue.dailyDetails.filter(item => item.businessDate.toISOString().slice(0, 7) === target.previousActualMonth),
      });
      await tx.storeDailyTarget.createMany({ data: calculated.dailyTargets.map(item => ({
        monthlyTargetId: target.id,
        storeId: target.storeId,
        targetDate: item.targetDate,
        targetAmount: item.targetAmount,
      })) });
      await tx.storeMonthlyTarget.update({ where: { id: target.id }, data: { dailyTargetStatus: "GENERATED" } });
      await tx.actualRevenueMonthly.update({ where: { id: target.sourceActualRevenueId }, data: { dailyTargetStatus: "GENERATED" } });
      const weekdayOrder = [1, 2, 3, 4, 5, 6, 0];
      const averages = weekdayOrder.map(weekday => `${weekdayNames[weekday]}二次均值：${calculated.secondaryAverages[weekday].toFixed(2)}（剔除${calculated.excludedCounts[weekday]}条）`).join("；");
      await writeOperationLogWithTransaction(tx, {
        userId: session.userId,
        username: session.username,
        page: "目标营业额",
        action: "立即计算",
        result: "成功",
        detail: `记录编号：${target.recordNo}；门店：${target.storeNameSnapshot}；目标月份：${target.targetMonth}；月目标：${target.targetAmount.toFixed(2)}；二次均值预估月营业额：${calculated.estimatedMonthAmount.toFixed(2)}；比例系数：${calculated.coefficient.toFixed(8)}；生成${calculated.dailyTargets.length}条；${averages}`,
        request,
      });
      return calculated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    const totalAmount = result.dailyTargets.reduce((total, item) => total.plus(item.targetAmount), new Prisma.Decimal(0));
    return NextResponse.json({
      message: "每日目标营业额计算成功",
      generatedCount: result.dailyTargets.length,
      totalAmount: totalAmount.toFixed(2),
      estimatedMonthAmount: result.estimatedMonthAmount.toFixed(2),
      coefficient: result.coefficient.toFixed(8),
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const missing = code === "TARGET_NOT_FOUND";
    const alreadyGenerated = code === "DAILY_TARGET_ALREADY_GENERATED" || (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002");
    const concurrencyConflict = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
    const ruleError = error instanceof RevenueTargetCalculationError;
    const message = missing ? "该目标营业额记录已不存在或无权操作" : alreadyGenerated ? "当前记录已生成每日目标，不支持重复计算" : concurrencyConflict ? "当前记录正在计算，请刷新列表后查看" : ruleError ? error.message : "每日目标营业额计算失败，请稍后重试";
    await writeOperationLog({ userId: session.userId, username: session.username, page: "目标营业额", action: "立即计算", result: "失败", detail: `${message}；记录ID：${id}`, request }).catch(() => undefined);
    return NextResponse.json({ message }, { status: missing ? 404 : alreadyGenerated || concurrencyConflict ? 409 : ruleError ? 422 : 500 });
  }
}

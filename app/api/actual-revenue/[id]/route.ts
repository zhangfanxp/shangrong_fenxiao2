import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { writeOperationLog, writeOperationLogWithTransaction } from "@/lib/operation-log";
import { actualRevenueDataScope, canActualRevenue, cooperationTypeText } from "@/lib/actual-revenue";

function businessDateText(value: Date) {
  return value.toISOString().slice(0, 10);
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canActualRevenue(session, "view")) return NextResponse.json({ message: "暂无实际营业额查看权限" }, { status: 403 });
  const { id } = await params;
  try {
    const row = await db.actualRevenueMonthly.findFirst({
      where: { AND: [{ id }, await actualRevenueDataScope(session)] },
      include: { dailyDetails: { orderBy: { businessDate: "asc" } }, monthlyTarget: true },
    });
    if (!row) return NextResponse.json({ message: "该实际营业额记录已不存在或无权查看" }, { status: 404 });
    await writeOperationLog({ userId: session.userId, username: session.username, page: "实际营业额", action: "查看", result: "成功", detail: `记录编号：${row.recordNo}`, request }).catch(() => undefined);
    return NextResponse.json({
      overview: {
        id: row.id,
        recordNo: row.recordNo,
        statMonth: row.statMonth,
        brandName: row.brandNameSnapshot,
        storeName: row.storeNameSnapshot,
        regionName: row.regionNameSnapshot || "-",
        storeManagerName: row.storeManagerNameSnapshot || "-",
        supervisorName: row.supervisorNameSnapshot || "-",
        cooperationType: cooperationTypeText(row.cooperationTypeSnapshot),
        monthlyRevenue: row.monthlyRevenue.toFixed(2),
        targetMonth: row.monthlyTarget?.targetMonth ?? null,
        monthlyTarget: row.monthlyTarget?.targetAmount.toFixed(2) ?? null,
      },
      dailyDetails: row.dailyDetails.map(item => ({
        id: item.id,
        businessDate: businessDateText(item.businessDate),
        revenueAmount: item.revenueAmount.toFixed(2),
        discountAmount: item.discountAmount?.toFixed(2) ?? null,
        operatingIncome: item.operatingIncome?.toFixed(2) ?? null,
        orderCount: item.orderCount,
        dinerCount: item.dinerCount,
        tableCount: item.tableCount,
      })),
    });
  } catch {
    await writeOperationLog({ userId: session.userId, username: session.username, page: "实际营业额", action: "查看", result: "失败", detail: `记录ID：${id}`, request }).catch(() => undefined);
    return NextResponse.json({ message: "实际营业额详情加载失败，请稍后重试" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canActualRevenue(session, "delete")) return NextResponse.json({ message: "暂无实际营业额删除权限" }, { status: 403 });
  const { id } = await params;
  try {
    const scope = await actualRevenueDataScope(session);
    await db.$transaction(async tx => {
      const current = await tx.actualRevenueMonthly.findFirst({ where: { AND: [{ id }, scope] }, include: { monthlyTarget: true } });
      if (!current) throw new Prisma.PrismaClientKnownRequestError("实际营业额记录不存在", { code: "P2025", clientVersion: Prisma.prismaVersion.client });
      if (current.monthlyTarget || current.dailyTargetStatus === "GENERATED") throw new Error("ACTUAL_REVENUE_LOCKED");
      await tx.actualRevenueDaily.deleteMany({ where: { monthlyRecordId: current.id } });
      await tx.actualRevenueMonthly.delete({ where: { id: current.id } });
      await writeOperationLogWithTransaction(tx, {
        userId: session.userId,
        username: session.username,
        page: "实际营业额",
        action: "删除",
        result: "成功",
        detail: `原记录编号：${current.recordNo}；统计月份：${current.statMonth}；门店ID：${current.storeId}；门店：${current.storeNameSnapshot}；品牌：${current.brandNameSnapshot}；原月营业额：${current.monthlyRevenue.toFixed(2)}；删除人：${session.realName}`,
        request,
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ message: "实际营业额记录删除成功" });
  } catch (error) {
    const missing = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
    const locked = error instanceof Error && error.message === "ACTUAL_REVENUE_LOCKED";
    await writeOperationLog({ userId: session.userId, username: session.username, page: "实际营业额", action: "删除", result: "失败", detail: locked ? `记录已生成目标，禁止删除：${id}` : `记录删除失败：${id}`, request }).catch(() => undefined);
    if (locked) return NextResponse.json({ message: "当前记录已生成目标，不支持删除" }, { status: 409 });
    return NextResponse.json({ message: missing ? "该实际营业额记录已不存在或已被删除" : "实际营业额记录删除失败，请稍后重试" }, { status: missing ? 404 : 500 });
  }
}


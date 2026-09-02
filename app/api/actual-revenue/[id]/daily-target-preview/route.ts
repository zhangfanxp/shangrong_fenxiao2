import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";
import { actualRevenueDataScope, canActualRevenue } from "@/lib/actual-revenue";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canActualRevenue(session, "daily-target-preview")) return NextResponse.json({ message: "暂无生成日目标权限" }, { status: 403 });
  const { id } = await params;
  try {
    const row = await db.actualRevenueMonthly.findFirst({ where: { AND: [{ id }, await actualRevenueDataScope(session)] }, include: { monthlyTarget: true } });
    if (!row) return NextResponse.json({ message: "该实际营业额记录已不存在或无权操作" }, { status: 404 });
    if (!row.monthlyTarget) return NextResponse.json({ message: "请先设置月目标" }, { status: 409 });
    await writeOperationLog({ userId: session.userId, username: session.username, page: "实际营业额", action: "打开生成日目标", result: "成功", detail: `记录编号：${row.recordNo}；目标月份：${row.monthlyTarget.targetMonth}`, request }).catch(() => undefined);
    return NextResponse.json({ targetMonth: row.monthlyTarget.targetMonth, storeName: row.storeNameSnapshot, monthlyTarget: row.monthlyTarget.targetAmount.toFixed(2), dailyTargetStatus: row.dailyTargetStatus, available: false, message: "日目标计算功能将在后续版本开放。" });
  } catch {
    return NextResponse.json({ message: "日目标预览加载失败，请稍后重试" }, { status: 500 });
  }
}


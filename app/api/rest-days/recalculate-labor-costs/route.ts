import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { recalculateCurrentMonthLaborCosts } from "@/lib/rest-day-labor-cost-recalculation";
import { writeOperationLog } from "@/lib/operation-log";
import { canUseRestDays } from "@/lib/rest-days";

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canUseRestDays(session, "calculate")) return NextResponse.json({ message: "暂无休息日管理立即计算权限" }, { status: 403 });

  try {
    const result = await recalculateCurrentMonthLaborCosts({ userId: session.userId, username: session.username });
    const { failedRecords, ...summary } = result;
    const failedDetail = failedRecords.length
      ? `；失败明细：${failedRecords.slice(0, 20).map(item => `${item.recordNo}（${item.reason}）`).join("、")}${failedRecords.length > 20 ? "等" : ""}`
      : "";
    await writeOperationLog({
      userId: session.userId,
      username: session.username,
      page: "休息日管理",
      action: "立即计算",
      result: summary.failedCount ? "失败" : "成功",
      detail: `计算月份：${summary.monthLabel}；员工总数：${summary.totalCount}；计算完成：${summary.completedCount}；计算失败：${summary.failedCount}${failedDetail}`,
      request,
    }).catch(() => undefined);
    return NextResponse.json(summary, { headers: { "Cache-Control": "no-store" } });
  } catch (reason) {
    const detail = reason instanceof Error ? reason.message : "服务端计算失败";
    await writeOperationLog({
      userId: session.userId,
      username: session.username,
      page: "休息日管理",
      action: "立即计算",
      result: "失败",
      detail,
      request,
    }).catch(() => undefined);
    return NextResponse.json({ message: "本月人力成本计算失败，请稍后重试" }, { status: 500 });
  }
}

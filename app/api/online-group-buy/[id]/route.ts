import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { DailySalesReportError, dailySalesReportDataScope, dailySalesReportSelect, loadDailySalesReportSource, serializeDailySalesReport } from "@/lib/daily-sales-report";
import { canOnlineGroupBuy, onlineGroupBuySourceWhere, withOnlineGroupBuyPercentages } from "@/lib/online-group-buy";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";

const pageName = "线上团购数据";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canOnlineGroupBuy(session, "view")) return NextResponse.json({ message: "暂无线上团购数据查看权限" }, { status: 403 });
  const { id } = await params;
  try {
    const source = await loadDailySalesReportSource();
    const row = await db.taskSubmission.findFirst({
      where: { AND: [onlineGroupBuySourceWhere(source), await dailySalesReportDataScope(session), { id }] },
      select: dailySalesReportSelect(source),
    });
    if (!row) return NextResponse.json({ message: "记录不存在或无权查看" }, { status: 404 });
    const detail = withOnlineGroupBuyPercentages(serializeDailySalesReport(row, source));
    await writeOperationLog({ userId: session.userId, username: session.username, client: "运营PC端", page: pageName, action: "查看", result: "成功", detail: `记录编号：${detail.recordNo}`, request }).catch(() => undefined);
    return NextResponse.json({ row: detail }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    const message = error instanceof DailySalesReportError ? error.message : "线上团购数据详情加载失败，请稍后重试";
    const status = error instanceof DailySalesReportError ? error.status : 500;
    await writeOperationLog({ userId: session.userId, username: session.username, client: "运营PC端", page: pageName, action: "查看", result: "失败", detail: `记录ID：${id}；${message}`, request }).catch(() => undefined);
    return NextResponse.json({ message }, { status });
  }
}

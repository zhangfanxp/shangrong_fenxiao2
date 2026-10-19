import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import {
  canOnlineGroupBuy,
  onlineGroupBuyFilterWhere,
  onlineGroupBuySourceWhere,
  readOnlineGroupBuyFilters,
  withOnlineGroupBuyPercentages,
} from "@/lib/online-group-buy";
import { DAILY_SALES_REPORT_PAGE_SIZES, DailySalesReportError, dailySalesReportDataScope, dailySalesReportSelect, loadDailySalesReportSource, serializeDailySalesReport } from "@/lib/daily-sales-report";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";

const pageName = "线上团购数据";

function positiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export async function GET(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canOnlineGroupBuy(session, "query")) return NextResponse.json({ message: "暂无线上团购数据查询权限" }, { status: 403 });
  const search = new URL(request.url).searchParams;
  const parsedFilters = readOnlineGroupBuyFilters(search);
  if (!parsedFilters.success) return NextResponse.json({ message: parsedFilters.error.issues[0]?.message || "筛选条件不正确" }, { status: 400 });
  const page = positiveInteger(search.get("page"), 1);
  const requestedPageSize = positiveInteger(search.get("pageSize"), 10);
  const pageSize = DAILY_SALES_REPORT_PAGE_SIZES.includes(requestedPageSize as 10 | 20 | 50 | 100) ? requestedPageSize : 10;
  try {
    const source = await loadDailySalesReportSource();
    const where = { AND: [onlineGroupBuySourceWhere(source), await dailySalesReportDataScope(session), onlineGroupBuyFilterWhere(parsedFilters.data)] };
    const [rows, total] = await db.$transaction([
      db.taskSubmission.findMany({
        where,
        select: dailySalesReportSelect(source),
        orderBy: [{ executionDate: "desc" }, { storeNameSnapshot: "asc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.taskSubmission.count({ where }),
    ]);
    await writeOperationLog({ userId: session.userId, username: session.username, client: "运营PC端", page: pageName, action: "查询", result: "成功", detail: `业务数据源：${source.sourceRecordNo}；筛选结果：${total} 条`, request }).catch(() => undefined);
    return NextResponse.json({ rows: rows.map(row => withOnlineGroupBuyPercentages(serializeDailySalesReport(row, source))), total, page, pageSize }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    const message = error instanceof DailySalesReportError ? error.message : "线上团购数据加载失败，请稍后重试";
    const status = error instanceof DailySalesReportError ? error.status : 500;
    await writeOperationLog({ userId: session.userId, username: session.username, client: "运营PC端", page: pageName, action: "查询", result: "失败", detail: message, request }).catch(() => undefined);
    return NextResponse.json({ message }, { status });
  }
}

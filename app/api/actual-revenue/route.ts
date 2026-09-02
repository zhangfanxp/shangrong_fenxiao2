import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";
import {
  actualRevenueDataScope, actualRevenueFilterWhere, actualRevenueListSelect, canActualRevenue,
  readActualRevenueFilters, serializeActualRevenue, validMonth,
} from "@/lib/actual-revenue";

export async function GET(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canActualRevenue(session, "query")) return NextResponse.json({ message: "暂无实际营业额查询权限" }, { status: 403 });
  const search = new URL(request.url).searchParams;
  const background = search.get("_background") === "1";
  const filters = readActualRevenueFilters(search);
  const page = Math.max(1, Number(search.get("page")) || 1);
  const requestedPageSize = Number(search.get("pageSize")) || 20;
  const pageSize = [20, 50, 100].includes(requestedPageSize) ? requestedPageSize : 20;
  if (!validMonth(filters.startMonth) || !validMonth(filters.endMonth)) return NextResponse.json({ message: "统计月份格式不正确" }, { status: 400 });
  if (filters.startMonth && filters.endMonth && filters.startMonth > filters.endMonth) return NextResponse.json({ message: "统计开始月份不能晚于统计截止月份" }, { status: 400 });
  try {
    const where = { AND: [await actualRevenueDataScope(session), actualRevenueFilterWhere(filters)] };
    const [rows, total] = await db.$transaction([
      db.actualRevenueMonthly.findMany({ where, select: actualRevenueListSelect, orderBy: [{ statMonth: "desc" }, { storeNameSnapshot: "asc" }], skip: (page - 1) * pageSize, take: pageSize }),
      db.actualRevenueMonthly.count({ where }),
    ]);
    if (!background) await writeOperationLog({ userId: session.userId, username: session.username, page: "实际营业额", action: "筛选", result: "成功", detail: `筛选结果：${total} 条`, request }).catch(() => undefined);
    return NextResponse.json({ rows: rows.map(serializeActualRevenue), total, page, pageSize }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch {
    if (!background) await writeOperationLog({ userId: session.userId, username: session.username, page: "实际营业额", action: "筛选", result: "失败", detail: "实际营业额列表加载失败", request }).catch(() => undefined);
    return NextResponse.json({ message: "实际营业额数据加载失败，请稍后重试" }, { status: 500 });
  }
}


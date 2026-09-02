import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";
import {
  canStoreCreditScore, readStoreCreditScoreFilters, serializeStoreCreditScore,
  storeCreditScoreDataScope, storeCreditScoreFilterWhere, storeCreditScoreSelect, validDate,
} from "@/lib/store-credit-scores";

export async function GET(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canStoreCreditScore(session, "query")) return NextResponse.json({ message: "暂无门店信用得分查询权限" }, { status: 403 });
  const search = new URL(request.url).searchParams;
  const background = search.get("_background") === "1";
  const filters = readStoreCreditScoreFilters(search);
  const page = Math.max(1, Number(search.get("page")) || 1);
  const requestedPageSize = Number(search.get("pageSize")) || 20;
  const pageSize = [20, 50, 100].includes(requestedPageSize) ? requestedPageSize : 20;
  if (!validDate(filters.assessmentStartDate) || !validDate(filters.assessmentEndDate)) {
    return NextResponse.json({ message: "考核日期格式不正确" }, { status: 400 });
  }
  if (filters.assessmentStartDate && filters.assessmentEndDate && filters.assessmentStartDate > filters.assessmentEndDate) {
    return NextResponse.json({ message: "考核开始日期不能晚于考核截止日期" }, { status: 400 });
  }
  try {
    const where = { AND: [await storeCreditScoreDataScope(session), storeCreditScoreFilterWhere(filters)] };
    const [rows, total] = await db.$transaction([
      db.leadH5Review.findMany({ where, select: storeCreditScoreSelect, orderBy: [{ assessmentDate: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
      db.leadH5Review.count({ where }),
    ]);
    if (!background) await writeOperationLog({ userId: session.userId, username: session.username, page: "门店信用得分", action: "筛选", result: "成功", detail: `筛选结果：${total} 条`, request }).catch(() => undefined);
    return NextResponse.json({ rows: rows.map(serializeStoreCreditScore), total, page, pageSize }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch {
    if (!background) await writeOperationLog({ userId: session.userId, username: session.username, page: "门店信用得分", action: "筛选", result: "失败", detail: "信用评分列表加载失败", request }).catch(() => undefined);
    return NextResponse.json({ message: "门店信用得分数据加载失败，请稍后重试" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  canIntelligentAnalysis, intelligentAnalysisListSelect, intelligentAnalysisWhere,
  readIntelligentAnalysisFilters, serializeIntelligentAnalysis, validIntelligentAnalysisDate,
} from "@/lib/intelligent-analysis";
import { writeOperationLog } from "@/lib/operation-log";

export async function GET(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canIntelligentAnalysis(session, "query")) return NextResponse.json({ message: "暂无智能分析查询权限" }, { status: 403 });
  const search = new URL(request.url).searchParams;
  const background = search.get("_background") === "1";
  const filters = readIntelligentAnalysisFilters(search);
  const page = Math.max(1, Number(search.get("page")) || 1);
  const requestedPageSize = Number(search.get("pageSize")) || 20;
  const pageSize = [20, 50, 100].includes(requestedPageSize) ? requestedPageSize : 20;
  if (!validIntelligentAnalysisDate(filters.taskStartDate) || !validIntelligentAnalysisDate(filters.taskEndDate)) {
    return NextResponse.json({ message: "任务日期格式不正确" }, { status: 400 });
  }
  if (filters.taskStartDate && filters.taskEndDate && filters.taskStartDate > filters.taskEndDate) {
    return NextResponse.json({ message: "任务开始日期不能晚于任务截止日期" }, { status: 400 });
  }
  try {
    const where = await intelligentAnalysisWhere(session, filters);
    const [rows, total] = await db.$transaction([
      db.taskAiAnalysis.findMany({ where, select: intelligentAnalysisListSelect, orderBy: [{ analyzedAt: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
      db.taskAiAnalysis.count({ where }),
    ]);
    if (!background) await writeOperationLog({ userId: session.userId, username: session.username, page: "智能分析", action: "筛选", result: "成功", detail: `筛选结果：${total}条`, request }).catch(() => undefined);
    return NextResponse.json({ rows: rows.map(serializeIntelligentAnalysis), total, page, pageSize }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch {
    if (!background) await writeOperationLog({ userId: session.userId, username: session.username, page: "智能分析", action: "筛选", result: "失败", detail: "智能分析记录列表加载失败", request }).catch(() => undefined);
    return NextResponse.json({ message: "智能分析记录加载失败，请稍后重试" }, { status: 500 });
  }
}

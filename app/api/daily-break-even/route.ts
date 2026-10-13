import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import {
  DAILY_BREAK_EVEN_PAGE_SIZES,
  DailyBreakEvenError,
  canDailyBreakEven,
  dailyBreakEvenDataScope,
  dailyBreakEvenFilterWhere,
  dailyBreakEvenSelect,
  dailyBreakEvenSourceWhere,
  filterDailyBreakEvenByAchievement,
  loadDailyBreakEvenSource,
  readDailyBreakEvenFilters,
  serializeDailyBreakEven,
} from "@/lib/daily-break-even";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";

const pageName = "每日保本营业额";

function positiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export async function GET(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canDailyBreakEven(session, "query")) return NextResponse.json({ message: "暂无每日保本营业额查询权限" }, { status: 403 });
  const search = new URL(request.url).searchParams;
  const parsedFilters = readDailyBreakEvenFilters(search);
  if (!parsedFilters.success) return NextResponse.json({ message: parsedFilters.error.issues[0]?.message || "筛选条件不正确" }, { status: 400 });
  const page = positiveInteger(search.get("page"), 1);
  const requestedPageSize = positiveInteger(search.get("pageSize"), 10);
  const pageSize = DAILY_BREAK_EVEN_PAGE_SIZES.includes(requestedPageSize as 10 | 20 | 50 | 100) ? requestedPageSize : 10;

  try {
    const source = await loadDailyBreakEvenSource();
    const where = { AND: [
      dailyBreakEvenSourceWhere(source),
      await dailyBreakEvenDataScope(session),
      dailyBreakEvenFilterWhere(parsedFilters.data),
    ] };
    let rows;
    let total: number;
    if (parsedFilters.data.achievement) {
      const sourceRows = await db.taskSubmission.findMany({
        where,
        select: dailyBreakEvenSelect(source),
        orderBy: [{ executionDate: "desc" }, { submittedAt: "desc" }, { id: "desc" }],
      });
      const matchedRows = filterDailyBreakEvenByAchievement(sourceRows.map(row => serializeDailyBreakEven(row, source)), parsedFilters.data.achievement);
      total = matchedRows.length;
      rows = matchedRows.slice((page - 1) * pageSize, page * pageSize);
    } else {
      const [sourceRows, sourceTotal] = await db.$transaction([
        db.taskSubmission.findMany({
          where,
          select: dailyBreakEvenSelect(source),
          orderBy: [{ executionDate: "desc" }, { submittedAt: "desc" }, { id: "desc" }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        db.taskSubmission.count({ where }),
      ]);
      rows = sourceRows.map(row => serializeDailyBreakEven(row, source));
      total = sourceTotal;
    }
    await writeOperationLog({
      userId: session.userId,
      username: session.username,
      client: "运营PC端",
      page: pageName,
      action: "筛选",
      result: "成功",
      detail: `业务数据源：${source.sourceRecordNo}；筛选结果：${total} 条`,
      request,
    }).catch(() => undefined);
    return NextResponse.json({ rows, total, page, pageSize }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    const message = error instanceof DailyBreakEvenError ? error.message : "每日保本营业额加载失败，请稍后重试";
    const status = error instanceof DailyBreakEvenError ? error.status : 500;
    await writeOperationLog({ userId: session.userId, username: session.username, client: "运营PC端", page: pageName, action: "筛选", result: "失败", detail: message, request }).catch(() => undefined);
    return NextResponse.json({ message }, { status });
  }
}

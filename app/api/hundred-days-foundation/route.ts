import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  HUNDRED_DAYS_PAGE_SIZES,
  HundredDaysError,
  canHundredDays,
  hundredDaysDataScope,
  hundredDaysFilterWhere,
  hundredDaysSelect,
  hundredDaysSourceWhere,
  loadHundredDaysSource,
  readHundredDaysFilters,
  serializeHundredDaysRows,
} from "@/lib/hundred-days-foundation";
import { writeOperationLog } from "@/lib/operation-log";

const pageName = "百日筑基表";

function positiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export async function GET(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canHundredDays(session, "query")) return NextResponse.json({ message: "暂无百日筑基表查询权限" }, { status: 403 });
  const search = new URL(request.url).searchParams;
  const parsedFilters = readHundredDaysFilters(search);
  if (!parsedFilters.success) return NextResponse.json({ message: parsedFilters.error.issues[0]?.message || "筛选条件不正确" }, { status: 400 });
  const page = positiveInteger(search.get("page"), 1);
  const requestedPageSize = positiveInteger(search.get("pageSize"), 10);
  const pageSize = HUNDRED_DAYS_PAGE_SIZES.includes(requestedPageSize as 10 | 20 | 50 | 100) ? requestedPageSize : 10;

  try {
    const source = await loadHundredDaysSource();
    const where = { AND: [
      hundredDaysSourceWhere(source),
      await hundredDaysDataScope(session),
      hundredDaysFilterWhere(parsedFilters.data),
    ] };
    const platformCount = parsedFilters.data.platform ? 1 : source.platforms.length;
    const submissionCount = await db.taskSubmission.count({ where });
    const total = submissionCount * platformCount;
    const rowOffset = (page - 1) * pageSize;
    const submissionOffset = Math.floor(rowOffset / platformCount);
    const firstPlatformOffset = rowOffset % platformCount;
    const submissionTake = total > rowOffset ? Math.ceil((firstPlatformOffset + pageSize) / platformCount) : 0;
    const sourceRows = submissionTake ? await db.taskSubmission.findMany({
      where,
      select: hundredDaysSelect(source),
      orderBy: [{ executionDate: "desc" }, { storeNameSnapshot: "asc" }, { id: "desc" }],
      skip: submissionOffset,
      take: submissionTake,
    }) : [];
    const platformCode = parsedFilters.data.platform || undefined;
    const rows = sourceRows.flatMap(row => serializeHundredDaysRows(row, source, platformCode)).slice(firstPlatformOffset, firstPlatformOffset + pageSize);
    await writeOperationLog({
      userId: session.userId,
      username: session.username,
      client: "运营PC端",
      page: pageName,
      action: "筛选",
      result: "成功",
      detail: `业务数据源：${source.sourceRecordNo}；筛选结果：${total} 条平台记录`,
      request,
    }).catch(() => undefined);
    return NextResponse.json({ rows, total, page, pageSize }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    const message = error instanceof HundredDaysError ? error.message : "百日筑基表数据加载失败，请稍后重试";
    const status = error instanceof HundredDaysError ? error.status : 500;
    await writeOperationLog({ userId: session.userId, username: session.username, client: "运营PC端", page: pageName, action: "筛选", result: "失败", detail: message, request }).catch(() => undefined);
    return NextResponse.json({ message }, { status });
  }
}

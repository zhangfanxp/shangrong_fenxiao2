import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  LABOR_RECORD_PAGE_SIZES,
  canLaborRecord,
  laborRecordDataScope,
  laborRecordFilterWhere,
  laborRecordSelect,
  readLaborRecordFilters,
  serializeLaborRecord,
} from "@/lib/labor-records";
import { writeOperationLog } from "@/lib/operation-log";

function positiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export async function GET(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canLaborRecord(session, "query")) return NextResponse.json({ message: "暂无用工记录查询权限" }, { status: 403 });
  const search = new URL(request.url).searchParams;
  const parsedFilters = readLaborRecordFilters(search);
  if (!parsedFilters.success) return NextResponse.json({ message: parsedFilters.error.issues[0]?.message || "筛选条件不正确" }, { status: 400 });
  const page = positiveInteger(search.get("page"), 1);
  const requestedPageSize = positiveInteger(search.get("pageSize"), 20);
  const pageSize = LABOR_RECORD_PAGE_SIZES.includes(requestedPageSize as (typeof LABOR_RECORD_PAGE_SIZES)[number]) ? requestedPageSize : 20;
  try {
    const where = { AND: [await laborRecordDataScope(session), laborRecordFilterWhere(parsedFilters.data)] };
    const [rows, total] = await db.$transaction([
      db.storeLaborRecord.findMany({
        where,
        select: laborRecordSelect,
        orderBy: [{ businessDate: "desc" }, { brandNameSnapshot: "asc" }, { storeNameSnapshot: "asc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.storeLaborRecord.count({ where }),
    ]);
    await writeOperationLog({
      userId: session.userId,
      username: session.username,
      client: "运营PC端",
      page: "用工记录",
      action: "筛选",
      result: "成功",
      detail: `筛选结果：${total} 条`,
      request,
    }).catch(() => undefined);
    return NextResponse.json({ rows: rows.map(serializeLaborRecord), total, page, pageSize }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "用工记录加载失败，请稍后重试";
    await writeOperationLog({ userId: session.userId, username: session.username, client: "运营PC端", page: "用工记录", action: "筛选", result: "失败", detail: message, request }).catch(() => undefined);
    return NextResponse.json({ message: "用工记录加载失败，请稍后重试" }, { status: 500 });
  }
}

import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { writeOperationLog, writeOperationLogWithTransaction } from "@/lib/operation-log";
import {
  REST_DAY_HOLIDAY_NAMES, REST_DAY_PAGE_SIZES, RestDayBusinessError, canUseRestDays,
  conflictMessage, dateTextAsDbDate, findRestDayConflict, lockRestDayYears,
  nextRestDayRecordNo, restDayFilterLogDetail, restDayFilterWhere, restDayFiltersSchema,
  restDayInputSchema, restDaySelect, serializeRestDay,
} from "@/lib/rest-days";

export async function GET(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canUseRestDays(session, "query")) return NextResponse.json({ message: "暂无休息日管理查询权限" }, { status: 403 });

  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const requestedPageSize = Number(url.searchParams.get("pageSize")) || 20;
  const pageSize = REST_DAY_PAGE_SIZES.includes(requestedPageSize as (typeof REST_DAY_PAGE_SIZES)[number]) ? requestedPageSize : 20;
  const parsed = restDayFiltersSchema.safeParse({
    year: url.searchParams.get("year") || "",
    month: url.searchParams.get("month") || "",
    holidayKeyword: url.searchParams.get("holidayKeyword") || "",
  });
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message || "筛选参数不正确";
    await writeOperationLog({ userId: session.userId, username: session.username, page: "休息日管理", action: "筛选", result: "失败", detail: message, request }).catch(() => undefined);
    return NextResponse.json({ message }, { status: 400 });
  }
  const detail = restDayFilterLogDetail(parsed.data);

  try {
    const where = restDayFilterWhere(parsed.data);
    const [total, rows] = await db.$transaction([
      db.restDay.count({ where }),
      db.restDay.findMany({
        where,
        select: restDaySelect,
        orderBy: [{ year: "desc" }, { startDate: "asc" }, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    await writeOperationLog({ userId: session.userId, username: session.username, page: "休息日管理", action: "筛选", result: "成功", detail: `${detail}；结果 ${total} 条`, request }).catch(() => undefined);
    return NextResponse.json({ rows: rows.map(serializeRestDay), total, page, pageSize }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    await writeOperationLog({ userId: session.userId, username: session.username, page: "休息日管理", action: "筛选", result: "失败", detail, request }).catch(() => undefined);
    return NextResponse.json({ message: "休息日数据加载失败，请稍后重试" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canUseRestDays(session, "create")) return NextResponse.json({ message: "暂无休息日管理新增权限" }, { status: 403 });

  const parsed = restDayInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message || "休息日信息不正确";
    await writeOperationLog({ userId: session.userId, username: session.username, page: "休息日管理", action: "新增", result: "失败", detail: message, request }).catch(() => undefined);
    return NextResponse.json({ message }, { status: 400 });
  }

  try {
    const createdAt = new Date();
    const created = await db.$transaction(async tx => {
      await lockRestDayYears(tx, [parsed.data.year]);
      const conflict = await findRestDayConflict(tx, parsed.data);
      const message = conflictMessage(conflict);
      if (message) throw new RestDayBusinessError(message, 409);
      const recordNo = await nextRestDayRecordNo(tx, createdAt);
      const row = await tx.restDay.create({
        data: {
          recordNo,
          year: parsed.data.year,
          holidayType: parsed.data.holidayType,
          holidayNameSnapshot: REST_DAY_HOLIDAY_NAMES[parsed.data.holidayType],
          startDate: dateTextAsDbDate(parsed.data.startDate),
          endDate: dateTextAsDbDate(parsed.data.endDate),
          remark: parsed.data.remark || null,
          createdByUserId: session.userId,
          createdByUsername: session.username,
          createdByNameSnapshot: session.realName,
          createdAt,
        },
        select: restDaySelect,
      });
      await writeOperationLogWithTransaction(tx, {
        userId: session.userId,
        username: session.username,
        page: "休息日管理",
        action: "新增",
        result: "成功",
        detail: `记录编号：${recordNo}；所属年份：${row.year}；节日：${row.holidayNameSnapshot}；放假日期：${parsed.data.startDate} ~ ${parsed.data.endDate}`,
        request,
        createdAt,
      });
      return row;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 10000 });
    return NextResponse.json(serializeRestDay(created), { status: 201 });
  } catch (error) {
    if (error instanceof RestDayBusinessError) {
      await writeOperationLog({ userId: session.userId, username: session.username, page: "休息日管理", action: "新增", result: "失败", detail: error.message, request }).catch(() => undefined);
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const message = "相同年份、节日和放假日期的休息日记录已存在";
      await writeOperationLog({ userId: session.userId, username: session.username, page: "休息日管理", action: "新增", result: "失败", detail: message, request }).catch(() => undefined);
      return NextResponse.json({ message }, { status: 409 });
    }
    await writeOperationLog({ userId: session.userId, username: session.username, page: "休息日管理", action: "新增", result: "失败", detail: "服务端保存失败", request }).catch(() => undefined);
    return NextResponse.json({ message: "休息日新增失败，请稍后重试" }, { status: 500 });
  }
}

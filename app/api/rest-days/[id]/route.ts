import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { writeOperationLog, writeOperationLogWithTransaction } from "@/lib/operation-log";
import {
  REST_DAY_HOLIDAY_NAMES, RestDayBusinessError, canUseRestDays, conflictMessage,
  dateTextAsDbDate, dbDateText, findRestDayConflict, lockRestDayYears,
  restDaySelect, restDayUpdateSchema, serializeRestDay,
} from "@/lib/rest-days";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canUseRestDays(session, "view")) return NextResponse.json({ message: "暂无休息日管理查看权限" }, { status: 403 });
  const { id } = await params;
  try {
    const row = await db.restDay.findUnique({ where: { id }, select: restDaySelect });
    if (!row) {
      const message = "当前休息日记录已不存在，请刷新后重新操作";
      await writeOperationLog({ userId: session.userId, username: session.username, page: "休息日管理", action: "查看", result: "失败", detail: `记录ID：${id}；${message}`, request }).catch(() => undefined);
      return NextResponse.json({ message }, { status: 404 });
    }
    await writeOperationLog({ userId: session.userId, username: session.username, page: "休息日管理", action: "查看", result: "成功", detail: `记录编号：${row.recordNo}`, request }).catch(() => undefined);
    return NextResponse.json(serializeRestDay(row), { headers: { "Cache-Control": "no-store" } });
  } catch {
    await writeOperationLog({ userId: session.userId, username: session.username, page: "休息日管理", action: "查看", result: "失败", detail: `记录ID：${id}`, request }).catch(() => undefined);
    return NextResponse.json({ message: "休息日详情加载失败，请稍后重试" }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canUseRestDays(session, "edit")) return NextResponse.json({ message: "暂无休息日管理编辑权限" }, { status: 403 });
  const { id } = await params;
  const parsed = restDayUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message || "休息日信息不正确";
    await writeOperationLog({ userId: session.userId, username: session.username, page: "休息日管理", action: "编辑", result: "失败", detail: message, request }).catch(() => undefined);
    return NextResponse.json({ message }, { status: 400 });
  }

  let before: { year: number; recordNo: string } | null;
  try {
    before = await db.restDay.findUnique({ where: { id }, select: { year: true, recordNo: true } });
  } catch {
    await writeOperationLog({ userId: session.userId, username: session.username, page: "休息日管理", action: "编辑", result: "失败", detail: `记录ID：${id}；服务端查询失败`, request }).catch(() => undefined);
    return NextResponse.json({ message: "休息日保存失败，请稍后重试" }, { status: 500 });
  }
  if (!before) {
    const message = "当前休息日记录已不存在，请刷新后重新操作";
    await writeOperationLog({ userId: session.userId, username: session.username, page: "休息日管理", action: "编辑", result: "失败", detail: `记录ID：${id}；${message}`, request }).catch(() => undefined);
    return NextResponse.json({ message }, { status: 404 });
  }

  try {
    const updated = await db.$transaction(async tx => {
      await lockRestDayYears(tx, [before.year, parsed.data.year]);
      const conflict = await findRestDayConflict(tx, parsed.data, id);
      const message = conflictMessage(conflict);
      if (message) throw new RestDayBusinessError(message, 409);
      const result = await tx.restDay.updateMany({
        where: { id, version: parsed.data.version },
        data: {
          year: parsed.data.year,
          holidayType: parsed.data.holidayType,
          holidayNameSnapshot: REST_DAY_HOLIDAY_NAMES[parsed.data.holidayType],
          startDate: dateTextAsDbDate(parsed.data.startDate),
          endDate: dateTextAsDbDate(parsed.data.endDate),
          remark: parsed.data.remark || null,
          updatedByUserId: session.userId,
          updatedByNameSnapshot: session.realName,
          version: { increment: 1 },
        },
      });
      if (!result.count) {
        const exists = await tx.restDay.findUnique({ where: { id }, select: { id: true } });
        throw new RestDayBusinessError(
          exists ? "当前休息日记录已被其他用户修改，请刷新后重新操作" : "当前休息日记录已不存在，请刷新后重新操作",
          exists ? 409 : 404,
        );
      }
      const row = await tx.restDay.findUnique({ where: { id }, select: restDaySelect });
      if (!row) throw new RestDayBusinessError("当前休息日记录已不存在，请刷新后重新操作", 404);
      await writeOperationLogWithTransaction(tx, {
        userId: session.userId,
        username: session.username,
        page: "休息日管理",
        action: "编辑",
        result: "成功",
        detail: `记录编号：${row.recordNo}；所属年份：${row.year}；节日：${row.holidayNameSnapshot}；放假日期：${parsed.data.startDate} ~ ${parsed.data.endDate}`,
        request,
      });
      return row;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 10000 });
    return NextResponse.json(serializeRestDay(updated));
  } catch (error) {
    if (error instanceof RestDayBusinessError) {
      await writeOperationLog({ userId: session.userId, username: session.username, page: "休息日管理", action: "编辑", result: "失败", detail: `${before.recordNo}；${error.message}`, request }).catch(() => undefined);
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const message = "相同年份、节日和放假日期的休息日记录已存在";
      await writeOperationLog({ userId: session.userId, username: session.username, page: "休息日管理", action: "编辑", result: "失败", detail: `${before.recordNo}；${message}`, request }).catch(() => undefined);
      return NextResponse.json({ message }, { status: 409 });
    }
    await writeOperationLog({ userId: session.userId, username: session.username, page: "休息日管理", action: "编辑", result: "失败", detail: `${before.recordNo}；服务端保存失败`, request }).catch(() => undefined);
    return NextResponse.json({ message: "休息日保存失败，请稍后重试" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canUseRestDays(session, "delete")) return NextResponse.json({ message: "暂无休息日管理删除权限" }, { status: 403 });
  const { id } = await params;
  let before: { year: number } | null;
  try {
    before = await db.restDay.findUnique({ where: { id }, select: { year: true } });
  } catch {
    await writeOperationLog({ userId: session.userId, username: session.username, page: "休息日管理", action: "删除", result: "失败", detail: `记录ID：${id}；服务端查询失败`, request }).catch(() => undefined);
    return NextResponse.json({ message: "休息日删除失败，请稍后重试" }, { status: 500 });
  }
  if (!before) {
    const message = "当前休息日记录已不存在，请刷新后重新操作";
    await writeOperationLog({ userId: session.userId, username: session.username, page: "休息日管理", action: "删除", result: "失败", detail: `记录ID：${id}；${message}`, request }).catch(() => undefined);
    return NextResponse.json({ message }, { status: 404 });
  }

  try {
    const deleted = await db.$transaction(async tx => {
      await lockRestDayYears(tx, [before.year]);
      const row = await tx.restDay.findUnique({ where: { id }, select: restDaySelect });
      if (!row) throw new RestDayBusinessError("当前休息日记录已不存在，请刷新后重新操作", 404);
      const result = await tx.restDay.deleteMany({ where: { id, version: row.version } });
      if (!result.count) throw new RestDayBusinessError("当前休息日记录已不存在，请刷新后重新操作", 404);
      await writeOperationLogWithTransaction(tx, {
        userId: session.userId,
        username: session.username,
        page: "休息日管理",
        action: "删除",
        result: "成功",
        detail: `原记录编号：${row.recordNo}；原所属年份：${row.year}；原节日：${row.holidayNameSnapshot}；原放假开始日期：${dbDateText(row.startDate)}；原放假截止日期：${dbDateText(row.endDate)}；删除人：${session.realName}`,
        request,
      });
      return row;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 10000 });
    return NextResponse.json({ success: true, recordNo: deleted.recordNo });
  } catch (error) {
    if (error instanceof RestDayBusinessError) {
      await writeOperationLog({ userId: session.userId, username: session.username, page: "休息日管理", action: "删除", result: "失败", detail: `记录ID：${id}；${error.message}`, request }).catch(() => undefined);
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    await writeOperationLog({ userId: session.userId, username: session.username, page: "休息日管理", action: "删除", result: "失败", detail: `记录ID：${id}；服务端删除失败`, request }).catch(() => undefined);
    return NextResponse.json({ message: "休息日删除失败，请稍后重试" }, { status: 500 });
  }
}

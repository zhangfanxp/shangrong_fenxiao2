import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";
import {
  attendanceRecordDataScope, attendanceRecordFilterWhere, attendanceRecordListSelect, canAttendanceRecord,
  readAttendanceRecordFilters, serializeAttendanceRecord, validateAttendanceRecordFilters,
} from "@/lib/attendance-records";

export async function GET(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canAttendanceRecord(session, "query")) return NextResponse.json({ message: "暂无考勤记录查询权限" }, { status: 403 });
  const search = new URL(request.url).searchParams;
  const filters = readAttendanceRecordFilters(search);
  const filterError = validateAttendanceRecordFilters(filters);
  if (filterError) return NextResponse.json({ message: filterError }, { status: 400 });
  const page = Math.max(1, Number(search.get("page")) || 1);
  const requestedPageSize = Number(search.get("pageSize")) || 20;
  const pageSize = [20, 50, 100].includes(requestedPageSize) ? requestedPageSize : 20;
  const background = search.get("_background") === "1";
  try {
    const where = { AND: [await attendanceRecordDataScope(session), attendanceRecordFilterWhere(filters)] };
    const [rows, total] = await db.$transaction([
      db.dailyAttendanceRecord.findMany({ where, select: attendanceRecordListSelect, orderBy: [{ attendanceDate: "desc" }, { createdAt: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
      db.dailyAttendanceRecord.count({ where }),
    ]);
    if (!background) await writeOperationLog({ userId: session.userId, username: session.username, client: "运营PC端", page: "考勤记录", action: "筛选", result: "成功", detail: `筛选结果：${total} 条`, request }).catch(() => undefined);
    return NextResponse.json({ rows: rows.map(serializeAttendanceRecord), total, page, pageSize }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch {
    if (!background) await writeOperationLog({ userId: session.userId, username: session.username, client: "运营PC端", page: "考勤记录", action: "筛选", result: "失败", detail: "考勤记录列表加载失败", request }).catch(() => undefined);
    return NextResponse.json({ message: "考勤记录加载失败，请稍后重试" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";
import {
  canTaskRecord, readTaskRecordFilters, serializeTaskRecord, taskRecordDataScope,
  taskRecordFilterWhere, taskRecordListSelect, validTaskRecordDate,
} from "@/lib/task-records";

export async function GET(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canTaskRecord(session, "query")) return NextResponse.json({ message: "暂无任务记录查询权限" }, { status: 403 });
  const search = new URL(request.url).searchParams;
  const background = search.get("_background") === "1";
  const filters = readTaskRecordFilters(search);
  const page = Math.max(1, Number(search.get("page")) || 1);
  const requestedPageSize = Number(search.get("pageSize")) || 20;
  const pageSize = [20, 50, 100].includes(requestedPageSize) ? requestedPageSize : 20;
  if (!validTaskRecordDate(filters.submitStartDate) || !validTaskRecordDate(filters.submitEndDate)) {
    return NextResponse.json({ message: "任务提交日期格式不正确" }, { status: 400 });
  }
  if (filters.submitStartDate && filters.submitEndDate && filters.submitStartDate > filters.submitEndDate) {
    return NextResponse.json({ message: "任务提交开始日期不能晚于任务提交截止日期" }, { status: 400 });
  }
  try {
    const where = { AND: [await taskRecordDataScope(session), taskRecordFilterWhere(filters)] };
    const [rows, total] = await db.$transaction([
      db.taskRecord.findMany({ where, select: taskRecordListSelect, orderBy: [{ triggeredAt: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
      db.taskRecord.count({ where }),
    ]);
    if (!background) await writeOperationLog({ userId: session.userId, username: session.username, page: "任务记录", action: "筛选", result: "成功", detail: `筛选结果：${total} 条`, request }).catch(() => undefined);
    return NextResponse.json({ rows: rows.map(serializeTaskRecord), total, page, pageSize }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch {
    if (!background) await writeOperationLog({ userId: session.userId, username: session.username, page: "任务记录", action: "筛选", result: "失败", detail: "任务记录列表加载失败", request }).catch(() => undefined);
    return NextResponse.json({ message: "任务记录加载失败，请稍后重试" }, { status: 500 });
  }
}

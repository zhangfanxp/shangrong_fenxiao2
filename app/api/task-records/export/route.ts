import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";
import { expireOverdueTaskInstances } from "@/lib/store-h5-tasks";
import {
  canTaskRecord, serializeTaskRecord, taskRecordDataScope, taskRecordFilterWhere,
  taskRecordListSelect, validTaskRecordDate,
} from "@/lib/task-records";

const bodySchema = z.object({
  taskInstanceIds: z.array(z.string().min(1)).max(10000).optional(),
  filters: z.object({
    status: z.enum(["COMPLETED", "PENDING", "OVERDUE"]).optional(),
    taskId: z.string().optional(),
    taskType: z.enum(["DAILY", "WEEKLY", "MONTHLY", "TEMPORARY", "CALENDAR"]).optional(),
    executorKeyword: z.string().optional(),
    submitStartDate: z.string().optional(),
    submitEndDate: z.string().optional(),
  }).default({}),
});

function timestamp() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value || "";
  return `${value("year")}${value("month")}${value("day")}_${value("hour")}${value("minute")}${value("second")}`;
}

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canTaskRecord(session, "export")) return NextResponse.json({ message: "暂无任务记录导出权限" }, { status: 403 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "导出参数不正确" }, { status: 400 });
  const { filters, taskInstanceIds } = parsed.data;
  if (!validTaskRecordDate(filters.submitStartDate) || !validTaskRecordDate(filters.submitEndDate) || (filters.submitStartDate && filters.submitEndDate && filters.submitStartDate > filters.submitEndDate)) {
    return NextResponse.json({ message: "任务提交日期范围不正确" }, { status: 400 });
  }
  try {
    await expireOverdueTaskInstances();
    const where = { AND: [await taskRecordDataScope(session), taskInstanceIds?.length ? { id: { in: taskInstanceIds } } : taskRecordFilterWhere(filters)] };
    const total = await db.taskRecord.count({ where });
    if (total > 50000) return NextResponse.json({ message: "当前筛选结果超过 50000 条，请缩小筛选范围后导出" }, { status: 413 });
    const rows = await db.taskRecord.findMany({ where, select: taskRecordListSelect, orderBy: [{ triggeredAt: "desc" }, { id: "desc" }] });
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "餐饮管理系统";
    const sheet = workbook.addWorksheet("任务记录");
    sheet.columns = [
      { header: "记录编号", key: "recordNo", width: 18 },
      { header: "任务名称", key: "taskName", width: 28 },
      { header: "任务类型", key: "taskType", width: 14 },
      { header: "任务执行人", key: "executor", width: 22 },
      { header: "任务对象", key: "targetEmployee", width: 22 },
      { header: "参与核算完成率", key: "includeCompletionRate", width: 18 },
      { header: "任务创建日期", key: "createdAt", width: 22 },
      { header: "任务提交日期", key: "submittedAt", width: 22 },
      { header: "任务状态", key: "status", width: 14 },
    ];
    for (const source of rows) {
      const row = serializeTaskRecord(source);
      sheet.addRow({ ...row, taskType: row.taskTypeLabel, includeCompletionRate: row.includeCompletionRate ? "参与" : "不参与", status: row.status === "COMPLETED" ? "已完成" : row.status === "OVERDUE" ? "已逾期" : "待完成" });
    }
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1677FF" } };
    sheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = { from: "A1", to: "I1" };
    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = `任务记录_${timestamp()}.xlsx`;
    await writeOperationLog({ userId: session.userId, username: session.username, page: "任务记录", action: "批量导出", result: "成功", detail: `导出 ${rows.length} 条任务记录`, request }).catch(() => undefined);
    return new NextResponse(Buffer.from(buffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}` } });
  } catch {
    await writeOperationLog({ userId: session.userId, username: session.username, page: "任务记录", action: "批量导出", result: "失败", detail: "任务记录导出失败", request }).catch(() => undefined);
    return NextResponse.json({ message: "任务记录导出失败，请稍后重试" }, { status: 500 });
  }
}

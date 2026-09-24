import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";
import {
  canUseRestDays, restDayFilterLogDetail, restDayFilterWhere, restDayFiltersSchema,
  restDaySelect, serializeRestDay,
} from "@/lib/rest-days";

const bodySchema = z.object({
  recordIds: z.array(z.string().trim().min(1)).max(50000).optional(),
  filters: restDayFiltersSchema.default({}),
});

function timestamp() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value || "";
  return `${value("year")}${value("month")}${value("day")}_${value("hour")}${value("minute")}${value("second")}`;
}

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canUseRestDays(session, "export")) return NextResponse.json({ message: "暂无休息日管理导出权限" }, { status: 403 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message || "导出参数不正确" }, { status: 400 });
  const recordIds = parsed.data.recordIds?.length ? [...new Set(parsed.data.recordIds)] : undefined;
  const detail = recordIds ? `已选择 ${recordIds.length} 条休息日记录` : restDayFilterLogDetail(parsed.data.filters);

  try {
    const where = recordIds ? { id: { in: recordIds } } : restDayFilterWhere(parsed.data.filters);
    const total = await db.restDay.count({ where });
    if (total > 50000) return NextResponse.json({ message: "当前筛选结果超过50000条，请缩小筛选范围后导出" }, { status: 413 });
    const rows = await db.restDay.findMany({
      where,
      select: restDaySelect,
      orderBy: [{ year: "desc" }, { startDate: "asc" }, { id: "asc" }],
    });
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "餐饮管理系统";
    const sheet = workbook.addWorksheet("休息日管理");
    sheet.columns = [
      { header: "记录编号", key: "recordNo", width: 17 },
      { header: "所属年份", key: "year", width: 12 },
      { header: "节日", key: "holidayName", width: 16 },
      { header: "放假日期", key: "dateRangeText", width: 29 },
      { header: "创建人", key: "createdByName", width: 18 },
      { header: "创建时间", key: "createdAt", width: 23 },
    ];
    rows.map(serializeRestDay).forEach(row => sheet.addRow(row));
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1677FF" } };
    sheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = { from: "A1", to: "F1" };
    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = `休息日管理_${timestamp()}.xlsx`;
    await writeOperationLog({ userId: session.userId, username: session.username, page: "休息日管理", action: "批量导出", result: "成功", detail: `${detail}；导出 ${rows.length} 条`, request }).catch(() => undefined);
    return new NextResponse(Buffer.from(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      },
    });
  } catch {
    await writeOperationLog({ userId: session.userId, username: session.username, page: "休息日管理", action: "批量导出", result: "失败", detail, request }).catch(() => undefined);
    return NextResponse.json({ message: "休息日数据导出失败，请稍后重试" }, { status: 500 });
  }
}

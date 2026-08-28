import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  canUseMeetingManagement, filterLogDetail, meetingConfigurationForRequest, monthlyMeetingFiltersSchema, monthlyMeetingFilterWhere,
  monthlyMeetingListSelect, serializeMonthlyMeeting,
} from "@/lib/monthly-online-meetings";
import { writeOperationLog } from "@/lib/operation-log";

const bodySchema = z.object({
  meetingIds: z.array(z.string().trim().min(1)).max(10000).optional(),
  filters: monthlyMeetingFiltersSchema.default({}),
});

function timestamp() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value || "";
  return `${value("year")}${value("month")}${value("day")}_${value("hour")}${value("minute")}${value("second")}`;
}

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  const configuration = meetingConfigurationForRequest(request);
  if (!canUseMeetingManagement(session, configuration.permissionPrefix, "export")) return NextResponse.json({ message: `暂无${configuration.pageName}导出权限` }, { status: 403 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message || "导出参数不正确" }, { status: 400 });
  const { meetingIds, filters } = parsed.data;
  const detail = meetingIds?.length ? `已选择 ${meetingIds.length} 条会议记录` : filterLogDetail(filters);

  try {
    const where = meetingIds?.length
      ? { AND: [monthlyMeetingFilterWhere({ meetingMonth: "", expectedAttendeeKeyword: "" }, configuration.type), { id: { in: [...new Set(meetingIds)] } }] }
      : monthlyMeetingFilterWhere(filters, configuration.type);
    const total = await db.meeting.count({ where });
    if (total > 50000) return NextResponse.json({ message: "当前筛选结果超过 50000 条，请缩小筛选范围后导出" }, { status: 413 });
    const rows = await db.meeting.findMany({ where, select: monthlyMeetingListSelect, orderBy: [{ meetingMonth: "desc" }, { notificationReleaseDate: "desc" }, { id: "desc" }] });
    const actualGroups = rows.length ? await db.meetingParticipant.groupBy({
      by: ["meetingId"],
      where: { meetingId: { in: rows.map(row => row.id) }, attendedAt: { not: null } },
      _count: { _all: true },
    }) : [];
    const actualCounts = new Map(actualGroups.map(group => [group.meetingId, group._count._all]));
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "餐饮管理系统";
    const sheet = workbook.addWorksheet(configuration.exportFileName);
    sheet.columns = [
      { header: "记录编号", key: "recordNo", width: 17 },
      { header: "会议月份", key: "meetingMonthText", width: 15 },
      { header: "应参会", key: "expectedCount", width: 12 },
      { header: "实际参会", key: "actualCount", width: 12 },
      { header: "通知发布日期", key: "notificationReleaseDate", width: 17 },
      { header: "发布人", key: "publisherName", width: 18 },
    ];
    for (const source of rows) {
      const row = serializeMonthlyMeeting(source, actualCounts.get(source.id) || 0);
      sheet.addRow({ ...row, actualCount: row.actualCount === null ? "-" : row.actualCount });
    }
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1677FF" } };
    sheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = { from: "A1", to: "F1" };
    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = `${configuration.exportFileName}_${timestamp()}.xlsx`;
    await writeOperationLog({ userId: session.userId, username: session.username, page: configuration.pageName, action: "批量导出", result: "成功", detail: `${detail}；导出 ${rows.length} 条`, request }).catch(() => undefined);
    return new NextResponse(Buffer.from(buffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}` } });
  } catch {
    await writeOperationLog({ userId: session.userId, username: session.username, page: configuration.pageName, action: "批量导出", result: "失败", detail, request }).catch(() => undefined);
    return NextResponse.json({ message: "线上会记录导出失败，请稍后重试" }, { status: 500 });
  }
}

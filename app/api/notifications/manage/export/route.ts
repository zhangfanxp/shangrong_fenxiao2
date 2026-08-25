import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  canManageNotification, notificationFilterWhere, notificationFiltersSchema, notificationListSelect,
  notificationManageDataScope, serializeNotificationList, validNotificationDate,
} from "@/lib/notification-management";
import { writeOperationLog } from "@/lib/operation-log";

const bodySchema = z.object({ notificationIds: z.array(z.string().min(1)).max(10000).optional(), filters: notificationFiltersSchema.default({}) });

function timestamp() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value || "";
  return `${value("year")}${value("month")}${value("day")}_${value("hour")}${value("minute")}${value("second")}`;
}

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canManageNotification(session, "export")) return NextResponse.json({ message: "暂无通知记录导出权限" }, { status: 403 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "导出参数不正确" }, { status: 400 });
  const { notificationIds, filters } = parsed.data;
  if (!validNotificationDate(filters.releaseStartDate) || !validNotificationDate(filters.releaseEndDate) || (filters.releaseStartDate && filters.releaseEndDate && filters.releaseStartDate > filters.releaseEndDate)) return NextResponse.json({ message: "发布日期范围不正确" }, { status: 400 });
  try {
    const where = { AND: [await notificationManageDataScope(session), notificationIds?.length ? { id: { in: notificationIds } } : notificationFilterWhere(filters)] };
    const total = await db.notification.count({ where });
    if (total > 50000) return NextResponse.json({ message: "当前筛选结果超过 50000 条，请缩小筛选范围后导出" }, { status: 413 });
    const sources = await db.notification.findMany({ where, select: notificationListSelect, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
    const readGroups = sources.length ? await db.notificationRecipient.groupBy({ by: ["notificationId"], where: { notificationId: { in: sources.map(item => item.id) }, readAt: { not: null } }, _count: { _all: true } }) : [];
    const readCountById = new Map(readGroups.map(item => [item.notificationId, item._count._all]));
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "餐饮管理系统";
    const sheet = workbook.addWorksheet("通知管理");
    sheet.columns = [
      { header: "记录编号", key: "recordNo", width: 17 }, { header: "通知标题", key: "title", width: 32 },
      { header: "已读数量", key: "readCount", width: 13 }, { header: "未读数量", key: "unreadCount", width: 13 },
      { header: "发布日期", key: "releaseDate", width: 15 }, { header: "发布人", key: "publisherName", width: 18 }, { header: "创建日期", key: "createdAt", width: 22 },
    ];
    for (const source of sources) sheet.addRow(serializeNotificationList(source, readCountById.get(source.id) || 0));
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1677FF" } };
    sheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = { from: "A1", to: "G1" };
    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = `通知管理_${timestamp()}.xlsx`;
    await writeOperationLog({ userId: session.userId, username: session.username, page: "通知管理", action: "批量导出", result: "成功", detail: `导出 ${sources.length} 条通知记录${notificationIds?.length ? "（已选记录）" : "（当前筛选结果）"}`, request }).catch(() => undefined);
    return new NextResponse(Buffer.from(buffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}` } });
  } catch {
    await writeOperationLog({ userId: session.userId, username: session.username, page: "通知管理", action: "批量导出", result: "失败", detail: "通知记录导出失败", request }).catch(() => undefined);
    return NextResponse.json({ message: "通知记录导出失败，请稍后重试" }, { status: 500 });
  }
}

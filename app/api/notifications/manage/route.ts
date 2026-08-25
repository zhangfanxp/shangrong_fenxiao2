import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  canManageNotification, notificationFilterWhere, notificationFiltersSchema,
  notificationListSelect, notificationManageDataScope, serializeNotificationList, validNotificationDate,
} from "@/lib/notification-management";
import { writeOperationLog } from "@/lib/operation-log";

export async function GET(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canManageNotification(session, "query")) return NextResponse.json({ message: "暂无通知管理查询权限" }, { status: 403 });
  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(20, Number(url.searchParams.get("pageSize")) || 20));
  const parsed = notificationFiltersSchema.safeParse({
    title: url.searchParams.get("title") || "",
    releaseStartDate: url.searchParams.get("releaseStartDate") || "",
    releaseEndDate: url.searchParams.get("releaseEndDate") || "",
    publisherName: url.searchParams.get("publisherName") || "",
  });
  if (!parsed.success || !validNotificationDate(parsed.data?.releaseStartDate) || !validNotificationDate(parsed.data?.releaseEndDate)) {
    return NextResponse.json({ message: "发布日期范围不正确" }, { status: 400 });
  }
  if (parsed.data.releaseStartDate && parsed.data.releaseEndDate && parsed.data.releaseStartDate > parsed.data.releaseEndDate) {
    return NextResponse.json({ message: "发布开始日期不能晚于发布截止日期" }, { status: 400 });
  }
  const filterDetail = [parsed.data.title && `标题：${parsed.data.title}`, parsed.data.releaseStartDate && `开始日期：${parsed.data.releaseStartDate}`, parsed.data.releaseEndDate && `截止日期：${parsed.data.releaseEndDate}`, parsed.data.publisherName && `发布人：${parsed.data.publisherName}`].filter(Boolean).join("；") || "全部通知";
  try {
    const where = { AND: [await notificationManageDataScope(session), notificationFilterWhere(parsed.data)] };
    const [total, rows] = await db.$transaction([
      db.notification.count({ where }),
      db.notification.findMany({ where, select: notificationListSelect, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    const readGroups = rows.length ? await db.notificationRecipient.groupBy({ by: ["notificationId"], where: { notificationId: { in: rows.map(item => item.id) }, readAt: { not: null } }, _count: { _all: true } }) : [];
    const readCountById = new Map(readGroups.map(item => [item.notificationId, item._count._all]));
    await writeOperationLog({ userId: session.userId, username: session.username, page: "通知管理", action: "筛选", result: "成功", detail: `${filterDetail}；结果 ${total} 条`, request }).catch(() => undefined);
    return NextResponse.json({ rows: rows.map(item => serializeNotificationList(item, readCountById.get(item.id) || 0)), total, page, pageSize }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    await writeOperationLog({ userId: session.userId, username: session.username, page: "通知管理", action: "筛选", result: "失败", detail: filterDetail, request }).catch(() => undefined);
    return NextResponse.json({ message: "通知记录加载失败，请稍后重试" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { canManageNotification, formatNotificationDate, notificationManageDataScope } from "@/lib/notification-management";
import { formatShanghaiDateTime } from "@/lib/notifications";
import { writeOperationLog } from "@/lib/operation-log";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canManageNotification(session, "view")) return NextResponse.json({ message: "暂无通知查看权限" }, { status: 403 });
  const { id } = await params;
  const peopleType = new URL(request.url).searchParams.get("people");
  const action = peopleType === "read" ? "查看已读人" : peopleType === "unread" ? "查看未读人" : "查看通知";
  try {
    const where = { AND: [{ id }, await notificationManageDataScope(session)] };
    if (peopleType === "read" || peopleType === "unread") {
      const notification = await db.notification.findFirst({ where, select: { recordNo: true, title: true } });
      if (!notification) return NextResponse.json({ message: "通知不存在或已超出数据权限" }, { status: 404 });
      const recipients = await db.notificationRecipient.findMany({
        where: { notificationId: id, ...(peopleType === "read" ? { readAt: { not: null } } : { readAt: null }) },
        select: { id: true, realNameSnapshot: true, roleSnapshot: true, readAt: true },
        orderBy: peopleType === "read" ? [{ readAt: "desc" }, { id: "desc" }] : [{ createdAt: "asc" }, { id: "asc" }],
      });
      await writeOperationLog({ userId: session.userId, username: session.username, page: "通知管理", action, result: "成功", detail: `记录编号：${notification.recordNo}；${peopleType === "read" ? "已读" : "未读"}人数：${recipients.length}`, request }).catch(() => undefined);
      return NextResponse.json({ rows: recipients.map(item => ({ id: item.id, realName: item.realNameSnapshot, role: item.roleSnapshot, readAt: item.readAt ? formatShanghaiDateTime(item.readAt) : null })), total: recipients.length });
    }
    const notification = await db.notification.findFirst({
      where,
      select: { id: true, recordNo: true, title: true, type: true, showAfterLogin: true, content: true, releaseDate: true, releaseAt: true, publisherName: true, createdAt: true, createdByName: true, status: true, recipients: { select: { readAt: true } } },
    });
    if (!notification) return NextResponse.json({ message: "通知不存在或已超出数据权限" }, { status: 404 });
    const readCount = notification.recipients.filter(item => item.readAt).length;
    await writeOperationLog({ userId: session.userId, username: session.username, page: "通知管理", action, result: "成功", detail: `记录编号：${notification.recordNo}；通知标题：${notification.title}`, request }).catch(() => undefined);
    return NextResponse.json({
      id: notification.id, recordNo: notification.recordNo, title: notification.title,
      notificationType: notification.type, showAfterLogin: notification.showAfterLogin, content: notification.content,
      releaseDate: formatNotificationDate(notification.releaseDate), releaseAt: formatShanghaiDateTime(notification.releaseAt).slice(0, 16),
      publisherName: notification.publisherName, createdAt: formatShanghaiDateTime(notification.createdAt), createdByName: notification.createdByName,
      status: notification.status, readCount, unreadCount: notification.recipients.length - readCount,
    });
  } catch {
    await writeOperationLog({ userId: session.userId, username: session.username, page: "通知管理", action, result: "失败", detail: `通知ID：${id}`, request }).catch(() => undefined);
    return NextResponse.json({ message: peopleType === "read" ? "已读人员加载失败，请稍后重试" : peopleType === "unread" ? "未读人员加载失败，请稍后重试" : "通知详情加载失败，请稍后重试" }, { status: 500 });
  }
}

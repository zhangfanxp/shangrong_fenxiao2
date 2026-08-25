import { NotificationStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { canManageNotification, notificationManageDataScope } from "@/lib/notification-management";
import { writeOperationLog, writeOperationLogWithTransaction } from "@/lib/operation-log";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canManageNotification(session, "stop")) return NextResponse.json({ message: "暂无通知停止权限" }, { status: 403 });
  const { id } = await params;
  try {
    const notification = await db.notification.findFirst({
      where: { AND: [{ id }, await notificationManageDataScope(session)] },
      select: { id: true, recordNo: true, title: true, status: true, recipients: { select: { readAt: true } } },
    });
    if (!notification) return NextResponse.json({ message: "通知不存在或已超出数据权限" }, { status: 404 });
    if (notification.status === NotificationStatus.STOPPED) return NextResponse.json({ message: "该通知已经停止，停止操作不可重复执行" }, { status: 409 });
    if (notification.status !== NotificationStatus.PENDING && notification.status !== NotificationStatus.PUBLISHED) return NextResponse.json({ message: "当前通知状态不允许停止" }, { status: 409 });
    const readCount = notification.recipients.filter(item => item.readAt).length;
    const unreadCount = notification.recipients.length - readCount;
    const stoppedAt = new Date();
    const updated = await db.$transaction(async tx => {
      const result = await tx.notification.updateMany({
        where: { id, status: { in: [NotificationStatus.PENDING, NotificationStatus.PUBLISHED] } },
        data: { status: NotificationStatus.STOPPED, stoppedAt, stoppedByUserId: session.userId, stoppedByName: session.realName },
      });
      if (!result.count) throw new Error("NOTIFICATION_STATUS_CHANGED");
      await writeOperationLogWithTransaction(tx, {
        userId: session.userId, username: session.username, page: "通知管理", action: "停止通知", result: "成功",
        detail: `记录编号：${notification.recordNo}；通知标题：${notification.title}；停止时已读数量：${readCount}；停止时未读数量：${unreadCount}；停止操作人：${session.realName}`,
        request, createdAt: stoppedAt,
      });
      return result.count;
    });
    return NextResponse.json({ stopped: Boolean(updated), status: NotificationStatus.STOPPED, message: "通知已停止" });
  } catch (error) {
    const changed = error instanceof Error && error.message === "NOTIFICATION_STATUS_CHANGED";
    await writeOperationLog({ userId: session.userId, username: session.username, page: "通知管理", action: "停止通知", result: "失败", detail: changed ? `通知ID：${id}；状态已发生变化` : `通知ID：${id}；通知停止失败`, request }).catch(() => undefined);
    return NextResponse.json({ message: changed ? "通知状态已发生变化，请刷新列表后重试" : "通知停止失败，请稍后重试" }, { status: changed ? 409 : 500 });
  }
}

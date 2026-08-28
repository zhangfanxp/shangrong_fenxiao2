import { MeetingAttendanceStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { canUseMeetingManagement, dateText, meetingConfigurationForRequest, monthText } from "@/lib/monthly-online-meetings";
import { writeOperationLog } from "@/lib/operation-log";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  const configuration = meetingConfigurationForRequest(request);
  if (!canUseMeetingManagement(session, configuration.permissionPrefix, "view")) return NextResponse.json({ message: `暂无${configuration.pageName}查看权限` }, { status: 403 });
  const { id } = await params;
  try {
    const meeting = await db.meeting.findFirst({
      where: { id, type: configuration.type },
      select: {
        id: true, recordNo: true, meetingMonth: true, notificationContentSnapshot: true,
        notificationReleaseDate: true, publisherNameSnapshot: true, attendanceStatus: true,
        notification: { select: { content: true, releaseDate: true, publisherName: true } },
        participants: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, realNameSnapshot: true, roleSnapshot: true, attendedAt: true } },
      },
    });
    if (!meeting) return NextResponse.json({ message: "会议记录不存在" }, { status: 404 });
    const expectedAttendees = meeting.participants.map(person => ({ id: person.id, realName: person.realNameSnapshot, role: person.roleSnapshot }));
    const actualAttendees = meeting.attendanceStatus === MeetingAttendanceStatus.SIGNED
      ? meeting.participants.filter(person => person.attendedAt).map(person => ({ id: person.id, realName: person.realNameSnapshot, role: person.roleSnapshot }))
      : null;
    await writeOperationLog({ userId: session.userId, username: session.username, page: configuration.pageName, action: "查看", result: "成功", detail: `会议记录编号：${meeting.recordNo}`, request }).catch(() => undefined);
    return NextResponse.json({
      id: meeting.id,
      recordNo: meeting.recordNo,
      meetingMonth: dateText(meeting.meetingMonth).slice(0, 7),
      meetingMonthText: monthText(meeting.meetingMonth),
      notificationContent: meeting.notificationContentSnapshot || meeting.notification.content,
      notificationReleaseDate: dateText(meeting.notificationReleaseDate || meeting.notification.releaseDate),
      publisherName: meeting.publisherNameSnapshot || meeting.notification.publisherName,
      attendanceStatus: meeting.attendanceStatus,
      expectedAttendees,
      actualAttendees,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    await writeOperationLog({ userId: session.userId, username: session.username, page: configuration.pageName, action: "查看", result: "失败", detail: `会议ID：${id}`, request }).catch(() => undefined);
    return NextResponse.json({ message: "会议详情加载失败，请稍后重试" }, { status: 500 });
  }
}

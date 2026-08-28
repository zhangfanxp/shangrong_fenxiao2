import { MeetingAttendanceStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { canUseMeetingManagement, meetingConfigurationForRequest } from "@/lib/monthly-online-meetings";
import { writeOperationLog, writeOperationLogWithTransaction } from "@/lib/operation-log";

const attendanceSchema = z.object({
  actualAttendeeIds: z.array(z.string().trim().min(1)).max(10000),
  attendanceVersion: z.number().int().min(0),
}).refine(value => new Set(value.actualAttendeeIds).size === value.actualAttendeeIds.length, { message: "实际参会人员不能重复" });

class AttendanceConflictError extends Error {}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  const configuration = meetingConfigurationForRequest(request);
  if (!canUseMeetingManagement(session, configuration.permissionPrefix, "attendance")) return NextResponse.json({ message: `暂无${configuration.pageName}签到权限` }, { status: 403 });
  const { id } = await params;
  try {
    const meeting = await db.meeting.findFirst({
      where: { id, type: configuration.type },
      select: {
        id: true, recordNo: true, attendanceStatus: true, attendanceVersion: true,
        participants: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, realNameSnapshot: true, roleSnapshot: true, attendedAt: true } },
      },
    });
    if (!meeting) return NextResponse.json({ message: "会议记录不存在" }, { status: 404 });
    const expectedAttendees = meeting.participants.map(person => ({ id: person.id, realName: person.realNameSnapshot, role: person.roleSnapshot }));
    const actualAttendeeIds = meeting.attendanceStatus === MeetingAttendanceStatus.SIGNED
      ? meeting.participants.filter(person => person.attendedAt).map(person => person.id)
      : meeting.participants.map(person => person.id);
    return NextResponse.json({
      id: meeting.id,
      recordNo: meeting.recordNo,
      expectedAttendees,
      actualAttendeeIds,
      attendanceStatus: meeting.attendanceStatus,
      attendanceVersion: meeting.attendanceVersion,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ message: "会议签到人员加载失败，请稍后重试" }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  const configuration = meetingConfigurationForRequest(request);
  if (!canUseMeetingManagement(session, configuration.permissionPrefix, "attendance")) return NextResponse.json({ message: `暂无${configuration.pageName}签到权限` }, { status: 403 });
  const { id } = await params;
  const parsed = attendanceSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message || "签到参数不正确" }, { status: 400 });

  const meeting = await db.meeting.findFirst({
    where: { id, type: configuration.type },
    select: { id: true, recordNo: true, attendanceVersion: true, participants: { select: { id: true } } },
  }).catch(() => null);
  if (!meeting) return NextResponse.json({ message: "会议记录不存在" }, { status: 404 });
  const expectedIds = new Set(meeting.participants.map(person => person.id));
  if (parsed.data.actualAttendeeIds.some(attendeeId => !expectedIds.has(attendeeId))) {
    return NextResponse.json({ message: "实际参会人员必须属于本次会议应参会名单" }, { status: 400 });
  }

  const now = new Date();
  try {
    await db.$transaction(async tx => {
      const updated = await tx.meeting.updateMany({
        where: { id, type: configuration.type, attendanceVersion: parsed.data.attendanceVersion },
        data: {
          attendanceStatus: MeetingAttendanceStatus.SIGNED,
          attendanceVersion: { increment: 1 },
          checkedInByUserId: session.userId,
          checkedInByName: session.realName,
          checkedInAt: now,
        },
      });
      if (updated.count !== 1) throw new AttendanceConflictError();
      await tx.meetingParticipant.updateMany({ where: { meetingId: id }, data: { attendedAt: null } });
      if (parsed.data.actualAttendeeIds.length) {
        await tx.meetingParticipant.updateMany({
          where: { meetingId: id, id: { in: parsed.data.actualAttendeeIds } },
          data: { attendedAt: now },
        });
      }
      await writeOperationLogWithTransaction(tx, {
        userId: session.userId,
        username: session.username,
        page: configuration.pageName,
        action: "保存会议签到",
        result: "成功",
        detail: `会议记录编号：${meeting.recordNo}；应参会人数：${meeting.participants.length}；实际参会人数：${parsed.data.actualAttendeeIds.length}；签到操作人：${session.realName}`,
        request,
        createdAt: now,
      });
    });
    return NextResponse.json({ message: "会议签到保存成功", attendanceVersion: parsed.data.attendanceVersion + 1 });
  } catch (error) {
    if (error instanceof AttendanceConflictError) {
      return NextResponse.json({ message: "当前会议签到结果已被其他用户修改，请刷新后重新操作。" }, { status: 409 });
    }
    await writeOperationLog({ userId: session.userId, username: session.username, page: configuration.pageName, action: "保存会议签到", result: "失败", detail: `会议记录编号：${meeting.recordNo}`, request }).catch(() => undefined);
    return NextResponse.json({ message: "会议签到保存失败，请稍后重试" }, { status: 500 });
  }
}

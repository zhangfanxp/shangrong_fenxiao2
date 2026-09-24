import { MeetingAttendanceStatus, MeetingType, Prisma } from "@prisma/client";
import { z } from "zod";
import type { Session } from "@/lib/auth";

export type MonthlyMeetingPermission = "query" | "view" | "attendance" | "export";

export function canUseMeetingManagement(session: Pick<Session, "permissions">, permissionPrefix: string, action: MonthlyMeetingPermission) {
  return session.permissions.includes("*")
    || session.permissions.includes("meetings:view")
    || session.permissions.includes(`${permissionPrefix}:${action}`);
}

export function canUseMonthlyOnlineMeetings(session: Pick<Session, "permissions">, action: MonthlyMeetingPermission) {
  return canUseMeetingManagement(session, "monthly-online-meetings", action);
}

export function meetingConfigurationForRequest(request: Request) {
  const pathname = new URL(request.url).pathname;
  if (pathname.startsWith("/api/mid-month-offline-meetings")) {
    return { type: MeetingType.MID_MONTH_OFFLINE, permissionPrefix: "mid-month-offline-meetings", pageName: "月中线下会", exportFileName: "月中线下会" } as const;
  }
  if (pathname.startsWith("/api/quarterly-offline-meetings")) {
    return { type: MeetingType.QUARTERLY_OFFLINE, permissionPrefix: "quarterly-offline-meetings", pageName: "季度线下会", exportFileName: "季度线下会" } as const;
  }
  return { type: MeetingType.MONTHLY_ONLINE, permissionPrefix: "monthly-online-meetings", pageName: "每月线上会", exportFileName: "每月线上会" } as const;
}

export const monthlyMeetingFiltersSchema = z.object({
  meetingMonth: z.string().trim().max(7).default("")
    .refine(value => !value || /^\d{4}-(0[1-9]|1[0-2])$/.test(value), "会议月份不正确"),
  expectedAttendeeKeyword: z.string().trim().max(30, "应参会人姓名不能超过30个字符").default(""),
});

export type MonthlyMeetingFilters = z.infer<typeof monthlyMeetingFiltersSchema>;

export function monthlyMeetingFilterWhere(filters: MonthlyMeetingFilters, type: MeetingType = MeetingType.MONTHLY_ONLINE): Prisma.MeetingWhereInput {
  return {
    type,
    ...(filters.meetingMonth ? { meetingMonth: new Date(`${filters.meetingMonth}-01T00:00:00.000Z`) } : {}),
    ...(filters.expectedAttendeeKeyword ? {
      participants: { some: { realNameSnapshot: { contains: filters.expectedAttendeeKeyword } } },
    } : {}),
  };
}

export const monthlyMeetingListSelect = {
  id: true,
  recordNo: true,
  meetingMonth: true,
  notificationReleaseDate: true,
  publisherNameSnapshot: true,
  notification: { select: { releaseDate: true, publisherName: true } },
  attendanceStatus: true,
  _count: { select: { participants: true } },
} satisfies Prisma.MeetingSelect;

export type MonthlyMeetingListSource = Prisma.MeetingGetPayload<{ select: typeof monthlyMeetingListSelect }>;

export function dateText(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function monthText(value: Date) {
  const [year, month] = dateText(value).split("-");
  return `${year}年${Number(month)}月`;
}

export function serializeMonthlyMeeting(source: MonthlyMeetingListSource, actualCount: number) {
  const releaseDate = source.notificationReleaseDate || source.notification.releaseDate;
  return {
    id: source.id,
    recordNo: source.recordNo,
    meetingMonth: dateText(source.meetingMonth).slice(0, 7),
    meetingMonthText: monthText(source.meetingMonth),
    expectedCount: source._count.participants,
    actualCount: source.attendanceStatus === MeetingAttendanceStatus.SIGNED ? actualCount : null,
    attendanceStatus: source.attendanceStatus,
    notificationReleaseDate: dateText(releaseDate),
    publisherName: source.publisherNameSnapshot || source.notification.publisherName,
  };
}

export function filterLogDetail(filters: MonthlyMeetingFilters, pageName = "每月线上会") {
  return [
    filters.meetingMonth && `会议月份：${filters.meetingMonth}`,
    filters.expectedAttendeeKeyword && `应参会人：${filters.expectedAttendeeKeyword}`,
  ].filter(Boolean).join("；") || `全部${pageName}`;
}

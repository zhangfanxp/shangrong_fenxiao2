import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  canUseMeetingManagement, filterLogDetail, meetingConfigurationForRequest, monthlyMeetingFiltersSchema,
  monthlyMeetingFilterWhere, monthlyMeetingListSelect, serializeMonthlyMeeting,
} from "@/lib/monthly-online-meetings";
import { writeOperationLog } from "@/lib/operation-log";

export async function GET(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  const configuration = meetingConfigurationForRequest(request);
  if (!canUseMeetingManagement(session, configuration.permissionPrefix, "query")) return NextResponse.json({ message: `暂无${configuration.pageName}查询权限` }, { status: 403 });

  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const requestedPageSize = Number(url.searchParams.get("pageSize")) || 20;
  const pageSize = [20, 50, 100].includes(requestedPageSize) ? requestedPageSize : 20;
  const parsed = monthlyMeetingFiltersSchema.safeParse({
    meetingMonth: url.searchParams.get("meetingMonth") || "",
    expectedAttendeeKeyword: url.searchParams.get("expectedAttendeeKeyword") || "",
  });
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message || "筛选参数不正确" }, { status: 400 });
  const detail = filterLogDetail(parsed.data, configuration.pageName);

  try {
    const where = monthlyMeetingFilterWhere(parsed.data, configuration.type);
    const [total, rows] = await db.$transaction([
      db.meeting.count({ where }),
      db.meeting.findMany({
        where,
        select: monthlyMeetingListSelect,
        orderBy: [{ meetingMonth: "desc" }, { notificationReleaseDate: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    const actualGroups = rows.length ? await db.meetingParticipant.groupBy({
      by: ["meetingId"],
      where: { meetingId: { in: rows.map(row => row.id) }, attendedAt: { not: null } },
      _count: { _all: true },
    }) : [];
    const actualCounts = new Map(actualGroups.map(group => [group.meetingId, group._count._all]));
    await writeOperationLog({ userId: session.userId, username: session.username, page: configuration.pageName, action: "筛选", result: "成功", detail: `${detail}；结果 ${total} 条`, request }).catch(() => undefined);
    return NextResponse.json({ rows: rows.map(row => serializeMonthlyMeeting(row, actualCounts.get(row.id) || 0)), total, page, pageSize }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    await writeOperationLog({ userId: session.userId, username: session.username, page: configuration.pageName, action: "筛选", result: "失败", detail, request }).catch(() => undefined);
    return NextResponse.json({ message: `${configuration.pageName}记录加载失败，请稍后重试` }, { status: 500 });
  }
}

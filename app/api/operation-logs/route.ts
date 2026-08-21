import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { backfillLegacyOperationLogs, writeOperationLog } from "@/lib/operation-log";
import { canOperationLog } from "@/lib/operation-log-permissions";
import {
  operationLogFilterDescription,
  operationLogJson,
  operationLogWhere,
  validateOperationLogFilters,
} from "@/lib/operation-log-query";

export async function GET(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canOperationLog(session, "view")) return NextResponse.json({ message: "暂无操作日志查看权限" }, { status: 403 });

  const url = new URL(request.url);
  const parsed = validateOperationLogFilters({
    startDate: url.searchParams.get("startDate") || undefined,
    endDate: url.searchParams.get("endDate") || undefined,
    startTime: url.searchParams.get("startTime") || undefined,
    endTime: url.searchParams.get("endTime") || undefined,
    ipAddress: url.searchParams.get("ipAddress") || undefined,
  });
  if (!parsed.ok) return NextResponse.json({ message: parsed.message }, { status: 400 });
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const requestedPageSize = Number(url.searchParams.get("pageSize")) || 20;
  const pageSize = [20, 50, 100].includes(requestedPageSize) ? requestedPageSize : 20;

  try {
    await backfillLegacyOperationLogs();
    const where = operationLogWhere(parsed.filters);
    await db.operationLog.count({ where });
    await writeOperationLog({
      userId: session.userId,
      username: session.username,
      page: "操作日志",
      action: "筛选",
      result: "成功",
      detail: operationLogFilterDescription(parsed.filters),
      request,
    }).catch(() => undefined);
    const [total, rows] = await db.$transaction([
      db.operationLog.count({ where }),
      db.operationLog.findMany({
        where,
        include: { user: { select: { username: true } } },
        orderBy: [{ createdAt: "desc" }, { recordNo: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return NextResponse.json({ rows: rows.map(operationLogJson), total, page, pageSize });
  } catch {
    await writeOperationLog({ userId: session.userId, username: session.username, page: "操作日志", action: "筛选", result: "失败", detail: "操作日志加载失败", request }).catch(() => undefined);
    return NextResponse.json({ message: "操作日志加载失败，请稍后重试" }, { status: 500 });
  }
}

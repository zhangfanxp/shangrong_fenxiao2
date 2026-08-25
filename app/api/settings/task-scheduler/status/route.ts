import { NextResponse } from "next/server";
import { requireApiSession, sessionHasPermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { getPlatformConfig } from "@/lib/platform-config";
import { dateKeyAsDbDate, shanghaiDateKey, shanghaiTimeKey } from "@/lib/store-h5-tasks";

export async function GET() {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!sessionHasPermission(session, "settings:parameters")) return NextResponse.json({ message: "暂无系统参数查看权限" }, { status: 403 });

  const [platform, lastRun] = await Promise.all([
    getPlatformConfig(),
    db.taskSchedulerRun.findFirst({ orderBy: [{ executionDate: "desc" }, { startedAt: "desc" }] }),
  ]);
  const now = new Date();
  const today = shanghaiDateKey(now);
  const todayRun = lastRun && lastRun.executionDate.getTime() === dateKeyAsDbDate(today).getTime() ? lastRun : null;
  const currentTime = shanghaiTimeKey(now);
  const dueToday = currentTime >= platform.automaticTaskExecutionTime;

  return NextResponse.json({
    scheduledTime: platform.automaticTaskExecutionTime,
    today,
    dueToday,
    todayStatus: todayRun?.status ?? (dueToday ? "WAITING" : "NOT_DUE"),
    lastRun: lastRun ? {
      executionDate: shanghaiDateKey(lastRun.executionDate),
      scheduledTime: lastRun.scheduledTime,
      status: lastRun.status,
      startedAt: lastRun.startedAt,
      completedAt: lastRun.completedAt,
      result: lastRun.result,
      error: lastRun.error,
    } : null,
  }, { headers: { "Cache-Control": "no-store" } });
}

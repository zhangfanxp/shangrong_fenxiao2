import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiSession, sessionHasPermission } from "@/lib/auth";

export async function GET() {
  const totalStartedAt = performance.now();
  const sessionStartedAt = performance.now();
  const session = await requireApiSession(); if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  const sessionDuration = performance.now() - sessionStartedAt;
  if (!sessionHasPermission(session, "dashboard:view")) return NextResponse.json({ message: "暂无查看仪表板的权限" }, { status: 403 });
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const in90Days = new Date(); in90Days.setDate(in90Days.getDate() + 90);
  const databaseStartedAt = performance.now();
  const [contracts, stores, expiringContracts, overdueContracts, todayLogins, taskCount, completedTaskCount, completed, tasks] = await Promise.all([
    db.contract.count(), db.store.count(), db.contract.count({ where: { status: { in: ["ACTIVE", "EXPIRING"] }, endDate: { gte: new Date(), lte: in90Days } } }), db.contract.count({ where: { status: { not: "TERMINATED" }, endDate: { lt: new Date() } } }), db.user.count({ where: { lastLoginAt: { gte: today } } }), db.task.count({ where: { status: "ENABLED" } }), db.taskRecord.count({ where: { status: "COMPLETED" } }),
    db.taskRecord.groupBy({ by: ["taskId"], where: { status: "COMPLETED" }, _count: true }),
    db.task.findMany({ select: { id: true, type: true }, where: { status: "ENABLED" } }),
  ]);
  const databaseDuration = performance.now() - databaseStartedAt;
  const completeMap = new Map(completed.map(row => [row.taskId, row._count]));
  const taskByType = tasks.reduce<Record<string, { total: number; completed: number }>>((result, task) => { const item = result[task.type] ?? { total: 0, completed: 0 }; item.total++; item.completed += completeMap.get(task.id) || 0; result[task.type] = item; return result; }, {});
  const response = NextResponse.json({ contracts, stores, expiringContracts, overdueContracts, todayLogins, taskCount, completedTaskCount, taskByType });
  response.headers.set("Server-Timing", `session;dur=${sessionDuration.toFixed(1)}, dashboard_db;dur=${databaseDuration.toFixed(1)}, total;dur=${(performance.now() - totalStartedAt).toFixed(1)}`);
  return response;
}

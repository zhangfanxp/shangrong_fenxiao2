import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiSession, sessionHasPermission } from "@/lib/auth";
import { getPlatformConfig } from "@/lib/platform-config";
import { dateKeyAsDbDate, shanghaiDateKey } from "@/lib/store-h5-tasks";
import { filterBirthdayReminderPersonnel } from "@/lib/birthday-reminder-scheduler";
import { maskPhone } from "@/lib/format";

const EMPLOYEE_CONTRACT_EXPIRING_DAYS = 30;

export async function GET() {
  const totalStartedAt = performance.now();
  const sessionStartedAt = performance.now();
  const session = await requireApiSession(); if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  const sessionDuration = performance.now() - sessionStartedAt;
  if (!sessionHasPermission(session, "dashboard:view")) return NextResponse.json({ message: "暂无查看仪表板的权限" }, { status: 403 });
  const todayKey = shanghaiDateKey();
  const today = dateKeyAsDbDate(todayKey);
  const platform = await getPlatformConfig();
  const expiringEndDate = new Date(today);
  expiringEndDate.setUTCDate(expiringEndDate.getUTCDate() + platform.contractExpiringWarningDays);
  const employeeContractExpiryEndDate = new Date(today);
  employeeContractExpiryEndDate.setUTCDate(employeeContractExpiryEndDate.getUTCDate() + EMPLOYEE_CONTRACT_EXPIRING_DAYS);
  const databaseStartedAt = performance.now();
  const [contracts, stores, expiringContracts, overdueContracts, expiringEmployeeRows, todayLogins, taskCount, taskRecordCount, completedTaskCount, completed, tasks, birthdayPersonnel] = await Promise.all([
    db.contract.count(),
    db.store.count(),
    db.contract.count({ where: { status: { not: "TERMINATED" }, startDate: { lte: today }, endDate: { gte: today, lt: expiringEndDate } } }),
    db.contract.count({ where: { status: { not: "TERMINATED" }, endDate: { lt: new Date() } } }),
    db.personnel.findMany({
      where: { status: "ACTIVE", deletedAt: null, contractExpiryDate: { gte: today, lt: employeeContractExpiryEndDate } },
      select: { id: true, name: true, phone: true, positionLevel: true, organization: true, department: true, contractSignDate: true, contractExpiryDate: true, store: { select: { name: true } } },
      orderBy: [{ contractExpiryDate: "asc" }, { name: "asc" }],
    }),
    db.user.count({ where: { lastLoginAt: { gte: today } } }),
    db.task.count({ where: { status: "ENABLED" } }),
    db.taskRecord.count(),
    db.taskRecord.count({ where: { status: "COMPLETED" } }),
    db.taskRecord.groupBy({ by: ["taskId"], where: { status: "COMPLETED" }, _count: true }),
    db.task.findMany({ select: { id: true, type: true }, where: { status: "ENABLED" } }),
    db.personnel.findMany({
      where: { status: "ACTIVE", deletedAt: null, birthday: { not: null } },
      select: { id: true, name: true, phone: true, positionLevel: true, organization: true, department: true, birthday: true, birthdayCalendar: true, store: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),
  ]);
  const completeMap = new Map(completed.map(row => [row.taskId, row._count]));
  const taskByType = tasks.reduce<Record<string, { total: number; completed: number }>>((result, task) => { const item = result[task.type] ?? { total: 0, completed: 0 }; item.total++; item.completed += completeMap.get(task.id) || 0; result[task.type] = item; return result; }, {});
  const exposeSensitive = sessionHasPermission(session, "personnel:sensitive");
  const personnelSummary = (row: { name: string; phone: string; positionLevel: string; organization: string; department: string | null; store: { name: string } | null }) => ({
    name: row.name,
    phone: exposeSensitive ? row.phone : maskPhone(row.phone),
    positionLevel: row.positionLevel,
    workplace: row.organization === "总部" ? row.department || "总部（未配置部门）" : row.store?.name || "未安排门店",
  });
  const expiringEmployeeContractRows = expiringEmployeeRows.map(row => ({
    id: row.id,
    ...personnelSummary(row),
    contractSignDate: row.contractSignDate,
    contractExpiryDate: row.contractExpiryDate,
  }));
  const birthdayReminderRows = filterBirthdayReminderPersonnel(birthdayPersonnel, todayKey, platform.birthdayReminderDays).map(row => ({
    id: row.id,
    ...personnelSummary(row),
    birthdayCalendar: row.birthdayCalendar,
    birthday: row.birthday,
  }));
  const databaseDuration = performance.now() - databaseStartedAt;
  const response = NextResponse.json({ contracts, stores, expiringContracts, contractExpiringWarningDays: platform.contractExpiringWarningDays, expiringEmployeeContracts: expiringEmployeeContractRows.length, employeeContractExpiringDays: EMPLOYEE_CONTRACT_EXPIRING_DAYS, expiringEmployeeContractRows, birthdayReminderCount: birthdayReminderRows.length, birthdayReminderDays: platform.birthdayReminderDays, birthdayReminderRows, overdueContracts, todayLogins, taskCount, taskRecordCount, completedTaskCount, taskByType });
  response.headers.set("Server-Timing", `session;dur=${sessionDuration.toFixed(1)}, dashboard_db;dur=${databaseDuration.toFixed(1)}, total;dur=${(performance.now() - totalStartedAt).toFixed(1)}`);
  return response;
}

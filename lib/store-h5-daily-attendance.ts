import type { Prisma } from "@prisma/client";
import { getAttendanceParameterEntries } from "@/lib/brand-day-hour-config";

export const STORE_MANAGER_ROLE_NAME = "店长";

export type AttendanceWindowRule = {
  startDayOffset: 0 | 1;
  startTime: string;
  deadlineDayOffset: 0 | 1;
  deadlineTime: string;
  configured: boolean;
};

export function isStoreManagerRole(roleName: string) {
  return roleName.trim() === STORE_MANAGER_ROLE_NAME;
}

export function shanghaiDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find(item => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function addDateDays(dateKey: string, days: number) {
  const value = new Date(`${dateKey}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function dateKeyAsDbDate(dateKey: string) {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

export function isValidDateKey(dateKey: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])-([012]\d|3[01])$/.test(dateKey)) return false;
  return dateKeyAsDbDate(dateKey).toISOString().slice(0, 10) === dateKey;
}

export function attendanceDateLabel(dateKey: string) {
  const weekdays = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
  return `${dateKey} ${weekdays[new Date(`${dateKey}T12:00:00.000Z`).getUTCDay()]}`;
}

export function formatShanghaiDateTime(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(value);
  const part = (type: string) => parts.find(item => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}:${part("second")}`;
}

export function cooperationTypeLabel(value: string | null | undefined) {
  if (value === "DIRECT") return "直营";
  if (value === "FRANCHISE") return "加盟";
  return value || "-";
}

export async function attendanceWindowRuleForBrand(brandName: string): Promise<AttendanceWindowRule> {
  const entries = await getAttendanceParameterEntries().catch(() => []);
  const entry = entries.find(item => item.brand === brandName);
  return entry
    ? {
        startDayOffset: entry.attendanceStartDayOffset,
        startTime: entry.attendanceStartTime,
        deadlineDayOffset: entry.attendanceDeadlineDayOffset,
        deadlineTime: entry.attendanceDeadlineTime,
        configured: true,
      }
    : { startDayOffset: 0, startTime: "20:00", deadlineDayOffset: 0, deadlineTime: "23:59", configured: false };
}

export function attendanceWindow(dateKey: string, rule: AttendanceWindowRule) {
  const startDate = addDateDays(dateKey, rule.startDayOffset);
  const deadlineDate = addDateDays(dateKey, rule.deadlineDayOffset);
  return {
    opensAt: new Date(`${startDate}T${rule.startTime}:00+08:00`),
    deadlineAt: new Date(`${deadlineDate}T${rule.deadlineTime}:59.999+08:00`),
  };
}

export function activeAttendanceDate(now: Date, rule: AttendanceWindowRule, previousSubmitted = false) {
  const today = shanghaiDateKey(now);
  const yesterday = addDateDays(today, -1);
  const previousWindow = attendanceWindow(yesterday, rule);
  return !previousSubmitted && now >= previousWindow.opensAt && now <= previousWindow.deadlineAt ? yesterday : today;
}

export function attendanceAvailability(now: Date, dateKey: string, rule: AttendanceWindowRule) {
  const window = attendanceWindow(dateKey, rule);
  if (now < window.opensAt) return { status: "NOT_OPEN" as const, ...window };
  if (now > window.deadlineAt) return { status: "CLOSED" as const, ...window };
  return { status: "OPEN" as const, ...window };
}

export async function nextDailyAttendanceRecordNo(tx: Prisma.TransactionClient, creationDate: string) {
  const dateKey = creationDate.replaceAll("-", "");
  const sequence = await tx.dailyAttendanceSequence.upsert({
    where: { dateKey },
    create: { dateKey, nextValue: 2 },
    update: { nextValue: { increment: 1 } },
  });
  const value = sequence.nextValue - 1;
  if (value > 9999) throw new Error("当日考勤记录流水号已达到上限");
  return `${dateKey}${String(value).padStart(4, "0")}`;
}

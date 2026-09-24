import { BirthdayCalendar, PersonnelStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";
import { getPlatformConfig } from "@/lib/platform-config";
import { dateKeyAsDbDate, shanghaiDateKey, shanghaiTimeKey } from "@/lib/store-h5-tasks";

export const BIRTHDAY_REMINDER_JOB_TYPE = "PERSONNEL_BIRTHDAY_REMINDER";

export type BirthdayReminderResult = {
  count: number;
  solarCount: number;
  lunarCount: number;
  reminderDays: number;
  startDate: string;
  endDate: string;
};

export type BirthdayPerson = {
  id: string;
  birthday: string | null;
  birthdayCalendar: BirthdayCalendar;
};

const chineseCalendarFormatter = new Intl.DateTimeFormat("en-u-ca-chinese-nu-latn", {
  timeZone: "Asia/Shanghai",
  month: "2-digit",
  day: "2-digit",
});

export function addDateKeyDays(dateKey: string, days: number) {
  const date = dateKeyAsDbDate(dateKey);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function lunarMonthDayForGregorianDate(dateKey: string) {
  const parts = chineseCalendarFormatter.formatToParts(new Date(`${dateKey}T12:00:00+08:00`));
  const rawMonth = parts.find(part => part.type === "month")?.value || "";
  const rawDay = parts.find(part => part.type === "day")?.value || "";
  const month = rawMonth.match(/^(\d{1,2})(bis)?$/i);
  const day = rawDay.match(/^\d{1,2}$/);
  // 员工档案没有闰月标记，统一按普通农历月份过生日，避免闰年重复提醒。
  if (!month || month[2] || !day) return null;
  return `${month[1].padStart(2, "0")}-${rawDay.padStart(2, "0")}`;
}

export function filterBirthdayReminderPersonnel<T extends BirthdayPerson>(personnel: readonly T[], startDate: string, reminderDays: number) {
  const dateKeys = Array.from({ length: reminderDays }, (_, index) => addDateKeyDays(startDate, index));
  const solarMonthDays = new Set(dateKeys.map(dateKey => dateKey.slice(5)));
  const lunarMonthDays = new Set(dateKeys.map(lunarMonthDayForGregorianDate).filter((value): value is string => Boolean(value)));
  return personnel.filter(person => person.birthday && (person.birthdayCalendar === BirthdayCalendar.SOLAR ? solarMonthDays.has(person.birthday) : lunarMonthDays.has(person.birthday)));
}

export function calculateBirthdayReminder(personnel: readonly BirthdayPerson[], startDate: string, reminderDays: number): BirthdayReminderResult {
  const matchingPersonnel = filterBirthdayReminderPersonnel(personnel, startDate, reminderDays);
  let solarCount = 0;
  let lunarCount = 0;
  for (const person of matchingPersonnel) {
    if (person.birthdayCalendar === BirthdayCalendar.SOLAR) solarCount += 1;
    if (person.birthdayCalendar === BirthdayCalendar.LUNAR) lunarCount += 1;
  }
  return {
    count: solarCount + lunarCount,
    solarCount,
    lunarCount,
    reminderDays,
    startDate,
    endDate: addDateKeyDays(startDate, reminderDays - 1),
  };
}

export function birthdayReminderResultForDate(value: Prisma.JsonValue | null, dateKey: string): BirthdayReminderResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const result = value as Record<string, unknown>;
  if (result.startDate !== dateKey || typeof result.count !== "number" || !Number.isInteger(result.count) || result.count < 0) return null;
  return {
    count: result.count,
    solarCount: typeof result.solarCount === "number" ? result.solarCount : 0,
    lunarCount: typeof result.lunarCount === "number" ? result.lunarCount : 0,
    reminderDays: typeof result.reminderDays === "number" ? result.reminderDays : 7,
    startDate: result.startDate,
    endDate: typeof result.endDate === "string" ? result.endDate : dateKey,
  };
}

export async function runScheduledBirthdayReminderCalculation(now = new Date()) {
  const platform = await getPlatformConfig();
  const scheduledTime = platform.birthdayReminderCalculationTime;
  const currentDate = shanghaiDateKey(now);
  const currentTime = shanghaiTimeKey(now);
  // 23:59 计算次日起的提醒人数；若 Mac 当时未运行，次日启动后补算最近一个应执行日。
  const executionDateKey = currentTime >= scheduledTime ? currentDate : addDateKeyDays(currentDate, -1);
  const executionDate = dateKeyAsDbDate(executionDateKey);
  const uniqueKey = { jobType: BIRTHDAY_REMINDER_JOB_TYPE, executionDate };
  let run = await db.scheduledJobRun.findUnique({ where: { jobType_executionDate: uniqueKey } });
  if (run?.status === "SUCCESS") {
    return { status: "already-completed" as const, date: executionDateKey, scheduledTime, result: run.result };
  }

  const staleBefore = new Date(now.getTime() - 30 * 60 * 1000);
  if (run?.status === "RUNNING" && run.startedAt >= staleBefore) {
    return { status: "already-running" as const, date: executionDateKey, scheduledTime };
  }

  if (!run) {
    try {
      run = await db.scheduledJobRun.create({ data: { ...uniqueKey, scheduledTime, status: "RUNNING", startedAt: now } });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
      return { status: "already-running" as const, date: executionDateKey, scheduledTime };
    }
  } else {
    const claimed = await db.scheduledJobRun.updateMany({
      where: { id: run.id, status: run.status, startedAt: run.startedAt },
      data: { status: "RUNNING", scheduledTime, startedAt: now, completedAt: null, error: null },
    });
    if (!claimed.count) return { status: "already-running" as const, date: executionDateKey, scheduledTime };
  }

  try {
    const personnel = await db.personnel.findMany({
      where: { status: PersonnelStatus.ACTIVE, deletedAt: null, birthday: { not: null } },
      select: { id: true, birthday: true, birthdayCalendar: true },
    });
    const startDate = addDateKeyDays(executionDateKey, 1);
    const result = calculateBirthdayReminder(personnel, startDate, platform.birthdayReminderDays);
    await db.scheduledJobRun.update({
      where: { jobType_executionDate: uniqueKey },
      data: { status: "SUCCESS", completedAt: new Date(), result: result as unknown as Prisma.InputJsonValue, error: null },
    });
    await writeOperationLog({ username: "系统", page: "人员档案", action: "自动计算生日提醒", result: "成功", detail: `提醒日期：${result.startDate}至${result.endDate}；提醒人数：${result.count}；公历：${result.solarCount}；农历：${result.lunarCount}` }).catch(() => undefined);
    return { status: "completed" as const, date: executionDateKey, scheduledTime, ...result };
  } catch (error) {
    const message = error instanceof Error ? error.message : "员工生日提醒计算失败";
    await db.scheduledJobRun.update({
      where: { jobType_executionDate: uniqueKey },
      data: { status: "FAILED", completedAt: new Date(), error: message.slice(0, 10000) },
    }).catch(() => undefined);
    await writeOperationLog({ username: "系统", page: "人员档案", action: "自动计算生日提醒", result: "失败", detail: `执行日期：${executionDateKey}；${message}` }).catch(() => undefined);
    throw error;
  }
}

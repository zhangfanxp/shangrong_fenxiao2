export function shanghaiDateKey(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const part = (name: string) => parts.find(item => item.type === name)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function monthKey(dateKey: string) {
  return dateKey.slice(0, 7);
}

export function shiftMonth(month: string, offset: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function calendarMonthOptions(now = new Date()) {
  const current = monthKey(shanghaiDateKey(now));
  return [current, shiftMonth(current, 1), shiftMonth(current, 2)];
}

export function dateKeysForMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const count = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return Array.from({ length: count }, (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`);
}

export function isEditableCalendarDate(dateKey: string, now = new Date()) {
  const today = shanghaiDateKey(now);
  const allowedMonths = calendarMonthOptions(now);
  return allowedMonths.includes(monthKey(dateKey)) && dateKey >= today;
}

export function dateKeyToDbDate(dateKey: string) {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

export function dbDateToKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

export type TaskCalendarTemplateAction = "query" | "create" | "view" | "edit" | "calendar-edit" | "delete";

/**
 * 日历任务模版的细粒度权限。tasks:settings:view 是历史兼容权限，继续拥有全部操作。
 */
export function canTaskCalendarTemplate(permissions: readonly string[], action: TaskCalendarTemplateAction) {
  return permissions.includes("*")
    || permissions.includes("tasks:settings:view")
    || permissions.includes(`tasks:calendar-templates:${action}`);
}

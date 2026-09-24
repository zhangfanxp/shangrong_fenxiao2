import { Prisma, RestDayHolidayType } from "@prisma/client";
import { z } from "zod";
import type { Session } from "@/lib/auth";
import { db } from "@/lib/db";
import { shanghaiDateTime } from "@/lib/operation-log";

export const REST_DAY_YEAR_MIN = 2026;
export const REST_DAY_YEAR_MAX = 2096;
export const REST_DAY_PAGE_SIZES = [20, 50, 100] as const;

export const REST_DAY_HOLIDAY_NAMES: Record<RestDayHolidayType, string> = {
  NEW_YEAR_DAY: "元旦",
  SPRING_FESTIVAL: "春节",
  QINGMING_FESTIVAL: "清明节",
  LABOR_DAY: "劳动节",
  DRAGON_BOAT_FESTIVAL: "端午节",
  MID_AUTUMN_FESTIVAL: "中秋节",
  NATIONAL_DAY: "国庆节",
  OTHER: "其他",
};

const holidayTypes = Object.values(RestDayHolidayType) as [RestDayHolidayType, ...RestDayHolidayType[]];

export type RestDayPermission = "query" | "create" | "view" | "edit" | "calculate" | "export" | "delete";

export function canUseRestDays(session: Pick<Session, "permissions">, action: RestDayPermission) {
  return session.permissions.includes("*")
    || session.permissions.includes("settings:rest-days")
    || session.permissions.includes(`rest-days:${action}`);
}

export function isValidDateText(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function dateTextAsDbDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

const requiredDate = (message: string) => z.string({ required_error: message, invalid_type_error: message })
  .trim().min(1, message).refine(isValidDateText, "放假日期格式不正确");

const baseRestDayInputSchema = z.object({
  year: z.number({ required_error: "请输入所属年份", invalid_type_error: "所属年份必须为四位数字" })
    .int("所属年份必须为四位数字")
    .refine(value => /^\d{4}$/.test(String(value)), "所属年份必须为四位数字")
    .refine(value => value >= REST_DAY_YEAR_MIN && value <= REST_DAY_YEAR_MAX, `所属年份仅支持${REST_DAY_YEAR_MIN}-${REST_DAY_YEAR_MAX}`),
  holidayType: z.enum(holidayTypes, { required_error: "请选择节日", invalid_type_error: "请选择有效的节日" }),
  startDate: requiredDate("请选择放假开始日期"),
  endDate: requiredDate("请选择放假截止日期"),
  remark: z.string().max(50, "备注不能超过50个字符").default(""),
});

function validateDateRules(data: z.infer<typeof baseRestDayInputSchema>, context: z.RefinementCtx) {
  if (!isValidDateText(data.startDate) || !isValidDateText(data.endDate)) return;
  if (!data.startDate.startsWith(`${data.year}-`) || !data.endDate.startsWith(`${data.year}-`)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["startDate"], message: `放假日期必须属于${data.year}年` });
    return;
  }
  if (data.startDate > data.endDate) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["endDate"], message: "放假开始日期不能晚于放假截止日期" });
  }
}

export const restDayInputSchema = baseRestDayInputSchema.superRefine(validateDateRules);
export const restDayUpdateSchema = baseRestDayInputSchema.extend({
  version: z.number({ required_error: "缺少数据版本，请刷新后重试" }).int().positive(),
}).superRefine(validateDateRules);

export type RestDayInput = z.infer<typeof restDayInputSchema>;

export const restDayFiltersSchema = z.object({
  year: z.string().trim().default("").refine(value => {
    if (!value) return true;
    return /^\d{4}$/.test(value) && Number(value) >= REST_DAY_YEAR_MIN && Number(value) <= REST_DAY_YEAR_MAX;
  }, `请输入${REST_DAY_YEAR_MIN}-${REST_DAY_YEAR_MAX}之间的四位年份`),
  month: z.string().trim().default("").refine(value => !value || /^(?:[1-9]|1[0-2])$/.test(value), "所属月份不正确"),
  holidayKeyword: z.string().trim().max(30, "节日名称不能超过30个字符").default(""),
});

export type RestDayFilters = z.infer<typeof restDayFiltersSchema>;

function monthBounds(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  return { start, end };
}

export function restDayFilterWhere(filters: RestDayFilters): Prisma.RestDayWhereInput {
  const year = filters.year ? Number(filters.year) : undefined;
  const month = filters.month ? Number(filters.month) : undefined;
  const monthIntersections: Prisma.RestDayWhereInput[] | undefined = month
    ? (year ? [year] : Array.from({ length: REST_DAY_YEAR_MAX - REST_DAY_YEAR_MIN + 1 }, (_, index) => REST_DAY_YEAR_MIN + index))
      .map(targetYear => {
        const { start, end } = monthBounds(targetYear, month);
        return { year: targetYear, startDate: { lte: end }, endDate: { gte: start } };
      })
    : undefined;

  return {
    ...(year ? { year } : {}),
    ...(filters.holidayKeyword ? { holidayNameSnapshot: { contains: filters.holidayKeyword } } : {}),
    ...(monthIntersections ? { OR: monthIntersections } : {}),
  };
}

export const restDaySelect = {
  id: true,
  recordNo: true,
  year: true,
  holidayType: true,
  holidayNameSnapshot: true,
  startDate: true,
  endDate: true,
  remark: true,
  createdByNameSnapshot: true,
  createdAt: true,
  version: true,
} satisfies Prisma.RestDaySelect;

export type RestDaySource = Prisma.RestDayGetPayload<{ select: typeof restDaySelect }>;

export function dbDateText(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function formatRestDayDateTime(value: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).format(value).replaceAll("/", "-");
}

export function serializeRestDay(row: RestDaySource) {
  const startDate = dbDateText(row.startDate);
  const endDate = dbDateText(row.endDate);
  return {
    id: row.id,
    recordNo: row.recordNo,
    year: row.year,
    holidayType: row.holidayType,
    holidayName: row.holidayNameSnapshot,
    startDate,
    endDate,
    dateRangeText: startDate === endDate ? startDate : `${startDate} ~ ${endDate}`,
    remark: row.remark || "",
    createdByName: row.createdByNameSnapshot,
    createdAt: formatRestDayDateTime(row.createdAt),
    version: row.version,
  };
}

export function restDayFilterLogDetail(filters: RestDayFilters) {
  return [
    filters.year && `所属年份：${filters.year}`,
    filters.month && `所属月份：${filters.month}月`,
    filters.holidayKeyword && `节日：${filters.holidayKeyword}`,
  ].filter(Boolean).join("；") || "全部休息日";
}

export async function lockRestDayYears(tx: Prisma.TransactionClient, years: number[]) {
  const targets = [...new Set(years)].sort((left, right) => left - right);
  for (const year of targets) {
    await tx.restDayYearLock.upsert({ where: { year }, create: { year }, update: {} });
  }
  if (targets.length) {
    await tx.$queryRaw(Prisma.sql`SELECT \`year\` FROM \`RestDayYearLock\` WHERE \`year\` IN (${Prisma.join(targets)}) ORDER BY \`year\` FOR UPDATE`);
  }
}

export async function nextRestDayRecordNo(tx: Prisma.TransactionClient, now = new Date()) {
  const { dateKey } = shanghaiDateTime(now);
  const sequence = await tx.restDaySequence.upsert({
    where: { dateKey },
    create: { dateKey, nextValue: 2 },
    update: { nextValue: { increment: 1 } },
  });
  const currentValue = sequence.nextValue - 1;
  if (currentValue > 9999) throw new RestDayBusinessError("当日休息日记录流水号已达到上限", 409);
  return `${dateKey}${String(currentValue).padStart(4, "0")}`;
}

export async function findRestDayConflict(tx: Prisma.TransactionClient, input: RestDayInput, excludeId?: string) {
  const startDate = dateTextAsDbDate(input.startDate);
  const endDate = dateTextAsDbDate(input.endDate);
  const commonWhere = { ...(excludeId ? { id: { not: excludeId } } : {}) };
  const duplicate = await tx.restDay.findFirst({ where: {
    ...commonWhere,
    year: input.year,
    holidayType: input.holidayType,
    startDate,
    endDate,
  }, select: { id: true } });
  if (duplicate) return "duplicate" as const;
  const overlap = await tx.restDay.findFirst({ where: {
    ...commonWhere,
    year: input.year,
    startDate: { lte: endDate },
    endDate: { gte: startDate },
  }, select: { id: true } });
  return overlap ? "overlap" as const : null;
}

export class RestDayBusinessError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "RestDayBusinessError";
  }
}

export function conflictMessage(conflict: Awaited<ReturnType<typeof findRestDayConflict>>) {
  if (conflict === "duplicate") return "相同年份、节日和放假日期的休息日记录已存在";
  if (conflict === "overlap") return "所选放假日期与已有休息日记录存在重叠，请调整后再保存";
  return null;
}

/** Shared server-side rest-day lookup for attendance, scheduling and target calculations. */
export async function isRestDay(value: string | Date) {
  const text = typeof value === "string" ? value : shanghaiDateTime(value).operationDate;
  if (!isValidDateText(text)) throw new Error("休息日查询日期格式不正确");
  const date = dateTextAsDbDate(text);
  return Boolean(await db.restDay.findFirst({
    where: { startDate: { lte: date }, endDate: { gte: date } },
    select: { id: true },
  }));
}

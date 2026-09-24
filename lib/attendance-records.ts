import { Prisma } from "@prisma/client";
import type { Session } from "@/lib/auth";
import { db } from "@/lib/db";
import { cooperationTypeLabel, dateKeyAsDbDate, formatShanghaiDateTime, isValidDateKey } from "@/lib/store-h5-daily-attendance";

export type AttendanceRecordAction = "query" | "view" | "export";

export type AttendanceRecordFilters = {
  storeId?: string;
  brand?: string;
  startDate?: string;
  endDate?: string;
};

type LaborCostValue = Prisma.Decimal | string | number | null;

export function calculateActualLaborCost(input: {
  attendanceType: string;
  leaveHours: LaborCostValue;
  overtimeHours: LaborCostValue;
  dailyLaborCost: LaborCostValue;
  hourlyLaborCost: LaborCostValue;
}) {
  const dailyCost = input.dailyLaborCost === null ? null : new Prisma.Decimal(input.dailyLaborCost);
  const hourlyCost = input.hourlyLaborCost === null ? null : new Prisma.Decimal(input.hourlyLaborCost);
  const leaveHours = input.leaveHours === null ? null : new Prisma.Decimal(input.leaveHours);
  const overtimeHours = input.overtimeHours === null ? new Prisma.Decimal(0) : new Prisma.Decimal(input.overtimeHours);
  let baseCost: Prisma.Decimal;

  if (input.attendanceType === "REST" || input.attendanceType === "LEAVE_FULL_DAY") {
    baseCost = new Prisma.Decimal(0);
  } else if (input.attendanceType === "FULL_ATTENDANCE") {
    if (dailyCost === null) return null;
    baseCost = dailyCost;
  } else if (input.attendanceType === "LEAVE_HOURS") {
    if (dailyCost === null || hourlyCost === null || leaveHours === null) return null;
    const afterLeave = dailyCost.minus(hourlyCost.times(leaveHours));
    baseCost = afterLeave.lessThan(0) ? new Prisma.Decimal(0) : afterLeave;
  } else {
    return null;
  }

  if (overtimeHours.greaterThan(0)) {
    if (hourlyCost === null) return null;
    baseCost = baseCost.plus(hourlyCost.times(overtimeHours));
  }
  return baseCost.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

export function canAttendanceRecord(session: Session, action: AttendanceRecordAction) {
  if (session.permissions.includes("*")) return true;
  if (session.permissions.includes(`attendance-records:${action}`)) return true;
  return (action === "query" || action === "view") && session.permissions.includes("staff:view");
}

function jsonStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item)) : null;
}

async function userScope(session: Session) {
  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { leadH5BrandIds: true, leadH5StoreIds: true },
  });
  if (!user) return { exists: false, brandIds: [] as string[] | null, storeIds: [] as string[] | null };
  const configuredBrandIds = jsonStringArray(user.leadH5BrandIds);
  const configuredStoreIds = jsonStringArray(user.leadH5StoreIds);
  const tokenBrandIds = session.permissions.filter(value => value.startsWith("data:brand:")).map(value => value.slice(11)).filter(Boolean);
  const tokenStoreIds = session.permissions.filter(value => value.startsWith("data:store:")).map(value => value.slice(11)).filter(Boolean);
  return {
    exists: true,
    brandIds: configuredBrandIds ?? (tokenBrandIds.length ? tokenBrandIds : null),
    storeIds: configuredStoreIds ?? (tokenStoreIds.length ? tokenStoreIds : null),
  };
}

export async function attendanceRecordDataScope(session: Session): Promise<Prisma.DailyAttendanceRecordWhereInput> {
  const scope = await userScope(session);
  if (!scope.exists) return { id: { in: [] } };
  const where: Prisma.DailyAttendanceRecordWhereInput = {};
  if (scope.brandIds !== null) where.brandIdSnapshot = { in: scope.brandIds };
  if (scope.storeIds !== null) where.storeId = { in: scope.storeIds };
  return where;
}

export async function attendanceStoreDataScope(session: Session): Promise<Prisma.StoreWhereInput> {
  const scope = await userScope(session);
  if (!scope.exists) return { id: { in: [] } };
  const where: Prisma.StoreWhereInput = {};
  if (scope.brandIds !== null) where.brandId = { in: scope.brandIds };
  if (scope.storeIds !== null) where.id = { in: scope.storeIds };
  return where;
}

function read(search: URLSearchParams, key: string, maximum = 100) {
  return search.get(key)?.trim().slice(0, maximum) || undefined;
}

export function readAttendanceRecordFilters(search: URLSearchParams): AttendanceRecordFilters {
  return {
    storeId: read(search, "storeId", 191),
    brand: read(search, "brand"),
    startDate: read(search, "startDate", 10),
    endDate: read(search, "endDate", 10),
  };
}

export function validateAttendanceRecordFilters(filters: AttendanceRecordFilters) {
  if ((filters.startDate && !isValidDateKey(filters.startDate)) || (filters.endDate && !isValidDateKey(filters.endDate))) return "考勤日期格式不正确";
  if (filters.startDate && filters.endDate && filters.startDate > filters.endDate) return "考勤开始日期不能晚于考勤截止日期";
  return null;
}

export function attendanceRecordFilterWhere(filters: AttendanceRecordFilters): Prisma.DailyAttendanceRecordWhereInput {
  const AND: Prisma.DailyAttendanceRecordWhereInput[] = [];
  if (filters.storeId) AND.push({ storeId: filters.storeId });
  if (filters.brand) AND.push({ OR: [{ brandIdSnapshot: filters.brand }, { brandNameSnapshot: filters.brand }] });
  if (filters.startDate || filters.endDate) AND.push({
    attendanceDate: {
      ...(filters.startDate ? { gte: dateKeyAsDbDate(filters.startDate) } : {}),
      ...(filters.endDate ? { lte: dateKeyAsDbDate(filters.endDate) } : {}),
    },
  });
  return AND.length ? { AND } : {};
}

export const attendanceRecordListSelect = {
  id: true,
  recordNo: true,
  brandNameSnapshot: true,
  storeNameSnapshot: true,
  cooperationTypeSnapshot: true,
  partTimeHeadcount: true,
  attendanceDate: true,
  createdByNameSnapshot: true,
  createdAt: true,
} satisfies Prisma.DailyAttendanceRecordSelect;

type SelectedAttendanceRecord = Prisma.DailyAttendanceRecordGetPayload<{ select: typeof attendanceRecordListSelect }>;

export function businessDateText(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function serializeAttendanceRecord(row: SelectedAttendanceRecord) {
  return {
    id: row.id,
    recordNo: row.recordNo,
    brandName: row.brandNameSnapshot,
    storeName: row.storeNameSnapshot,
    cooperationType: cooperationTypeLabel(row.cooperationTypeSnapshot),
    partTimeWorkerCount: row.partTimeHeadcount,
    attendanceDate: businessDateText(row.attendanceDate),
    createdByName: row.createdByNameSnapshot,
    createdAt: formatShanghaiDateTime(row.createdAt),
  };
}

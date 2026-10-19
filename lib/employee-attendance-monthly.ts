import { DailyAttendanceType, Prisma } from "@prisma/client";
import type { Session } from "@/lib/auth";
import { db } from "@/lib/db";
import { attendanceRecordDataScope } from "@/lib/attendance-records";
import { dateKeyAsDbDate } from "@/lib/store-h5-daily-attendance";

export type EmployeeAttendanceMonthlyFilters = {
  brand?: string;
  storeId?: string;
  startMonth?: string;
  endMonth?: string;
  employeeName?: string;
  position?: string;
};

export type EmployeeAttendanceMonthlyRow = {
  id: string;
  statMonth: string;
  brandName: string;
  storeName: string;
  employeeName: string;
  position: string;
  attendanceDays: number;
  restDays: number;
  overtimeHours: number;
  leaveHours: number;
};

const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;

function read(search: URLSearchParams, key: string, maximum = 100) {
  return search.get(key)?.trim().slice(0, maximum) || undefined;
}

export function readEmployeeAttendanceMonthlyFilters(search: URLSearchParams): EmployeeAttendanceMonthlyFilters {
  return {
    brand: read(search, "brand"),
    storeId: read(search, "storeId", 191),
    startMonth: read(search, "startMonth", 7),
    endMonth: read(search, "endMonth", 7),
    employeeName: read(search, "employeeName", 50),
    position: read(search, "position", 50),
  };
}

export function validateEmployeeAttendanceMonthlyFilters(filters: EmployeeAttendanceMonthlyFilters) {
  if ((filters.startMonth && !monthPattern.test(filters.startMonth)) || (filters.endMonth && !monthPattern.test(filters.endMonth))) {
    return "统计月份格式不正确";
  }
  if (filters.startMonth && filters.endMonth && filters.startMonth > filters.endMonth) {
    return "开始月份不能晚于截止月份";
  }
  return null;
}

function nextMonth(month: string) {
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  return monthNumber === 12
    ? `${year + 1}-01`
    : `${year}-${String(monthNumber + 1).padStart(2, "0")}`;
}

export function employeeAttendanceMonthlyFilterWhere(filters: EmployeeAttendanceMonthlyFilters): Prisma.DailyAttendanceRecordWhereInput {
  const AND: Prisma.DailyAttendanceRecordWhereInput[] = [];
  if (filters.storeId) AND.push({ storeId: filters.storeId });
  if (filters.brand) AND.push({ OR: [{ brandIdSnapshot: filters.brand }, { brandNameSnapshot: filters.brand }] });
  if (filters.startMonth || filters.endMonth) {
    AND.push({
      attendanceDate: {
        ...(filters.startMonth ? { gte: dateKeyAsDbDate(`${filters.startMonth}-01`) } : {}),
        ...(filters.endMonth ? { lt: dateKeyAsDbDate(`${nextMonth(filters.endMonth)}-01`) } : {}),
      },
    });
  }
  return AND.length ? { AND } : {};
}

function roundHours(value: number) {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

function compareText(left: string, right: string) {
  return left.localeCompare(right, "zh-CN");
}

const itemSelect = {
  personnelId: true,
  personnelNameSnapshot: true,
  positionLevelSnapshot: true,
  attendanceType: true,
  leaveHours: true,
  overtimeHours: true,
} satisfies Prisma.DailyAttendanceItemSelect;

const recordSelect = {
  attendanceDate: true,
  storeId: true,
  storeNameSnapshot: true,
  brandNameSnapshot: true,
  store: { select: { workdayHours: true } },
  items: { select: itemSelect },
} satisfies Prisma.DailyAttendanceRecordSelect;

type AttendanceSourceRecord = Prisma.DailyAttendanceRecordGetPayload<{ select: typeof recordSelect }>;

export async function loadEmployeeAttendanceMonthlyRows(session: Session, filters: EmployeeAttendanceMonthlyFilters) {
  const itemWhere: Prisma.DailyAttendanceItemWhereInput = {};
  if (filters.employeeName) itemWhere.personnelNameSnapshot = { contains: filters.employeeName };
  if (filters.position) itemWhere.positionLevelSnapshot = { contains: filters.position };

  const where: Prisma.DailyAttendanceRecordWhereInput = {
    AND: [
      await attendanceRecordDataScope(session),
      employeeAttendanceMonthlyFilterWhere(filters),
      ...(Object.keys(itemWhere).length ? [{ items: { some: itemWhere } }] : []),
    ],
  };
  const records = await db.dailyAttendanceRecord.findMany({
    where,
    select: {
      ...recordSelect,
      items: { where: Object.keys(itemWhere).length ? itemWhere : undefined, select: itemSelect },
    },
    orderBy: [{ attendanceDate: "desc" }, { storeNameSnapshot: "asc" }],
  }) as AttendanceSourceRecord[];

  const summaries = new Map<string, EmployeeAttendanceMonthlyRow>();
  for (const record of records) {
    const statMonth = record.attendanceDate.toISOString().slice(0, 7);
    const workdayHours = record.store.workdayHours === null ? 0 : Number(record.store.workdayHours);
    for (const item of record.items) {
      const key = `${statMonth}|${record.storeId}|${item.personnelId}`;
      const current = summaries.get(key) ?? {
        id: key,
        statMonth,
        brandName: record.brandNameSnapshot,
        storeName: record.storeNameSnapshot,
        employeeName: item.personnelNameSnapshot,
        position: item.positionLevelSnapshot,
        attendanceDays: 0,
        restDays: 0,
        overtimeHours: 0,
        leaveHours: 0,
      };
      current.employeeName = item.personnelNameSnapshot;
      current.position = item.positionLevelSnapshot;
      if (item.attendanceType === DailyAttendanceType.FULL_ATTENDANCE) current.attendanceDays += 1;
      if (item.attendanceType === DailyAttendanceType.REST) current.restDays += 1;
      if (item.overtimeHours !== null) current.overtimeHours += Number(item.overtimeHours);
      if (item.attendanceType === DailyAttendanceType.LEAVE_FULL_DAY) current.leaveHours += workdayHours;
      if (item.attendanceType === DailyAttendanceType.LEAVE_HOURS && item.leaveHours !== null) current.leaveHours += Number(item.leaveHours);
      summaries.set(key, current);
    }
  }

  return [...summaries.values()]
    .map(row => ({ ...row, overtimeHours: roundHours(row.overtimeHours), leaveHours: roundHours(row.leaveHours) }))
    .sort((left, right) => right.statMonth.localeCompare(left.statMonth) || compareText(left.brandName, right.brandName) || compareText(left.storeName, right.storeName) || compareText(left.employeeName, right.employeeName) || compareText(left.position, right.position));
}

export async function queryEmployeeAttendanceMonthlyRows(session: Session, filters: EmployeeAttendanceMonthlyFilters, page: number, pageSize: number) {
  const rows = await loadEmployeeAttendanceMonthlyRows(session, filters);
  return { rows: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length };
}

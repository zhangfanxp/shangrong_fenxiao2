import { Prisma } from "@prisma/client";
import type { Session } from "@/lib/auth";
import {
  attendanceRecordDataScope,
  attendanceRecordFilterWhere,
  attendanceStoreDataScope,
  businessDateText,
  calculateActualLaborCost,
  readAttendanceRecordFilters,
  validateAttendanceRecordFilters,
  type AttendanceRecordFilters,
} from "@/lib/attendance-records";
import { cooperationTypeLabel } from "@/lib/store-h5-daily-attendance";

export type LaborCostAction = "query" | "view" | "export";
export type LaborCostFilters = AttendanceRecordFilters;

export function canLaborCost(session: Session, action: LaborCostAction) {
  if (session.permissions.includes("*")) return true;
  if (session.permissions.includes(`labor-costs:${action}`)) return true;
  return (action === "query" || action === "view") && session.permissions.includes("operations:view");
}

export const laborCostDataScope = attendanceRecordDataScope;
export const laborCostStoreDataScope = attendanceStoreDataScope;
export const readLaborCostFilters = readAttendanceRecordFilters;
export const validateLaborCostFilters = validateAttendanceRecordFilters;
export const laborCostFilterWhere = attendanceRecordFilterWhere;

const laborCostItemSelect = {
  personnelId: true,
  personnelNameSnapshot: true,
  positionLevelSnapshot: true,
  attendanceType: true,
  leaveHours: true,
  overtimeHours: true,
  laborCostSnapshot: true,
  hourlyLaborCostSnapshot: true,
  sortOrder: true,
} satisfies Prisma.DailyAttendanceItemSelect;

export const laborCostRecordSelect = {
  id: true,
  recordNo: true,
  attendanceDate: true,
  brandNameSnapshot: true,
  storeNameSnapshot: true,
  cooperationTypeSnapshot: true,
  partTimeActualLaborCost: true,
  items: { select: laborCostItemSelect, orderBy: [{ sortOrder: "asc" as const }, { personnelNameSnapshot: "asc" as const }] },
} satisfies Prisma.DailyAttendanceRecordSelect;

type SelectedLaborCostRecord = Prisma.DailyAttendanceRecordGetPayload<{ select: typeof laborCostRecordSelect }>;

function actualLaborCost(item: SelectedLaborCostRecord["items"][number]) {
  return calculateActualLaborCost({
    attendanceType: item.attendanceType,
    leaveHours: item.leaveHours,
    overtimeHours: item.overtimeHours,
    dailyLaborCost: item.laborCostSnapshot,
    hourlyLaborCost: item.hourlyLaborCostSnapshot,
  });
}

function fullTimeSubtotal(row: SelectedLaborCostRecord) {
  let subtotal = new Prisma.Decimal(0);
  for (const item of row.items) {
    const amount = actualLaborCost(item);
    if (amount === null) return null;
    subtotal = subtotal.plus(amount);
  }
  return subtotal.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

function money(value: Prisma.Decimal | null) {
  return value === null ? null : value.toFixed(2);
}

export function attendanceStatus(type: string, leaveHours: Prisma.Decimal | null) {
  if (type === "FULL_ATTENDANCE") return "全勤";
  if (type === "REST") return "休息";
  if (type === "LEAVE_FULL_DAY") return "请假全天";
  if (type === "LEAVE_HOURS") return `请假${leaveHours === null ? "-" : Number(leaveHours)}小时`;
  return "-";
}

export function serializeLaborCostRecord(row: SelectedLaborCostRecord) {
  const fullTimeLaborCost = fullTimeSubtotal(row);
  const partTimeLaborCost = row.partTimeActualLaborCost ?? new Prisma.Decimal(0);
  const totalLaborCost = fullTimeLaborCost === null ? null : fullTimeLaborCost.plus(partTimeLaborCost).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  return {
    id: row.id,
    attendanceDate: businessDateText(row.attendanceDate),
    recordNo: row.recordNo,
    brandName: row.brandNameSnapshot,
    storeName: row.storeNameSnapshot,
    cooperationType: cooperationTypeLabel(row.cooperationTypeSnapshot),
    fullTimeLaborCost: money(fullTimeLaborCost),
    partTimeLaborCost: money(partTimeLaborCost)!,
    totalLaborCost: money(totalLaborCost),
  };
}

export function serializeLaborCostDetail(row: SelectedLaborCostRecord) {
  const summary = serializeLaborCostRecord(row);
  return {
    overview: summary,
    details: row.items.map(item => ({
      personnelId: item.personnelId,
      personnelName: item.personnelNameSnapshot,
      positionStar: item.positionLevelSnapshot,
      attendanceStatus: attendanceStatus(item.attendanceType, item.leaveHours),
      attendanceType: item.attendanceType,
      leaveHours: item.leaveHours === null ? null : item.leaveHours.toString(),
      overtimeHours: item.overtimeHours === null ? "0" : item.overtimeHours.toString(),
      dailyLaborCost: item.laborCostSnapshot === null ? null : item.laborCostSnapshot.toFixed(2),
      hourlyLaborCost: item.hourlyLaborCostSnapshot === null ? null : item.hourlyLaborCostSnapshot.toFixed(2),
      actualLaborCost: money(actualLaborCost(item)),
    })),
  };
}

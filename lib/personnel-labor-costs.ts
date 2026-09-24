export const MONTHLY_REST_RULES = [
  "SATURDAY_AND_SUNDAY",
  "SUNDAY",
  "SATURDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "FIXED_DAYS",
] as const;

export type MonthlyRestRule = typeof MONTHLY_REST_RULES[number];

export const LEGAL_HOLIDAY_RULES = [
  "ACTUAL_DATES",
  "EACH_HOLIDAY_ONE_DAY",
  "ANY_HOLIDAY_ONE_DAY",
  "NONE",
] as const;

export type LegalHolidayRule = typeof LEGAL_HOLIDAY_RULES[number];

export type LaborCostPolicy = {
  headquartersMonthlyRestRule: MonthlyRestRule;
  headquartersFixedRestDays: number;
  headquartersLegalHolidayRule: LegalHolidayRule;
  storeMonthlyRestRule: MonthlyRestRule;
  storeFixedRestDays: number;
  storeLegalHolidayRule: LegalHolidayRule;
};

export type LaborCostPolicyVersion = LaborCostPolicy & {
  effectiveMonth: string;
};

export const DEFAULT_LABOR_COST_POLICY: LaborCostPolicy = {
  headquartersMonthlyRestRule: "SUNDAY",
  headquartersFixedRestDays: 2,
  headquartersLegalHolidayRule: "ACTUAL_DATES",
  storeMonthlyRestRule: "FIXED_DAYS",
  storeFixedRestDays: 2,
  storeLegalHolidayRule: "ANY_HOLIDAY_ONE_DAY",
};

/** The formula used before monthly policy versions were introduced. */
export const LEGACY_LABOR_COST_POLICY: LaborCostPolicy = {
  headquartersMonthlyRestRule: "SUNDAY",
  headquartersFixedRestDays: 2,
  headquartersLegalHolidayRule: "ACTUAL_DATES",
  storeMonthlyRestRule: "SUNDAY",
  storeFixedRestDays: 2,
  storeLegalHolidayRule: "ACTUAL_DATES",
};

export type LaborCostRestDay = {
  startDate: Date | string;
  endDate: Date | string;
  holidayType?: string;
};

export type LaborCostSalaryHistory = {
  oldSalary: number | string | { toString(): string };
  newSalary: number | string | { toString(): string };
  effectiveDate: Date | string;
  createdAt?: Date | string;
};

export type LaborCostPositionHistory = {
  oldOrganization: string;
  newOrganization: string;
  effectiveDate: Date | string;
  createdAt?: Date | string;
};

export type PersonnelLaborCostMonth = {
  month: number;
  daysInMonth: number;
  monthlyRestDays: number;
  legalRestDays: number;
  overlappingRestDays: number;
  payableDays: number;
  dailyLaborCost: number | null;
  hourlyLaborCost: number | null;
  monthlyRestRule: MonthlyRestRule;
  legalHolidayRule: LegalHolidayRule;
  employeeScope: "HEADQUARTERS" | "STORE";
  policyEffectiveMonth: string | null;
};

type LaborCostReportInput = {
  year: number;
  baseSalary: number | null;
  workdayHours: number | null;
  organization?: string | null;
  hireDate?: Date | string | null;
  resignationDate?: Date | string | null;
  salaryHistory?: LaborCostSalaryHistory[];
  positionHistory?: LaborCostPositionHistory[];
  restDays?: LaborCostRestDay[];
  policyVersions?: LaborCostPolicyVersion[];
};

function dateKey(value: Date | string) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
}

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function monthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function monthEndKey(year: number, month: number) {
  return `${monthKey(year, month)}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, "0")}`;
}

function holidayDataByMonth(year: number, ranges: LaborCostRestDay[]) {
  const result = Array.from({ length: 12 }, () => ({ dates: new Set<string>(), holidays: new Set<string>() }));
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  for (const range of ranges) {
    const start = dateKey(range.startDate) < yearStart ? yearStart : dateKey(range.startDate);
    const end = dateKey(range.endDate) > yearEnd ? yearEnd : dateKey(range.endDate);
    if (start > end) continue;
    const holidayKey = range.holidayType?.trim() || `${dateKey(range.startDate)}:${dateKey(range.endDate)}`;
    const cursor = new Date(`${start}T00:00:00.000Z`);
    const last = new Date(`${end}T00:00:00.000Z`);
    while (cursor <= last) {
      const key = cursor.toISOString().slice(0, 10);
      const month = cursor.getUTCMonth();
      result[month].dates.add(key);
      result[month].holidays.add(holidayKey);
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }
  return result;
}

function salaryForMonth(baseSalary: number | null, histories: LaborCostSalaryHistory[], endOfMonth: string) {
  if (baseSalary === null || !Number.isFinite(baseSalary)) return null;
  const ordered = [...histories].sort((left, right) => {
    const byDate = dateKey(left.effectiveDate).localeCompare(dateKey(right.effectiveDate));
    if (byDate) return byDate;
    return left.createdAt && right.createdAt ? new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime() : 0;
  });
  let salary = ordered.length ? Number(ordered[0].oldSalary) : baseSalary;
  for (const item of ordered) {
    if (dateKey(item.effectiveDate) > endOfMonth) break;
    salary = Number(item.newSalary);
  }
  return Number.isFinite(salary) ? salary : null;
}

function organizationForMonth(currentOrganization: string, histories: LaborCostPositionHistory[], endOfMonth: string) {
  const ordered = [...histories].sort((left, right) => {
    const byDate = dateKey(left.effectiveDate).localeCompare(dateKey(right.effectiveDate));
    if (byDate) return byDate;
    return left.createdAt && right.createdAt ? new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime() : 0;
  });
  let organization = ordered.length ? ordered[0].oldOrganization : currentOrganization;
  for (const item of ordered) {
    if (dateKey(item.effectiveDate) > endOfMonth) break;
    organization = item.newOrganization;
  }
  return organization;
}

function policyForMonth(versions: LaborCostPolicyVersion[], targetMonth: string) {
  const selected = [...versions]
    .filter(item => /^\d{4}-\d{2}$/.test(item.effectiveMonth) && item.effectiveMonth <= targetMonth)
    .sort((left, right) => right.effectiveMonth.localeCompare(left.effectiveMonth))[0];
  return selected
    ? { policy: selected as LaborCostPolicy, effectiveMonth: selected.effectiveMonth, deduplicateActualDates: true }
    : { policy: LEGACY_LABOR_COST_POLICY, effectiveMonth: null, deduplicateActualDates: false };
}

const weekdaysByRule: Partial<Record<MonthlyRestRule, number[]>> = {
  SATURDAY_AND_SUNDAY: [6, 0],
  SUNDAY: [0],
  SATURDAY: [6],
  MONDAY: [1],
  TUESDAY: [2],
  WEDNESDAY: [3],
  THURSDAY: [4],
  FRIDAY: [5],
};

function monthlyRestDates(year: number, monthIndex: number, daysInMonth: number, rule: MonthlyRestRule) {
  const dates = new Set<string>();
  const weekdays = weekdaysByRule[rule] || [];
  for (let day = 1; day <= daysInMonth; day++) {
    if (!weekdays.includes(new Date(Date.UTC(year, monthIndex, day)).getUTCDay())) continue;
    dates.add(`${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  }
  return dates;
}

export function shanghaiYearMonth(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit" }).formatToParts(now);
  const value = (type: "year" | "month") => Number(parts.find(part => part.type === type)?.value);
  return { year: value("year"), month: value("month") };
}

export function nextMonthText(now = new Date()) {
  const current = shanghaiYearMonth(now);
  return current.month === 12 ? `${current.year + 1}-01` : monthKey(current.year, current.month + 1);
}

export function buildPersonnelLaborCostReport(input: LaborCostReportInput): PersonnelLaborCostMonth[] {
  const holidays = holidayDataByMonth(input.year, input.restDays || []);
  const hireDate = input.hireDate ? dateKey(input.hireDate) : null;
  const resignationDate = input.resignationDate ? dateKey(input.resignationDate) : null;
  const workdayHours = input.workdayHours !== null && Number.isFinite(input.workdayHours) && input.workdayHours > 0 ? input.workdayHours : null;
  const currentOrganization = input.organization?.trim() || "总部";

  return Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const targetMonth = monthKey(input.year, month);
    const daysInMonth = new Date(Date.UTC(input.year, month, 0)).getUTCDate();
    const endOfMonth = monthEndKey(input.year, month);
    const organization = organizationForMonth(currentOrganization, input.positionHistory || [], endOfMonth);
    const employeeScope = organization === "总部" ? "HEADQUARTERS" as const : "STORE" as const;
    const resolved = policyForMonth(input.policyVersions || [], targetMonth);
    const monthlyRestRule = employeeScope === "HEADQUARTERS" ? resolved.policy.headquartersMonthlyRestRule : resolved.policy.storeMonthlyRestRule;
    const fixedRestDays = employeeScope === "HEADQUARTERS" ? resolved.policy.headquartersFixedRestDays : resolved.policy.storeFixedRestDays;
    const legalHolidayRule = employeeScope === "HEADQUARTERS" ? resolved.policy.headquartersLegalHolidayRule : resolved.policy.storeLegalHolidayRule;
    const weeklyDates = monthlyRestDates(input.year, index, daysInMonth, monthlyRestRule);
    const monthlyRestDays = monthlyRestRule === "FIXED_DAYS" ? fixedRestDays : weeklyDates.size;
    const holidayData = holidays[index];
    const legalRestDays = legalHolidayRule === "ACTUAL_DATES"
      ? holidayData.dates.size
      : legalHolidayRule === "EACH_HOLIDAY_ONE_DAY"
        ? holidayData.holidays.size
        : legalHolidayRule === "ANY_HOLIDAY_ONE_DAY" && holidayData.holidays.size > 0
          ? 1
          : 0;
    const overlappingRestDays = legalHolidayRule === "ACTUAL_DATES" && monthlyRestRule !== "FIXED_DAYS" && resolved.deduplicateActualDates
      ? [...holidayData.dates].filter(key => weeklyDates.has(key)).length
      : 0;
    const payableDays = daysInMonth - monthlyRestDays - legalRestDays + overlappingRestDays;
    const startOfMonth = `${targetMonth}-01`;
    const employed = (!hireDate || hireDate <= endOfMonth) && (!resignationDate || resignationDate >= startOfMonth);
    const salary = employed ? salaryForMonth(input.baseSalary, input.salaryHistory || [], endOfMonth) : null;
    const rawDaily = salary !== null && payableDays > 0 ? salary / payableDays : null;
    return {
      month,
      daysInMonth,
      monthlyRestDays,
      legalRestDays,
      overlappingRestDays,
      payableDays,
      dailyLaborCost: rawDaily === null ? null : money(rawDaily),
      hourlyLaborCost: rawDaily === null || workdayHours === null ? null : money(rawDaily / workdayHours),
      monthlyRestRule,
      legalHolidayRule,
      employeeScope,
      policyEffectiveMonth: resolved.effectiveMonth,
    };
  });
}

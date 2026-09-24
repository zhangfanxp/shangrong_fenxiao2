import { DEFAULT_LABOR_COST_POLICY, buildPersonnelLaborCostReport, type LaborCostPolicyVersion } from "../lib/personnel-labor-costs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const restDays = [
  { startDate: "2026-01-04", endDate: "2026-01-06", holidayType: "HOLIDAY_A" },
  { startDate: "2026-01-10", endDate: "2026-01-12", holidayType: "HOLIDAY_B" },
];

const policy: LaborCostPolicyVersion = {
  effectiveMonth: "2026-01",
  headquartersMonthlyRestRule: "SUNDAY",
  headquartersFixedRestDays: 2,
  headquartersLegalHolidayRule: "ACTUAL_DATES",
  storeMonthlyRestRule: "FIXED_DAYS",
  storeFixedRestDays: 2,
  storeLegalHolidayRule: "EACH_HOLIDAY_ONE_DAY",
};

const base = { year: 2026, baseSalary: 10_000, workdayHours: 8, organization: "总部", restDays };
assert(DEFAULT_LABOR_COST_POLICY.storeMonthlyRestRule === "FIXED_DAYS" && DEFAULT_LABOR_COST_POLICY.storeFixedRestDays === 2, "门店员工默认规则应为每月固定公休2天");
const headquarters = buildPersonnelLaborCostReport({ ...base, policyVersions: [policy] })[0];
assert(headquarters.monthlyRestDays === 4, "按周日计算公司员工公休数失败");
assert(headquarters.legalRestDays === 6, "按实际放假日期计算法定假期失败");
assert(headquarters.overlappingRestDays === 2 && headquarters.payableDays === 23, "实际放假日期与星期公休去重失败");

const store = buildPersonnelLaborCostReport({ ...base, organization: "品牌A", policyVersions: [policy] })[0];
assert(store.monthlyRestDays === 2 && store.overlappingRestDays === 0, "固定公休天数不应参与日期去重");
assert(store.legalRestDays === 2 && store.payableDays === 27, "每个法定节日计1天失败");

const anyHoliday = buildPersonnelLaborCostReport({
  ...base,
  organization: "品牌A",
  policyVersions: [{ ...policy, storeLegalHolidayRule: "ANY_HOLIDAY_ONE_DAY" }],
})[0];
assert(anyHoliday.legalRestDays === 1 && anyHoliday.payableDays === 28, "当月有法定节日统一计1天失败");

const noHoliday = buildPersonnelLaborCostReport({
  ...base,
  organization: "品牌A",
  policyVersions: [{ ...policy, storeLegalHolidayRule: "NONE" }],
})[0];
assert(noHoliday.legalRestDays === 0 && noHoliday.payableDays === 29, "法定假期计0天失败");

const legacy = buildPersonnelLaborCostReport(base)[0];
assert(legacy.policyEffectiveMonth === null && legacy.overlappingRestDays === 0 && legacy.payableDays === 21, "历史月份不应套用新规则");

const transfer = buildPersonnelLaborCostReport({
  ...base,
  organization: "品牌A",
  positionHistory: [{ oldOrganization: "总部", newOrganization: "品牌A", effectiveDate: "2026-01-20" }],
  policyVersions: [policy],
})[0];
assert(transfer.employeeScope === "STORE", "调岗月份应采用调岗后的人员归属规则");

process.stdout.write("人员成本参数规则验证通过\n");

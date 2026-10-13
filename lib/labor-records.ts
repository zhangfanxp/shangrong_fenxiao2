import {
  DailyAttendanceType,
  Prisma,
  StoreLaborAssessmentMetric,
  StoreLaborRecordStatus,
} from "@prisma/client";
import { z } from "zod";
import type { Session } from "@/lib/auth";
import { calculateActualLaborCost } from "@/lib/attendance-records";
import { getBusinessDictionaryOptions, type DictionaryOption } from "@/lib/business-dictionaries";
import {
  DAILY_SALES_REPORT_SOURCE_RECORD_NO,
  type DailySalesReportSource,
  loadDailySalesReportSource,
} from "@/lib/daily-sales-report";
import { db } from "@/lib/db";
import {
  ensureStoreLaborStandardPolicyVersion,
  storeLaborPolicyRulesSchema,
  type StoreLaborPolicyRule,
} from "@/lib/store-labor-standards";
import { dateKeyAsDbDate } from "@/lib/store-h5-tasks";

export const LABOR_RECORD_PAGE_SIZES = [20, 50, 100] as const;
export const LABOR_RECORD_STATUSES = Object.values(StoreLaborRecordStatus) as [StoreLaborRecordStatus, ...StoreLaborRecordStatus[]];
export const LABOR_RECORD_STATUS_LABELS: Record<StoreLaborRecordStatus, string> = {
  NORMAL: "正常",
  OVERSTAFFED: "用工过多",
  UNDERSTAFFED: "用工过少",
  UNABLE_TO_CALCULATE: "无法计算",
};

export const LABOR_RECORD_METRIC_LABELS: Record<StoreLaborAssessmentMetric, string> = {
  RECEIVED_AMOUNT: "实收金额",
  ACTUAL_SALES_AMOUNT: "实际销售额",
};

export type LaborRecordAction = "query" | "view" | "export";

export function canLaborRecord(session: Pick<Session, "permissions">, action: LaborRecordAction) {
  if (session.permissions.includes("*")) return true;
  if (session.permissions.includes(`labor-records:${action}`)) return true;
  return (action === "query" || action === "view") && session.permissions.includes("operations:view");
}

function validDateKey(value: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value)) return false;
  return dateKeyAsDbDate(value).toISOString().slice(0, 10) === value;
}

export const laborRecordFiltersSchema = z.object({
  brand: z.string().trim().max(100, "品牌筛选条件不正确").default(""),
  storeNameKeyword: z.string().trim().max(100, "门店名称不能超过100个字符").default(""),
  startDate: z.string().trim().default("").refine(value => !value || validDateKey(value), "开始日期格式不正确"),
  endDate: z.string().trim().default("").refine(value => !value || validDateKey(value), "截止日期格式不正确"),
  laborStatus: z.union([z.literal(""), z.enum(LABOR_RECORD_STATUSES)]).default(""),
}).superRefine((value, context) => {
  if (value.startDate && value.endDate && value.startDate > value.endDate) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["startDate"], message: "开始日期不能晚于截止日期" });
  }
});

export type LaborRecordFilters = z.infer<typeof laborRecordFiltersSchema>;

export function readLaborRecordFilters(search: URLSearchParams) {
  return laborRecordFiltersSchema.safeParse({
    brand: search.get("brand") || "",
    storeNameKeyword: search.get("storeNameKeyword") || "",
    startDate: search.get("startDate") || "",
    endDate: search.get("endDate") || "",
    laborStatus: search.get("laborStatus") || "",
  });
}

function jsonStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item)) : null;
}

type LaborRecordScope = { brandIds: string[] | null; storeIds: string[] | null };

async function resolveLaborRecordScope(session: Session): Promise<LaborRecordScope> {
  if (session.permissions.includes("*")) return { brandIds: null, storeIds: null };
  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { leadH5BrandIds: true, leadH5StoreIds: true },
  });
  if (!user) return { brandIds: [], storeIds: [] };
  const configuredBrandIds = jsonStringArray(user.leadH5BrandIds);
  const configuredStoreIds = jsonStringArray(user.leadH5StoreIds);
  const permissionBrandIds = session.permissions.filter(value => value.startsWith("data:brand:")).map(value => value.slice(11)).filter(Boolean);
  const permissionStoreIds = session.permissions.filter(value => value.startsWith("data:store:")).map(value => value.slice(11)).filter(Boolean);
  return {
    brandIds: configuredBrandIds ?? (permissionBrandIds.length ? permissionBrandIds : null),
    storeIds: configuredStoreIds ?? (permissionStoreIds.length ? permissionStoreIds : null),
  };
}

export async function laborRecordDataScope(session: Session): Promise<Prisma.StoreLaborRecordWhereInput> {
  const scope = await resolveLaborRecordScope(session);
  return {
    ...(scope.brandIds !== null ? { brandIdSnapshot: { in: scope.brandIds } } : {}),
    ...(scope.storeIds !== null ? { storeId: { in: scope.storeIds } } : {}),
  };
}

export async function laborRecordBrandOptions(session: Session): Promise<DictionaryOption[]> {
  const dictionaryOptions = await getBusinessDictionaryOptions("BRAND");
  const scope = await resolveLaborRecordScope(session);
  if (scope.brandIds === null && scope.storeIds === null) return dictionaryOptions;
  const brands = await db.brand.findMany({
    where: {
      ...(scope.brandIds !== null ? { id: { in: scope.brandIds } } : {}),
      ...(scope.storeIds !== null ? { stores: { some: { id: { in: scope.storeIds } } } } : {}),
    },
    select: { id: true, code: true, name: true },
  });
  const permittedValues = new Set(brands.flatMap(brand => [brand.id, brand.code, brand.name]));
  return dictionaryOptions.filter(option => permittedValues.has(option.value) || permittedValues.has(option.label));
}

export function laborRecordFilterWhere(filters: LaborRecordFilters): Prisma.StoreLaborRecordWhereInput {
  return {
    ...(filters.brand ? { OR: [{ brandIdSnapshot: filters.brand }, { brandNameSnapshot: filters.brand }] } : {}),
    ...(filters.storeNameKeyword ? { storeNameSnapshot: { contains: filters.storeNameKeyword } } : {}),
    ...(filters.startDate || filters.endDate ? {
      businessDate: {
        ...(filters.startDate ? { gte: dateKeyAsDbDate(filters.startDate) } : {}),
        ...(filters.endDate ? { lte: dateKeyAsDbDate(filters.endDate) } : {}),
      },
    } : {}),
    ...(filters.laborStatus ? { laborStatus: filters.laborStatus } : {}),
  };
}

export const laborRecordSelect = {
  id: true,
  brandNameSnapshot: true,
  storeNameSnapshot: true,
  businessDate: true,
  receivedAmount: true,
  actualSalesAmount: true,
  actualHeadcount: true,
  laborStatus: true,
  unavailableReason: true,
  assessmentMetricSnapshot: true,
  assessedAmount: true,
  standardHeadcountSnapshot: true,
  lowerAmountSnapshot: true,
  upperAmountSnapshot: true,
  policyVersion: { select: { version: true } },
} satisfies Prisma.StoreLaborRecordSelect;

export type LaborRecordSource = Prisma.StoreLaborRecordGetPayload<{ select: typeof laborRecordSelect }>;

export function serializeLaborRecord(row: LaborRecordSource) {
  return {
    id: row.id,
    brandName: row.brandNameSnapshot,
    storeName: row.storeNameSnapshot,
    businessDate: row.businessDate.toISOString().slice(0, 10),
    receivedAmount: row.receivedAmount?.toFixed(2) ?? null,
    actualSalesAmount: row.actualSalesAmount?.toFixed(2) ?? null,
    actualHeadcount: row.actualHeadcount,
    laborStatus: row.laborStatus,
    laborStatusLabel: LABOR_RECORD_STATUS_LABELS[row.laborStatus],
    unavailableReason: row.unavailableReason,
    assessmentMetric: row.assessmentMetricSnapshot,
    assessmentMetricLabel: row.assessmentMetricSnapshot ? LABOR_RECORD_METRIC_LABELS[row.assessmentMetricSnapshot] : null,
    assessedAmount: row.assessedAmount?.toFixed(2) ?? null,
    standardHeadcount: row.standardHeadcountSnapshot,
    lowerAmount: row.lowerAmountSnapshot?.toFixed(2) ?? null,
    upperAmount: row.upperAmountSnapshot?.toFixed(2) ?? null,
    policyVersion: row.policyVersion?.version ?? null,
  };
}

const laborRecordDetailItemSelect = {
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

export const laborRecordDetailSelect = {
  id: true,
  brandNameSnapshot: true,
  storeNameSnapshot: true,
  businessDate: true,
  actualHeadcount: true,
  attendanceRecord: {
    select: {
      recordNo: true,
      items: {
        select: laborRecordDetailItemSelect,
        orderBy: [{ sortOrder: "asc" as const }, { personnelNameSnapshot: "asc" as const }],
      },
    },
  },
} satisfies Prisma.StoreLaborRecordSelect;

type LaborRecordDetailSource = Prisma.StoreLaborRecordGetPayload<{ select: typeof laborRecordDetailSelect }>;

function attendanceStatus(type: DailyAttendanceType, leaveHours: Prisma.Decimal | null) {
  if (type === DailyAttendanceType.FULL_ATTENDANCE) return "全勤";
  if (type === DailyAttendanceType.REST) return "休息";
  if (type === DailyAttendanceType.LEAVE_FULL_DAY) return "请假全天";
  if (type === DailyAttendanceType.LEAVE_HOURS) return `请假${leaveHours === null ? "-" : Number(leaveHours)}小时`;
  return "-";
}

export function serializeLaborRecordDetail(row: LaborRecordDetailSource) {
  return {
    overview: {
      brandName: row.brandNameSnapshot,
      storeName: row.storeNameSnapshot,
      businessDate: row.businessDate.toISOString().slice(0, 10),
      actualHeadcount: row.actualHeadcount,
      attendanceRecordNo: row.attendanceRecord?.recordNo ?? null,
      hasAttendance: Boolean(row.attendanceRecord),
    },
    details: (row.attendanceRecord?.items ?? []).map(item => {
      const actualLaborCost = calculateActualLaborCost({
        attendanceType: item.attendanceType,
        leaveHours: item.leaveHours,
        overtimeHours: item.overtimeHours,
        dailyLaborCost: item.laborCostSnapshot,
        hourlyLaborCost: item.hourlyLaborCostSnapshot,
      });
      return {
        personnelId: item.personnelId,
        personnelName: item.personnelNameSnapshot,
        positionStar: item.positionLevelSnapshot,
        attendanceStatus: attendanceStatus(item.attendanceType, item.leaveHours),
        attendanceType: item.attendanceType,
        overtimeHours: item.overtimeHours?.toString() ?? "0",
        dailyLaborCost: item.laborCostSnapshot?.toFixed(2) ?? null,
        hourlyLaborCost: item.hourlyLaborCostSnapshot?.toFixed(2) ?? null,
        actualLaborCost: actualLaborCost?.toFixed(2) ?? null,
      };
    }),
  };
}

function decimalValue(value: string | null | undefined) {
  if (value === null || value === undefined || value.trim() === "") return null;
  try {
    const parsed = new Prisma.Decimal(value.trim());
    return parsed.isFinite() ? parsed.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP) : null;
  } catch {
    return null;
  }
}

function moneyFromSubmission(
  items: Array<{ sortOrder: number; itemName: string; value: string | null }>,
  metric: { sortOrder: number; itemName: string },
) {
  return decimalValue(items.find(item => item.sortOrder === metric.sortOrder && item.itemName === metric.itemName)?.value);
}

function matchedRule(amount: Prisma.Decimal, rules: StoreLaborPolicyRule[]) {
  return rules.find(rule => {
    const lower = rule.lowerAmount === null ? null : new Prisma.Decimal(rule.lowerAmount);
    const upper = rule.upperAmount === null ? null : new Prisma.Decimal(rule.upperAmount);
    return (lower === null || amount.greaterThanOrEqualTo(lower)) && (upper === null || amount.lessThan(upper));
  }) ?? null;
}

function calculatedValues(input: {
  hasAttendance: boolean;
  hasSales: boolean;
  actualHeadcount: number | null;
  actualSalesAmount: Prisma.Decimal | null;
  receivedAmount: Prisma.Decimal | null;
  assessmentMetric: StoreLaborAssessmentMetric | null;
  rules: StoreLaborPolicyRule[];
}) {
  const missing: string[] = [];
  if (!input.hasAttendance) missing.push("缺少考勤记录");
  if (!input.hasSales) missing.push("缺少每日销售数据上报");
  if (!input.assessmentMetric || !input.rules.length) missing.push("品牌未配置用工标准");
  const assessedAmount = input.assessmentMetric === StoreLaborAssessmentMetric.ACTUAL_SALES_AMOUNT
    ? input.actualSalesAmount
    : input.assessmentMetric === StoreLaborAssessmentMetric.RECEIVED_AMOUNT ? input.receivedAmount : null;
  if (input.hasSales && input.assessmentMetric && assessedAmount === null) {
    missing.push(`每日销售数据上报缺少${LABOR_RECORD_METRIC_LABELS[input.assessmentMetric]}`);
  }
  const standard = assessedAmount === null ? null : matchedRule(assessedAmount, input.rules);
  if (assessedAmount !== null && input.rules.length && !standard) missing.push("考核金额未匹配到用工标准");
  if (missing.length || input.actualHeadcount === null || !standard) {
    return {
      assessedAmount,
      standard: null,
      laborStatus: StoreLaborRecordStatus.UNABLE_TO_CALCULATE,
      unavailableReason: [...new Set(missing)].join("；") || "缺少用工计算条件",
    };
  }
  const laborStatus = input.actualHeadcount === standard.standardHeadcount
    ? StoreLaborRecordStatus.NORMAL
    : input.actualHeadcount > standard.standardHeadcount
      ? StoreLaborRecordStatus.OVERSTAFFED
      : StoreLaborRecordStatus.UNDERSTAFFED;
  return { assessedAmount, standard, laborStatus, unavailableReason: null };
}

async function synchronizeWithSource(storeId: string, businessDate: Date, source: DailySalesReportSource | null) {
  return db.$transaction(async tx => {
    const salesPromise = source ? tx.taskSubmission.findFirst({
      where: { taskIdSnapshot: source.templateId, storeId, executionDate: businessDate },
      select: {
        id: true,
        storeNameSnapshot: true,
        brandIdSnapshot: true,
        brandNameSnapshot: true,
        items: {
          where: { OR: [source.metrics.actualSalesAmount, source.metrics.receivedAmount].map(metric => ({ sortOrder: metric.sortOrder, itemName: metric.itemName })) },
          select: { sortOrder: true, itemName: true, value: true },
        },
      },
      orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
    }) : Promise.resolve(null);
    const [attendance, sales, existing] = await Promise.all([
      tx.dailyAttendanceRecord.findUnique({
        where: { storeId_attendanceDate: { storeId, attendanceDate: businessDate } },
        select: {
          id: true,
          storeNameSnapshot: true,
          brandIdSnapshot: true,
          brandNameSnapshot: true,
          _count: { select: { items: { where: { attendanceType: DailyAttendanceType.FULL_ATTENDANCE } } } },
        },
      }),
      salesPromise,
      tx.storeLaborRecord.findUnique({
        where: { storeId_businessDate: { storeId, businessDate } },
        include: { policyVersion: true },
      }),
    ]);
    if (!attendance && !sales) return null;

    const identity = existing ?? attendance ?? sales!;
    const brandName = existing?.brandNameSnapshot ?? identity.brandNameSnapshot;
    const policyVersion = existing?.policyVersion ?? await ensureStoreLaborStandardPolicyVersion(tx, brandName);
    const parsedRules = storeLaborPolicyRulesSchema.safeParse(policyVersion.rules);
    const rules = parsedRules.success ? parsedRules.data : [];
    const actualSalesAmount = sales && source ? moneyFromSubmission(sales.items, source.metrics.actualSalesAmount) : null;
    const receivedAmount = sales && source ? moneyFromSubmission(sales.items, source.metrics.receivedAmount) : null;
    const actualHeadcount = attendance?._count.items ?? null;
    const calculation = calculatedValues({
      hasAttendance: Boolean(attendance),
      hasSales: Boolean(sales),
      actualHeadcount,
      actualSalesAmount,
      receivedAmount,
      assessmentMetric: policyVersion.assessmentMetric,
      rules,
    });
    const now = new Date();
    const data = {
      storeNameSnapshot: existing?.storeNameSnapshot ?? identity.storeNameSnapshot,
      brandIdSnapshot: existing?.brandIdSnapshot ?? identity.brandIdSnapshot,
      brandNameSnapshot: existing?.brandNameSnapshot ?? identity.brandNameSnapshot,
      attendanceRecordId: attendance?.id ?? null,
      salesSubmissionId: sales?.id ?? null,
      policyVersionId: policyVersion.id,
      assessmentMetricSnapshot: policyVersion.assessmentMetric,
      actualSalesAmount,
      receivedAmount,
      assessedAmount: calculation.assessedAmount,
      actualHeadcount,
      standardRecordIdSnapshot: calculation.standard?.standardId ?? null,
      lowerAmountSnapshot: calculation.standard?.lowerAmount ?? null,
      upperAmountSnapshot: calculation.standard?.upperAmount ?? null,
      standardHeadcountSnapshot: calculation.standard?.standardHeadcount ?? null,
      laborStatus: calculation.laborStatus,
      unavailableReason: calculation.unavailableReason,
      calculatedAt: now,
    } satisfies Prisma.StoreLaborRecordUncheckedUpdateInput;
    return tx.storeLaborRecord.upsert({
      where: { storeId_businessDate: { storeId, businessDate } },
      create: {
        businessDate,
        storeId,
        storeNameSnapshot: data.storeNameSnapshot,
        brandIdSnapshot: data.brandIdSnapshot,
        brandNameSnapshot: data.brandNameSnapshot,
        attendanceRecordId: attendance?.id ?? null,
        salesSubmissionId: sales?.id ?? null,
        policyVersionId: policyVersion.id,
        assessmentMetricSnapshot: policyVersion.assessmentMetric,
        actualSalesAmount,
        receivedAmount,
        assessedAmount: calculation.assessedAmount,
        actualHeadcount,
        standardRecordIdSnapshot: calculation.standard?.standardId ?? null,
        lowerAmountSnapshot: calculation.standard?.lowerAmount ?? null,
        upperAmountSnapshot: calculation.standard?.upperAmount ?? null,
        standardHeadcountSnapshot: calculation.standard?.standardHeadcount ?? null,
        laborStatus: calculation.laborStatus,
        unavailableReason: calculation.unavailableReason,
        calculatedAt: now,
      },
      update: data,
    });
  }, { maxWait: 5_000, timeout: 20_000 });
}

export async function synchronizeLaborRecord(storeId: string, businessDate: Date | string) {
  const source = await loadDailySalesReportSource().catch(() => null);
  const normalizedDate = typeof businessDate === "string" ? dateKeyAsDbDate(businessDate) : dateKeyAsDbDate(businessDate.toISOString().slice(0, 10));
  return synchronizeWithSource(storeId, normalizedDate, source);
}

export async function synchronizeLaborRecordForTaskSubmission(submissionId: string) {
  const [submission, configuredSource] = await Promise.all([
    db.taskSubmission.findUnique({
      where: { id: submissionId },
      select: { taskIdSnapshot: true, storeId: true, executionDate: true },
    }),
    db.businessDataSource.findUnique({
      where: { recordNo: DAILY_SALES_REPORT_SOURCE_RECORD_NO },
      select: { templateId: true },
    }),
  ]);
  if (!submission || !configuredSource || submission.taskIdSnapshot !== configuredSource.templateId) return null;
  const source = await loadDailySalesReportSource();
  return synchronizeWithSource(submission.storeId, submission.executionDate, source);
}

export async function reconcileAllLaborRecords() {
  const source = await loadDailySalesReportSource().catch(() => null);
  const [attendanceRows, salesRows] = await Promise.all([
    db.dailyAttendanceRecord.findMany({
      select: { storeId: true, attendanceDate: true },
      orderBy: [{ attendanceDate: "asc" }, { storeId: "asc" }],
    }),
    source ? db.taskSubmission.findMany({
      where: { taskIdSnapshot: source.templateId },
      select: { storeId: true, executionDate: true },
      distinct: ["storeId", "executionDate"],
      orderBy: [{ executionDate: "asc" }, { storeId: "asc" }],
    }) : Promise.resolve([]),
  ]);
  const identities = new Map<string, { storeId: string; businessDate: Date }>();
  for (const row of attendanceRows) identities.set(`${row.storeId}:${row.attendanceDate.toISOString().slice(0, 10)}`, { storeId: row.storeId, businessDate: row.attendanceDate });
  for (const row of salesRows) identities.set(`${row.storeId}:${row.executionDate.toISOString().slice(0, 10)}`, { storeId: row.storeId, businessDate: row.executionDate });
  let synchronized = 0;
  for (const identity of identities.values()) {
    if (await synchronizeWithSource(identity.storeId, identity.businessDate, source)) synchronized += 1;
  }
  return { sources: identities.size, synchronized };
}

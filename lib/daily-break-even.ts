import { BusinessDataSourceType, Prisma } from "@prisma/client";
import { z } from "zod";
import type { Session } from "@/lib/auth";
import { getBusinessDictionaryOptions, type DictionaryOption } from "@/lib/business-dictionaries";
import {
  calculateStoredBusinessFormula,
  calculateStoredBusinessJudgment,
  readStoredBusinessFormulaConfig,
  readStoredBusinessJudgmentConfig,
} from "@/lib/business-data-sources";
import { db } from "@/lib/db";
import { dateKeyAsDbDate } from "@/lib/store-h5-tasks";

export const DAILY_BREAK_EVEN_SOURCE_NAME = "每日保本营业额";
export const DAILY_BREAK_EVEN_PAGE_SIZES = [10, 20, 50, 100] as const;
export const DAILY_BREAK_EVEN_STATUSES = ["QUALIFIED", "UNQUALIFIED"] as const;

export type DailyBreakEvenStatus = typeof DAILY_BREAK_EVEN_STATUSES[number];
export type DailyBreakEvenAction = "query" | "view" | "export";

export function canDailyBreakEven(session: Pick<Session, "permissions">, action: DailyBreakEvenAction) {
  if (session.permissions.includes("*")) return true;
  if (session.permissions.includes(`daily-break-even:${action}`)) return true;
  return (action === "query" || action === "view") && session.permissions.includes("operations:view");
}

function validDateKey(value: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])-([012]\d|3[01])$/.test(value)) return false;
  return dateKeyAsDbDate(value).toISOString().slice(0, 10) === value;
}

export const dailyBreakEvenFiltersSchema = z.object({
  brand: z.string().trim().max(100, "品牌筛选条件不正确").default(""),
  storeNameKeyword: z.string().trim().max(100, "门店名称不能超过100个字符").default(""),
  startDate: z.string().trim().default("").refine(value => !value || validDateKey(value), "开始日期格式不正确"),
  endDate: z.string().trim().default("").refine(value => !value || validDateKey(value), "截止日期格式不正确"),
  achievement: z.union([z.literal(""), z.enum(DAILY_BREAK_EVEN_STATUSES)]).default(""),
}).superRefine((value, context) => {
  if (value.startDate && value.endDate && value.startDate > value.endDate) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["startDate"], message: "开始日期不能晚于截止日期" });
  }
});

export type DailyBreakEvenFilters = z.infer<typeof dailyBreakEvenFiltersSchema>;

export function readDailyBreakEvenFilters(search: URLSearchParams) {
  return dailyBreakEvenFiltersSchema.safeParse({
    brand: search.get("brand") || "",
    storeNameKeyword: search.get("storeNameKeyword") || "",
    startDate: search.get("startDate") || "",
    endDate: search.get("endDate") || "",
    achievement: search.get("achievement") || "",
  });
}

export function dailyBreakEvenFilterWhere(filters: DailyBreakEvenFilters): Prisma.TaskSubmissionWhereInput {
  return {
    ...(filters.brand ? { OR: [{ brandIdSnapshot: filters.brand }, { brandNameSnapshot: filters.brand }] } : {}),
    ...(filters.storeNameKeyword ? { storeNameSnapshot: { contains: filters.storeNameKeyword } } : {}),
    ...(filters.startDate || filters.endDate ? {
      executionDate: {
        ...(filters.startDate ? { gte: dateKeyAsDbDate(filters.startDate) } : {}),
        ...(filters.endDate ? { lte: dateKeyAsDbDate(filters.endDate) } : {}),
      },
    } : {}),
  };
}

function jsonStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item)) : null;
}

type DailyBreakEvenScope = { brandIds: string[] | null; storeIds: string[] | null };

async function resolveDailyBreakEvenScope(session: Session): Promise<DailyBreakEvenScope> {
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

export async function dailyBreakEvenDataScope(session: Session): Promise<Prisma.TaskSubmissionWhereInput> {
  const scope = await resolveDailyBreakEvenScope(session);
  return {
    ...(scope.brandIds !== null ? { brandIdSnapshot: { in: scope.brandIds } } : {}),
    ...(scope.storeIds !== null ? { storeId: { in: scope.storeIds } } : {}),
  };
}

export async function dailyBreakEvenBrandOptions(session: Session): Promise<DictionaryOption[]> {
  const dictionaryOptions = await getBusinessDictionaryOptions("BRAND");
  const scope = await resolveDailyBreakEvenScope(session);
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

type SourceFieldConfig = {
  source?: unknown;
  column?: unknown;
  sortOrder?: unknown;
  itemName?: unknown;
  systemSource?: unknown;
  calculation?: unknown;
};

type TaskMetricSource = { sourceFieldKey: string; sortOrder: number; itemName: string };
type CalculatedFieldSource = { sourceFieldKey: string; sourceFieldConfig: unknown };

export type DailyBreakEvenSource = {
  sourceRecordNo: string;
  templateId: string;
  receivedAmount: TaskMetricSource;
  monthlyBreakEvenRevenue: CalculatedFieldSource;
  dailyBreakEvenRevenue: CalculatedFieldSource;
  achievement: CalculatedFieldSource;
};

export class DailyBreakEvenError extends Error {
  constructor(message: string, readonly status = 500) {
    super(message);
    this.name = "DailyBreakEvenError";
  }
}

function fieldConfig(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as SourceFieldConfig : null;
}

export async function loadDailyBreakEvenSource(): Promise<DailyBreakEvenSource> {
  const source = await db.businessDataSource.findFirst({
    where: { businessName: DAILY_BREAK_EVEN_SOURCE_NAME },
    select: {
      recordNo: true,
      sourceType: true,
      templateId: true,
      fields: {
        select: { sourceFieldKey: true, fieldNameSnapshot: true, sourceFieldConfig: true },
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
  });
  if (!source) throw new DailyBreakEvenError(`业务数据源“${DAILY_BREAK_EVEN_SOURCE_NAME}”不存在，请先完成配置`, 409);
  if (source.sourceType !== BusinessDataSourceType.TASK_TEMPLATE) {
    throw new DailyBreakEvenError(`业务数据源 ${source.recordNo} 必须引用任务模版`, 409);
  }

  const dimensions = [
    { name: "任务记录编号", column: "recordNo" },
    { name: "业务日期", column: "executionDate" },
    { name: "上报时间", column: "submittedAt" },
    { name: "品牌", column: "brandNameSnapshot" },
    { name: "门店", column: "storeNameSnapshot" },
    { name: "上报人", column: "userRealNameSnapshot" },
  ];
  const dimensionsMatch = dimensions.every(dimension => {
    const config = fieldConfig(source.fields.find(field => field.fieldNameSnapshot === dimension.name)?.sourceFieldConfig);
    return config?.source === "TaskSubmission" && config.column === dimension.column;
  });
  if (!dimensionsMatch) throw new DailyBreakEvenError(`业务数据源 ${source.recordNo} 中页面所需基础字段映射不正确`, 409);

  const receivedField = source.fields.find(field => field.fieldNameSnapshot === "【营业数据】实收金额");
  const receivedConfig = fieldConfig(receivedField?.sourceFieldConfig);
  const keySortOrder = receivedField?.sourceFieldKey.match(/^task-item:(\d+)$/)?.[1];
  const receivedSortOrder = typeof receivedConfig?.sortOrder === "number" && Number.isInteger(receivedConfig.sortOrder)
    ? receivedConfig.sortOrder
    : keySortOrder === undefined ? NaN : Number(keySortOrder);
  const receivedItemName = typeof receivedConfig?.itemName === "string" && receivedConfig.itemName.trim()
    ? receivedConfig.itemName.trim()
    : receivedField?.fieldNameSnapshot || "";
  if (!receivedField?.sourceFieldKey.match(/^task-item:\d+$/)
    || (receivedConfig?.source !== undefined && receivedConfig.source !== "TaskSubmissionItem")
    || (receivedConfig?.column !== undefined && receivedConfig.column !== "value")
    || !Number.isInteger(receivedSortOrder) || receivedSortOrder < 0 || !receivedItemName) {
    throw new DailyBreakEvenError(`业务数据源 ${source.recordNo} 中字段“【营业数据】实收金额”映射不正确`, 409);
  }

  const monthlyField = source.fields.find(field => field.fieldNameSnapshot === "月保本营业额");
  const monthlyConfig = fieldConfig(monthlyField?.sourceFieldConfig);
  if (!monthlyField || monthlyConfig?.systemSource !== "STORE_COST" || monthlyConfig.source !== "StoreCostSummary" || monthlyConfig.column !== "monthlyBreakEvenRevenue") {
    throw new DailyBreakEvenError(`业务数据源 ${source.recordNo} 中字段“月保本营业额”映射不正确`, 409);
  }

  const dailyField = source.fields.find(field => field.fieldNameSnapshot === "日保本营业额");
  if (!dailyField || !dailyField.sourceFieldKey.startsWith("formula:") || !readStoredBusinessFormulaConfig(dailyField.sourceFieldConfig)) {
    throw new DailyBreakEvenError(`业务数据源 ${source.recordNo} 中字段“日保本营业额”公式配置不正确`, 409);
  }
  const achievementField = source.fields.find(field => field.fieldNameSnapshot === "保本达标");
  if (!achievementField || !achievementField.sourceFieldKey.startsWith("judgment:") || !readStoredBusinessJudgmentConfig(achievementField.sourceFieldConfig)) {
    throw new DailyBreakEvenError(`业务数据源 ${source.recordNo} 中字段“保本达标”判断配置不正确`, 409);
  }

  return {
    sourceRecordNo: source.recordNo,
    templateId: source.templateId,
    receivedAmount: { sourceFieldKey: receivedField.sourceFieldKey, sortOrder: receivedSortOrder, itemName: receivedItemName },
    monthlyBreakEvenRevenue: { sourceFieldKey: monthlyField.sourceFieldKey, sourceFieldConfig: monthlyField.sourceFieldConfig },
    dailyBreakEvenRevenue: { sourceFieldKey: dailyField.sourceFieldKey, sourceFieldConfig: dailyField.sourceFieldConfig },
    achievement: { sourceFieldKey: achievementField.sourceFieldKey, sourceFieldConfig: achievementField.sourceFieldConfig },
  };
}

export function dailyBreakEvenSourceWhere(source: DailyBreakEvenSource): Prisma.TaskSubmissionWhereInput {
  return { taskIdSnapshot: source.templateId };
}

export function dailyBreakEvenSelect(source: DailyBreakEvenSource) {
  return {
    id: true,
    recordNo: true,
    executionDate: true,
    submittedAt: true,
    brandNameSnapshot: true,
    storeNameSnapshot: true,
    userRealNameSnapshot: true,
    store: {
      select: {
        costProfile: {
          select: {
            storeRent: true,
            employeeWages: true,
            dormitoryRent: true,
            propertyFee: true,
            utilitiesFee: true,
            otherCost: true,
            ratioCoefficient: true,
          },
        },
      },
    },
    items: {
      where: { sortOrder: source.receivedAmount.sortOrder, itemName: source.receivedAmount.itemName },
      select: { sortOrder: true, itemName: true, value: true },
    },
  } satisfies Prisma.TaskSubmissionSelect;
}

type NumericValue = { toString(): string } | string | number;
type DailyBreakEvenSourceRow = {
  id: string;
  recordNo: string;
  executionDate: Date;
  submittedAt: Date;
  brandNameSnapshot: string;
  storeNameSnapshot: string;
  userRealNameSnapshot: string;
  store: {
    costProfile: null | {
      storeRent: NumericValue;
      employeeWages: NumericValue;
      dormitoryRent: NumericValue;
      propertyFee: NumericValue;
      utilitiesFee: NumericValue;
      otherCost: NumericValue;
      ratioCoefficient: NumericValue;
    };
  };
  items: Array<{ sortOrder: number; itemName: string; value: string | null }>;
};

function numericValue(value: NumericValue | null | undefined) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function monthlyBreakEvenRevenue(row: DailyBreakEvenSourceRow) {
  const cost = row.store.costProfile;
  if (!cost) return null;
  const values = [cost.storeRent, cost.employeeWages, cost.dormitoryRent, cost.propertyFee, cost.utilitiesFee, cost.otherCost].map(numericValue);
  const ratio = numericValue(cost.ratioCoefficient);
  if (values.some(value => value === null) || ratio === null || ratio <= 0) return null;
  const fixedCost = values.reduce((sum, value) => sum.plus(value || 0), new Prisma.Decimal(0));
  return fixedCost.dividedBy(ratio).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toNumber();
}

function formatDateTime(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}:${part("second")}`;
}

function normalizeAchievement(value: string | null): { code: DailyBreakEvenStatus | null; label: string | null } {
  const text = value?.trim();
  if (!text) return { code: null, label: null };
  if (["合格", "达标", "是", "true", "QUALIFIED"].includes(text)) return { code: "QUALIFIED", label: "合格" };
  if (["不合格", "未达标", "否", "false", "UNQUALIFIED"].includes(text)) return { code: "UNQUALIFIED", label: "不合格" };
  return { code: null, label: text };
}

export type DailyBreakEvenRow = ReturnType<typeof serializeDailyBreakEven>;

export function serializeDailyBreakEven(row: DailyBreakEvenSourceRow, source: DailyBreakEvenSource) {
  const rawReceivedAmount = row.items.find(item => item.sortOrder === source.receivedAmount.sortOrder && item.itemName === source.receivedAmount.itemName)?.value;
  const receivedAmount = numericValue(rawReceivedAmount);
  const monthlyAmount = monthlyBreakEvenRevenue(row);
  const numericValues: Record<string, number | null> = {
    [source.receivedAmount.sourceFieldKey]: receivedAmount,
    [source.monthlyBreakEvenRevenue.sourceFieldKey]: monthlyAmount,
  };
  const dailyAmount = calculateStoredBusinessFormula(source.dailyBreakEvenRevenue.sourceFieldConfig, numericValues);
  numericValues[source.dailyBreakEvenRevenue.sourceFieldKey] = dailyAmount;
  const achievement = normalizeAchievement(calculateStoredBusinessJudgment(source.achievement.sourceFieldConfig, numericValues));
  return {
    id: row.id,
    taskRecordNo: row.recordNo,
    businessDate: row.executionDate.toISOString().slice(0, 10),
    submittedAt: formatDateTime(row.submittedAt),
    brandName: row.brandNameSnapshot,
    storeName: row.storeNameSnapshot,
    submitterName: row.userRealNameSnapshot,
    receivedAmount,
    monthlyBreakEvenRevenue: monthlyAmount,
    dailyBreakEvenRevenue: dailyAmount,
    achievementCode: achievement.code,
    achievementLabel: achievement.label,
  };
}

export function filterDailyBreakEvenByAchievement(rows: DailyBreakEvenRow[], achievement: DailyBreakEvenFilters["achievement"]) {
  return achievement ? rows.filter(row => row.achievementCode === achievement) : rows;
}

import { BusinessDataSourceType, Prisma } from "@prisma/client";
import { z } from "zod";
import type { Session } from "@/lib/auth";
import { calculateStoredBusinessFormula, readStoredBusinessFormulaConfig } from "@/lib/business-data-sources";
import { db } from "@/lib/db";
import { dateKeyAsDbDate } from "@/lib/store-h5-tasks";

export const HUNDRED_DAYS_SOURCE_RECORD_NO = "202610080001";
export const HUNDRED_DAYS_PAGE_SIZES = [10, 20, 50, 100] as const;

export const HUNDRED_DAYS_PLATFORMS = [
  { code: "KUAISHOU", label: "快手团购", sourcePrefix: "快手团购", formulaPrefix: "快手" },
  { code: "MEITUAN", label: "美团团购", sourcePrefix: "美团团购", formulaPrefix: "美团" },
  { code: "DOUYIN", label: "抖音团购", sourcePrefix: "抖音团购", formulaPrefix: "抖音" },
  { code: "GAODE", label: "高德团购", sourcePrefix: "高德团购", formulaPrefix: "高德" },
] as const;

export type HundredDaysPlatformCode = typeof HUNDRED_DAYS_PLATFORMS[number]["code"];
export type HundredDaysAction = "query" | "export";

export function canHundredDays(session: Pick<Session, "permissions">, action: HundredDaysAction) {
  if (session.permissions.includes("*")) return true;
  if (session.permissions.includes(`hundred-days:${action}`)) return true;
  return action === "query" && session.permissions.includes("operations:view");
}

function validDateKey(value: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])-([012]\d|3[01])$/.test(value)) return false;
  return dateKeyAsDbDate(value).toISOString().slice(0, 10) === value;
}

const platformCodes = HUNDRED_DAYS_PLATFORMS.map(platform => platform.code) as [HundredDaysPlatformCode, ...HundredDaysPlatformCode[]];

export const hundredDaysFiltersSchema = z.object({
  brand: z.string().trim().max(100, "品牌筛选条件不正确").default(""),
  storeNameKeyword: z.string().trim().max(100, "门店名称不能超过100个字符").default(""),
  platform: z.union([z.literal(""), z.enum(platformCodes)]).default(""),
  startDate: z.string().trim().default("").refine(value => !value || validDateKey(value), "开始日期格式不正确"),
  endDate: z.string().trim().default("").refine(value => !value || validDateKey(value), "截止日期格式不正确"),
}).superRefine((value, context) => {
  if (value.startDate && value.endDate && value.startDate > value.endDate) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["startDate"], message: "开始日期不能晚于截止日期" });
  }
});

export type HundredDaysFilters = z.infer<typeof hundredDaysFiltersSchema>;

export function readHundredDaysFilters(search: URLSearchParams) {
  return hundredDaysFiltersSchema.safeParse({
    brand: search.get("brand") || "",
    storeNameKeyword: search.get("storeNameKeyword") || "",
    platform: search.get("platform") || "",
    startDate: search.get("startDate") || "",
    endDate: search.get("endDate") || "",
  });
}

export function hundredDaysFilterWhere(filters: HundredDaysFilters): Prisma.TaskSubmissionWhereInput {
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

export async function hundredDaysDataScope(session: Session): Promise<Prisma.TaskSubmissionWhereInput> {
  if (session.permissions.includes("*")) return {};
  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { leadH5BrandIds: true, leadH5StoreIds: true },
  });
  if (!user) return { id: { in: [] } };
  const configuredBrandIds = jsonStringArray(user.leadH5BrandIds);
  const configuredStoreIds = jsonStringArray(user.leadH5StoreIds);
  const permissionBrandIds = session.permissions.filter(value => value.startsWith("data:brand:")).map(value => value.slice(11)).filter(Boolean);
  const permissionStoreIds = session.permissions.filter(value => value.startsWith("data:store:")).map(value => value.slice(11)).filter(Boolean);
  const brandIds = configuredBrandIds ?? (permissionBrandIds.length ? permissionBrandIds : null);
  const storeIds = configuredStoreIds ?? (permissionStoreIds.length ? permissionStoreIds : null);
  return {
    ...(brandIds !== null ? { brandIdSnapshot: { in: brandIds } } : {}),
    ...(storeIds !== null ? { storeId: { in: storeIds } } : {}),
  };
}

type SourceFieldConfig = { source?: unknown; column?: unknown; sortOrder?: unknown; itemName?: unknown };
type MetricKey = "shopScore" | "rating" | "weeklyOrders" | "weeklyReviews" | "weeklyPositiveReviews" | "weeklyNegativeReviews" | "productQuality" | "serviceExperience" | "environmentExperience";
type RateKey = "reviewRate" | "positiveRate" | "negativeRate";
type MetricSource = { sourceFieldKey: string; sortOrder: number; itemName: string };
type RateSource = { sourceFieldConfig: unknown };

export type HundredDaysPlatformSource = {
  code: HundredDaysPlatformCode;
  label: string;
  metrics: Record<MetricKey, MetricSource>;
  rates: Record<RateKey, RateSource>;
};

export type HundredDaysSource = {
  sourceRecordNo: string;
  templateId: string;
  platforms: HundredDaysPlatformSource[];
};

export class HundredDaysError extends Error {
  constructor(message: string, readonly status = 500) {
    super(message);
    this.name = "HundredDaysError";
  }
}

function fieldConfig(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as SourceFieldConfig : null;
}

export async function loadHundredDaysSource(): Promise<HundredDaysSource> {
  const source = await db.businessDataSource.findUnique({
    where: { recordNo: HUNDRED_DAYS_SOURCE_RECORD_NO },
    select: {
      recordNo: true,
      sourceType: true,
      templateId: true,
      fields: {
        select: { sourceFieldKey: true, fieldNameSnapshot: true, sourceFieldConfig: true },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
  if (!source) throw new HundredDaysError(`业务数据源 ${HUNDRED_DAYS_SOURCE_RECORD_NO} 不存在，请先完成配置`, 409);
  if (source.sourceType !== BusinessDataSourceType.TASK_TEMPLATE) {
    throw new HundredDaysError(`业务数据源 ${source.recordNo} 必须引用任务模版`, 409);
  }

  const dimensions = [
    { name: "品牌", column: "brandNameSnapshot" },
    { name: "门店", column: "storeNameSnapshot" },
    { name: "业务日期", column: "executionDate" },
  ];
  const dimensionsMatch = dimensions.every(dimension => {
    const config = fieldConfig(source.fields.find(field => field.fieldNameSnapshot === dimension.name)?.sourceFieldConfig);
    return config?.source === "TaskSubmission" && config.column === dimension.column;
  });
  if (!dimensionsMatch) throw new HundredDaysError(`业务数据源 ${source.recordNo} 中页面所需基础字段映射不正确`, 409);

  const metricSuffixes: Record<MetricKey, string> = {
    shopScore: "店铺分",
    rating: "评分",
    weeklyOrders: "周单量",
    weeklyReviews: "周评价数",
    weeklyPositiveReviews: "周好评数",
    weeklyNegativeReviews: "周差评数",
    productQuality: "产品质量(内容)",
    serviceExperience: "服务体验(内容)",
    environmentExperience: "环境卫生体验(内容)",
  };
  const rateSuffixes: Record<RateKey, string> = {
    reviewRate: "评价率",
    positiveRate: "好评率",
    negativeRate: "差评率",
  };

  const platforms = HUNDRED_DAYS_PLATFORMS.map(platform => {
    const metrics = Object.fromEntries((Object.entries(metricSuffixes) as Array<[MetricKey, string]>).map(([key, suffix]) => {
      const expectedName = `${platform.sourcePrefix}_${suffix}`;
      const field = source.fields.find(item => item.fieldNameSnapshot === expectedName);
      const config = fieldConfig(field?.sourceFieldConfig);
      const keySortOrder = field?.sourceFieldKey.match(/^task-item:(\d+)$/)?.[1];
      const sortOrder = typeof config?.sortOrder === "number" && Number.isInteger(config.sortOrder)
        ? config.sortOrder
        : keySortOrder === undefined ? NaN : Number(keySortOrder);
      const itemName = typeof config?.itemName === "string" && config.itemName.trim() ? config.itemName.trim() : field?.fieldNameSnapshot || "";
      const valid = Boolean(field?.sourceFieldKey.match(/^task-item:\d+$/))
        && (config?.source === undefined || config.source === "TaskSubmissionItem")
        && (config?.column === undefined || config.column === "value")
        && Number.isInteger(sortOrder) && sortOrder >= 0 && Boolean(itemName);
      if (!field || !valid) throw new HundredDaysError(`业务数据源 ${source.recordNo} 中字段“${expectedName}”映射不正确`, 409);
      return [key, { sourceFieldKey: field.sourceFieldKey, sortOrder, itemName }];
    })) as Record<MetricKey, MetricSource>;

    const rates = Object.fromEntries((Object.entries(rateSuffixes) as Array<[RateKey, string]>).map(([key, suffix]) => {
      const expectedName = `${platform.formulaPrefix}${suffix}`;
      const field = source.fields.find(item => item.fieldNameSnapshot === expectedName);
      if (!field || !field.sourceFieldKey.startsWith("formula:") || !readStoredBusinessFormulaConfig(field.sourceFieldConfig)) {
        throw new HundredDaysError(`业务数据源 ${source.recordNo} 中字段“${expectedName}”公式配置不正确`, 409);
      }
      return [key, { sourceFieldConfig: field.sourceFieldConfig }];
    })) as Record<RateKey, RateSource>;

    return { code: platform.code, label: platform.label, metrics, rates };
  });
  return { sourceRecordNo: source.recordNo, templateId: source.templateId, platforms };
}

export function hundredDaysSourceWhere(source: HundredDaysSource): Prisma.TaskSubmissionWhereInput {
  return { taskIdSnapshot: source.templateId };
}

export function hundredDaysSelect(source: HundredDaysSource) {
  const metrics = source.platforms.flatMap(platform => Object.values(platform.metrics));
  return {
    id: true,
    brandNameSnapshot: true,
    storeNameSnapshot: true,
    executionDate: true,
    items: {
      where: { OR: metrics.map(metric => ({ sortOrder: metric.sortOrder, itemName: metric.itemName })) },
      select: { sortOrder: true, itemName: true, value: true },
    },
  } satisfies Prisma.TaskSubmissionSelect;
}

export type HundredDaysSourceRow = {
  id: string;
  brandNameSnapshot: string;
  storeNameSnapshot: string;
  executionDate: Date;
  items: Array<{ sortOrder: number; itemName: string; value: string | null }>;
};

function rawValue(row: HundredDaysSourceRow, metric: MetricSource) {
  return row.items.find(item => item.sortOrder === metric.sortOrder && item.itemName === metric.itemName)?.value ?? null;
}

function numericValue(value: string | null) {
  if (value === null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function hundredDaysRecordId(submissionId: string, platformCode: HundredDaysPlatformCode) {
  return `${submissionId}:${platformCode}`;
}

export function parseHundredDaysRecordId(value: string) {
  const separator = value.lastIndexOf(":");
  if (separator <= 0) return null;
  const submissionId = value.slice(0, separator);
  const platformCode = value.slice(separator + 1) as HundredDaysPlatformCode;
  return HUNDRED_DAYS_PLATFORMS.some(platform => platform.code === platformCode) ? { submissionId, platformCode } : null;
}

export function serializeHundredDaysRows(row: HundredDaysSourceRow, source: HundredDaysSource, platformCode?: HundredDaysPlatformCode) {
  const platforms = platformCode ? source.platforms.filter(platform => platform.code === platformCode) : source.platforms;
  const numericValues = Object.fromEntries(source.platforms.flatMap(platform => Object.values(platform.metrics).map(metric => [metric.sourceFieldKey, numericValue(rawValue(row, metric))])));
  return platforms.map(platform => ({
    id: hundredDaysRecordId(row.id, platform.code),
    submissionId: row.id,
    platformCode: platform.code,
    brandName: row.brandNameSnapshot,
    storeName: row.storeNameSnapshot,
    weekDate: row.executionDate.toISOString().slice(0, 10),
    platformName: platform.label,
    shopScore: numericValue(rawValue(row, platform.metrics.shopScore)),
    rating: numericValue(rawValue(row, platform.metrics.rating)),
    weeklyOrders: numericValue(rawValue(row, platform.metrics.weeklyOrders)),
    weeklyReviews: numericValue(rawValue(row, platform.metrics.weeklyReviews)),
    weeklyPositiveReviews: numericValue(rawValue(row, platform.metrics.weeklyPositiveReviews)),
    weeklyNegativeReviews: numericValue(rawValue(row, platform.metrics.weeklyNegativeReviews)),
    reviewRate: calculateStoredBusinessFormula(platform.rates.reviewRate.sourceFieldConfig, numericValues),
    positiveRate: calculateStoredBusinessFormula(platform.rates.positiveRate.sourceFieldConfig, numericValues),
    negativeRate: calculateStoredBusinessFormula(platform.rates.negativeRate.sourceFieldConfig, numericValues),
    productQuality: rawValue(row, platform.metrics.productQuality),
    serviceExperience: rawValue(row, platform.metrics.serviceExperience),
    environmentExperience: rawValue(row, platform.metrics.environmentExperience),
  }));
}

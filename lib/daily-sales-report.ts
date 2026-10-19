import { BusinessDataSourceType, Prisma } from "@prisma/client";
import { z } from "zod";
import type { Session } from "@/lib/auth";
import { getBusinessDictionaryOptions, type DictionaryOption } from "@/lib/business-dictionaries";
import { db } from "@/lib/db";
import { dateKeyAsDbDate } from "@/lib/store-h5-tasks";

export const DAILY_SALES_REPORT_SOURCE_RECORD_NO = "202609240001";
export const DAILY_SALES_REPORT_PAGE_SIZES = [10, 20, 50, 100] as const;

export const DAILY_SALES_REPORT_METRICS = [
  { key: "actualSalesAmount", fieldName: "【营业数据】实际销售额", columnTitle: "实际销售额" },
  { key: "receivedAmount", fieldName: "【营业数据】实收金额", columnTitle: "实收金额" },
  { key: "scanCashAmount", fieldName: "【业绩构成】扫码/现金", columnTitle: "扫码/现金" },
  { key: "meituanAmount", fieldName: "【业绩构成】美团团购", columnTitle: "美团订单" },
  { key: "douyinAmount", fieldName: "【业绩构成】抖音", columnTitle: "抖音订单" },
  { key: "kuaishouAmount", fieldName: "【业绩构成】快手", columnTitle: "快手订单" },
  { key: "gaodeAmount", fieldName: "【业绩构成】高德", columnTitle: "高德订单" },
  { key: "takeawayAmount", fieldName: "【业绩构成】外卖", columnTitle: "外卖" },
] as const;

export type DailySalesReportMetricKey = typeof DAILY_SALES_REPORT_METRICS[number]["key"];
export type DailySalesReportAction = "query" | "export";

export function canDailySalesReport(session: Pick<Session, "permissions">, action: DailySalesReportAction) {
  if (session.permissions.includes("*")) return true;
  if (session.permissions.includes(`daily-sales-report:${action}`)) return true;
  return action === "query" && session.permissions.includes("operations:view");
}

function validDateKey(value: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value)) return false;
  return dateKeyAsDbDate(value).toISOString().slice(0, 10) === value;
}

export const dailySalesReportFiltersSchema = z.object({
  brand: z.string().trim().max(100, "品牌筛选条件不正确").default(""),
  storeNameKeyword: z.string().trim().max(100, "门店名称不能超过100个字符").default(""),
  startDate: z.string().trim().default("").refine(value => !value || validDateKey(value), "开始日期格式不正确"),
  endDate: z.string().trim().default("").refine(value => !value || validDateKey(value), "截止日期格式不正确"),
}).superRefine((value, context) => {
  if (value.startDate && value.endDate && value.startDate > value.endDate) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["startDate"], message: "开始日期不能晚于截止日期" });
  }
});

export type DailySalesReportFilters = z.infer<typeof dailySalesReportFiltersSchema>;

export function readDailySalesReportFilters(search: URLSearchParams) {
  return dailySalesReportFiltersSchema.safeParse({
    brand: search.get("brand") || "",
    storeNameKeyword: search.get("storeNameKeyword") || "",
    startDate: search.get("startDate") || "",
    endDate: search.get("endDate") || "",
  });
}

export function dailySalesReportFilterWhere(filters: DailySalesReportFilters): Prisma.TaskSubmissionWhereInput {
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

type DailySalesReportScope = { brandIds: string[] | null; storeIds: string[] | null };

async function resolveDailySalesReportScope(session: Session): Promise<DailySalesReportScope> {
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

export async function dailySalesReportDataScope(session: Session): Promise<Prisma.TaskSubmissionWhereInput> {
  const scope = await resolveDailySalesReportScope(session);
  return {
    ...(scope.brandIds !== null ? { brandIdSnapshot: { in: scope.brandIds } } : {}),
    ...(scope.storeIds !== null ? { storeId: { in: scope.storeIds } } : {}),
  };
}

export async function dailySalesReportBrandOptions(session: Session): Promise<DictionaryOption[]> {
  const dictionaryOptions = await getBusinessDictionaryOptions("BRAND");
  const scope = await resolveDailySalesReportScope(session);
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

type SourceFieldConfig = { source?: unknown; column?: unknown; sortOrder?: unknown; itemName?: unknown };
type MetricSource = { sortOrder: number; itemName: string };

export type DailySalesReportSource = {
  sourceRecordNo: string;
  templateId: string;
  metrics: Record<DailySalesReportMetricKey, MetricSource>;
};

export class DailySalesReportError extends Error {
  constructor(message: string, readonly status = 500) {
    super(message);
    this.name = "DailySalesReportError";
  }
}

function fieldConfig(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as SourceFieldConfig : null;
}

export async function loadDailySalesReportSource(): Promise<DailySalesReportSource> {
  const source = await db.businessDataSource.findUnique({
    where: { recordNo: DAILY_SALES_REPORT_SOURCE_RECORD_NO },
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
  if (!source) throw new DailySalesReportError(`业务数据源 ${DAILY_SALES_REPORT_SOURCE_RECORD_NO} 不存在，请先完成配置`, 409);
  if (source.sourceType !== BusinessDataSourceType.TASK_TEMPLATE) {
    throw new DailySalesReportError(`业务数据源 ${source.recordNo} 必须引用任务模版`, 409);
  }

  const dimensions = [
    { name: "品牌", column: "brandNameSnapshot" },
    { name: "门店", column: "storeNameSnapshot" },
    { name: "业务日期", column: "executionDate" },
    { name: "上报人", column: "userRealNameSnapshot" },
  ];
  const dimensionsMatch = dimensions.every(dimension => {
    const config = fieldConfig(source.fields.find(item => item.fieldNameSnapshot === dimension.name)?.sourceFieldConfig);
    return config?.source === "TaskSubmission" && config.column === dimension.column;
  });

  const metricEntries = DAILY_SALES_REPORT_METRICS.map(spec => {
    const field = source.fields.find(item => item.fieldNameSnapshot === spec.fieldName);
    const config = fieldConfig(field?.sourceFieldConfig);
    const keySortOrder = field?.sourceFieldKey.match(/^task-item:(\d+)$/)?.[1];
    const sortOrder = typeof config?.sortOrder === "number" && Number.isInteger(config.sortOrder)
      ? config.sortOrder
      : keySortOrder === undefined ? NaN : Number(keySortOrder);
    const itemName = typeof config?.itemName === "string" && config.itemName.trim()
      ? config.itemName.trim()
      : field?.fieldNameSnapshot || "";
    const mappingMatches = Boolean(field?.sourceFieldKey.match(/^task-item:\d+$/))
      && (config?.source === undefined || config.source === "TaskSubmissionItem")
      && (config?.column === undefined || config.column === "value")
      && Number.isInteger(sortOrder) && sortOrder >= 0 && Boolean(itemName);
    if (!mappingMatches) return null;
    return [spec.key, { sortOrder, itemName }] as const;
  });
  if (!dimensionsMatch || metricEntries.some(entry => entry === null)) {
    throw new DailySalesReportError(`业务数据源 ${source.recordNo} 中页面所需字段映射不正确`, 409);
  }
  const metrics = Object.fromEntries(metricEntries as Array<readonly [DailySalesReportMetricKey, MetricSource]>) as Record<DailySalesReportMetricKey, MetricSource>;
  const uniqueMappings = new Set(Object.values(metrics).map(metric => `${metric.sortOrder}:${metric.itemName}`));
  if (uniqueMappings.size !== DAILY_SALES_REPORT_METRICS.length) {
    throw new DailySalesReportError(`业务数据源 ${source.recordNo} 中销售指标字段存在重复映射`, 409);
  }
  return { sourceRecordNo: source.recordNo, templateId: source.templateId, metrics };
}

export function dailySalesReportSourceWhere(source: DailySalesReportSource): Prisma.TaskSubmissionWhereInput {
  return { taskIdSnapshot: source.templateId };
}

export function dailySalesReportSelect(source: DailySalesReportSource) {
  return {
    id: true,
    recordNo: true,
    brandNameSnapshot: true,
    storeNameSnapshot: true,
    executionDate: true,
    userRealNameSnapshot: true,
    items: {
      where: { OR: Object.values(source.metrics).map(metric => ({ sortOrder: metric.sortOrder, itemName: metric.itemName })) },
      select: { sortOrder: true, itemName: true, value: true },
    },
  } satisfies Prisma.TaskSubmissionSelect;
}

type DailySalesReportSourceRow = {
  id: string;
  recordNo: string;
  brandNameSnapshot: string;
  storeNameSnapshot: string;
  executionDate: Date;
  userRealNameSnapshot: string;
  items: Array<{ sortOrder: number; itemName: string; value: string | null }>;
};

function readMoneyValue(row: DailySalesReportSourceRow, metric: MetricSource) {
  const raw = row.items.find(item => item.sortOrder === metric.sortOrder && item.itemName === metric.itemName)?.value;
  if (raw === null || raw === undefined || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export function serializeDailySalesReport(row: DailySalesReportSourceRow, source: DailySalesReportSource) {
  const amounts = Object.fromEntries(DAILY_SALES_REPORT_METRICS.map(spec => [spec.key, readMoneyValue(row, source.metrics[spec.key])])) as Record<DailySalesReportMetricKey, number | null>;
  return {
    id: row.id,
    recordNo: row.recordNo,
    brandName: row.brandNameSnapshot,
    storeName: row.storeNameSnapshot,
    businessDate: row.executionDate.toISOString().slice(0, 10),
    ...amounts,
    submitterName: row.userRealNameSnapshot,
  };
}

import { BusinessDataSourceType, Prisma } from "@prisma/client";
import { z } from "zod";
import type { Session } from "@/lib/auth";
import { db } from "@/lib/db";
import { dateKeyAsDbDate } from "@/lib/store-h5-tasks";

export const WECHAT_PRIVATE_DAILY_NEW_SOURCE_RECORD_NO = "202610190001";
export const WECHAT_PRIVATE_DAILY_NEW_PAGE_SIZES = [10, 20, 50, 100] as const;
export const WECHAT_PRIVATE_DAILY_NEW_FIELD_NAME = "【微信新增】今日新增好友";

export type WechatPrivateDailyNewAction = "query" | "export";

export function canWechatPrivateDailyNew(session: Pick<Session, "permissions">, action: WechatPrivateDailyNewAction) {
  if (session.permissions.includes("*")) return true;
  if (session.permissions.includes(`wechat-private-daily-new:${action}`)) return true;
  return action === "query" && session.permissions.includes("operations:view");
}

function validDateKey(value: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])-([012]\d|3[01])$/.test(value)) return false;
  return dateKeyAsDbDate(value).toISOString().slice(0, 10) === value;
}

export const wechatPrivateDailyNewFiltersSchema = z.object({
  brand: z.string().trim().max(100, "品牌筛选条件不正确").default(""),
  storeNameKeyword: z.string().trim().max(100, "门店名称不能超过100个字符").default(""),
  startDate: z.string().trim().default("").refine(value => !value || validDateKey(value), "开始日期格式不正确"),
  endDate: z.string().trim().default("").refine(value => !value || validDateKey(value), "截止日期格式不正确"),
}).superRefine((value, context) => {
  if (value.startDate && value.endDate && value.startDate > value.endDate) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["startDate"], message: "开始日期不能晚于截止日期" });
  }
});

export type WechatPrivateDailyNewFilters = z.infer<typeof wechatPrivateDailyNewFiltersSchema>;

export function readWechatPrivateDailyNewFilters(search: URLSearchParams) {
  return wechatPrivateDailyNewFiltersSchema.safeParse({
    brand: search.get("brand") || "",
    storeNameKeyword: search.get("storeNameKeyword") || "",
    startDate: search.get("startDate") || "",
    endDate: search.get("endDate") || "",
  });
}

export function wechatPrivateDailyNewFilterWhere(filters: WechatPrivateDailyNewFilters): Prisma.TaskSubmissionWhereInput {
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

export async function wechatPrivateDailyNewDataScope(session: Session): Promise<Prisma.TaskSubmissionWhereInput> {
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

type FieldConfig = { source?: unknown; column?: unknown; sortOrder?: unknown; itemName?: unknown };

export type WechatPrivateDailyNewSource = {
  sourceRecordNo: string;
  templateId: string;
  metricSortOrder: number;
  metricItemName: string;
};

export class WechatPrivateDailyNewError extends Error {
  constructor(message: string, readonly status = 500) {
    super(message);
    this.name = "WechatPrivateDailyNewError";
  }
}

export async function loadWechatPrivateDailyNewSource(): Promise<WechatPrivateDailyNewSource> {
  const source = await db.businessDataSource.findUnique({
    where: { recordNo: WECHAT_PRIVATE_DAILY_NEW_SOURCE_RECORD_NO },
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
  if (!source) throw new WechatPrivateDailyNewError(`业务数据源 ${WECHAT_PRIVATE_DAILY_NEW_SOURCE_RECORD_NO} 不存在，请先完成配置`, 409);
  if (source.sourceType !== BusinessDataSourceType.TASK_TEMPLATE) {
    throw new WechatPrivateDailyNewError(`业务数据源 ${source.recordNo} 必须引用任务模版`, 409);
  }
  const metric = source.fields.find(field => field.fieldNameSnapshot === WECHAT_PRIVATE_DAILY_NEW_FIELD_NAME);
  const config = metric?.sourceFieldConfig && typeof metric.sourceFieldConfig === "object" && !Array.isArray(metric.sourceFieldConfig)
    ? metric.sourceFieldConfig as FieldConfig
    : null;
  const keySortOrder = metric?.sourceFieldKey.match(/^task-item:(\d+)$/)?.[1];
  const metricSortOrder = typeof config?.sortOrder === "number" && Number.isInteger(config.sortOrder)
    ? config.sortOrder
    : keySortOrder === undefined ? NaN : Number(keySortOrder);
  const metricItemName = typeof config?.itemName === "string" && config.itemName.trim()
    ? config.itemName.trim()
    : metric?.fieldNameSnapshot || "";
  const metricSourceMatches = (config?.source === undefined || config.source === "TaskSubmissionItem")
    && (config?.column === undefined || config.column === "value")
    && Boolean(metric?.sourceFieldKey.match(/^task-item:\d+$/));
  const dimensions = [
    { name: "任务记录编号", column: "recordNo" },
    { name: "品牌", column: "brandNameSnapshot" },
    { name: "门店", column: "storeNameSnapshot" },
    { name: "业务日期", column: "executionDate" },
    { name: "上报人", column: "userRealNameSnapshot" },
    { name: "上报时间", column: "submittedAt" },
  ];
  const dimensionsMatch = dimensions.every(dimension => {
    const field = source.fields.find(item => item.fieldNameSnapshot === dimension.name);
    const fieldConfig = field?.sourceFieldConfig && typeof field.sourceFieldConfig === "object" && !Array.isArray(field.sourceFieldConfig)
      ? field.sourceFieldConfig as FieldConfig
      : null;
    return fieldConfig?.source === "TaskSubmission" && fieldConfig.column === dimension.column;
  });
  if (!metric || !metricSourceMatches || !Number.isInteger(metricSortOrder) || metricSortOrder < 0 || !metricItemName || !dimensionsMatch) {
    throw new WechatPrivateDailyNewError(`业务数据源 ${source.recordNo} 中页面所需字段映射不正确`, 409);
  }
  return { sourceRecordNo: source.recordNo, templateId: source.templateId, metricSortOrder, metricItemName };
}

export function wechatPrivateDailyNewSourceWhere(source: WechatPrivateDailyNewSource): Prisma.TaskSubmissionWhereInput {
  return {
    taskIdSnapshot: source.templateId,
    items: { some: { sortOrder: source.metricSortOrder, itemName: source.metricItemName, value: { not: null } } },
  };
}

export function wechatPrivateDailyNewSelect(source: WechatPrivateDailyNewSource) {
  return {
    id: true,
    recordNo: true,
    brandNameSnapshot: true,
    storeNameSnapshot: true,
    executionDate: true,
    userRealNameSnapshot: true,
    submittedAt: true,
    items: {
      where: { sortOrder: source.metricSortOrder, itemName: source.metricItemName },
      select: { value: true },
      take: 1,
    },
  } satisfies Prisma.TaskSubmissionSelect;
}

type WechatPrivateDailyNewSourceRow = {
  id: string;
  recordNo: string;
  brandNameSnapshot: string;
  storeNameSnapshot: string;
  executionDate: Date;
  userRealNameSnapshot: string;
  submittedAt: Date;
  items: Array<{ value: string | null }>;
};

export function formatWechatPrivateDailyNewDateTime(value: Date) {
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

export function serializeWechatPrivateDailyNew(row: WechatPrivateDailyNewSourceRow) {
  const rawValue = row.items[0]?.value;
  const value = rawValue === null || rawValue === undefined ? NaN : Number(rawValue);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new WechatPrivateDailyNewError(`门店“${row.storeNameSnapshot}”在 ${row.executionDate.toISOString().slice(0, 10)} 的微信好友新增数异常，请检查原始任务记录`, 500);
  }
  return {
    id: row.id,
    recordNo: row.recordNo,
    brandName: row.brandNameSnapshot,
    storeName: row.storeNameSnapshot,
    businessDate: row.executionDate.toISOString().slice(0, 10),
    todayNewWechatFriends: value,
    submitterName: row.userRealNameSnapshot,
    submittedAt: formatWechatPrivateDailyNewDateTime(row.submittedAt),
  };
}

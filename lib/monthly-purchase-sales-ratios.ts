import { Prisma } from "@prisma/client";
import { z } from "zod";
import type { Session } from "@/lib/auth";
import { db } from "@/lib/db";
import { shanghaiDateTime } from "@/lib/operation-log";

export const MONTHLY_PURCHASE_SALES_YEAR_MIN = 2026;
export const MONTHLY_PURCHASE_SALES_YEAR_MAX = 2999;
export const MONTHLY_PURCHASE_SALES_PAGE_SIZES = [20, 50, 100] as const;

export type MonthlyPurchaseSalesPermission = "query" | "create" | "import" | "export" | "view" | "edit" | "delete";

export function canMonthlyPurchaseSales(session: Pick<Session, "permissions">, action: MonthlyPurchaseSalesPermission) {
  if (session.permissions.includes("*")) return true;
  if (session.permissions.includes(`monthly-purchase-sales:${action}`)) return true;
  return (action === "query" || action === "view") && session.permissions.includes("operations:view");
}

function jsonStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item)) : null;
}

async function userDataScope(session: Session) {
  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { leadH5BrandIds: true, leadH5StoreIds: true },
  });
  if (!user) return { brandIds: [] as string[], storeIds: [] as string[] };
  const configuredBrandIds = jsonStringArray(user.leadH5BrandIds);
  const configuredStoreIds = jsonStringArray(user.leadH5StoreIds);
  const tokenBrandIds = session.permissions.filter(value => value.startsWith("data:brand:")).map(value => value.slice(11)).filter(Boolean);
  const tokenStoreIds = session.permissions.filter(value => value.startsWith("data:store:")).map(value => value.slice(11)).filter(Boolean);
  return {
    brandIds: configuredBrandIds ?? (tokenBrandIds.length ? tokenBrandIds : null),
    storeIds: configuredStoreIds ?? (tokenStoreIds.length ? tokenStoreIds : null),
  };
}

export async function monthlyPurchaseSalesDataScope(session: Session): Promise<Prisma.MonthlyPurchaseSalesRatioWhereInput> {
  const scope = await userDataScope(session);
  const where: Prisma.MonthlyPurchaseSalesRatioWhereInput = {};
  if (scope.brandIds !== null) where.store = { brandId: { in: scope.brandIds } };
  if (scope.storeIds !== null) where.storeId = { in: scope.storeIds };
  return where;
}

export async function monthlyPurchaseSalesStoreScope(session: Session): Promise<Prisma.StoreWhereInput> {
  const scope = await userDataScope(session);
  const where: Prisma.StoreWhereInput = {};
  if (scope.brandIds !== null) where.brandId = { in: scope.brandIds };
  if (scope.storeIds !== null) where.id = { in: scope.storeIds };
  return where;
}

export const monthlyPurchaseSalesFiltersSchema = z.object({
  brandCode: z.string().trim().max(100, "品牌筛选条件不正确").default(""),
  storeNameKeyword: z.string().trim().max(100, "门店名称不能超过100个字符").default(""),
  year: z.string().trim().default("").refine(value => !value || (/^\d{4}$/.test(value) && Number(value) >= MONTHLY_PURCHASE_SALES_YEAR_MIN && Number(value) <= MONTHLY_PURCHASE_SALES_YEAR_MAX), "请输入2026-2999之间的四位年份"),
  month: z.string().trim().default("").refine(value => !value || /^(?:[1-9]|1[0-2])$/.test(value), "所属月份不正确"),
});

export type MonthlyPurchaseSalesFilters = z.infer<typeof monthlyPurchaseSalesFiltersSchema>;

export function monthlyPurchaseSalesFilterWhere(filters: MonthlyPurchaseSalesFilters): Prisma.MonthlyPurchaseSalesRatioWhereInput {
  return {
    ...(filters.brandCode ? { OR: [{ brandCode: filters.brandCode }, { brandNameSnapshot: filters.brandCode }] } : {}),
    ...(filters.storeNameKeyword ? { storeNameSnapshot: { contains: filters.storeNameKeyword } } : {}),
    ...(filters.year ? { year: Number(filters.year) } : {}),
    ...(filters.month ? { month: Number(filters.month) } : {}),
  };
}

const requiredAmount = (label: string, allowZero: boolean) => z.preprocess(value => {
  if (typeof value === "string" && value.trim()) return Number(value);
  return value;
}, z.number({ required_error: `请输入${label}`, invalid_type_error: `${label}格式不正确` }).finite(`${label}格式不正确`).refine(value => allowZero ? value >= 0 : value > 0, allowZero ? `${label}不能为负数` : `${label}必须大于0`).refine(value => Math.abs(Math.round(value * 100) - value * 100) < 1e-6, `${label}最多保留2位小数`));

const optionalPositiveAmount = (label: string) => z.preprocess(value => {
  if (value === "" || value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim()) return Number(value);
  return value;
}, z.number({ invalid_type_error: `${label}格式不正确` }).finite(`${label}格式不正确`).positive(`${label}必须大于0`).refine(value => Math.abs(Math.round(value * 100) - value * 100) < 1e-6, `${label}最多保留2位小数`).nullable());

const yearSchema = z.number({ required_error: "请输入所属年份", invalid_type_error: "请输入2026-2999之间的四位年份" })
  .int("请输入2026-2999之间的四位年份")
  .min(MONTHLY_PURCHASE_SALES_YEAR_MIN, "请输入2026-2999之间的四位年份")
  .max(MONTHLY_PURCHASE_SALES_YEAR_MAX, "请输入2026-2999之间的四位年份");
const monthSchema = z.number({ required_error: "请选择所属月份", invalid_type_error: "请选择所属月份" }).int().min(1, "请选择所属月份").max(12, "请选择所属月份");

export const monthlyPurchaseSalesCreateSchema = z.object({
  aliasId: z.string({ required_error: "请选择系统中已配置的美团管家门店别名" }).trim().min(1, "请选择系统中已配置的美团管家门店别名").max(191),
  year: yearSchema,
  month: monthSchema,
  preDiscountSales: requiredAmount("折前销售额", false),
  postDiscountSales: optionalPositiveAmount("折后销售额"),
  purchaseAmount: requiredAmount("要货金额", true),
  remark: z.string().max(200, "备注不能超过200个字符").default(""),
});

export const monthlyPurchaseSalesUpdateSchema = monthlyPurchaseSalesCreateSchema.omit({ aliasId: true, remark: true });

export type MonthlyPurchaseSalesAmounts = {
  preDiscountSales: number | string | Prisma.Decimal;
  postDiscountSales?: number | string | Prisma.Decimal | null;
  purchaseAmount: number | string | Prisma.Decimal;
};

export function calculateMonthlyPurchaseSalesRatios(values: MonthlyPurchaseSalesAmounts) {
  const pre = new Prisma.Decimal(values.preDiscountSales);
  const post = values.postDiscountSales === null || values.postDiscountSales === undefined || values.postDiscountSales === "" ? null : new Prisma.Decimal(values.postDiscountSales);
  const purchase = new Prisma.Decimal(values.purchaseAmount);
  if (!pre.isPositive()) throw new MonthlyPurchaseSalesError("折前销售额必须大于0", 400);
  if (post && !post.isPositive()) throw new MonthlyPurchaseSalesError("折后销售额必须大于0", 400);
  if (purchase.isNegative()) throw new MonthlyPurchaseSalesError("要货金额不能为负数", 400);
  return {
    preDiscountSales: pre.toDecimalPlaces(2),
    postDiscountSales: post?.toDecimalPlaces(2) ?? null,
    purchaseAmount: purchase.toDecimalPlaces(2),
    preDiscountPurchaseSalesRatio: purchase.div(pre).mul(100).toDecimalPlaces(4),
    postDiscountPurchaseSalesRatio: post ? purchase.div(post).mul(100).toDecimalPlaces(4) : null,
  };
}

export const monthlyPurchaseSalesSelect = {
  id: true,
  recordNo: true,
  storeId: true,
  storeNameSnapshot: true,
  aliasId: true,
  meituanAliasSnapshot: true,
  brandCode: true,
  brandNameSnapshot: true,
  year: true,
  month: true,
  preDiscountSales: true,
  postDiscountSales: true,
  purchaseAmount: true,
  preDiscountPurchaseSalesRatio: true,
  postDiscountPurchaseSalesRatio: true,
  remark: true,
  sourceType: true,
  createdByNameSnapshot: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.MonthlyPurchaseSalesRatioSelect;

export type MonthlyPurchaseSalesSource = Prisma.MonthlyPurchaseSalesRatioGetPayload<{ select: typeof monthlyPurchaseSalesSelect }>;

export function formatMonthlyPurchaseSalesDateTime(value: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).format(value).replaceAll("/", "-");
}

export function serializeMonthlyPurchaseSales(row: MonthlyPurchaseSalesSource) {
  return {
    id: row.id,
    recordNo: row.recordNo,
    storeId: row.storeId,
    storeName: row.storeNameSnapshot,
    aliasId: row.aliasId,
    storeAlias: row.meituanAliasSnapshot,
    brandCode: row.brandCode,
    brandName: row.brandNameSnapshot,
    year: row.year,
    month: row.month,
    preDiscountSales: row.preDiscountSales.toFixed(2),
    postDiscountSales: row.postDiscountSales?.toFixed(2) ?? null,
    purchaseAmount: row.purchaseAmount.toFixed(2),
    preDiscountPurchaseSalesRatio: row.preDiscountPurchaseSalesRatio.toFixed(4),
    postDiscountPurchaseSalesRatio: row.postDiscountPurchaseSalesRatio?.toFixed(4) ?? null,
    remark: row.remark || "",
    sourceType: row.sourceType,
    createdByName: row.createdByNameSnapshot,
    createdAt: formatMonthlyPurchaseSalesDateTime(row.createdAt),
    updatedAt: formatMonthlyPurchaseSalesDateTime(row.updatedAt),
  };
}

export function normalizeMeituanAlias(value: unknown) {
  return String(value ?? "").replace(/[\u00a0\u3000]/g, " ").trim();
}

export async function nextMonthlyPurchaseSalesRecordNo(tx: Prisma.TransactionClient, now = new Date()) {
  const { dateKey } = shanghaiDateTime(now);
  const sequence = await tx.monthlyPurchaseSalesSequence.upsert({
    where: { dateKey },
    create: { dateKey, nextValue: 2 },
    update: { nextValue: { increment: 1 } },
  });
  const value = sequence.nextValue - 1;
  if (value > 9999) throw new MonthlyPurchaseSalesError("当日月度采销比记录编号已达到上限", 409);
  return `${dateKey}${String(value).padStart(4, "0")}`;
}

export class MonthlyPurchaseSalesError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "MonthlyPurchaseSalesError";
  }
}

export function isMonthlyPurchaseSalesUniqueError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

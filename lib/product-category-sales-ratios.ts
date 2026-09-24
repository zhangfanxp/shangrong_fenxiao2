import { Prisma } from "@prisma/client";
import { z } from "zod";
import type { Session } from "@/lib/auth";
import { db } from "@/lib/db";
import { shanghaiDateTime } from "@/lib/operation-log";

export const PRODUCT_CATEGORY_SALES_PAGE_SIZES = [20, 50, 100] as const;
export type ProductCategorySalesPermission = "query" | "import" | "export" | "view" | "delete";

export function canProductCategorySales(session: Pick<Session, "permissions">, action: ProductCategorySalesPermission) {
  if (session.permissions.includes("*")) return true;
  if (session.permissions.includes(`product-category-sales:${action}`)) return true;
  return (action === "query" || action === "view") && session.permissions.includes("operations:view");
}

function jsonStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item)) : null;
}

async function userDataScope(session: Session) {
  const user = await db.user.findUnique({ where: { id: session.userId }, select: { leadH5BrandIds: true, leadH5StoreIds: true } });
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

export async function productCategorySalesDataScope(session: Session): Promise<Prisma.ProductCategorySalesMonthlyWhereInput> {
  const scope = await userDataScope(session);
  const where: Prisma.ProductCategorySalesMonthlyWhereInput = {};
  if (scope.brandIds !== null) where.store = { brandId: { in: scope.brandIds } };
  if (scope.storeIds !== null) where.storeId = { in: scope.storeIds };
  return where;
}

export async function productCategorySalesStoreScope(session: Session): Promise<Prisma.StoreWhereInput> {
  const scope = await userDataScope(session);
  const where: Prisma.StoreWhereInput = {};
  if (scope.brandIds !== null) where.brandId = { in: scope.brandIds };
  if (scope.storeIds !== null) where.id = { in: scope.storeIds };
  return where;
}

export const productCategorySalesFiltersSchema = z.object({
  brandCode: z.string().trim().max(100, "品牌筛选条件不正确").default(""),
  storeNameKeyword: z.string().trim().max(100, "门店名称不能超过100个字符").default(""),
  month: z.string().trim().default("").refine(value => !value || /^\d{4}-(?:0[1-9]|1[0-2])$/.test(value), "所属月份不正确"),
});

export type ProductCategorySalesFilters = z.infer<typeof productCategorySalesFiltersSchema>;

export function productCategorySalesFilterWhere(filters: ProductCategorySalesFilters): Prisma.ProductCategorySalesMonthlyWhereInput {
  const [year, month] = filters.month ? filters.month.split("-").map(Number) : [];
  return {
    ...(filters.brandCode ? { OR: [{ brandCode: filters.brandCode }, { brandNameSnapshot: filters.brandCode }] } : {}),
    ...(filters.storeNameKeyword ? { storeNameSnapshot: { contains: filters.storeNameKeyword } } : {}),
    ...(filters.month ? { year, month } : {}),
  };
}

export const productCategorySalesListSelect = {
  id: true,
  recordNo: true,
  year: true,
  month: true,
  storeId: true,
  storeNameSnapshot: true,
  meituanAliasSnapshot: true,
  brandCode: true,
  brandNameSnapshot: true,
  totalSalesQuantity: true,
  totalSalesAmount: true,
  createdAt: true,
} satisfies Prisma.ProductCategorySalesMonthlySelect;

export type ProductCategorySalesListSource = Prisma.ProductCategorySalesMonthlyGetPayload<{ select: typeof productCategorySalesListSelect }>;

export function formatProductCategorySalesDateTime(value: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).format(value).replaceAll("/", "-");
}

export function serializeProductCategorySales(row: ProductCategorySalesListSource) {
  return {
    id: row.id,
    recordNo: row.recordNo,
    year: row.year,
    month: row.month,
    storeId: row.storeId,
    storeName: row.storeNameSnapshot,
    storeAlias: row.meituanAliasSnapshot,
    brandCode: row.brandCode,
    brandName: row.brandNameSnapshot,
    totalSalesQuantity: row.totalSalesQuantity.toFixed(2),
    totalSalesAmount: row.totalSalesAmount.toFixed(2),
    createdAt: formatProductCategorySalesDateTime(row.createdAt),
  };
}

export function normalizeProductCategoryText(value: unknown) {
  return String(value ?? "").normalize("NFKC").replace(/[\u00a0\u3000]/g, " ").replace(/\s+/g, " ").trim();
}

export function normalizeProductCategoryStoreAlias(value: unknown) {
  return normalizeProductCategoryText(value).replace(/[()（）]/g, "").replace(/\s+/g, " ").trim();
}

export function normalizeProductCategoryHeader(value: unknown) {
  return normalizeProductCategoryText(value).replaceAll("(", "（").replaceAll(")", "）").replace(/\s+/g, "");
}

export type ProductCategorySalesInputDetail = {
  categoryName: string;
  salesQuantity: Prisma.Decimal;
  salesAmount: Prisma.Decimal;
  dishIncome: Prisma.Decimal;
  dishDiscount: Prisma.Decimal;
  sortOrder: number;
};

export function calculateProductCategorySales(details: ProductCategorySalesInputDetail[]) {
  const zero = new Prisma.Decimal(0);
  const totalSalesQuantity = details.reduce((sum, item) => sum.add(item.salesQuantity), zero);
  const totalSalesAmount = details.reduce((sum, item) => sum.add(item.salesAmount), zero);
  const totalDishIncome = details.reduce((sum, item) => sum.add(item.dishIncome), zero);
  const totalDishDiscount = details.reduce((sum, item) => sum.add(item.dishDiscount), zero);
  const ratio = (value: Prisma.Decimal, total: Prisma.Decimal) => total.isZero() ? null : value.div(total).mul(100).toDecimalPlaces(4);
  return {
    totalSalesQuantity: totalSalesQuantity.toDecimalPlaces(2),
    totalSalesAmount: totalSalesAmount.toDecimalPlaces(2),
    details: details.map(item => ({
      categoryName: item.categoryName,
      salesQuantity: item.salesQuantity.toDecimalPlaces(2),
      salesQuantityRatio: ratio(item.salesQuantity, totalSalesQuantity),
      salesAmount: item.salesAmount.toDecimalPlaces(2),
      salesAmountRatio: ratio(item.salesAmount, totalSalesAmount),
      dishIncome: item.dishIncome.toDecimalPlaces(2),
      dishIncomeRatio: ratio(item.dishIncome, totalDishIncome),
      dishDiscount: item.dishDiscount.toDecimalPlaces(2),
      dishDiscountRatio: ratio(item.dishDiscount, totalDishDiscount),
      sortOrder: item.sortOrder,
    })),
  };
}

export async function nextProductCategorySalesRecordNo(tx: Prisma.TransactionClient, now = new Date()) {
  const { dateKey } = shanghaiDateTime(now);
  const sequence = await tx.productCategorySalesSequence.upsert({
    where: { dateKey },
    create: { dateKey, nextValue: 2 },
    update: { nextValue: { increment: 1 } },
  });
  const value = sequence.nextValue - 1;
  if (value > 9999) throw new ProductCategorySalesError("当日产品类别销售占比记录编号已达到上限", 409);
  return `${dateKey}${String(value).padStart(4, "0")}`;
}

export class ProductCategorySalesError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "ProductCategorySalesError";
  }
}

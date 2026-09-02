import type { Prisma } from "@prisma/client";
import type { Session } from "@/lib/auth";
import { db } from "@/lib/db";

export type ActualRevenueAction = "query" | "import" | "export" | "view" | "set-monthly-target" | "daily-target-preview" | "delete";

export function canActualRevenue(session: Session, action: ActualRevenueAction) {
  if (session.permissions.includes("*")) return true;
  if (session.permissions.includes(`actual-revenue:${action}`)) return true;
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

export async function actualRevenueDataScope(session: Session): Promise<Prisma.ActualRevenueMonthlyWhereInput> {
  const scope = await userDataScope(session);
  const where: Prisma.ActualRevenueMonthlyWhereInput = {};
  if (scope.brandIds !== null) where.brandId = { in: scope.brandIds };
  if (scope.storeIds !== null) where.storeId = { in: scope.storeIds };
  return where;
}

export async function actualRevenueStoreScope(session: Session): Promise<Prisma.StoreWhereInput> {
  const scope = await userDataScope(session);
  const where: Prisma.StoreWhereInput = {};
  if (scope.brandIds !== null) where.brandId = { in: scope.brandIds };
  if (scope.storeIds !== null) where.id = { in: scope.storeIds };
  return where;
}

export type ActualRevenueFilters = {
  brand?: string;
  storeKeyword?: string;
  startMonth?: string;
  endMonth?: string;
};

export const validMonth = (value?: string) => !value || /^\d{4}-(0[1-9]|1[0-2])$/.test(value);

export function readActualRevenueFilters(search: URLSearchParams): ActualRevenueFilters {
  const read = (key: string, max = 100) => search.get(key)?.trim().slice(0, max) || undefined;
  return { brand: read("brand"), storeKeyword: read("storeKeyword"), startMonth: read("startMonth", 7), endMonth: read("endMonth", 7) };
}

export function actualRevenueFilterWhere(filters: ActualRevenueFilters): Prisma.ActualRevenueMonthlyWhereInput {
  const AND: Prisma.ActualRevenueMonthlyWhereInput[] = [];
  if (filters.brand) AND.push({ OR: [{ brandId: filters.brand }, { brandNameSnapshot: filters.brand }] });
  if (filters.storeKeyword) AND.push({ storeNameSnapshot: { contains: filters.storeKeyword } });
  if (filters.startMonth || filters.endMonth) AND.push({ statMonth: {
    ...(filters.startMonth ? { gte: filters.startMonth } : {}),
    ...(filters.endMonth ? { lte: filters.endMonth } : {}),
  } });
  return AND.length ? { AND } : {};
}

export function nextMonth(statMonth: string) {
  if (!validMonth(statMonth)) throw new Error("统计月份格式不正确");
  const [year, month] = statMonth.split("-").map(Number);
  const date = new Date(Date.UTC(year, month, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export const actualRevenueListSelect = {
  id: true,
  recordNo: true,
  statMonth: true,
  brandNameSnapshot: true,
  storeNameSnapshot: true,
  regionNameSnapshot: true,
  monthlyRevenue: true,
  dailyTargetStatus: true,
  monthlyTarget: { select: { targetMonth: true, targetAmount: true } },
} satisfies Prisma.ActualRevenueMonthlySelect;

type SelectedActualRevenue = Prisma.ActualRevenueMonthlyGetPayload<{ select: typeof actualRevenueListSelect }>;

export function serializeActualRevenue(row: SelectedActualRevenue) {
  return {
    id: row.id,
    recordNo: row.recordNo,
    statMonth: row.statMonth,
    brandName: row.brandNameSnapshot,
    storeName: row.storeNameSnapshot,
    regionName: row.regionNameSnapshot || "-",
    monthlyRevenue: row.monthlyRevenue.toFixed(2),
    targetMonth: row.monthlyTarget?.targetMonth ?? null,
    monthlyTarget: row.monthlyTarget?.targetAmount.toFixed(2) ?? null,
    dailyTargetStatus: row.dailyTargetStatus,
    locked: Boolean(row.monthlyTarget) || row.dailyTargetStatus === "GENERATED",
  };
}

export async function nextActualRevenueRecordNo(tx: Prisma.TransactionClient, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: string) => parts.find(item => item.type === type)?.value || "";
  const dateKey = `${part("year")}${part("month")}${part("day")}`;
  const sequence = await tx.actualRevenueSequence.upsert({
    where: { dateKey },
    create: { dateKey, nextValue: 2 },
    update: { nextValue: { increment: 1 } },
  });
  const value = sequence.nextValue - 1;
  if (value > 9999) throw new Error("当日实际营业额记录编号已达到上限");
  return `${dateKey}${String(value).padStart(4, "0")}`;
}

export function cooperationTypeText(value: string | null | undefined) {
  if (value === "DIRECT") return "直营";
  if (value === "FRANCHISE") return "加盟";
  return value || "-";
}


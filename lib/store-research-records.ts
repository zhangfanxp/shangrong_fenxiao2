import type { Prisma } from "@prisma/client";
import type { Session } from "@/lib/auth";
import { db } from "@/lib/db";
import { validResearchMonth } from "@/lib/lead-h5-research";

export type StoreResearchAction = "query" | "view" | "export" | "delete";

export function canStoreResearch(session: Session, action: StoreResearchAction) {
  return session.permissions.includes("*") || session.permissions.includes(`store-research-records:${action}`);
}

function jsonStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : null;
}

export async function storeResearchDataScope(session: Session): Promise<Prisma.ResearchTemplateRecordWhereInput> {
  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { leadH5BrandIds: true, leadH5StoreIds: true },
  });
  if (!user) return { id: { in: [] } };
  const configuredBrandIds = jsonStringArray(user.leadH5BrandIds);
  const configuredStoreIds = jsonStringArray(user.leadH5StoreIds);
  const tokenBrandIds = session.permissions.filter(value => value.startsWith("data:brand:")).map(value => value.slice(11)).filter(Boolean);
  const tokenStoreIds = session.permissions.filter(value => value.startsWith("data:store:")).map(value => value.slice(11)).filter(Boolean);
  const brandIds = configuredBrandIds ?? (tokenBrandIds.length ? tokenBrandIds : null);
  const storeIds = configuredStoreIds ?? (tokenStoreIds.length ? tokenStoreIds : null);
  const where: Prisma.ResearchTemplateRecordWhereInput = {};
  if (brandIds !== null) where.brandId = { in: brandIds };
  if (storeIds !== null) where.storeId = { in: storeIds };
  return where;
}

export async function researchStoreDataScope(session: Session): Promise<Prisma.StoreWhereInput> {
  const recordScope = await storeResearchDataScope(session);
  const where: Prisma.StoreWhereInput = {};
  if (recordScope.brandId) where.brandId = recordScope.brandId as Prisma.StringFilter;
  if (recordScope.storeId) where.id = recordScope.storeId as Prisma.StringFilter;
  return where;
}

export type StoreResearchFilters = {
  brand?: string;
  storeId?: string;
  researchStartMonth?: string;
  researchEndMonth?: string;
  creatorKeyword?: string;
};

export function storeResearchFilterWhere(filters: StoreResearchFilters): Prisma.ResearchTemplateRecordWhereInput {
  const where: Prisma.ResearchTemplateRecordWhereInput = { status: "SUBMITTED" };
  if (filters.brand) where.AND = [{ OR: [{ brandId: filters.brand }, { brandNameSnapshot: filters.brand }] }];
  if (filters.storeId) where.storeId = filters.storeId;
  if (filters.creatorKeyword) where.supervisorRealName = { contains: filters.creatorKeyword };
  if (filters.researchStartMonth || filters.researchEndMonth) {
    where.researchMonth = {
      ...(filters.researchStartMonth ? { gte: filters.researchStartMonth } : {}),
      ...(filters.researchEndMonth ? { lte: filters.researchEndMonth } : {}),
    };
  }
  return where;
}

export function readStoreResearchFilters(search: URLSearchParams): StoreResearchFilters {
  const read = (key: string, maxLength = 100) => search.get(key)?.trim().slice(0, maxLength) || undefined;
  return {
    brand: read("brand"),
    storeId: read("storeId"),
    researchStartMonth: read("researchStartMonth", 7),
    researchEndMonth: read("researchEndMonth", 7),
    creatorKeyword: read("creatorKeyword", 50),
  };
}

export function validResearchRange(filters: StoreResearchFilters) {
  if (filters.researchStartMonth && !validResearchMonth(filters.researchStartMonth)) return false;
  if (filters.researchEndMonth && !validResearchMonth(filters.researchEndMonth)) return false;
  return !filters.researchStartMonth || !filters.researchEndMonth || filters.researchStartMonth <= filters.researchEndMonth;
}

const dateTimeFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

export function formatResearchDateTime(value: Date) {
  const parts = dateTimeFormatter.formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}:${part("second")}`;
}

export const storeResearchSelect = {
  id: true,
  recordNo: true,
  brandNameSnapshot: true,
  storeNameSnapshot: true,
  templateType: true,
  researchMonth: true,
  storeManagerNameSnapshot: true,
  supervisorRealName: true,
  submittedAt: true,
} satisfies Prisma.ResearchTemplateRecordSelect;

type SelectedStoreResearch = Prisma.ResearchTemplateRecordGetPayload<{ select: typeof storeResearchSelect }>;

export function serializeStoreResearch(row: SelectedStoreResearch) {
  return {
    ...row,
    storeManagerNameSnapshot: row.storeManagerNameSnapshot || "-",
    submittedAt: formatResearchDateTime(row.submittedAt),
  };
}

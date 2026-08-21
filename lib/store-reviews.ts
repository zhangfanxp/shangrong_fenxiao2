import type { Prisma } from "@prisma/client";
import type { Session } from "@/lib/auth";
import { db } from "@/lib/db";

export type StoreReviewAction = "query" | "view" | "export" | "delete";

export function canStoreReview(session: Session, action: StoreReviewAction) {
  if (session.permissions.includes("*")) return true;
  if (session.permissions.includes(`store-reviews:${action}`)) return true;
  return (action === "query" || action === "view") && session.permissions.includes("inspection:view");
}

function jsonStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : null;
}

export async function storeReviewDataScope(session: Session): Promise<Prisma.LeadH5ReviewWhereInput> {
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
  const where: Prisma.LeadH5ReviewWhereInput = {};
  if (brandIds !== null) where.brandId = { in: brandIds };
  if (storeIds !== null) where.storeId = { in: storeIds };
  return where;
}

export async function storeDataScope(session: Session): Promise<Prisma.StoreWhereInput> {
  const reviewScope = await storeReviewDataScope(session);
  const where: Prisma.StoreWhereInput = {};
  if (reviewScope.brandId) where.brandId = reviewScope.brandId as Prisma.StringFilter;
  if (reviewScope.storeId) where.id = reviewScope.storeId as Prisma.StringFilter;
  return where;
}

export type StoreReviewFilters = {
  brand?: string;
  storeId?: string;
  assessmentType?: string;
  startDate?: string;
  endDate?: string;
  reviewerUserId?: string;
};

export function validDate(value: string | undefined) {
  return !value || /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function storeReviewFilterWhere(filters: StoreReviewFilters): Prisma.LeadH5ReviewWhereInput {
  const where: Prisma.LeadH5ReviewWhereInput = {};
  if (filters.brand) where.OR = [{ brandId: filters.brand }, { brandNameSnapshot: filters.brand }];
  if (filters.storeId) where.storeId = filters.storeId;
  if (filters.assessmentType) {
    where.AND = [{ OR: [{ reviewType: filters.assessmentType }, { assessmentName: filters.assessmentType }] }];
  }
  if (filters.reviewerUserId) where.reviewerUserId = filters.reviewerUserId;
  if (filters.startDate || filters.endDate) {
    where.assessmentDate = {
      ...(filters.startDate ? { gte: new Date(`${filters.startDate}T00:00:00+08:00`) } : {}),
      ...(filters.endDate ? { lte: new Date(`${filters.endDate}T23:59:59.999+08:00`) } : {}),
    };
  }
  return where;
}

export function readStoreReviewFilters(search: URLSearchParams): StoreReviewFilters {
  const read = (key: string) => search.get(key)?.trim() || undefined;
  return {
    brand: read("brand"),
    storeId: read("storeId"),
    assessmentType: read("assessmentType"),
    startDate: read("startDate"),
    endDate: read("endDate"),
    reviewerUserId: read("reviewerUserId"),
  };
}

const dateFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" });

export function formatReviewDate(value: Date) {
  return dateFormatter.format(value);
}

export const storeReviewSelect = {
  id: true,
  recordNo: true,
  brandNameSnapshot: true,
  storeNameSnapshot: true,
  assessmentName: true,
  responsiblePersonNameSnapshot: true,
  assessmentDate: true,
  actualScore: true,
  maxScore: true,
  reviewerRealName: true,
  reviewMonth: true,
} satisfies Prisma.LeadH5ReviewSelect;

type SelectedStoreReview = Prisma.LeadH5ReviewGetPayload<{ select: typeof storeReviewSelect }>;

export function serializeStoreReview(row: SelectedStoreReview) {
  return {
    ...row,
    assessmentDate: formatReviewDate(row.assessmentDate),
    actualScore: Number(row.actualScore),
    maxScore: Number(row.maxScore),
    responsiblePersonNameSnapshot: row.responsiblePersonNameSnapshot || "-",
  };
}

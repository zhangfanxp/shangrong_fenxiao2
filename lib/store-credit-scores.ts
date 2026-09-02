import type { Prisma } from "@prisma/client";
import type { Session } from "@/lib/auth";
import { STORE_CREDIT_ASSESSMENT_NAME, STORE_CREDIT_REVIEW_TYPE } from "@/lib/lead-h5-reviews";
import { storeDataScope, storeReviewDataScope } from "@/lib/store-reviews";

export type StoreCreditScoreAction = "query" | "view" | "export" | "delete";

export function canStoreCreditScore(session: Session, action: StoreCreditScoreAction) {
  if (session.permissions.includes("*")) return true;
  if (session.permissions.includes(`store-credit-scores:${action}`)) return true;
  return (action === "query" || action === "view") && session.permissions.includes("inspection:view");
}

export type StoreCreditScoreFilters = {
  brand?: string;
  storeId?: string;
  assessmentStartDate?: string;
  assessmentEndDate?: string;
  supervisorUserId?: string;
};

export function validDate(value: string | undefined) {
  if (!value) return true;
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!matched) return false;
  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const day = Number(matched[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function readStoreCreditScoreFilters(search: URLSearchParams): StoreCreditScoreFilters {
  const read = (key: string) => search.get(key)?.trim() || undefined;
  return {
    brand: read("brand"),
    storeId: read("storeId"),
    assessmentStartDate: read("assessmentStartDate"),
    assessmentEndDate: read("assessmentEndDate"),
    supervisorUserId: read("supervisorUserId"),
  };
}

export function storeCreditScoreFilterWhere(filters: StoreCreditScoreFilters): Prisma.LeadH5ReviewWhereInput {
  const where: Prisma.LeadH5ReviewWhereInput = { reviewType: STORE_CREDIT_REVIEW_TYPE };
  if (filters.brand) where.OR = [{ brandId: filters.brand }, { brandCodeSnapshot: filters.brand }, { brandNameSnapshot: filters.brand }];
  if (filters.storeId) where.storeId = filters.storeId;
  if (filters.supervisorUserId) where.reviewerUserId = filters.supervisorUserId;
  if (filters.assessmentStartDate || filters.assessmentEndDate) {
    where.assessmentDate = {
      ...(filters.assessmentStartDate ? { gte: new Date(`${filters.assessmentStartDate}T00:00:00+08:00`) } : {}),
      ...(filters.assessmentEndDate ? { lte: new Date(`${filters.assessmentEndDate}T23:59:59.999+08:00`) } : {}),
    };
  }
  return where;
}

export async function storeCreditScoreDataScope(session: Session): Promise<Prisma.LeadH5ReviewWhereInput> {
  return storeReviewDataScope(session);
}

export async function creditScoreStoreDataScope(session: Session): Promise<Prisma.StoreWhereInput> {
  return storeDataScope(session);
}

const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
});
const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

export function formatCreditScoreDate(value: Date) {
  return dateFormatter.format(value);
}

export function formatCreditScoreDateTime(value: Date) {
  return dateTimeFormatter.format(value).replace(/\//g, "-");
}

export const storeCreditScoreSelect = {
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
  reviewerUserId: true,
  reviewMonth: true,
  createdAt: true,
} satisfies Prisma.LeadH5ReviewSelect;

type SelectedStoreCreditScore = Prisma.LeadH5ReviewGetPayload<{ select: typeof storeCreditScoreSelect }>;

export function serializeStoreCreditScore(row: SelectedStoreCreditScore) {
  return {
    id: row.id,
    recordNo: row.recordNo,
    brandName: row.brandNameSnapshot || "-",
    storeName: row.storeNameSnapshot || "-",
    assessmentType: row.assessmentName || STORE_CREDIT_ASSESSMENT_NAME,
    managerName: row.responsiblePersonNameSnapshot || "-",
    assessmentDate: formatCreditScoreDate(row.assessmentDate),
    totalScore: Number(row.actualScore),
    maxScore: Number(row.maxScore),
    supervisorName: row.reviewerRealName || "-",
    supervisorUserId: row.reviewerUserId,
    assessmentMonth: row.reviewMonth,
    createdAt: formatCreditScoreDateTime(row.createdAt),
  };
}

type SnapshotItem = { id?: unknown; breachAmount?: unknown };
type SnapshotSubsection = { items?: unknown };
type SnapshotSection = { children?: unknown };

export function readCreditScoreSnapshot(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { valid: false as const, scoreMode: "", scoreModeLabel: "", breachAmounts: new Map<string, string>() };
  const snapshot = value as Record<string, unknown>;
  if (!Array.isArray(snapshot.sections) || (snapshot.scoreMode !== "BINARY" && snapshot.scoreMode !== "CUSTOM_SCORE")) {
    return { valid: false as const, scoreMode: "", scoreModeLabel: "", breachAmounts: new Map<string, string>() };
  }
  const breachAmounts = new Map<string, string>();
  for (const sectionValue of snapshot.sections) {
    const section = sectionValue as SnapshotSection;
    if (!section || !Array.isArray(section.children)) return { valid: false as const, scoreMode: "", scoreModeLabel: "", breachAmounts: new Map<string, string>() };
    for (const subsectionValue of section.children) {
      const subsection = subsectionValue as SnapshotSubsection;
      if (!subsection || !Array.isArray(subsection.items)) return { valid: false as const, scoreMode: "", scoreModeLabel: "", breachAmounts: new Map<string, string>() };
      for (const itemValue of subsection.items) {
        const item = itemValue as SnapshotItem;
        if (!item || typeof item.id !== "string") return { valid: false as const, scoreMode: "", scoreModeLabel: "", breachAmounts: new Map<string, string>() };
        if (typeof item.breachAmount === "string" || typeof item.breachAmount === "number") breachAmounts.set(item.id, String(item.breachAmount));
      }
    }
  }
  const scoreMode = snapshot.scoreMode as "BINARY" | "CUSTOM_SCORE";
  const scoreModeLabel = typeof snapshot.scoreModeLabel === "string"
    ? snapshot.scoreModeLabel
    : scoreMode === "BINARY" ? "0或满分" : "允许自定义得分";
  return { valid: true as const, scoreMode, scoreModeLabel, breachAmounts };
}

import { Prisma } from "@prisma/client";
import type { Session } from "@/lib/auth";
import { formatTaskRecordDateTime, taskRecordDataScope } from "@/lib/task-records";

export type IntelligentAnalysisAction = "query" | "view" | "export" | "delete";

export type IntelligentAnalysisFilters = {
  brand?: string;
  storeKeyword?: string;
  taskSettingId?: string;
  taskRecordNo?: string;
  executorKeyword?: string;
  taskStartDate?: string;
  taskEndDate?: string;
};

export function canIntelligentAnalysis(session: Session, action: IntelligentAnalysisAction) {
  if (session.permissions.includes("*")) return true;
  if (session.permissions.includes(`intelligent-analysis:${action}`)) return true;
  return action === "query" && session.permissions.includes("intelligent-analysis:view");
}

export async function intelligentAnalysisDataScope(session: Session): Promise<Prisma.TaskAiAnalysisWhereInput> {
  return { taskRecord: { is: await taskRecordDataScope(session) } };
}

export function validIntelligentAnalysisDate(value: string | undefined) {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function readIntelligentAnalysisFilters(search: URLSearchParams): IntelligentAnalysisFilters {
  const read = (key: string) => search.get(key)?.trim() || undefined;
  return {
    brand: read("brand"),
    storeKeyword: read("storeKeyword"),
    taskSettingId: read("taskSettingId"),
    taskRecordNo: read("taskRecordNo"),
    executorKeyword: read("executorKeyword"),
    taskStartDate: read("taskStartDate"),
    taskEndDate: read("taskEndDate"),
  };
}

export function intelligentAnalysisFilterWhere(filters: IntelligentAnalysisFilters): Prisma.TaskAiAnalysisWhereInput {
  const AND: Prisma.TaskAiAnalysisWhereInput[] = [];
  if (filters.brand) AND.push({ OR: [
    { brandIdSnapshot: filters.brand },
    { brandCodeSnapshot: filters.brand },
    { brandNameSnapshot: filters.brand },
  ] });
  if (filters.storeKeyword) AND.push({ storeNameSnapshot: { contains: filters.storeKeyword } });
  if (filters.taskSettingId) AND.push({ taskSettingId: filters.taskSettingId });
  if (filters.taskRecordNo) AND.push({ taskRecordNo: { startsWith: filters.taskRecordNo } });
  if (filters.executorKeyword) AND.push({ executorNameSnapshot: { contains: filters.executorKeyword } });
  if (filters.taskStartDate || filters.taskEndDate) AND.push({ taskExecutionDate: {
    ...(filters.taskStartDate ? { gte: new Date(`${filters.taskStartDate}T00:00:00.000Z`) } : {}),
    ...(filters.taskEndDate ? { lte: new Date(`${filters.taskEndDate}T00:00:00.000Z`) } : {}),
  } });
  return AND.length ? { AND } : {};
}

export const intelligentAnalysisListSelect = {
  id: true,
  recordNo: true,
  taskNameSnapshot: true,
  taskRecordNo: true,
  brandNameSnapshot: true,
  storeNameSnapshot: true,
  executorNameSnapshot: true,
  taskSubmittedAt: true,
  analyzedAt: true,
  items: {
    select: { isQualified: true },
    orderBy: { sortOrder: "asc" },
  },
} satisfies Prisma.TaskAiAnalysisSelect;

type SelectedIntelligentAnalysis = Prisma.TaskAiAnalysisGetPayload<{ select: typeof intelligentAnalysisListSelect }>;

export function summarizeNames(values: string[], unit: "项" | "类") {
  const normalized = values.map(value => value.trim()).filter(Boolean);
  const summarized = unit === "类" ? [...new Set(normalized)] : normalized;
  if (!summarized.length) return "-";
  return summarized.length === 1 ? summarized[0] : `${summarized[0]} 等${summarized.length}${unit}`;
}

export function summarizeAnalysisResults(items: Array<{ isQualified: boolean | null }>) {
  const qualified = items.filter(item => item.isQualified === true).length;
  const unqualified = items.filter(item => item.isQualified === false).length;
  return `【合格】${qualified}项；【不合格】${unqualified}项。`;
}

export function serializeIntelligentAnalysis(row: SelectedIntelligentAnalysis) {
  return {
    id: row.id,
    recordNo: row.recordNo,
    taskName: row.taskNameSnapshot,
    taskRecordNo: row.taskRecordNo,
    brandName: row.brandNameSnapshot,
    storeName: row.storeNameSnapshot,
    executorName: row.executorNameSnapshot,
    taskSubmittedAt: formatTaskRecordDateTime(row.taskSubmittedAt),
    analysisResultSummary: summarizeAnalysisResults(row.items),
    analyzedAt: formatTaskRecordDateTime(row.analyzedAt),
  };
}

function shanghaiDatePrefix(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value || "";
  return `${part("year")}${part("month")}${part("day")}`;
}

export async function nextTaskAiAnalysisRecordNo(tx: Prisma.TransactionClient, now = new Date()) {
  const dateKey = shanghaiDatePrefix(now);
  const sequence = await tx.taskAiAnalysisSequence.upsert({
    where: { dateKey },
    create: { dateKey, nextValue: 2 },
    update: { nextValue: { increment: 1 } },
  });
  const currentValue = sequence.nextValue - 1;
  if (currentValue > 9999) throw new Error("当日智能分析记录流水号已达到上限");
  return `${dateKey}${String(currentValue).padStart(4, "0")}`;
}

export async function intelligentAnalysisWhere(session: Session, filters: IntelligentAnalysisFilters) {
  return { AND: [await intelligentAnalysisDataScope(session), intelligentAnalysisFilterWhere(filters)] } satisfies Prisma.TaskAiAnalysisWhereInput;
}

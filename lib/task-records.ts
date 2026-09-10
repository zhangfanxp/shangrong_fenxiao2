import { Prisma, TaskRecordStatus, TaskType } from "@prisma/client";
import type { Session } from "@/lib/auth";
import { db } from "@/lib/db";

export type TaskRecordAction = "query" | "view" | "edit" | "export" | "analyze" | "delete";

export type TaskRecordFilters = {
  status?: "COMPLETED" | "PENDING" | "OVERDUE";
  taskName?: string;
  taskType?: TaskType;
  executorKeyword?: string;
  submitStartDate?: string;
  submitEndDate?: string;
};

export function canTaskRecord(session: Session, action: TaskRecordAction) {
  if (session.permissions.includes("*")) return true;
  if (session.permissions.includes(`tasks:records:${action}`)) return true;
  return action === "query" && session.permissions.includes("tasks:records:view");
}

function jsonStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item)) : null;
}

export async function taskRecordDataScope(session: Session): Promise<Prisma.TaskRecordWhereInput> {
  const businessInstances: Prisma.TaskRecordWhereInput = {
    assignedUserId: { not: null },
    storeId: { not: null },
    taskNameSnapshot: { not: null },
    taskType: { not: null },
  };
  if (session.permissions.includes("*")) return businessInstances;
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
  return { AND: [
    businessInstances,
    {
      ...(brandIds !== null ? { brandIdSnapshot: { in: brandIds } } : {}),
      ...(storeIds !== null ? { storeId: { in: storeIds } } : {}),
    },
  ] };
}

export function validTaskRecordDate(value: string | undefined) {
  return !value || /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function readTaskRecordFilters(search: URLSearchParams): TaskRecordFilters {
  const read = (key: string) => search.get(key)?.trim() || undefined;
  const status = read("status");
  const taskType = read("taskType");
  return {
    status: status === "COMPLETED" || status === "PENDING" || status === "OVERDUE" ? status : undefined,
    taskName: read("taskName"),
    taskType: Object.values(TaskType).includes(taskType as TaskType) ? taskType as TaskType : undefined,
    executorKeyword: read("executorKeyword"),
    submitStartDate: read("submitStartDate"),
    submitEndDate: read("submitEndDate"),
  };
}

export function taskRecordFilterWhere(filters: TaskRecordFilters): Prisma.TaskRecordWhereInput {
  const AND: Prisma.TaskRecordWhereInput[] = [];
  if (filters.status === "COMPLETED") AND.push({ status: TaskRecordStatus.COMPLETED });
  if (filters.status === "PENDING") AND.push({ status: TaskRecordStatus.PENDING });
  if (filters.status === "OVERDUE") AND.push({ status: TaskRecordStatus.OVERDUE });
  if (filters.taskName) AND.push({ taskNameSnapshot: { contains: filters.taskName.trim() } });
  if (filters.taskType) AND.push({ taskType: filters.taskType });
  if (filters.executorKeyword) AND.push({ assignedUserNameSnapshot: { contains: filters.executorKeyword.trim() } });
  if (filters.submitStartDate || filters.submitEndDate) {
    AND.push({ completedAt: {
      ...(filters.submitStartDate ? { gte: new Date(`${filters.submitStartDate}T00:00:00+08:00`) } : {}),
      ...(filters.submitEndDate ? { lte: new Date(`${filters.submitEndDate}T23:59:59.999+08:00`) } : {}),
    } });
  }
  return AND.length ? { AND } : {};
}

export const taskRecordListSelect = {
  id: true,
  taskNameSnapshot: true,
  taskType: true,
  assignedUserNameSnapshot: true,
  assignedRoleNameSnapshot: true,
  includeCompletionRate: true,
  status: true,
  triggeredAt: true,
  completedAt: true,
  formalSubmission: { select: { recordNo: true, submittedAt: true } },
  aiAnalysis: { select: { id: true } },
} satisfies Prisma.TaskRecordSelect;

type SelectedTaskRecord = Prisma.TaskRecordGetPayload<{ select: typeof taskRecordListSelect }>;

const taskTypeLabels: Record<TaskType, string> = {
  DAILY: "日任务",
  WEEKLY: "周任务",
  MONTHLY: "月任务",
  TEMPORARY: "临时任务",
};

const dateTimeFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export function formatTaskRecordDateTime(value: Date | null | undefined) {
  if (!value) return "-";
  const parts = dateTimeFormatter.formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}:${part("second")}`;
}

export function serializeTaskRecord(row: SelectedTaskRecord) {
  const completed = row.status === TaskRecordStatus.COMPLETED;
  return {
    id: row.id,
    recordNo: completed ? row.formalSubmission?.recordNo || "-" : "-",
    taskName: row.taskNameSnapshot || "未命名任务",
    taskType: row.taskType || null,
    taskTypeLabel: row.taskType ? taskTypeLabels[row.taskType] : "-",
    executor: `${row.assignedRoleNameSnapshot || "未知角色"}｜${row.assignedUserNameSnapshot || "-"}`,
    includeCompletionRate: row.includeCompletionRate !== false,
    createdAt: formatTaskRecordDateTime(row.triggeredAt),
    submittedAt: completed ? formatTaskRecordDateTime(row.formalSubmission?.submittedAt || row.completedAt) : "-",
    status: row.status,
    hasAiAnalysis: Boolean(row.aiAnalysis),
  };
}

function shanghaiDatePrefix(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value || "";
  return `${part("year")}${part("month")}${part("day")}`;
}

export async function nextTaskSubmissionRecordNo(tx: Prisma.TransactionClient, now = new Date()) {
  const dateKey = shanghaiDatePrefix(now);
  const sequence = await tx.taskSubmissionSequence.upsert({
    where: { dateKey },
    create: { dateKey, nextValue: 2 },
    update: { nextValue: { increment: 1 } },
  });
  const currentValue = sequence.nextValue - 1;
  if (currentValue > 999999) throw new Error("当日任务记录流水号已达到上限");
  return `${dateKey}${String(currentValue).padStart(6, "0")}`;
}

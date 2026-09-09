import { Prisma, RecordStatus, TaskRecordStatus, TaskType } from "@prisma/client";
import { db } from "@/lib/db";
import { readTaskConfig } from "@/lib/task-config";
import { deleteTaskDraftFiles } from "@/lib/task-r2-upload";
import { jsonIdArray, resolveUserStores } from "@/lib/user-store-scope";

export type StoreTaskItem = {
  name: string;
  component: "attachment" | "input" | "select";
  dataType: "photo" | "video" | "document" | "amount" | "quantity" | null;
  captureOnly?: boolean;
  options: string[];
  description: string;
  required: boolean;
  weight: number;
  aiAnalysisType?: string | null;
  aiAnalysisPrompt?: string | null;
};

export type StoreTaskSnapshot = {
  recordNo?: string;
  taskName: string;
  taskType: string;
  configVersion: number;
  storageSpace?: { id?: string; name?: string; bucketName?: string };
  submitItems: StoreTaskItem[];
};

export type TaskGenerationMode = "automatic" | "manual";

const typeLabels: Record<TaskType, string> = {
  DAILY: "日任务", WEEKLY: "周任务", MONTHLY: "月任务", TEMPORARY: "临时任务",
};

export function isStoreTaskSnapshot(value: unknown): value is StoreTaskSnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StoreTaskSnapshot>;
  return typeof candidate.taskName === "string" && Array.isArray(candidate.submitItems) && candidate.submitItems.every(item =>
    item && typeof item.name === "string" && ["attachment", "input", "select"].includes(item.component)
      && (item.captureOnly === undefined || typeof item.captureOnly === "boolean")
      && (item.aiAnalysisType === undefined || item.aiAnalysisType === null || typeof item.aiAnalysisType === "string")
      && (item.aiAnalysisPrompt === undefined || item.aiAnalysisPrompt === null || typeof item.aiAnalysisPrompt === "string")
      && Boolean(item.aiAnalysisType) === Boolean(item.aiAnalysisPrompt)
      && typeof item.description === "string" && typeof item.required === "boolean" && Number.isInteger(item.weight));
}

export function shanghaiDateKey(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const part = (name: string) => parts.find(item => item.type === name)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function shanghaiTimeKey(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(value);
  const part = (name: string) => parts.find(item => item.type === name)?.value || "";
  return `${part("hour")}:${part("minute")}`;
}

export function dateKeyAsDbDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("执行日期格式不正确");
  return new Date(`${value}T00:00:00.000Z`);
}

export async function expireOverdueTaskInstances(now = new Date()) {
  const result = await db.taskRecord.updateMany({ where: { status: TaskRecordStatus.PENDING, dueDate: { lt: now } }, data: { status: TaskRecordStatus.OVERDUE } });
  return result.count;
}

export async function countPendingStoreTaskInstances(userId: string, now = new Date()) {
  await expireOverdueTaskInstances(now);
  return db.taskRecord.count({
    where: { assignedUserId: userId, status: TaskRecordStatus.PENDING, dueDate: { gte: now } },
  });
}

function weekdayLabel(dateKey: string) {
  const names = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return names[new Date(`${dateKey}T12:00:00+08:00`).getUTCDay()];
}

function isLastDayOfMonth(dateKey: string) {
  const current = new Date(`${dateKey}T12:00:00+08:00`);
  return shanghaiDateKey(new Date(current.getTime() + 86_400_000)).slice(5, 7) !== dateKey.slice(5, 7);
}

function shouldGenerate(task: { type: TaskType; executionDays: unknown; weeklyExecutionDay: string | null; monthlyExecutionDay: string | null }, dateKey: string, mode: TaskGenerationMode) {
  if (mode === "manual") return true;
  if (task.type === TaskType.TEMPORARY) return false;
  const weekday = weekdayLabel(dateKey);
  const legacyDays = Array.isArray(task.executionDays) ? task.executionDays.filter((value): value is string => typeof value === "string") : [];
  if (task.type === TaskType.DAILY) return legacyDays.includes(weekday);
  if (task.type === TaskType.WEEKLY) return (task.weeklyExecutionDay || legacyDays[0]) === weekday;
  if (task.type === TaskType.MONTHLY) return task.monthlyExecutionDay === "LAST_DAY" ? isLastDayOfMonth(dateKey) : Number(task.monthlyExecutionDay) === Number(dateKey.slice(8, 10));
  return false;
}

function addDays(dateKey: string, days: number) {
  const base = new Date(`${dateKey}T12:00:00+08:00`);
  return shanghaiDateKey(new Date(base.getTime() + days * 86_400_000));
}

function deadlineAt(dateKey: string, dayOffset: number, time: string) {
  const dueDateKey = addDays(dateKey, dayOffset === 1 ? 1 : 0);
  const normalizedTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : "23:59";
  return new Date(`${dueDateKey}T${normalizedTime}:59.999+08:00`);
}

function recordNo(taskRecordNo: string | null, dateKey: string, userId: string, storeId: string) {
  return `${dateKey.replaceAll("-", "")}-${(taskRecordNo || "TASK").slice(-5)}-${userId.slice(-4)}-${storeId.slice(-4)}`.slice(0, 24);
}

/** Automatic mode creates only missing records. Manual mode also refreshes pending records. */
export async function generateStoreTaskInstances(dateKey = shanghaiDateKey(), taskIds?: readonly string[], mode: TaskGenerationMode = taskIds?.length ? "manual" : "automatic") {
  const executionDate = dateKeyAsDbDate(dateKey);
  const overdue = await expireOverdueTaskInstances();
  const selectedTaskIds = taskIds ? [...new Set(taskIds.filter(Boolean))] : undefined;
  const tasks = await db.task.findMany({
    where: { status: RecordStatus.ENABLED, deletedAt: null, configFileName: { not: null }, ...(selectedTaskIds ? { id: { in: selectedTaskIds } } : {}) },
    include: { brands: true },
  });
  let created = 0;
  let covered = 0;
  let notGenerated = 0;
  let ignoredTasks = 0;
  for (const task of tasks) {
    if (!task.configFileName || !task.executorRoleId || !shouldGenerate(task, dateKey, mode)) continue;
    const config = await readTaskConfig(task.configFileName).catch(() => null);
    if (!isStoreTaskSnapshot(config)) { ignoredTasks += 1; continue; }
    const brandIds = task.brands.map(item => item.brandId);
    if (!brandIds.length) continue;
    const candidateUsers = await db.user.findMany({
      where: { status: RecordStatus.ENABLED, roleId: task.executorRoleId },
      include: { role: { select: { id: true, name: true } }, personnelProfile: { include: { store: { include: { brand: true } } } } },
    });
    const configuredStoreIds = [...new Set(candidateUsers.flatMap(user => jsonIdArray(user.leadH5StoreIds)))];
    const configuredStores = configuredStoreIds.length ? await db.store.findMany({ where: { id: { in: configuredStoreIds } }, include: { brand: true } }) : [];
    const configuredStoreById = new Map(configuredStores.map(store => [store.id, store]));
    for (const user of candidateUsers) {
      for (const store of resolveUserStores(user, configuredStoreById, brandIds)) {
        const dueDate = deadlineAt(dateKey, task.deadlineDayOffset, task.deadlineTime);
        const recordData = {
          recordNo: recordNo(task.recordNo, dateKey, user.id, store.id), taskId: task.id,
          taskNameSnapshot: task.title, taskType: task.type,
          storeId: store.id, storeNameSnapshot: store.name,
          brandIdSnapshot: store.brand.id, brandNameSnapshot: store.brand.name,
          assignedUserId: user.id, assignedUserNameSnapshot: user.realName || user.username,
          assignedRoleIdSnapshot: user.role.id, assignedRoleNameSnapshot: user.role.name,
          executionDate, effectiveStartAt: new Date(), effectiveEndAt: dueDate,
          includeCompletionRate: task.includeCompletionRate, dueDate,
          status: TaskRecordStatus.PENDING, configVersion: task.configVersion,
          configSnapshot: config as unknown as Prisma.InputJsonValue,
        } satisfies Prisma.TaskRecordUncheckedCreateInput;
        let existing = await db.taskRecord.findFirst({ where: { taskId: task.id, assignedUserId: user.id, storeId: store.id, executionDate }, select: { id: true, status: true } });
        if (!existing) {
          try { await db.taskRecord.create({ data: recordData }); created += 1; continue; }
          catch (error) {
            if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
            existing = await db.taskRecord.findFirst({ where: { taskId: task.id, assignedUserId: user.id, storeId: store.id, executionDate }, select: { id: true, status: true } });
            if (!existing) throw error;
          }
        }
        if (mode === "automatic" || existing.status !== TaskRecordStatus.PENDING) { notGenerated += 1; continue; }
        const outcome = await db.$transaction(async tx => {
          await tx.$queryRaw`SELECT id FROM TaskRecord WHERE id = ${existing.id} FOR UPDATE`;
          const current = await tx.taskRecord.findUnique({ where: { id: existing.id }, select: { status: true, attachments: { where: { consumedAt: null }, select: { id: true, r2StorageId: true, objectKey: true } } } });
          if (!current || current.status !== TaskRecordStatus.PENDING) return "not-generated" as const;
          if (current.attachments.length) await deleteTaskDraftFiles(current.attachments);
          await tx.taskAttachment.deleteMany({ where: { taskRecordId: existing.id, consumedAt: null } });
          await tx.taskRecord.update({ where: { id: existing.id }, data: { ...recordData, submission: Prisma.DbNull, completedAt: null, triggeredAt: new Date() } });
          return "covered" as const;
        }, { maxWait: 5_000, timeout: 30_000 });
        if (outcome === "covered") covered += 1; else notGenerated += 1;
      }
    }
  }
  return { date: dateKey, mode, total: created + covered + notGenerated, created, covered, notGenerated, overdue, ignoredTasks };
}

export function taskTypeLabel(type: TaskType | null) {
  return type ? typeLabels[type] : "任务";
}

import { createHash } from "node:crypto";
import { Prisma, RecordStatus, TaskRecordStatus, TaskTarget, TaskType } from "@prisma/client";
import { db } from "@/lib/db";
import { availableMobileTaskWhere } from "@/lib/mobile-task-availability";
import { isStoreLeader } from "@/lib/store-employees";
import { readTaskConfig } from "@/lib/task-config";
import { deleteTaskDraftFiles } from "@/lib/task-r2-upload";
import { employeeMatchesSpecifiedTargets, readTaskSpecifiedTargets, storeMatchesSpecifiedTargets } from "@/lib/task-targets";
import { jsonIdArray } from "@/lib/user-store-scope";
import { taskRecordParticipantWhere } from "@/lib/task-record-access";

export type StoreTaskItem = {
  name: string;
  component: "attachment" | "input" | "select";
  dataType: "photo" | "video" | "document" | "amount" | "quantity" | "score" | "text" | null;
  maxValue?: number | null;
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
  taskTarget?: "门店" | "门店员工";
  specifiedTargets?: string[];
  targetPersonnel?: { id: string; name: string; positionLevel: string };
  calendarDescription?: string | null;
  calendarRemark?: string | null;
  configVersion: number;
  storageSpace?: { id?: string; name?: string; bucketName?: string };
  submitItems: StoreTaskItem[];
};

export type TaskGenerationMode = "automatic" | "manual";

const STORE_MANAGER_EXECUTOR_ROLE = "店长";
const STORE_SUPERVISOR_EXECUTOR_ROLE = "督导";

const typeLabels: Record<TaskType, string> = {
  DAILY: "日任务", WEEKLY: "周任务", MONTHLY: "月任务", TEMPORARY: "临时任务", CALENDAR: "日历任务",
};

const targetLabels: Record<TaskTarget, StoreTaskSnapshot["taskTarget"]> = {
  STORE: "门店", STORE_EMPLOYEE: "门店员工",
};

export function isStoreTaskSnapshot(value: unknown): value is StoreTaskSnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StoreTaskSnapshot>;
  return typeof candidate.taskName === "string" && Array.isArray(candidate.submitItems) && candidate.submitItems.every(item =>
    item && typeof item.name === "string" && ["attachment", "input", "select"].includes(item.component)
      && (item.captureOnly === undefined || typeof item.captureOnly === "boolean")
      && (item.aiAnalysisType === undefined || item.aiAnalysisType === null || typeof item.aiAnalysisType === "string")
      && (item.aiAnalysisPrompt === undefined || item.aiAnalysisPrompt === null || typeof item.aiAnalysisPrompt === "string")
      && (item.maxValue === undefined || item.maxValue === null || (Number.isSafeInteger(item.maxValue) && item.maxValue >= 0))
      && Boolean(item.aiAnalysisType) === Boolean(item.aiAnalysisPrompt)
      && typeof item.description === "string" && typeof item.required === "boolean" && Number.isInteger(item.weight) && item.weight > 0)
    && (candidate.taskTarget === undefined || candidate.taskTarget === "门店" || candidate.taskTarget === "门店员工")
    && (candidate.specifiedTargets === undefined || (Array.isArray(candidate.specifiedTargets) && candidate.specifiedTargets.every(item => typeof item === "string")))
    && (candidate.targetPersonnel === undefined || (typeof candidate.targetPersonnel.id === "string" && typeof candidate.targetPersonnel.name === "string" && typeof candidate.targetPersonnel.positionLevel === "string"));
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
  const result = await db.taskRecord.updateMany({ where: { status: TaskRecordStatus.PENDING, dueDate: { lt: now }, rectificationRound: { is: null } }, data: { status: TaskRecordStatus.OVERDUE } });
  return result.count;
}

export async function countPendingStoreTaskInstances(userId: string, now = new Date()) {
  await expireOverdueTaskInstances(now);
  return db.taskRecord.count({
    where: { AND: [taskRecordParticipantWhere(userId), availableMobileTaskWhere(now)] },
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

function shouldGenerate(task: { type: TaskType; executionDays: unknown; weeklyExecutionDay: string | null; monthlyExecutionDay: string | null }, dateKey: string, mode: TaskGenerationMode, calendarHasTask = false) {
  if (task.type === TaskType.CALENDAR) return calendarHasTask;
  if (mode === "manual") return true;
  if (task.type === TaskType.TEMPORARY) return false;
  const weekday = weekdayLabel(dateKey);
  const legacyDays = Array.isArray(task.executionDays) ? task.executionDays.filter((value): value is string => typeof value === "string") : [];
  if (task.type === TaskType.DAILY) return legacyDays.includes(weekday);
  if (task.type === TaskType.WEEKLY) return (task.weeklyExecutionDay || legacyDays[0]) === weekday;
  if (task.type === TaskType.MONTHLY) {
    if (task.monthlyExecutionDay === "ANY_DAY") return true;
    return task.monthlyExecutionDay === "LAST_DAY" ? isLastDayOfMonth(dateKey) : Number(task.monthlyExecutionDay) === Number(dateKey.slice(8, 10));
  }
  return false;
}

function addDays(dateKey: string, days: number) {
  const base = new Date(`${dateKey}T12:00:00+08:00`);
  return shanghaiDateKey(new Date(base.getTime() + days * 86_400_000));
}

function monthEndDateKey(dateKey: string) {
  const [year, month] = dateKey.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
}

function deadlineAt(dateKey: string, dayOffset: number, time: string) {
  const dueDateKey = dayOffset === -1 ? monthEndDateKey(dateKey) : addDays(dateKey, dayOffset === 1 ? 1 : 0);
  const normalizedTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : "23:59";
  return new Date(`${dueDateKey}T${normalizedTime}:59.999+08:00`);
}

function recordNo(taskRecordNo: string | null, dateKey: string, userId: string, storeId: string, targetPersonnelKey: string) {
  const identity = createHash("sha256").update([taskRecordNo || "TASK", userId, storeId, targetPersonnelKey].join("|")).digest("hex").slice(0, 16);
  return `${dateKey.replaceAll("-", "")}${identity}`;
}

function sharedRecordKey(taskId: string, dateKey: string, storeId: string, targetPersonnelKey: string) {
  return createHash("sha256").update([taskId, dateKey, storeId, targetPersonnelKey].join("|")).digest("hex");
}

/** Automatic mode creates only missing records. Manual mode also refreshes pending records. */
export async function generateStoreTaskInstances(dateKey = shanghaiDateKey(), taskIds?: readonly string[], mode: TaskGenerationMode = taskIds?.length ? "manual" : "automatic") {
  const overdue = await expireOverdueTaskInstances();
  const selectedTaskIds = taskIds ? [...new Set(taskIds.filter(Boolean))] : undefined;
  const tasks = await db.task.findMany({
    where: { status: RecordStatus.ENABLED, deletedAt: null, configFileName: { not: null }, ...(selectedTaskIds ? { id: { in: selectedTaskIds } } : {}) },
    include: {
      brands: true,
      executorRole: { select: { id: true, name: true } },
      executorRoles: { include: { role: { select: { id: true, name: true } } } },
      calendarTemplate: { select: { status: true, dates: { where: { calendarDate: dateKeyAsDbDate(dateKey) }, select: { hasTask: true, content: true, remark: true } } } },
    },
  });
  let created = 0;
  let covered = 0;
  let notGenerated = 0;
  let ignoredTasks = 0;
  for (const task of tasks) {
    const calendarDate = task.type === TaskType.CALENDAR ? task.calendarTemplate?.dates[0] : undefined;
    if (!task.configFileName || (task.type === TaskType.CALENDAR && task.calendarTemplate?.status !== RecordStatus.ENABLED) || !shouldGenerate(task, dateKey, mode, calendarDate?.hasTask)) continue;
    const configuredExecutorRoles = task.executorRoles.length
      ? task.executorRoles.map(item => item.role)
      : task.executorRole ? [task.executorRole] : [];
    if (!configuredExecutorRoles.length) continue;
    const useStoreManagers = configuredExecutorRoles.some(role => role.name === STORE_MANAGER_EXECUTOR_ROLE);
    const useStoreSupervisors = configuredExecutorRoles.some(role => role.name === STORE_SUPERVISOR_EXECUTOR_ROLE);
    const genericExecutorRoleIds = configuredExecutorRoles
      .filter(role => role.name !== STORE_MANAGER_EXECUTOR_ROLE && role.name !== STORE_SUPERVISOR_EXECUTOR_ROLE)
      .map(role => role.id);
    const executionDateKey = task.type === TaskType.MONTHLY && task.monthlyExecutionDay === "ANY_DAY" ? `${dateKey.slice(0, 7)}-01` : dateKey;
    const executionDate = dateKeyAsDbDate(executionDateKey);
    const config = await readTaskConfig(task.configFileName).catch(() => null);
    if (!isStoreTaskSnapshot(config)) { ignoredTasks += 1; continue; }
    const specifiedTargets = readTaskSpecifiedTargets(task.specifiedTargets);
    const snapshot: StoreTaskSnapshot = { ...config, taskTarget: targetLabels[task.targetType], specifiedTargets, ...(task.type === TaskType.CALENDAR ? { calendarDescription: calendarDate?.content || null, calendarRemark: calendarDate?.remark || null } : {}) };
    const brandIds = task.brands.map(item => item.brandId);
    if (!brandIds.length) continue;
    const stores = await db.store.findMany({
      where: { brandId: { in: brandIds }, operationStatus: { not: "CLOSED" } },
      include: {
        brand: true,
        personnel: {
          where: { status: "ACTIVE", deletedAt: null },
          include: { platformUser: { select: { role: { select: { name: true } } } } },
          orderBy: [{ positionLevel: "asc" }, { name: "asc" }],
        },
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    const archiveUserIds = [...new Set(stores.flatMap(store => [
      ...(useStoreManagers && store.managerUserId ? [store.managerUserId] : []),
      ...(useStoreSupervisors && store.supervisorUserId ? [store.supervisorUserId] : []),
    ]))];
    const executorScopes: Prisma.UserWhereInput[] = [
      ...(genericExecutorRoleIds.length ? [{ roleId: { in: genericExecutorRoleIds } }] : []),
      ...(archiveUserIds.length ? [{ id: { in: archiveUserIds } }] : []),
    ];
    if (!executorScopes.length) continue;
    const candidateUsers = await db.user.findMany({
      where: { status: RecordStatus.ENABLED, role: { status: RecordStatus.ENABLED }, OR: executorScopes },
      include: { role: { select: { id: true, name: true } }, personnelProfile: { include: { store: { include: { brand: true } } } } },
    });
    const userCanExecuteForStore = (user: typeof candidateUsers[number], store: typeof stores[number]) => {
      const asManager = useStoreManagers && store.managerUserId === user.id;
      const asSupervisor = useStoreSupervisors && store.supervisorUserId === user.id;
      const hasGenericExecutorRole = genericExecutorRoleIds.includes(user.roleId);
      const genericStoreScope = hasGenericExecutorRole && (
        jsonIdArray(user.leadH5StoreIds).includes(store.id)
        || user.personnelProfile?.store?.id === store.id
      );
      return asManager || asSupervisor || genericStoreScope;
    };
    const synchronizeRecord = async (user: typeof candidateUsers[number], store: { id: string; name: string; brand: { id: string; name: string } }, targetPersonnel?: { id: string; name: string; positionLevel: string }, sharedExecutors?: typeof candidateUsers) => {
        const isShared = Boolean(task.singleRecordForMultipleExecutors && sharedExecutors?.length);
        const targetPersonnelKey = targetPersonnel?.id || "STORE";
        const instanceTaskName = targetPersonnel ? `${task.title}_${targetPersonnel.name}` : task.title;
        const dueDate = deadlineAt(dateKey, task.deadlineDayOffset, task.deadlineTime);
        const recordSnapshot: StoreTaskSnapshot = targetPersonnel ? { ...snapshot, taskName: instanceTaskName, targetPersonnel } : snapshot;
        const recordKey = isShared ? sharedRecordKey(task.id, executionDateKey, store.id, targetPersonnelKey) : null;
        const recordData = {
          recordNo: recordNo(task.recordNo, executionDateKey, isShared ? "SHARED" : user.id, store.id, targetPersonnelKey), taskId: task.id,
          taskNameSnapshot: instanceTaskName, taskType: task.type, targetType: task.targetType,
          storeId: store.id, storeNameSnapshot: store.name,
          brandIdSnapshot: store.brand.id, brandNameSnapshot: store.brand.name,
          assignedUserId: isShared ? null : user.id, assignedUserNameSnapshot: isShared ? "多人可执行" : user.realName || user.username,
          assignedRoleIdSnapshot: isShared ? null : user.role.id, assignedRoleNameSnapshot: isShared ? "共同执行" : user.role.name,
          sharedExecution: isShared, sharedRecordKey: recordKey,
          targetPersonnelId: targetPersonnel?.id || null,
          targetPersonnelKey,
          targetPersonnelNameSnapshot: targetPersonnel?.name || null,
          targetPersonnelPositionSnapshot: targetPersonnel?.positionLevel || null,
          executionDate, effectiveStartAt: new Date(), effectiveEndAt: dueDate,
          includeCompletionRate: task.includeCompletionRate, dueDate,
          status: TaskRecordStatus.PENDING, configVersion: task.configVersion,
          configSnapshot: recordSnapshot as unknown as Prisma.InputJsonValue,
        } satisfies Prisma.TaskRecordUncheckedCreateInput;
        const identity = isShared
          ? { sharedRecordKey: recordKey! }
          : { taskId: task.id, assignedUserId: user.id, storeId: store.id, targetPersonnelKey, executionDate };
        let existing = await db.taskRecord.findFirst({ where: identity, select: { id: true, status: true, editOwnerUserId: true } });
        let upgradingLegacyEmployeeRecord = false;
        if (!isShared && !existing && targetPersonnel) {
          existing = await db.taskRecord.findFirst({
            where: { taskId: task.id, assignedUserId: user.id, storeId: store.id, executionDate, targetType: TaskTarget.STORE_EMPLOYEE, targetPersonnelId: null, targetPersonnelKey: "STORE", status: TaskRecordStatus.PENDING },
            select: { id: true, status: true, editOwnerUserId: true },
            orderBy: { createdAt: "asc" },
          });
          upgradingLegacyEmployeeRecord = Boolean(existing);
        }
        if (!existing) {
          try {
            await db.$transaction(async tx => {
              const createdRecord = await tx.taskRecord.create({ data: recordData });
              if (isShared && sharedExecutors?.length) await tx.taskRecordSharedExecutor.createMany({ data: sharedExecutors.map(executor => ({ taskRecordId: createdRecord.id, userId: executor.id })), skipDuplicates: true });
            });
            created += 1; return;
          }
          catch (error) {
            if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
            existing = await db.taskRecord.findFirst({ where: identity, select: { id: true, status: true, editOwnerUserId: true } });
            if (!existing) throw error;
          }
        }
        if (isShared && sharedExecutors?.length && existing.status === TaskRecordStatus.PENDING && mode === "automatic") {
          await db.taskRecordSharedExecutor.createMany({ data: sharedExecutors.map(executor => ({ taskRecordId: existing!.id, userId: executor.id })), skipDuplicates: true });
        }
        if ((!upgradingLegacyEmployeeRecord && mode === "automatic") || existing.status !== TaskRecordStatus.PENDING) { notGenerated += 1; return; }
        const outcome = await db.$transaction(async tx => {
          await tx.$queryRaw`SELECT id FROM TaskRecord WHERE id = ${existing.id} FOR UPDATE`;
          const current = await tx.taskRecord.findUnique({ where: { id: existing.id }, select: { status: true, targetPersonnelKey: true, sharedExecution: true, editOwnerUserId: true, attachments: { where: { consumedAt: null }, select: { id: true, r2StorageId: true, objectKey: true } } } });
          if (!current || current.status !== TaskRecordStatus.PENDING) return "not-generated" as const;
          if (current.sharedExecution && current.editOwnerUserId) return "not-generated" as const;
          if (upgradingLegacyEmployeeRecord && current.targetPersonnelKey !== "STORE") return "not-generated" as const;
          if (current.attachments.length) await deleteTaskDraftFiles(current.attachments);
          await tx.taskAttachment.deleteMany({ where: { taskRecordId: existing.id, consumedAt: null } });
          if (isShared) {
            await tx.taskRecordSharedExecutor.deleteMany({ where: { taskRecordId: existing.id } });
            if (sharedExecutors?.length) await tx.taskRecordSharedExecutor.createMany({ data: sharedExecutors.map(executor => ({ taskRecordId: existing!.id, userId: executor.id })), skipDuplicates: true });
          }
          await tx.taskRecord.update({ where: { id: existing.id }, data: { ...recordData, submission: Prisma.DbNull, draftValues: Prisma.DbNull, draftCaptureFallbacks: Prisma.DbNull, draftSavedAt: null, completedAt: null, triggeredAt: new Date() } });
          return "covered" as const;
        }, { maxWait: 5_000, timeout: 30_000 });
        if (outcome === "covered") covered += 1; else notGenerated += 1;
    };

    if (task.targetType === TaskTarget.STORE_EMPLOYEE) {
      for (const store of stores) {
        const targetPersonnel = store.personnel.filter(personnel => !isStoreLeader(personnel, store) && employeeMatchesSpecifiedTargets(personnel, specifiedTargets));
        if (!targetPersonnel.length) continue;
        const executors = candidateUsers.filter(user => userCanExecuteForStore(user, store));
        if (task.singleRecordForMultipleExecutors) {
          const representative = executors[0];
          if (representative) for (const personnel of targetPersonnel) await synchronizeRecord(representative, store, personnel, executors);
        } else {
          for (const user of executors) for (const personnel of targetPersonnel) await synchronizeRecord(user, store, personnel);
        }
      }
      continue;
    }

    if (task.singleRecordForMultipleExecutors) {
      for (const store of stores) {
        if (!storeMatchesSpecifiedTargets(store, specifiedTargets)) continue;
        const executors = candidateUsers.filter(user => userCanExecuteForStore(user, store));
        if (executors[0]) await synchronizeRecord(executors[0], store, undefined, executors);
      }
    } else {
      for (const user of candidateUsers) {
        const assignedStores = stores.filter(store => userCanExecuteForStore(user, store) && storeMatchesSpecifiedTargets(store, specifiedTargets));
        for (const store of assignedStores) {
          await synchronizeRecord(user, store);
        }
      }
    }
  }
  return { date: dateKey, mode, total: created + covered + notGenerated, created, covered, notGenerated, overdue, ignoredTasks };
}

export function taskTypeLabel(type: TaskType | null) {
  return type ? typeLabels[type] : "任务";
}

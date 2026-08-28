import type { DailyLearningPlan, Prisma } from "@prisma/client";
import { z } from "zod";
import type { Session } from "@/lib/auth";
import { db } from "@/lib/db";

export const DAILY_LEARNING_DAY_FIELDS = [
  "mondayContent", "tuesdayContent", "wednesdayContent", "thursdayContent",
  "fridayContent", "saturdayContent", "sundayContent",
] as const;
export const DAILY_LEARNING_DAY_NAMES = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"] as const;

export const dailyLearningInputSchema = z.object({
  isoYear: z.coerce.number().int().min(2000, "年份不合法").max(2100, "年份不合法"),
  isoWeek: z.coerce.number().int().min(1, "周次不合法").max(53, "周次不合法"),
  studentTag: z.string().trim().min(1, "请选择学员标签").max(100, "学员标签不能超过100个字符"),
  mondayContent: z.string().max(2000, "周一学习内容不能超过2000个字符").optional().nullable(),
  tuesdayContent: z.string().max(2000, "周二学习内容不能超过2000个字符").optional().nullable(),
  wednesdayContent: z.string().max(2000, "周三学习内容不能超过2000个字符").optional().nullable(),
  thursdayContent: z.string().max(2000, "周四学习内容不能超过2000个字符").optional().nullable(),
  fridayContent: z.string().max(2000, "周五学习内容不能超过2000个字符").optional().nullable(),
  saturdayContent: z.string().max(2000, "周六学习内容不能超过2000个字符").optional().nullable(),
  sundayContent: z.string().max(2000, "周日学习内容不能超过2000个字符").optional().nullable(),
  remark: z.string().max(100, "备注不能超过100个字符").optional().nullable(),
  version: z.coerce.number().int().positive().optional(),
});

export type DailyLearningInput = z.infer<typeof dailyLearningInputSchema>;

const shanghaiPartsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

function civilDate(date: Date) {
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function addCivilDays(year: number, month: number, day: number, amount: number) {
  return civilDate(new Date(Date.UTC(year, month - 1, day + amount)));
}

export function shanghaiNowParts(value = new Date()) {
  const parts = shanghaiPartsFormatter.formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(item => item.type === type)?.value || 0);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") };
}

export function isoWeekForCivilDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekDay = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekDay);
  const isoYear = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const isoWeek = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { isoYear, isoWeek, weekDay };
}

export function currentIsoWeek(now = new Date()) {
  const parts = shanghaiNowParts(now);
  return isoWeekForCivilDate(parts.year, parts.month, parts.day);
}

export function weeksInIsoYear(year: number) {
  return isoWeekForCivilDate(year, 12, 28).isoWeek;
}

export function isoWeekMondayCivil(isoYear: number, isoWeek: number) {
  if (isoWeek < 1 || isoWeek > weeksInIsoYear(isoYear)) throw new Error("年份与周次组合不合法");
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  return addCivilDays(isoYear, 1, 4, -(jan4Day - 1) + (isoWeek - 1) * 7);
}

export function isoWeekStartAt(isoYear: number, isoWeek: number) {
  const monday = isoWeekMondayCivil(isoYear, isoWeek);
  return new Date(Date.UTC(monday.year, monday.month - 1, monday.day, -8));
}

export function civilDateText(value: { year: number; month: number; day: number }) {
  return `${value.year}-${String(value.month).padStart(2, "0")}-${String(value.day).padStart(2, "0")}`;
}

export function weekRangeText(isoYear: number, isoWeek: number) {
  const monday = isoWeekMondayCivil(isoYear, isoWeek);
  return `${civilDateText(monday)} ~ ${civilDateText(addCivilDays(monday.year, monday.month, monday.day, 6))}`;
}

export function nextIsoWeeks(count = 6, now = new Date()) {
  const parts = shanghaiNowParts(now);
  const current = isoWeekForCivilDate(parts.year, parts.month, parts.day);
  const monday = isoWeekMondayCivil(current.isoYear, current.isoWeek);
  return Array.from({ length: count }, (_, index) => {
    const target = addCivilDays(monday.year, monday.month, monday.day, (index + 1) * 7);
    const week = isoWeekForCivilDate(target.year, target.month, target.day);
    return { ...week, rangeText: weekRangeText(week.isoYear, week.isoWeek) };
  });
}

export function splitTags(value?: string | null) {
  return [...new Set((value || "").split(/[|｜]/).map(tag => tag.trim()).filter(Boolean))];
}

export async function dailyLearningTags() {
  const users = await db.user.findMany({ select: { tags: true } });
  return [...new Set(users.flatMap(user => splitTags(user.tags)))].sort((a, b) => a.localeCompare(b, "zh-CN"));
}

export function dailyLearningCan(session: Session, action: "query" | "create" | "view" | "edit" | "delete" | "update") {
  return session.permissions.includes("*") || session.permissions.includes("training:view") || session.permissions.includes(`daily-learning:${action}`);
}

export function normalizeDailyLearningInput(input: DailyLearningInput) {
  if (input.isoWeek > weeksInIsoYear(input.isoYear)) throw new Error("年份与周次组合不合法");
  const contents = DAILY_LEARNING_DAY_FIELDS.map(field => input[field]?.trim() || null);
  if (!contents.some(Boolean)) throw new Error("请至少填写一天的学习内容");
  return {
    isoYear: input.isoYear,
    isoWeek: input.isoWeek,
    studentTag: input.studentTag.trim(),
    mondayContent: contents[0], tuesdayContent: contents[1], wednesdayContent: contents[2],
    thursdayContent: contents[3], fridayContent: contents[4], saturdayContent: contents[5], sundayContent: contents[6],
    learningDays: contents.filter(Boolean).length,
    remark: input.remark?.trim() || null,
    weekStartAt: isoWeekStartAt(input.isoYear, input.isoWeek),
    activeKey: `${input.isoYear}:${input.isoWeek}:${input.studentTag.trim()}`,
  };
}

export async function matchingAssigneeData(studentTag: string) {
  const users = await db.user.findMany({ where: { status: "ENABLED" }, select: { id: true, username: true, realName: true, tags: true } });
  return users.filter(user => splitTags(user.tags).includes(studentTag)).map(user => ({
    userId: user.id, usernameSnapshot: user.username, realNameSnapshot: user.realName || user.username,
    labelSnapshot: (user.tags || "").slice(0, 200),
  }));
}

export async function regenerateDailyLearningAssignments(planIds: string[]) {
  const uniquePlanIds = [...new Set(planIds)];
  const current = currentIsoWeek();
  return db.$transaction(async tx => {
    const [plans, users] = await Promise.all([
      tx.dailyLearningPlan.findMany({
        where: { id: { in: uniquePlanIds }, deletedAt: null },
        select: {
          id: true, recordNo: true, isoYear: true, isoWeek: true, studentTag: true,
          assignees: { select: { id: true, userId: true } },
          progress: { where: { status: "COMPLETED" }, select: { userId: true } },
        },
      }),
      tx.user.findMany({ where: { status: "ENABLED" }, select: { id: true, username: true, realName: true, tags: true } }),
    ]);
    const eligiblePlans = plans.filter(plan => plan.isoYear > current.isoYear || (plan.isoYear === current.isoYear && plan.isoWeek >= current.isoWeek));
    let added = 0; let refreshed = 0; let removed = 0; let protectedWithProgress = 0;
    for (const plan of eligiblePlans) {
      const matching = users.filter(user => splitTags(user.tags).includes(plan.studentTag));
      const matchingMap = new Map(matching.map(user => [user.id, user]));
      const existingMap = new Map(plan.assignees.map(item => [item.userId, item]));
      const protectedUserIds = new Set(plan.progress.map(item => item.userId));
      const refreshUserIds = plan.assignees.filter(item => matchingMap.has(item.userId) && !protectedUserIds.has(item.userId)).map(item => item.userId);
      const removeUserIds = plan.assignees.filter(item => !matchingMap.has(item.userId) && !protectedUserIds.has(item.userId)).map(item => item.userId);
      const addUsers = matching.filter(user => !existingMap.has(user.id));
      const recreateUsers = refreshUserIds.map(userId => matchingMap.get(userId)).filter((user): user is NonNullable<typeof user> => Boolean(user));
      const deleteUserIds = [...removeUserIds, ...refreshUserIds];
      if (deleteUserIds.length) await tx.dailyLearningAssignee.deleteMany({ where: { planId: plan.id, userId: { in: deleteUserIds } } });
      const createUsers = [...addUsers, ...recreateUsers];
      if (createUsers.length) await tx.dailyLearningAssignee.createMany({ data: createUsers.map(user => ({
        planId: plan.id, userId: user.id, usernameSnapshot: user.username,
        realNameSnapshot: user.realName || user.username, labelSnapshot: (user.tags || "").slice(0, 200),
      })) });
      added += addUsers.length;
      refreshed += recreateUsers.length;
      removed += removeUserIds.length;
      protectedWithProgress += plan.assignees.filter(item => protectedUserIds.has(item.userId)).length;
    }
    return {
      selected: uniquePlanIds.length,
      processed: eligiblePlans.length,
      missing: uniquePlanIds.length - plans.length,
      historicalSkipped: plans.length - eligiblePlans.length,
      added, refreshed, removed, protectedWithProgress,
    };
  }, { isolationLevel: "ReadCommitted", timeout: 15000 });
}

export function formatShanghaiDateTime(value: Date) {
  const parts = shanghaiPartsFormatter.formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}

export function serializeDailyLearningPlan(plan: DailyLearningPlan, progressCount = 0) {
  return {
    ...plan,
    createdAt: plan.createdAt.toISOString(), updatedAt: plan.updatedAt.toISOString(),
    weekStartAt: plan.weekStartAt.toISOString(), deletedAt: plan.deletedAt?.toISOString() || null,
    createdAtText: formatShanghaiDateTime(plan.createdAt), weekRangeText: weekRangeText(plan.isoYear, plan.isoWeek),
    editable: new Date() < plan.weekStartAt, hasProgress: progressCount > 0,
  };
}

export function prismaConflictMessage(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code: unknown }).code) : "";
  if (code === "P2002") return "该年份、周次、学员标签已存在每日学习计划";
  return null;
}

export function safeDailyLearningError(error: unknown, fallback: string) {
  const conflict = prismaConflictMessage(error);
  if (conflict) return conflict;
  const message = error instanceof Error ? error.message : "";
  const allowed = [
    "年份与周次组合不合法", "请至少填写一天的学习内容", "只能新增尚未开始的每日学习计划",
    "所选学员标签不存在或已失效，请重新选择", "当日每日学习计划流水号已达到上限",
    "当前学习计划已进入执行周期，不允许编辑", "当前学习计划已有学习记录，不允许编辑",
    "当前学习计划已被其他用户修改，请刷新后重新操作", "每日学习计划不存在",
    "已有用户产生学习记录，不支持删除", "学习日期不合法", "未来日期的学习内容尚未开放",
    "当天没有学习任务", "当前学习计划不存在或无权访问", "当天学习任务已经完成",
  ];
  return allowed.includes(message) ? message : fallback;
}

export async function nextDailyLearningRecordNo(tx: Prisma.TransactionClient, now = new Date()) {
  const parts = shanghaiNowParts(now);
  const dateKey = `${parts.year}${String(parts.month).padStart(2, "0")}${String(parts.day).padStart(2, "0")}`;
  const sequence = await tx.dailyLearningSequence.upsert({ where: { dateKey }, create: { dateKey, nextValue: 2 }, update: { nextValue: { increment: 1 } } });
  const value = sequence.nextValue - 1;
  if (value > 9999) throw new Error("当日每日学习计划流水号已达到上限");
  return `${dateKey}${String(value).padStart(4, "0")}`;
}

export async function dailyLearningPeople(planId: string, completed: boolean, page = 1, pageSize = 20, weekDay?: number) {
  const plan = await db.dailyLearningPlan.findFirst({
    where: { id: planId, deletedAt: null }, select: {
      learningDays: true,
      mondayContent: true, tuesdayContent: true, wednesdayContent: true, thursdayContent: true,
      fridayContent: true, saturdayContent: true, sundayContent: true,
      assignees: { orderBy: [{ realNameSnapshot: "asc" }, { id: "asc" }], select: {
        id: true, userId: true, usernameSnapshot: true, realNameSnapshot: true,
        user: { select: { role: { select: { name: true } } } },
      } },
      progress: { where: { status: "COMPLETED" }, orderBy: [{ completedAt: "desc" }, { id: "desc" }], select: {
        id: true, userId: true, learningDate: true, weekDay: true, completedAt: true,
        recordingOriginalName: true, recordingMimeType: true, recordingSize: true,
        recordingDurationSeconds: true, recordingObjectKey: true,
      } },
    },
  });
  if (!plan) return null;
  if (weekDay && (!Number.isInteger(weekDay) || weekDay < 1 || weekDay > 7 || !plan[DAILY_LEARNING_DAY_FIELDS[weekDay - 1]])) {
    return { rows: [], total: 0, assigneeTotal: plan.assignees.length, page, pageSize };
  }
  const completion = new Map<string, Date[]>();
  for (const item of plan.progress) completion.set(item.userId, [...(completion.get(item.userId) || []), item.completedAt]);
  if (completed) {
    const assigneeMap = new Map(plan.assignees.map(item => [item.userId, item]));
    const rows = plan.progress.filter(progress => !weekDay || progress.weekDay === weekDay).map(progress => {
      const assignee = assigneeMap.get(progress.userId);
      return {
        progressId: progress.id,
        userId: progress.userId,
        realName: assignee?.realNameSnapshot || "未知用户",
        username: assignee?.usernameSnapshot || "-",
        roleName: assignee?.user.role.name || "-",
        completedDays: completion.get(progress.userId)?.length || 0,
        completedAt: progress.completedAt.toISOString(),
        completedAtText: formatShanghaiDateTime(progress.completedAt),
        learningDate: progress.learningDate.toISOString().slice(0, 10),
        weekDay: progress.weekDay,
        weekDayName: DAILY_LEARNING_DAY_NAMES[progress.weekDay - 1] || `星期${progress.weekDay}`,
        hasRecording: Boolean(progress.recordingObjectKey),
        recordingOriginalName: progress.recordingOriginalName,
        recordingMimeType: progress.recordingMimeType,
        recordingSize: progress.recordingSize,
        recordingDurationSeconds: progress.recordingDurationSeconds,
      };
    });
    return { rows: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, assigneeTotal: plan.assignees.length, page, pageSize };
  }
  const rows = plan.assignees.flatMap(item => {
    const dates = completion.get(item.userId) || [];
    const isCompleted = weekDay
      ? plan.progress.some(progress => progress.userId === item.userId && progress.weekDay === weekDay)
      : dates.length >= plan.learningDays;
    if (isCompleted) return [];
    return [{ userId: item.userId, realName: item.realNameSnapshot, username: item.usernameSnapshot, roleName: item.user.role.name, completedDays: dates.length, completedAt: null }];
  });
  return { rows: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, assigneeTotal: plan.assignees.length, page, pageSize };
}

export async function mobileDailyLearningPlans(userId: string, now = new Date()) {
  const parts = shanghaiNowParts(now);
  const current = isoWeekForCivilDate(parts.year, parts.month, parts.day);
  const plans = await db.dailyLearningPlan.findMany({
    where: { deletedAt: null, isoYear: current.isoYear, isoWeek: current.isoWeek, assignees: { some: { userId } } },
    include: { progress: { where: { userId, status: "COMPLETED" }, select: { weekDay: true, completedAt: true } } },
    orderBy: [{ studentTag: "asc" }, { createdAt: "asc" }],
  });
  const monday = isoWeekMondayCivil(current.isoYear, current.isoWeek);
  return plans.map(plan => ({
    id: plan.id, recordNo: plan.recordNo, isoYear: plan.isoYear, isoWeek: plan.isoWeek, studentTag: plan.studentTag,
    learningDays: plan.learningDays, weekRangeText: weekRangeText(plan.isoYear, plan.isoWeek), todayWeekDay: current.weekDay,
    completedDays: plan.progress.length,
    days: DAILY_LEARNING_DAY_FIELDS.map((field, index) => ({
      weekDay: index + 1, name: DAILY_LEARNING_DAY_NAMES[index], date: civilDateText(addCivilDays(monday.year, monday.month, monday.day, index)),
      content: index + 1 <= current.weekDay ? plan[field] : null,
      hasTask: Boolean(plan[field]), available: index + 1 <= current.weekDay,
      completed: plan.progress.some(item => item.weekDay === index + 1),
    })),
  }));
}

export async function mobileDailyLearningTasks(userId: string, now = new Date()) {
  const parts = shanghaiNowParts(now);
  const current = isoWeekForCivilDate(parts.year, parts.month, parts.day);
  const field = DAILY_LEARNING_DAY_FIELDS[current.weekDay - 1];
  const plans = await db.dailyLearningPlan.findMany({
    where: { deletedAt: null, isoYear: current.isoYear, isoWeek: current.isoWeek, assignees: { some: { userId } } },
    include: { progress: { where: { userId, weekDay: current.weekDay, status: "COMPLETED" }, select: { completedAt: true } } },
    orderBy: [{ studentTag: "asc" }, { createdAt: "asc" }],
  });
  const date = civilDateText(parts);
  return plans.flatMap(plan => {
    const content = plan[field]?.trim();
    if (!content) return [];
    const progress = plan.progress[0];
    return [{
      id: plan.id,
      recordNo: plan.recordNo,
      studentTag: plan.studentTag,
      date,
      title: `【每日学习】${date}`,
      contentPreview: content.length > 72 ? `${content.slice(0, 72)}…` : content,
      completed: Boolean(progress),
      completedAt: progress?.completedAt.toISOString() || null,
    }];
  });
}

export async function hasPendingDailyLearningTask(userId: string, now = new Date()) {
  const tasks = await mobileDailyLearningTasks(userId, now);
  return tasks.some(task => !task.completed);
}

export async function dailyLearningTodayDetail(planId: string, userId: string, now = new Date()) {
  const parts = shanghaiNowParts(now);
  const current = isoWeekForCivilDate(parts.year, parts.month, parts.day);
  const plan = await db.dailyLearningPlan.findFirst({
    where: { id: planId, deletedAt: null, isoYear: current.isoYear, isoWeek: current.isoWeek, assignees: { some: { userId } } },
    include: {
      progress: {
        where: { userId, weekDay: current.weekDay, status: "COMPLETED" },
        select: { id: true, completedAt: true, recordingDurationSeconds: true, recordingSize: true },
      },
    },
  });
  if (!plan) throw new Error("当前学习计划不存在或无权访问");
  const content = plan[DAILY_LEARNING_DAY_FIELDS[current.weekDay - 1]]?.trim();
  if (!content) throw new Error("当天没有学习任务");
  const date = civilDateText(parts);
  const progress = plan.progress[0];
  return {
    id: plan.id,
    recordNo: plan.recordNo,
    studentTag: plan.studentTag,
    weekDay: current.weekDay,
    date,
    title: `【每日学习】${date}`,
    content,
    completed: Boolean(progress),
    completedAt: progress?.completedAt.toISOString() || null,
    recordingDurationSeconds: progress?.recordingDurationSeconds || null,
    recordingSize: progress?.recordingSize || null,
  };
}

export async function completeDailyLearningRecording(input: {
  planId: string;
  userId: string;
  weekDay: number;
  learningDate: string;
  r2StorageId: string;
  objectKey: string;
  originalName: string;
  mimeType: string;
  size: number;
  durationSeconds: number;
  now?: Date;
}) {
  const now = input.now || new Date();
  const detail = await dailyLearningTodayDetail(input.planId, input.userId, now);
  if (detail.weekDay !== input.weekDay || detail.date !== input.learningDate) throw new Error("学习日期不合法");
  if (detail.completed) throw new Error("当天学习任务已经完成");
  const [year, month, day] = input.learningDate.split("-").map(Number);
  return db.dailyLearningProgress.create({
    data: {
      planId: input.planId,
      userId: input.userId,
      weekDay: input.weekDay,
      learningDate: new Date(Date.UTC(year, month - 1, day)),
      contentSnapshot: detail.content,
      status: "COMPLETED",
      completedAt: now,
      recordingR2StorageId: input.r2StorageId,
      recordingObjectKey: input.objectKey,
      recordingOriginalName: input.originalName,
      recordingMimeType: input.mimeType,
      recordingSize: input.size,
      recordingDurationSeconds: input.durationSeconds,
    },
  });
}

export async function completeDailyLearningDay(planId: string, userId: string, weekDay: number, now = new Date()) {
  if (!Number.isInteger(weekDay) || weekDay < 1 || weekDay > 7) throw new Error("学习日期不合法");
  const parts = shanghaiNowParts(now);
  const current = isoWeekForCivilDate(parts.year, parts.month, parts.day);
  const plan = await db.dailyLearningPlan.findFirst({ where: { id: planId, deletedAt: null, isoYear: current.isoYear, isoWeek: current.isoWeek, assignees: { some: { userId } } } });
  if (!plan) throw new Error("当前学习计划不存在或无权访问");
  if (weekDay > current.weekDay) throw new Error("未来日期的学习内容尚未开放");
  const field = DAILY_LEARNING_DAY_FIELDS[weekDay - 1];
  const content = plan[field];
  if (!content) throw new Error("当天没有学习任务");
  const monday = isoWeekMondayCivil(plan.isoYear, plan.isoWeek);
  const learningCivil = addCivilDays(monday.year, monday.month, monday.day, weekDay - 1);
  const learningDate = new Date(Date.UTC(learningCivil.year, learningCivil.month - 1, learningCivil.day));
  return db.dailyLearningProgress.upsert({
    where: { planId_userId_weekDay: { planId, userId, weekDay } },
    create: { planId, userId, weekDay, learningDate, contentSnapshot: content, status: "COMPLETED", completedAt: now },
    update: {},
  });
}

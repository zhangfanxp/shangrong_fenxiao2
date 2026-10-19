import { RecordStatus, TaskTarget, TaskType } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireApiSession } from "@/lib/auth";
import { canTaskSettingsAction } from "@/lib/task-settings-permissions";
import { getBusinessDictionaryOptions } from "@/lib/business-dictionaries";
import { writeOperationLog } from "@/lib/operation-log";
import { configFileExists, createTaskConfig, deleteTaskConfig, normalizeConfigFileName, parseSubmitContent, TaskConfigError, type SubmitItem } from "@/lib/task-config";
import { parseTaskSpecifiedTargets, TaskTargetError } from "@/lib/task-targets";

const dayValues = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"] as const;
const monthlyDayValues = ["ANY_DAY", ...Array.from({ length: 28 }, (_, index) => String(index + 1)), "LAST_DAY"];
const taskSchema = z.object({
  title: z.string().trim().min(1, "请输入任务名称").refine(value => Array.from(value).length <= 20, "任务名称不能超过20个汉字"),
  type: z.nativeEnum(TaskType, { message: "请选择任务类型" }),
  calendarTemplateId: z.string().min(1).nullable().optional(),
  targetType: z.nativeEnum(TaskTarget, { message: "请选择任务对象" }).default(TaskTarget.STORE),
  specifiedTargets: z.string().max(5000, "指定对象内容不能超过5000个字符").default(""),
  executorRoleIds: z.array(z.string().min(1)).min(1, "请至少选择一个执行人角色"),
  r2StorageId: z.string().min(1, "请选择存储空间"),
  brandIds: z.array(z.string()).default([]),
  executionDays: z.array(z.enum(dayValues)).default([]),
  weeklyExecutionDay: z.enum(dayValues).nullable().optional(),
  monthlyExecutionDay: z.string().refine(value => monthlyDayValues.includes(value), "请选择正确的月任务执行日期").nullable().optional(),
  deadlineDayOffset: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
  deadlineTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "请选择正确的任务截止时间"),
  includeCompletionRate: z.boolean().default(true),
  configFileBase: z.string().min(1, "请输入配置文件名称"),
  submitContent: z.string().min(1, "请输入提交内容"),
  status: z.nativeEnum(RecordStatus).default(RecordStatus.ENABLED),
}).superRefine((value, context) => {
  if (value.type === TaskType.DAILY && !value.executionDays.length) context.addIssue({ code: "custom", path: ["executionDays"], message: "请至少选择一个日任务执行星期" });
  if (value.type === TaskType.WEEKLY && !value.weeklyExecutionDay) context.addIssue({ code: "custom", path: ["weeklyExecutionDay"], message: "请选择周任务执行星期" });
  if (value.type === TaskType.MONTHLY && !value.monthlyExecutionDay) context.addIssue({ code: "custom", path: ["monthlyExecutionDay"], message: "请选择月任务执行日期" });
  if (value.type === TaskType.MONTHLY && value.monthlyExecutionDay === "ANY_DAY" && value.deadlineDayOffset !== -1) context.addIssue({ code: "custom", path: ["deadlineDayOffset"], message: "每月执行日选择“不限”时，任务截止日期必须选择“月末”" });
  if (value.type !== TaskType.MONTHLY && value.deadlineDayOffset === -1) context.addIssue({ code: "custom", path: ["deadlineDayOffset"], message: "只有月任务可以选择月末截止" });
  if (value.type === TaskType.CALENDAR && !value.calendarTemplateId) context.addIssue({ code: "custom", path: ["calendarTemplateId"], message: "请选择日历任务模版" });
});

const typeLabels: Record<TaskType, string> = { DAILY: "日任务", WEEKLY: "周任务", MONTHLY: "月任务", TEMPORARY: "临时任务", CALENDAR: "日历任务" };
const targetLabels: Record<TaskTarget, string> = { STORE: "门店", STORE_EMPLOYEE: "门店员工" };

function buildConfig(input: z.infer<typeof taskSchema>, specifiedTargets: string[], recordNo: string, roles: { id: string; name: string }[], brands: { id: string; name: string }[], r2Storage: { id: string; name: string; bucketName: string }, version: number, items: SubmitItem[], calendarTemplate?: { id: string; recordNo: string; name: string } | null) {
  return {
    recordNo, taskName: input.title, taskType: typeLabels[input.type], taskTarget: targetLabels[input.targetType], executorRoles: roles, executorRole: roles[0] || null,
    specifiedTargets,
    brands, storageSpace: r2Storage, executionDays: input.executionDays, weeklyExecutionDay: input.weeklyExecutionDay, monthlyExecutionDay: input.monthlyExecutionDay,
    deadlineDayOffset: input.deadlineDayOffset, deadlineTime: input.deadlineTime, includeCompletionRate: input.includeCompletionRate,
    calendarTemplate: calendarTemplate || null,
    status: input.status === RecordStatus.ENABLED ? "启用" : "禁用", configVersion: version, submitItems: items,
  };
}

async function nextRecordNo() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const datePart = (type: string) => parts.find(part => part.type === type)?.value || "";
  const prefix = `${datePart("year")}${datePart("month")}${datePart("day")}`;
  const count = await db.task.count({ where: { recordNo: { startsWith: prefix } } });
  return `${prefix}${String(count + 1).padStart(4, "0")}`;
}

export async function GET(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canTaskSettingsAction(session.permissions, "query")) return NextResponse.json({ message: "暂无任务设置查询权限" }, { status: 403 });
  const url = new URL(request.url);
  const keyword = (url.searchParams.get("keyword") || "").trim();
  const type = url.searchParams.get("type") || "";
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(10, Number(url.searchParams.get("pageSize")) || 10));
  const where = {
    deletedAt: null,
    configFileName: { not: null },
    ...(keyword ? { title: { contains: keyword } } : {}),
    ...(Object.values(TaskType).includes(type as TaskType) ? { type: type as TaskType } : {}),
  };
  const [total, rows] = await db.$transaction([
    db.task.count({ where }),
    db.task.findMany({ where, include: { executorRole: { select: { id: true, name: true, status: true } }, executorRoles: { include: { role: { select: { id: true, name: true, status: true } } } }, r2Storage: { select: { id: true, name: true, status: true } }, brands: { include: { brand: { select: { id: true, name: true } } } }, createdBy: { select: { realName: true } } }, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  await writeOperationLog({ userId: session.userId, username: session.username, page: "任务设置", action: "筛选", result: "成功", detail: keyword || type ? `任务名称：${keyword || "全部"}；任务类型：${type || "全部"}` : "加载任务列表", request });
  return NextResponse.json({ rows, total, page, pageSize });
}

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canTaskSettingsAction(session.permissions, "create")) return NextResponse.json({ message: "暂无新增任务设置权限" }, { status: 403 });
  const parsed = taskSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0].message }, { status: 400 });
  const input = parsed.data;
  try {
    const fileName = normalizeConfigFileName(input.configFileBase);
    const specifiedTargets = parseTaskSpecifiedTargets(input.specifiedTargets);
    if (await configFileExists(fileName) || await db.task.findFirst({ where: { configFileName: fileName, deletedAt: null } })) return NextResponse.json({ message: "配置文件名称已存在，请重新输入" }, { status: 400 });
    const uniqueRoleIds = [...new Set(input.executorRoleIds)];
    const [roles, brands, r2Storage, aiServiceOptions, calendarTemplate] = await Promise.all([
      db.role.findMany({ where: { id: { in: uniqueRoleIds }, status: RecordStatus.ENABLED }, select: { id: true, name: true } }),
      db.brand.findMany({ where: { id: { in: [...new Set(input.brandIds)] }, status: RecordStatus.ENABLED }, select: { id: true, name: true } }),
      db.r2StorageConfig.findFirst({ where: { id: input.r2StorageId, status: RecordStatus.ENABLED, deletedAt: null }, select: { id: true, name: true, bucketName: true } }),
      getBusinessDictionaryOptions("AI_SERVICE").catch(() => []),
      input.type === TaskType.CALENDAR && input.calendarTemplateId ? db.taskCalendarTemplate.findFirst({ where: { id: input.calendarTemplateId, status: RecordStatus.ENABLED, task: null }, select: { id: true, recordNo: true, name: true } }) : Promise.resolve(null),
    ]);
    if (roles.length !== uniqueRoleIds.length) return NextResponse.json({ message: "部分执行人角色无效或已禁用，请重新选择。" }, { status: 400 });
    if (brands.length !== new Set(input.brandIds).size) return NextResponse.json({ message: "品牌数据无效，请重新选择" }, { status: 400 });
    if (!r2Storage) return NextResponse.json({ message: "请选择已启用的R2存储空间" }, { status: 400 });
    if (input.type === TaskType.CALENDAR && !calendarTemplate) return NextResponse.json({ message: "日历任务模版不存在、已禁用或已被其他任务使用" }, { status: 400 });
    const recordNo = await nextRecordNo();
    const { items, normalizedContent } = parseSubmitContent(input.submitContent, aiServiceOptions.map(option => option.value));
    const orderedRoles = uniqueRoleIds.map(roleId => roles.find(role => role.id === roleId)!);
    const config = buildConfig({ ...input, submitContent: normalizedContent }, specifiedTargets, recordNo, orderedRoles, brands, r2Storage, 1, items, calendarTemplate);
    await createTaskConfig(fileName, config);
    try {
      const task = await db.$transaction(async tx => {
        const normalizedExecutionDays = input.type === TaskType.DAILY ? input.executionDays : input.type === TaskType.WEEKLY && input.weeklyExecutionDay ? [input.weeklyExecutionDay] : [];
        const created = await tx.task.create({ data: { recordNo, title: input.title, type: input.type, targetType: input.targetType, specifiedTargets, status: input.status, executorRoleId: orderedRoles[0].id, r2StorageId: r2Storage.id, calendarTemplateId: input.type === TaskType.CALENDAR ? input.calendarTemplateId : null, includeCompletionRate: input.includeCompletionRate, executionDays: normalizedExecutionDays, weeklyExecutionDay: input.type === TaskType.WEEKLY ? input.weeklyExecutionDay : null, monthlyExecutionDay: input.type === TaskType.MONTHLY ? input.monthlyExecutionDay : null, deadlineDayOffset: input.deadlineDayOffset, deadlineTime: input.deadlineTime, configFileName: fileName, submitItems: items, description: normalizedContent, createdByUserId: session.userId, executorRoles: { create: orderedRoles.map(role => ({ roleId: role.id })) }, brands: { create: brands.map(brand => ({ brandId: brand.id })) } } });
        await tx.r2StorageReference.create({ data: { r2ConfigId: r2Storage.id, businessType: "TASK", businessId: created.id } });
        return created;
      });
      await writeOperationLog({ userId: session.userId, username: session.username, page: "任务设置", action: "新增", result: "成功", detail: `新增任务：${task.recordNo}`, request });
      return NextResponse.json(task, { status: 201 });
    } catch (error) {
      await deleteTaskConfig(fileName);
      throw error;
    }
  } catch (error) {
    const message = error instanceof TaskConfigError || error instanceof TaskTargetError ? error.message : "任务配置文件创建失败，请稍后重试";
    await writeOperationLog({ userId: session.userId, username: session.username, page: "任务设置", action: "新增", result: "失败", detail: message, request });
    return NextResponse.json({ message }, { status: 400 });
  }
}

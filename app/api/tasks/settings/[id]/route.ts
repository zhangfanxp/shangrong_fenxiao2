import { BusinessDataSourceType, RecordStatus, TaskTarget, TaskType } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireApiSession } from "@/lib/auth";
import { canTaskSettingsAction } from "@/lib/task-settings-permissions";
import { getBusinessDictionaryOptions } from "@/lib/business-dictionaries";
import { writeOperationLog } from "@/lib/operation-log";
import { configFileExists, createTaskConfig, deleteTaskConfig, normalizeConfigFileName, parseSubmitContent, readTaskConfig, TaskConfigError, writeTaskConfig } from "@/lib/task-config";
import { parseTaskSpecifiedTargets, TaskTargetError } from "@/lib/task-targets";

const dayValues = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"] as const;
const monthlyDayValues = ["ANY_DAY", ...Array.from({ length: 28 }, (_, index) => String(index + 1)), "LAST_DAY"];
const taskSchema = z.object({
  title: z.string().trim().min(1, "请输入任务名称").refine(value => Array.from(value).length <= 20, "任务名称不能超过20个汉字"),
  type: z.nativeEnum(TaskType, { message: "请选择任务类型" }), targetType: z.nativeEnum(TaskTarget, { message: "请选择任务对象" }).default(TaskTarget.STORE), specifiedTargets: z.string().max(5000, "指定对象内容不能超过5000个字符").default(""), executorRoleIds: z.array(z.string().min(1)).min(1, "请至少选择一个执行人角色"),
  calendarTemplateId: z.string().min(1).nullable().optional(),
  r2StorageId: z.string().min(1, "请选择存储空间"),
  brandIds: z.array(z.string()).default([]), executionDays: z.array(z.enum(dayValues)).default([]), weeklyExecutionDay: z.enum(dayValues).nullable().optional(), monthlyExecutionDay: z.string().refine(value => monthlyDayValues.includes(value), "请选择正确的月任务执行日期").nullable().optional(),
  deadlineDayOffset: z.union([z.literal(-1), z.literal(0), z.literal(1)]), deadlineTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "请选择正确的任务截止时间"), includeCompletionRate: z.boolean().default(true),
  singleRecordForMultipleExecutors: z.boolean().default(false),
  configFileBase: z.string().min(1, "请输入配置文件名称"), submitContent: z.string().min(1, "请输入提交内容"), status: z.nativeEnum(RecordStatus), updatedAt: z.string().min(1),
}).superRefine((value, context) => {
  if (value.type === TaskType.DAILY && !value.executionDays.length) context.addIssue({ code: "custom", path: ["executionDays"], message: "请至少选择一个日任务执行星期" });
  if (value.type === TaskType.WEEKLY && !value.weeklyExecutionDay) context.addIssue({ code: "custom", path: ["weeklyExecutionDay"], message: "请选择周任务执行星期" });
  if (value.type === TaskType.MONTHLY && !value.monthlyExecutionDay) context.addIssue({ code: "custom", path: ["monthlyExecutionDay"], message: "请选择月任务执行日期" });
  if (value.type === TaskType.MONTHLY && value.monthlyExecutionDay === "ANY_DAY" && value.deadlineDayOffset !== -1) context.addIssue({ code: "custom", path: ["deadlineDayOffset"], message: "每月执行日选择“不限”时，任务截止日期必须选择“月末”" });
  if (value.type !== TaskType.MONTHLY && value.deadlineDayOffset === -1) context.addIssue({ code: "custom", path: ["deadlineDayOffset"], message: "只有月任务可以选择月末截止" });
  if (value.type === TaskType.CALENDAR && !value.calendarTemplateId) context.addIssue({ code: "custom", path: ["calendarTemplateId"], message: "请选择日历任务模版" });
});
const labels: Record<TaskType, string> = { DAILY: "日任务", WEEKLY: "周任务", MONTHLY: "月任务", TEMPORARY: "临时任务", CALENDAR: "日历任务" };
const targetLabels: Record<TaskTarget, string> = { STORE: "门店", STORE_EMPLOYEE: "门店员工" };

async function findTask(id: string) {
  return db.task.findFirst({ where: { id, deletedAt: null, configFileName: { not: null } }, include: { executorRole: { select: { id: true, name: true, status: true } }, executorRoles: { include: { role: { select: { id: true, name: true, status: true } } } }, r2Storage: { select: { id: true, name: true, status: true, bucketName: true } }, calendarTemplate: { select: { id: true, recordNo: true, name: true, status: true } }, brands: { include: { brand: { select: { id: true, name: true } } } }, createdBy: { select: { realName: true } } } });
}
function sameTimestamp(first: Date, second: string) { return first.getTime() === new Date(second).getTime(); }

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession(); if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!["view", "edit", "preview"].some(action => canTaskSettingsAction(session.permissions, action as "view" | "edit" | "preview"))) return NextResponse.json({ message: "暂无任务设置查看权限" }, { status: 403 });
  const { id } = await params; const task = await findTask(id);
  if (!task || !task.configFileName) return NextResponse.json({ message: "任务设置不存在或已删除" }, { status: 404 });
  try {
    const config = await readTaskConfig(task.configFileName);
    await writeOperationLog({ userId: session.userId, username: session.username, page: "任务设置", action: "查看", result: "成功", detail: `查看任务：${task.recordNo}`, request });
    return NextResponse.json({ task, config });
  } catch (error) {
    const message = error instanceof TaskConfigError ? error.message : "任务配置文件加载失败，请联系系统管理员";
    await writeOperationLog({ userId: session.userId, username: session.username, page: "任务设置", action: "查看", result: "失败", detail: `任务：${task.recordNo}；${message}`, request });
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession(); if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  const { id } = await params; const task = await findTask(id);
  if (!task || !task.configFileName) return NextResponse.json({ message: "任务设置不存在或已删除" }, { status: 404 });
  const body = await request.json();
  const changingStatus = body.action === "status";
  const statusAction = body.status === RecordStatus.ENABLED ? "enable" : "disable";
  if (!canTaskSettingsAction(session.permissions, changingStatus ? statusAction : "edit")) return NextResponse.json({ message: changingStatus ? "暂无任务状态变更权限" : "暂无任务编辑权限" }, { status: 403 });
  const parsed = changingStatus ? z.object({ action: z.literal("status"), status: z.nativeEnum(RecordStatus), updatedAt: z.string().min(1) }).safeParse(body) : taskSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0].message }, { status: 400 });
  if (!sameTimestamp(task.updatedAt, parsed.data.updatedAt)) return NextResponse.json({ message: "当前任务配置已被其他用户修改，请刷新后重新操作。" }, { status: 409 });
  try {
    const oldConfig = await readTaskConfig(task.configFileName);
    if (changingStatus) {
      const nextVersion = task.configVersion + 1;
      const nextConfig = { ...(oldConfig as Record<string, unknown>), status: parsed.data.status === RecordStatus.ENABLED ? "启用" : "禁用", configVersion: nextVersion };
      await writeTaskConfig(task.configFileName, nextConfig);
      const result = await db.task.updateMany({ where: { id, updatedAt: task.updatedAt }, data: { status: parsed.data.status, configVersion: nextVersion } });
      if (!result.count) { await writeTaskConfig(task.configFileName, oldConfig); return NextResponse.json({ message: "当前任务配置已被其他用户修改，请刷新后重新操作。" }, { status: 409 }); }
      const action = parsed.data.status === RecordStatus.ENABLED ? "启用" : "禁用";
      await writeOperationLog({ userId: session.userId, username: session.username, page: "任务设置", action, result: "成功", detail: `${action}任务：${task.recordNo}`, request });
      return NextResponse.json({ message: `任务${action}成功` });
    }
    const input = taskSchema.parse(body); const nextFileName = normalizeConfigFileName(input.configFileBase);
    const specifiedTargets = parseTaskSpecifiedTargets(input.specifiedTargets);
    const hasHistory = await db.taskRecord.count({ where: { taskId: id } });
    if (nextFileName !== task.configFileName && hasHistory) return NextResponse.json({ message: "该任务已经产生历史任务记录，配置文件名称不可修改。" }, { status: 400 });
    if (nextFileName !== task.configFileName && ((await configFileExists(nextFileName)) || await db.task.findFirst({ where: { configFileName: nextFileName, deletedAt: null, id: { not: id } } }))) return NextResponse.json({ message: "配置文件名称已存在，请重新输入" }, { status: 400 });
    const uniqueRoleIds = [...new Set(input.executorRoleIds)];
    const [roles, brands, r2Storage, aiServiceOptions, calendarTemplate] = await Promise.all([
      db.role.findMany({ where: { id: { in: uniqueRoleIds }, status: RecordStatus.ENABLED }, select: { id: true, name: true } }),
      db.brand.findMany({ where: { id: { in: [...new Set(input.brandIds)] }, status: RecordStatus.ENABLED }, select: { id: true, name: true } }),
      db.r2StorageConfig.findFirst({ where: { id: input.r2StorageId, status: RecordStatus.ENABLED, deletedAt: null }, select: { id: true, name: true, bucketName: true } }),
      getBusinessDictionaryOptions("AI_SERVICE").catch(() => []),
      input.type === TaskType.CALENDAR && input.calendarTemplateId ? db.taskCalendarTemplate.findFirst({ where: { id: input.calendarTemplateId, status: RecordStatus.ENABLED, OR: [{ task: null }, { task: { id } }] }, select: { id: true, recordNo: true, name: true } }) : Promise.resolve(null),
    ]);
    if (roles.length !== uniqueRoleIds.length) return NextResponse.json({ message: "部分执行人角色已禁用或不存在，请重新选择启用状态的角色。" }, { status: 400 });
    if (brands.length !== new Set(input.brandIds).size) return NextResponse.json({ message: "品牌数据无效，请重新选择" }, { status: 400 });
    if (!r2Storage) return NextResponse.json({ message: "请选择已启用的R2存储空间" }, { status: 400 });
    if (input.type === TaskType.CALENDAR && !calendarTemplate) return NextResponse.json({ message: "日历任务模版不存在、已禁用或已被其他任务使用" }, { status: 400 });
    const orderedRoles = uniqueRoleIds.map(roleId => roles.find(role => role.id === roleId)!);
    const { items, normalizedContent } = parseSubmitContent(input.submitContent, aiServiceOptions.map(option => option.value)); const nextVersion = task.configVersion + 1;
    const normalizedExecutionDays = input.type === TaskType.DAILY ? input.executionDays : input.type === TaskType.WEEKLY && input.weeklyExecutionDay ? [input.weeklyExecutionDay] : [];
    const nextConfig = { recordNo: task.recordNo, taskName: input.title, taskType: labels[input.type], taskTarget: targetLabels[input.targetType], specifiedTargets, executorRoles: orderedRoles, executorRole: orderedRoles[0] || null, brands, storageSpace: r2Storage, calendarTemplate: calendarTemplate || null, executionDays: normalizedExecutionDays, weeklyExecutionDay: input.weeklyExecutionDay, monthlyExecutionDay: input.monthlyExecutionDay, deadlineDayOffset: input.deadlineDayOffset, deadlineTime: input.deadlineTime, includeCompletionRate: input.includeCompletionRate, singleRecordForMultipleExecutors: input.singleRecordForMultipleExecutors, status: input.status === RecordStatus.ENABLED ? "启用" : "禁用", configVersion: nextVersion, submitItems: items };
    if (nextFileName === task.configFileName) await writeTaskConfig(nextFileName, nextConfig); else { await createTaskConfig(nextFileName, nextConfig); await deleteTaskConfig(task.configFileName); }
    try {
      const result = await db.$transaction(async tx => {
        const update = await tx.task.updateMany({ where: { id, updatedAt: task.updatedAt }, data: { title: input.title, type: input.type, targetType: input.targetType, specifiedTargets, status: input.status, executorRoleId: orderedRoles[0].id, r2StorageId: r2Storage.id, calendarTemplateId: input.type === TaskType.CALENDAR ? input.calendarTemplateId : null, includeCompletionRate: input.includeCompletionRate, singleRecordForMultipleExecutors: input.singleRecordForMultipleExecutors, executionDays: normalizedExecutionDays, weeklyExecutionDay: input.type === TaskType.WEEKLY ? input.weeklyExecutionDay : null, monthlyExecutionDay: input.type === TaskType.MONTHLY ? input.monthlyExecutionDay : null, deadlineDayOffset: input.deadlineDayOffset, deadlineTime: input.deadlineTime, configFileName: nextFileName, submitItems: items, description: normalizedContent, configVersion: nextVersion } });
        if (!update.count) throw new TaskConfigError("当前任务配置已被其他用户修改，请刷新后重新操作。");
        await tx.taskExecutorRole.deleteMany({ where: { taskId: id } });
        await tx.taskExecutorRole.createMany({ data: orderedRoles.map(role => ({ taskId: id, roleId: role.id })) });
        await tx.taskBrand.deleteMany({ where: { taskId: id } });
        if (brands.length) await tx.taskBrand.createMany({ data: brands.map(brand => ({ taskId: id, brandId: brand.id })) });
        await tx.r2StorageReference.upsert({ where: { businessType_businessId: { businessType: "TASK", businessId: id } }, create: { r2ConfigId: r2Storage.id, businessType: "TASK", businessId: id }, update: { r2ConfigId: r2Storage.id } });
      });
      await writeOperationLog({ userId: session.userId, username: session.username, page: "任务设置", action: "编辑", result: "成功", detail: `编辑任务：${task.recordNo}，版本：${nextVersion}`, request });
      return NextResponse.json(result ?? { message: "任务保存成功" });
    } catch (error) {
      if (nextFileName !== task.configFileName) { await deleteTaskConfig(nextFileName); await writeTaskConfig(task.configFileName, oldConfig); } else await writeTaskConfig(task.configFileName, oldConfig);
      throw error;
    }
  } catch (error) {
    const message = error instanceof TaskConfigError || error instanceof TaskTargetError ? error.message : "任务配置文件保存失败，请稍后重试";
    await writeOperationLog({ userId: session.userId, username: session.username, page: "任务设置", action: changingStatus ? "状态变更" : "编辑", result: "失败", detail: `任务：${task.recordNo}；${message}`, request });
    return NextResponse.json({ message }, { status: 400 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession(); if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canTaskSettingsAction(session.permissions, "delete")) return NextResponse.json({ message: "暂无任务设置删除权限" }, { status: 403 });
  const { id } = await params; const task = await findTask(id);
  if (!task || !task.configFileName) return NextResponse.json({ message: "任务设置不存在或已删除" }, { status: 404 });
  const [taskRecordCount, businessDataSources] = await Promise.all([
    db.taskRecord.count({ where: { taskId: id } }),
    db.businessDataSource.findMany({
      where: { sourceType: BusinessDataSourceType.TASK_TEMPLATE, templateId: id },
      select: { recordNo: true, businessName: true },
      orderBy: [{ recordNo: "asc" }],
    }),
  ]);
  if (taskRecordCount || businessDataSources.length) {
    const blockers = [
      ...(taskRecordCount ? [`仍关联 ${taskRecordCount} 条任务记录`] : []),
      ...(businessDataSources.length ? [`仍被 ${businessDataSources.length} 个业务数据源引用（${businessDataSources.slice(0, 3).map(source => `${source.businessName} ${source.recordNo}`).join("、")}${businessDataSources.length > 3 ? "等" : ""}）`] : []),
    ];
    const suggestions = [
      ...(task.status === RecordStatus.ENABLED ? ["当前模版仍为启用状态，请先禁用以停止继续生成任务"] : []),
      ...(taskRecordCount ? ["请先按业务需要处理关联任务记录"] : []),
      ...(businessDataSources.length ? ["请先调整或解除业务数据源引用"] : []),
    ];
    return NextResponse.json({ message: `任务模版暂不能删除：${blockers.join("；")}。${suggestions.join("；")}。` }, { status: 409 });
  }
  try {
    const oldConfig = await readTaskConfig(task.configFileName);
    await deleteTaskConfig(task.configFileName);
    try { await db.$transaction([db.task.update({ where: { id }, data: { deletedAt: new Date() } }), db.r2StorageReference.deleteMany({ where: { businessType: "TASK", businessId: id } })]); }
    catch (error) { await writeTaskConfig(task.configFileName, oldConfig); throw error; }
    await writeOperationLog({ userId: session.userId, username: session.username, page: "任务设置", action: "删除", result: "成功", detail: `删除任务：${task.recordNo}`, request });
    return NextResponse.json({ message: "任务删除成功" });
  } catch (error) {
    const message = error instanceof TaskConfigError ? error.message : "任务删除失败，请稍后重试";
    await writeOperationLog({ userId: session.userId, username: session.username, page: "任务设置", action: "删除", result: "失败", detail: `任务：${task.recordNo}；${message}`, request });
    return NextResponse.json({ message }, { status: 400 });
  }
}

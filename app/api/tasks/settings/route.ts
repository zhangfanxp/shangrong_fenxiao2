import { RecordStatus, TaskType } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireApiSession, sessionHasPermission } from "@/lib/auth";
import { configFileExists, createTaskConfig, deleteTaskConfig, normalizeConfigFileName, parseSubmitContent, TaskConfigError } from "@/lib/task-config";

const dayValues = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"] as const;
const taskSchema = z.object({
  title: z.string().trim().min(1, "请输入任务名称").refine(value => Array.from(value).length <= 20, "任务名称不能超过20个汉字"),
  type: z.nativeEnum(TaskType, { message: "请选择任务类型" }),
  executorRoleId: z.string().min(1, "请选择执行人角色"),
  r2StorageId: z.string().min(1, "请选择存储空间"),
  brandIds: z.array(z.string()).default([]),
  executionDays: z.array(z.enum(dayValues)).default([]),
  includeCompletionRate: z.boolean().default(true),
  configFileBase: z.string().min(1, "请输入配置文件名称"),
  submitContent: z.string().min(1, "请输入提交内容"),
  status: z.nativeEnum(RecordStatus).default(RecordStatus.ENABLED),
});

const typeLabels: Record<TaskType, string> = { DAILY: "日任务", WEEKLY: "周任务", MONTHLY: "月任务", TEMPORARY: "临时任务" };

function buildConfig(input: z.infer<typeof taskSchema>, recordNo: string, role: { id: string; name: string }, brands: { id: string; name: string }[], r2Storage: { id: string; name: string; bucketName: string }, version: number) {
  const { items } = parseSubmitContent(input.submitContent);
  return {
    recordNo, taskName: input.title, taskType: typeLabels[input.type], executorRole: role,
    brands, storageSpace: r2Storage, executionDays: input.executionDays, includeCompletionRate: input.includeCompletionRate,
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
  if (!sessionHasPermission(session, "tasks:settings:view")) return NextResponse.json({ message: "暂无任务设置权限" }, { status: 403 });
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
    db.task.findMany({ where, include: { executorRole: { select: { id: true, name: true, status: true } }, r2Storage: { select: { id: true, name: true, status: true } }, brands: { include: { brand: { select: { id: true, name: true } } } }, createdBy: { select: { realName: true } } }, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  await db.operationLog.create({ data: { userId: session.userId, page: "任务设置", action: "筛选", result: "成功", detail: keyword || type ? `任务名称：${keyword || "全部"}；任务类型：${type || "全部"}` : "加载任务列表" } });
  return NextResponse.json({ rows, total, page, pageSize });
}

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!sessionHasPermission(session, "tasks:settings:view")) return NextResponse.json({ message: "暂无任务设置权限" }, { status: 403 });
  const parsed = taskSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0].message }, { status: 400 });
  const input = parsed.data;
  try {
    const fileName = normalizeConfigFileName(input.configFileBase);
    if (await configFileExists(fileName) || await db.task.findFirst({ where: { configFileName: fileName, deletedAt: null } })) return NextResponse.json({ message: "配置文件名称已存在，请重新输入" }, { status: 400 });
    const [role, brands, r2Storage] = await Promise.all([
      db.role.findFirst({ where: { id: input.executorRoleId, status: RecordStatus.ENABLED }, select: { id: true, name: true } }),
      db.brand.findMany({ where: { id: { in: [...new Set(input.brandIds)] }, status: RecordStatus.ENABLED }, select: { id: true, name: true } }),
      db.r2StorageConfig.findFirst({ where: { id: input.r2StorageId, status: RecordStatus.ENABLED, deletedAt: null }, select: { id: true, name: true, bucketName: true } }),
    ]);
    if (!role) return NextResponse.json({ message: "当前执行人角色已禁用，请重新选择启用状态的角色。" }, { status: 400 });
    if (brands.length !== new Set(input.brandIds).size) return NextResponse.json({ message: "品牌数据无效，请重新选择" }, { status: 400 });
    if (!r2Storage) return NextResponse.json({ message: "请选择已启用的R2存储空间" }, { status: 400 });
    const recordNo = await nextRecordNo();
    const { items, normalizedContent } = parseSubmitContent(input.submitContent);
    const config = buildConfig({ ...input, submitContent: normalizedContent }, recordNo, role, brands, r2Storage, 1);
    await createTaskConfig(fileName, config);
    try {
      const task = await db.$transaction(async tx => {
        const created = await tx.task.create({ data: { recordNo, title: input.title, type: input.type, status: input.status, executorRoleId: role.id, r2StorageId: r2Storage.id, includeCompletionRate: input.includeCompletionRate, executionDays: input.executionDays, configFileName: fileName, submitItems: items, description: normalizedContent, createdByUserId: session.userId, brands: { create: brands.map(brand => ({ brandId: brand.id })) } } });
        await tx.r2StorageReference.create({ data: { r2ConfigId: r2Storage.id, businessType: "TASK", businessId: created.id } });
        return created;
      });
      await db.operationLog.create({ data: { userId: session.userId, page: "任务设置", action: "新增", result: "成功", detail: `新增任务：${task.recordNo}` } });
      return NextResponse.json(task, { status: 201 });
    } catch (error) {
      await deleteTaskConfig(fileName);
      throw error;
    }
  } catch (error) {
    const message = error instanceof TaskConfigError ? error.message : "任务配置文件创建失败，请稍后重试";
    await db.operationLog.create({ data: { userId: session.userId, page: "任务设置", action: "新增", result: "失败", detail: message } });
    return NextResponse.json({ message }, { status: 400 });
  }
}

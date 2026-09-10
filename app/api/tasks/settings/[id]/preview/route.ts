import { Prisma, TaskRecordStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiSession, sessionHasPermission } from "@/lib/auth";
import { writeOperationLog } from "@/lib/operation-log";
import { readTaskConfig, TaskConfigError } from "@/lib/task-config";
import { deleteUploadedTaskFiles, TaskAttachmentError, uploadTaskFiles, type UploadedTaskFile } from "@/lib/task-r2-upload";

type ConfigItem = { name: string; component: "attachment" | "input" | "select"; dataType: "photo" | "video" | "document" | "amount" | "quantity" | "text" | null; options: string[]; description: string; required: boolean; weight: number };
type SubmittedFile = { name: string; type: string; size: number; dataUrl: string };
type SubmittedItem = { name: string; value?: string | number; files?: SubmittedFile[] };

function isConfig(value: unknown): value is { submitItems: ConfigItem[]; storageSpace?: { id?: string } } {
  return Boolean(value && typeof value === "object" && Array.isArray((value as { submitItems?: unknown }).submitItems));
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!sessionHasPermission(session, "tasks:settings:view")) return NextResponse.json({ message: "暂无任务设置权限" }, { status: 403 });
  const { id } = await params;
  const task = await db.task.findFirst({ where: { id, deletedAt: null, configFileName: { not: null } } });
  if (!task || !task.configFileName) return NextResponse.json({ message: "任务设置不存在或已删除" }, { status: 404 });
  if (!task.r2StorageId) return NextResponse.json({ message: "当前任务尚未配置R2存储空间，请先编辑任务设置" }, { status: 400 });
  let uploadedFiles: UploadedTaskFile[] = [];
  try {
    const config = await readTaskConfig(task.configFileName);
    if (!isConfig(config)) throw new TaskConfigError("任务配置文件格式异常，请联系系统管理员。");
    if (config.storageSpace?.id !== task.r2StorageId) throw new TaskConfigError("任务配置文件与存储空间设置不一致，请联系系统管理员处理。");
    const body = await request.json() as { items?: SubmittedItem[] };
    if (!Array.isArray(body.items)) return NextResponse.json({ message: "提交内容格式不正确" }, { status: 400 });
    const attachmentEntries: { itemIndex: number; dataType: "photo" | "video" | "document"; file: SubmittedFile }[] = [];
    const normalized: Record<string, unknown>[] = config.submitItems.map((item, index) => {
      const submitted = body.items?.[index];
      if (!submitted || submitted.name !== item.name) throw new TaskConfigError(`任务项“${item.name}”与当前配置不一致，请刷新后重试。`);
      if (item.component === "attachment") {
        const files = (submitted.files || []).filter(file => typeof file?.dataUrl === "string" && file.dataUrl.startsWith("data:"));
        if (item.required && !files.length) throw new TaskConfigError(`请上传“${item.name}”`);
        if (files.length > item.weight) throw new TaskConfigError(`“${item.name}”最多上传${item.weight}个附件`);
        const dataType = item.dataType === "photo" || item.dataType === "video" || item.dataType === "document" ? item.dataType : null;
        if (!dataType) throw new TaskConfigError(`“${item.name}”附件类型配置不正确`);
        files.forEach(file => attachmentEntries.push({ itemIndex: index, dataType, file }));
        return { name: item.name, component: item.component, files: [] };
      }
      const value = submitted.value;
      const empty = value === undefined || value === null || String(value).trim() === "";
      if (item.required && empty) throw new TaskConfigError(`请填写“${item.name}”`);
      if (!empty) {
        if (item.component === "input" && item.dataType !== "text" && (!Number.isFinite(Number(value)) || Number(value) < 0)) throw new TaskConfigError(`“${item.name}”请输入有效数字`);
        if (item.component === "select" && !item.options.includes(String(value))) throw new TaskConfigError(`“${item.name}”选项无效，请重新选择`);
      }
      const normalizedValue = empty ? "" : item.component === "input" && item.dataType !== "text" ? Number(value) : typeof value === "string" ? value.trim() : value;
      return { name: item.name, component: item.component, value: normalizedValue };
    });
    if (attachmentEntries.length) {
      const uploaded = await uploadTaskFiles({ r2StorageId: task.r2StorageId, taskRecordNo: task.recordNo || task.id, entries: attachmentEntries });
      uploadedFiles = uploaded;
      normalized.forEach((item, index) => { if (item.component === "attachment") item.files = uploaded.filter(file => file.itemIndex === index).map(({ itemIndex: _itemIndex, ...file }) => file); });
    }
    const now = new Date();
    let record;
    try { record = await db.taskRecord.create({ data: { taskId: task.id, dueDate: now, status: TaskRecordStatus.COMPLETED, completedAt: now, configVersion: task.configVersion, configSnapshot: config as Prisma.InputJsonValue, submission: { submittedBy: { id: session.userId, name: session.realName }, submittedAt: now.toISOString(), r2StorageId: task.r2StorageId, items: normalized } as Prisma.InputJsonValue } }); }
    catch (error) { await deleteUploadedTaskFiles(task.r2StorageId, uploadedFiles); throw error; }
    await writeOperationLog({ userId: session.userId, username: session.username, page: "任务设置", action: "预览提交", result: "成功", detail: `任务：${task.recordNo}；任务记录：${record.id}`, request });
    return NextResponse.json({ message: "任务提交成功", recordId: record.id }, { status: 201 });
  } catch (error) {
    const message = error instanceof TaskConfigError || error instanceof TaskAttachmentError ? error.message : "任务提交失败，请稍后重试";
    await writeOperationLog({ userId: session.userId, username: session.username, page: "任务设置", action: "预览提交", result: "失败", detail: `任务：${task.recordNo}；${message}`, request });
    return NextResponse.json({ message }, { status: 400 });
  }
}

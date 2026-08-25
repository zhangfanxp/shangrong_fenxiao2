import { Prisma, TaskRecordStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";
import { getStoreH5Session } from "@/lib/store-h5-auth";
import { dateKeyAsDbDate, isStoreTaskSnapshot, shanghaiDateKey } from "@/lib/store-h5-tasks";
import { nextTaskSubmissionRecordNo } from "@/lib/task-records";

const bodySchema = z.object({
  items: z.array(z.object({
    index: z.number().int().min(0),
    value: z.union([z.string(), z.number()]).optional(),
    attachmentIds: z.array(z.string()).max(1).optional(),
  })),
});

class SubmissionError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

function valueIsEmpty(value: unknown) {
  return value === undefined || value === null || String(value).trim() === "";
}

export async function POST(request: Request, { params }: { params: Promise<{ taskInstanceId: string }> }) {
  const session = await getStoreH5Session();
  if (!session) return NextResponse.json({ message: "当前账号已无门店H5使用权限，请重新登录或联系管理员" }, { status: 401 });
  const { taskInstanceId } = await params;
  try {
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new SubmissionError("任务提交内容格式不正确");
    const submittedByIndex = new Map(parsed.data.items.map(item => [item.index, item]));
    if (submittedByIndex.size !== parsed.data.items.length) throw new SubmissionError("任务提交内容存在重复项目");
    const record = await db.taskRecord.findFirst({
      where: { id: taskInstanceId, assignedUserId: session.userId, dueDate: { gte: new Date() } },
      include: { task: { select: { id: true, recordNo: true, r2StorageId: true } }, store: { include: { brand: true } } },
    });
    if (!record) throw new SubmissionError("任务不存在或不属于当前用户", 404);
    if (record.status !== TaskRecordStatus.PENDING) throw new SubmissionError("当前任务已经完成，请勿重复提交。", 409);
    if (!record.store || !record.executionDate || !record.taskType || !record.configVersion || !isStoreTaskSnapshot(record.configSnapshot)) throw new SubmissionError("任务配置快照异常，请联系系统管理员", 500);
    const snapshot = record.configSnapshot;
    const store = record.store;
    const executionDate = record.executionDate;
    const taskType = record.taskType;
    const configVersion = record.configVersion;
    const detailRows: Array<{
      itemName: string; componentType: string; dataType: string | null; description: string;
      required: boolean; weight: number; value: string | null; attachmentObjectKey: string | null;
      attachmentName: string | null; attachmentMimeType: string | null; r2StorageId: string | null; sortOrder: number;
    }> = [];
    const attachmentIds: string[] = [];
    for (const [index, item] of snapshot.submitItems.entries()) {
      const submitted = submittedByIndex.get(index);
      if (!submitted) {
        if (item.required) throw new SubmissionError(`还有必填任务内容未完成：${item.name}`);
        detailRows.push({ itemName: item.name, componentType: item.component, dataType: item.dataType, description: item.description, required: item.required, weight: item.weight, value: null, attachmentObjectKey: null, attachmentName: null, attachmentMimeType: null, r2StorageId: null, sortOrder: index });
        continue;
      }
      if (item.component === "attachment") {
        const ids = submitted.attachmentIds || [];
        if (item.required && !ids.length) throw new SubmissionError(`请上传“${item.name}”`);
        if (ids.length) {
          const attachment = await db.taskAttachment.findFirst({ where: { id: ids[0], taskRecordId: record.id, itemIndex: index, uploaderUserId: session.userId, consumedAt: null } });
          if (!attachment) throw new SubmissionError(`“${item.name}”附件无效或尚未上传成功`);
          attachmentIds.push(attachment.id);
          detailRows.push({ itemName: item.name, componentType: item.component, dataType: item.dataType, description: item.description, required: item.required, weight: item.weight, value: null, attachmentObjectKey: attachment.objectKey, attachmentName: attachment.originalName, attachmentMimeType: attachment.mimeType, r2StorageId: attachment.r2StorageId, sortOrder: index });
        } else detailRows.push({ itemName: item.name, componentType: item.component, dataType: item.dataType, description: item.description, required: item.required, weight: item.weight, value: null, attachmentObjectKey: null, attachmentName: null, attachmentMimeType: null, r2StorageId: null, sortOrder: index });
        continue;
      }
      if (item.required && valueIsEmpty(submitted.value)) throw new SubmissionError(`请完成“${item.name}”`);
      let value = valueIsEmpty(submitted.value) ? null : String(submitted.value).trim();
      if (value !== null && item.component === "input") {
        if (!/^\d+(?:\.\d+)?$/.test(value) || Number(value) < 0) throw new SubmissionError(`“${item.name}”请输入大于等于0的有效数字`);
        if (item.dataType === "amount" && !/^\d+(?:\.\d{1,2})?$/.test(value)) throw new SubmissionError(`“${item.name}”最多保留2位小数`);
      }
      if (value !== null && item.component === "select" && !item.options.includes(value)) throw new SubmissionError(`“${item.name}”选项无效，请重新选择`);
      detailRows.push({ itemName: item.name, componentType: item.component, dataType: item.dataType, description: item.description, required: item.required, weight: item.weight, value, attachmentObjectKey: null, attachmentName: null, attachmentMimeType: null, r2StorageId: null, sortOrder: index });
    }
    const now = new Date();
    const submission = await db.$transaction(async tx => {
      const updated = await tx.taskRecord.updateMany({ where: { id: record.id, assignedUserId: session.userId, status: TaskRecordStatus.PENDING }, data: { status: TaskRecordStatus.COMPLETED, completedAt: now } });
      if (updated.count !== 1) throw new SubmissionError("当前任务已经完成，请勿重复提交。", 409);
      const formalRecordNo = await nextTaskSubmissionRecordNo(tx, now);
      const created = await tx.taskSubmission.create({ data: {
        recordNo: formalRecordNo,
        taskRecordId: record.id, taskIdSnapshot: record.task.id, taskSettingRecordNo: record.task.recordNo,
        taskNameSnapshot: record.taskNameSnapshot || snapshot.taskName, taskType,
        storeId: store.id, storeNameSnapshot: record.storeNameSnapshot || store.name,
        brandIdSnapshot: record.brandIdSnapshot || store.brand.id, brandNameSnapshot: record.brandNameSnapshot || store.brand.name,
        userId: session.userId, userRealNameSnapshot: session.realName, executionDate,
        configVersion, configSnapshot: snapshot as unknown as Prisma.InputJsonValue,
        submittedAt: now, items: { create: detailRows },
      } });
      if (attachmentIds.length) {
        const consumed = await tx.taskAttachment.updateMany({ where: { id: { in: attachmentIds }, consumedAt: null, uploaderUserId: session.userId, taskRecordId: record.id }, data: { consumedAt: now } });
        if (consumed.count !== attachmentIds.length) throw new SubmissionError("附件状态已变化，请刷新后重试", 409);
      }
      return created;
    });
    await writeOperationLog({ userId: session.userId, username: session.username, client: "门店员工移动端", page: "任务详情", action: "提交", result: "成功", detail: `任务实例：${record.recordNo || record.id}；提交：${submission.id}`, request }).catch(() => undefined);
    return NextResponse.json({ message: "任务提交成功", submissionId: submission.id });
  } catch (error) {
    const duplicate = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
    const message = duplicate ? "当前任务已经完成，请勿重复提交。" : error instanceof SubmissionError ? error.message : "任务提交失败，请检查网络后重试";
    const status = duplicate ? 409 : error instanceof SubmissionError ? error.status : 500;
    await writeOperationLog({ userId: session.userId, username: session.username, client: "门店员工移动端", page: "任务详情", action: "提交", result: "失败", detail: message, request }).catch(() => undefined);
    return NextResponse.json({ message }, { status });
  }
}

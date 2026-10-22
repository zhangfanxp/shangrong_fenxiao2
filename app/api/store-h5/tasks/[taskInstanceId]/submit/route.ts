import { availableMobileTaskWhere } from "@/lib/mobile-task-availability";
import { Prisma, TaskRecordStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { RectificationError, submitRectificationTask } from "@/lib/inspection-rectifications";
import { synchronizeLaborRecordForTaskSubmission } from "@/lib/labor-records";
import { writeOperationLog } from "@/lib/operation-log";
import { getMobileH5TaskSession, mobileH5TaskChannel, mobileH5UnauthorizedMessage } from "@/lib/mobile-h5-task-session";
import { isStoreTaskSnapshot } from "@/lib/store-h5-tasks";
import { deleteTaskDraftFiles } from "@/lib/task-r2-upload";
import { taskInputValueError } from "@/lib/task-input-values";
import { nextTaskSubmissionRecordNo } from "@/lib/task-records";
import { claimSharedTaskRecord, taskRecordEditorWhere, taskRecordParticipantWhere } from "@/lib/task-record-access";

const bodySchema = z.object({
  items: z.array(z.object({
    index: z.number().int().min(0),
    value: z.union([z.string(), z.number()]).optional(),
    attachmentIds: z.array(z.string()).optional(),
  })),
});

class SubmissionError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

function valueIsEmpty(value: unknown) {
  return value === undefined || value === null || String(value).trim() === "";
}

export async function POST(request: Request, { params }: { params: Promise<{ taskInstanceId: string }> }) {
  const channel = mobileH5TaskChannel(request);
  const session = await getMobileH5TaskSession(request, "submit");
  if (!session) return NextResponse.json({ message: mobileH5UnauthorizedMessage(channel) }, { status: 401 });
  const { taskInstanceId } = await params;
  try {
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new SubmissionError("任务提交内容格式不正确");
    const submittedByIndex = new Map(parsed.data.items.map(item => [item.index, item]));
    if (submittedByIndex.size !== parsed.data.items.length) throw new SubmissionError("任务提交内容存在重复项目");
    const record = await db.taskRecord.findFirst({
      where: { id: taskInstanceId, AND: [taskRecordParticipantWhere(session.userId), taskRecordEditorWhere(session.userId), availableMobileTaskWhere()] },
      include: { task: { select: { id: true, recordNo: true, r2StorageId: true } }, store: { include: { brand: true } } },
    });
    if (!record) throw new SubmissionError("任务已由其他执行人开始处理，或已完成/逾期，当前不能提交", 409);
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
      aiAnalysisTypeSnapshot: string | null; aiAnalysisPromptSnapshot: string | null;
    }> = [];
    const attachmentIds: string[] = [];
    for (const [index, item] of snapshot.submitItems.entries()) {
      const submitted = submittedByIndex.get(index);
      if (!submitted) {
        if (item.required) throw new SubmissionError(`还有必填任务内容未完成：${item.name}`);
        detailRows.push({ itemName: item.name, componentType: item.component, dataType: item.dataType, description: item.description, required: item.required, weight: item.weight, value: null, attachmentObjectKey: null, attachmentName: null, attachmentMimeType: null, r2StorageId: null, aiAnalysisTypeSnapshot: item.aiAnalysisType || null, aiAnalysisPromptSnapshot: item.aiAnalysisPrompt || null, sortOrder: index });
        continue;
      }
      if (item.component === "attachment") {
        const ids = submitted.attachmentIds || [];
        if (item.required && !ids.length) throw new SubmissionError(`请上传“${item.name}”`);
        if (ids.length > item.weight) throw new SubmissionError(`“${item.name}”最多上传${item.weight}个附件`);
        if (new Set(ids).size !== ids.length) throw new SubmissionError(`“${item.name}”存在重复附件`);
        if (ids.length) {
          const uploaded = await db.taskAttachment.findMany({ where: { id: { in: ids }, taskRecordId: record.id, itemIndex: index, uploaderUserId: session.userId, consumedAt: null } });
          if (uploaded.length !== ids.length) throw new SubmissionError(`“${item.name}”包含无效或尚未上传成功的附件`);
          const uploadedById = new Map(uploaded.map(attachment => [attachment.id, attachment]));
          const ordered = ids.map(id => uploadedById.get(id)!);
          attachmentIds.push(...ids);
          const first = ordered[0];
          detailRows.push({ itemName: item.name, componentType: item.component, dataType: item.dataType, description: item.description, required: item.required, weight: item.weight, value: null, attachmentObjectKey: first.objectKey, attachmentName: first.originalName, attachmentMimeType: first.mimeType, r2StorageId: first.r2StorageId, aiAnalysisTypeSnapshot: item.aiAnalysisType || null, aiAnalysisPromptSnapshot: item.aiAnalysisPrompt || null, sortOrder: index });
        } else detailRows.push({ itemName: item.name, componentType: item.component, dataType: item.dataType, description: item.description, required: item.required, weight: item.weight, value: null, attachmentObjectKey: null, attachmentName: null, attachmentMimeType: null, r2StorageId: null, aiAnalysisTypeSnapshot: item.aiAnalysisType || null, aiAnalysisPromptSnapshot: item.aiAnalysisPrompt || null, sortOrder: index });
        continue;
      }
      if (item.required && valueIsEmpty(submitted.value)) throw new SubmissionError(`请完成“${item.name}”`);
      let value = valueIsEmpty(submitted.value) ? null : String(submitted.value).trim();
      const inputError = value !== null && item.component === "input" ? taskInputValueError(item, value) : null;
      if (inputError) throw new SubmissionError(inputError);
      if (value !== null && item.component === "select" && !item.options.includes(value)) throw new SubmissionError(`“${item.name}”选项无效，请重新选择`);
      detailRows.push({ itemName: item.name, componentType: item.component, dataType: item.dataType, description: item.description, required: item.required, weight: item.weight, value, attachmentObjectKey: null, attachmentName: null, attachmentMimeType: null, r2StorageId: null, aiAnalysisTypeSnapshot: item.aiAnalysisType || null, aiAnalysisPromptSnapshot: item.aiAnalysisPrompt || null, sortOrder: index });
    }
    const now = new Date();
    const submission = await db.$transaction(async tx => {
      if (!await claimSharedTaskRecord(tx, record.id, session.userId, session.realName, now)) throw new SubmissionError("其他执行人已开始处理该任务，或任务状态已变化，请刷新后查看", 409);
      const updated = await tx.taskRecord.updateMany({ where: { id: record.id, AND: [taskRecordEditorWhere(session.userId), { status: TaskRecordStatus.PENDING }] }, data: { status: TaskRecordStatus.COMPLETED, completedAt: now, draftValues: Prisma.DbNull, draftCaptureFallbacks: Prisma.DbNull, draftSavedAt: null } });
      if (updated.count !== 1) throw new SubmissionError("当前任务已经完成，请勿重复提交。", 409);
      const formalRecordNo = await nextTaskSubmissionRecordNo(tx, now);
      const created = await tx.taskSubmission.create({ data: {
        recordNo: formalRecordNo,
        taskRecordId: record.id, taskIdSnapshot: record.task.id, taskSettingRecordNo: record.task.recordNo,
        taskNameSnapshot: record.taskNameSnapshot || snapshot.taskName, taskType, targetType: record.targetType,
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
      await submitRectificationTask(tx, record.id, session.userId, String(submittedByIndex.get(1)?.value || ""), now);
      return created;
    });
    const unusedDrafts = await db.taskAttachment.findMany({ where: { taskRecordId: record.id, uploaderUserId: session.userId, consumedAt: null }, select: { id: true, r2StorageId: true, objectKey: true } });
    if (unusedDrafts.length) {
      await deleteTaskDraftFiles(unusedDrafts)
        .then(() => db.taskAttachment.deleteMany({ where: { id: { in: unusedDrafts.map(attachment => attachment.id) }, consumedAt: null } }))
        .catch(() => undefined);
    }
    await synchronizeLaborRecordForTaskSubmission(submission.id).catch(async error => {
      await writeOperationLog({
        userId: session.userId,
        username: session.username,
        client: session.clientName,
        page: "用工记录",
        action: "同步",
        result: "失败",
        detail: `销售上报：${submission.id}；${error instanceof Error ? error.message : "同步失败"}`,
        request,
      }).catch(() => undefined);
    });
    await writeOperationLog({ userId: session.userId, username: session.username, client: session.clientName, page: "任务详情", action: "提交", result: "成功", detail: `任务实例：${record.recordNo || record.id}；提交：${submission.id}`, request }).catch(() => undefined);
    return NextResponse.json({ message: "任务提交成功", submissionId: submission.id });
  } catch (error) {
    const duplicate = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
    const message = duplicate ? "当前任务已经完成，请勿重复提交。" : (error instanceof SubmissionError || error instanceof RectificationError) ? error.message : "任务提交失败，请检查网络后重试";
    const status = duplicate ? 409 : (error instanceof SubmissionError || error instanceof RectificationError) ? error.status : 500;
    await writeOperationLog({ userId: session.userId, username: session.username, client: session.clientName, page: "任务详情", action: "提交", result: "失败", detail: message, request }).catch(() => undefined);
    return NextResponse.json({ message }, { status });
  }
}

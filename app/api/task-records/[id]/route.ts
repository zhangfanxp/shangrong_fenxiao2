import { Prisma, TaskRecordStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { writeOperationLog, writeOperationLogWithTransaction } from "@/lib/operation-log";
import { createTaskAttachmentReadUrl, deleteTaskDraftFiles } from "@/lib/task-r2-upload";
import { canTaskRecord, formatTaskRecordDateTime, taskRecordDataScope } from "@/lib/task-records";
import { isStoreTaskSnapshot, taskTypeLabel } from "@/lib/store-h5-tasks";

class MissingTaskRecordError extends Error {}
class TaskRecordEditError extends Error {
  constructor(message: string, readonly status = 409) { super(message); }
}

const editSchema = z.object({
  items: z.array(z.object({
    itemId: z.string().trim().min(1),
    attachmentId: z.string().trim().min(1),
    originalObjectKey: z.string().max(512).nullable(),
  })).min(1, "请至少重新上传一个图片或视频附件").max(100),
});

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canTaskRecord(session, "view") && !canTaskRecord(session, "edit")) return NextResponse.json({ message: "暂无任务记录查看权限" }, { status: 403 });
  const { id } = await params;
  try {
    const row = await db.taskRecord.findFirst({
      where: { AND: [{ id }, await taskRecordDataScope(session)] },
      include: { rectificationRound: { select: { id: true } }, aiAnalysis: { select: { id: true } }, attachments: { where: { consumedAt: { not: null } }, orderBy: { createdAt: "asc" } }, formalSubmission: { include: { items: { orderBy: { sortOrder: "asc" } } } } },
    });
    if (!row) return NextResponse.json({ message: "该任务记录已不存在或无权查看" }, { status: 404 });
    if (row.status !== TaskRecordStatus.COMPLETED) return NextResponse.json({ message: "当前任务尚未提交，暂无任务详情" }, { status: 409 });
    if (!row.formalSubmission) return NextResponse.json({ message: "已完成任务提交明细异常缺失，请联系系统管理员" }, { status: 500 });
    const snapshot = isStoreTaskSnapshot(row.formalSubmission.configSnapshot) ? row.formalSubmission.configSnapshot : null;
    const items = await Promise.all(row.formalSubmission.items.map(async item => {
      const snapshotItem = snapshot?.submitItems[item.sortOrder];
      const submittedAttachments = row.attachments.filter(attachment => attachment.itemIndex === item.sortOrder);
      const attachments = submittedAttachments.length ? await Promise.all(submittedAttachments.map(async attachment => ({
        id: attachment.id,
        name: attachment.originalName,
        mimeType: attachment.mimeType,
        objectKey: attachment.objectKey,
        url: await createTaskAttachmentReadUrl({ r2StorageId: attachment.r2StorageId, objectKey: attachment.objectKey }).catch(() => null),
      }))) : item.attachmentObjectKey ? [{
        id: item.id,
        name: item.attachmentName || "附件",
        mimeType: item.attachmentMimeType,
        objectKey: item.attachmentObjectKey,
        url: item.r2StorageId ? await createTaskAttachmentReadUrl({ r2StorageId: item.r2StorageId, objectKey: item.attachmentObjectKey }).catch(() => null) : null,
      }] : [];
      return {
        id: item.id,
        itemName: item.itemName,
        componentType: item.componentType,
        dataType: item.dataType,
        description: item.description,
        required: item.required,
        weight: item.weight,
        value: item.value,
        attachmentObjectKey: item.attachmentObjectKey,
        attachmentName: item.attachmentName,
        attachmentMimeType: item.attachmentMimeType,
        attachmentUrl: item.attachmentObjectKey && item.r2StorageId
          ? await createTaskAttachmentReadUrl({ r2StorageId: item.r2StorageId, objectKey: item.attachmentObjectKey }).catch(() => null)
          : null,
        attachments,
        aiAnalysisType: item.aiAnalysisTypeSnapshot || snapshotItem?.aiAnalysisType || null,
        aiAnalysisPrompt: item.aiAnalysisPromptSnapshot || snapshotItem?.aiAnalysisPrompt || null,
        aiAnalysisStatus: item.aiAnalysisStatus,
        aiAnalysisResult: item.aiAnalysisResult,
        aiUnqualifiedReasonDescription: item.aiUnqualifiedReasonDescription,
        aiAnalysisFailureReason: item.aiAnalysisFailureReason,
        aiAnalyzedAt: formatTaskRecordDateTime(item.aiAnalyzedAt),
        aiAnalyzedByName: item.aiAnalyzedByName,
        sortOrder: item.sortOrder,
      };
    }));
    await writeOperationLog({ userId: session.userId, username: session.username, page: "任务记录", action: "查看", result: "成功", detail: `记录编号：${row.formalSubmission.recordNo || "历史记录未编号"}；任务实例ID：${row.id}`, request }).catch(() => undefined);
    return NextResponse.json({
      id: row.id,
      recordNo: row.formalSubmission.recordNo || "-",
      taskName: row.taskNameSnapshot || row.formalSubmission.taskNameSnapshot,
      taskType: row.taskType || row.formalSubmission.taskType,
      taskTypeLabel: taskTypeLabel(row.taskType || row.formalSubmission.taskType),
      executor: `${row.assignedRoleNameSnapshot || "未知角色"}｜${row.assignedUserNameSnapshot || row.formalSubmission.userRealNameSnapshot}`,
      targetEmployee: row.targetPersonnelNameSnapshot ? `${row.targetPersonnelNameSnapshot}${row.targetPersonnelPositionSnapshot ? `｜${row.targetPersonnelPositionSnapshot}` : ""}` : "-",
      includeCompletionRate: row.includeCompletionRate !== false,
      createdAt: formatTaskRecordDateTime(row.triggeredAt),
      submittedAt: formatTaskRecordDateTime(row.formalSubmission.submittedAt),
      status: "COMPLETED",
      editable: canTaskRecord(session, "edit") && !row.aiAnalysis && !row.rectificationRound,
      configVersion: row.configVersion || row.formalSubmission.configVersion,
      configSnapshot: row.configSnapshot || row.formalSubmission.configSnapshot,
      items,
    });
  } catch {
    await writeOperationLog({ userId: session.userId, username: session.username, page: "任务记录", action: "查看", result: "失败", detail: `任务实例ID：${id}`, request }).catch(() => undefined);
    return NextResponse.json({ message: "任务详情加载失败，请稍后重试" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canTaskRecord(session, "edit")) return NextResponse.json({ message: "暂无任务记录编辑权限" }, { status: 403 });
  const parsed = editSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0].message }, { status: 400 });
  const itemIds = parsed.data.items.map(item => item.itemId);
  const attachmentIds = parsed.data.items.map(item => item.attachmentId);
  if (new Set(itemIds).size !== itemIds.length || new Set(attachmentIds).size !== attachmentIds.length) {
    return NextResponse.json({ message: "附件替换项目存在重复，请刷新后重试" }, { status: 400 });
  }
  const { id } = await params;
  const scope = await taskRecordDataScope(session);
  let replacedFiles: Array<{ r2StorageId: string; objectKey: string }> = [];
  try {
    if (await db.inspectionRectificationRound.findUnique({ where: { taskRecordId: id }, select: { id: true } })) return NextResponse.json({ message: "巡检整改任务的提交内容须保留历史，不能直接编辑" }, { status: 409 });
    const result = await db.$transaction(async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT \`id\` FROM \`TaskRecord\` WHERE \`id\` = ${id} FOR UPDATE`);
      const record = await tx.taskRecord.findFirst({
        where: { AND: [{ id }, scope] },
        include: { aiAnalysis: { select: { id: true } }, formalSubmission: { include: { items: true } } },
      });
      if (!record) throw new TaskRecordEditError("该任务记录已不存在或无权编辑", 404);
      if (record.status !== TaskRecordStatus.COMPLETED || record.aiAnalysis) throw new TaskRecordEditError("仅已完成且尚未智能分析的任务记录支持编辑");
      if (!record.formalSubmission) throw new TaskRecordEditError("已完成任务提交明细异常缺失，请联系系统管理员", 500);
      const items = new Map(record.formalSubmission.items.map(item => [item.id, item]));
      const attachments = await tx.taskAttachment.findMany({ where: { id: { in: attachmentIds } } });
      const attachmentById = new Map(attachments.map(attachment => [attachment.id, attachment]));
      const oldFiles: Array<{ r2StorageId: string; objectKey: string }> = [];
      const now = new Date();
      for (const replacement of parsed.data.items) {
        const item = items.get(replacement.itemId);
        const attachment = attachmentById.get(replacement.attachmentId);
        if (!item || item.componentType !== "attachment" || (item.dataType !== "photo" && item.dataType !== "video")) {
          throw new TaskRecordEditError("仅任务中的图片和视频附件支持重新上传", 400);
        }
        if (!attachment || attachment.taskRecordId !== record.id || attachment.itemIndex !== item.sortOrder || attachment.uploaderUserId !== session.userId || attachment.consumedAt) {
          throw new TaskRecordEditError(`“${item.itemName}”的新附件无效或已被使用`);
        }
        if ((item.attachmentObjectKey || null) !== replacement.originalObjectKey) {
          throw new TaskRecordEditError(`“${item.itemName}”已被其他用户修改，请刷新后重试`);
        }
        const updated = await tx.taskSubmissionItem.updateMany({
          where: { id: item.id, submissionId: record.formalSubmission.id, attachmentObjectKey: replacement.originalObjectKey },
          data: {
            attachmentObjectKey: attachment.objectKey,
            attachmentName: attachment.originalName,
            attachmentMimeType: attachment.mimeType,
            r2StorageId: attachment.r2StorageId,
          },
        });
        if (updated.count !== 1) throw new TaskRecordEditError(`“${item.itemName}”已被其他用户修改，请刷新后重试`);
        const consumed = await tx.taskAttachment.updateMany({
          where: { id: attachment.id, consumedAt: null, taskRecordId: record.id, uploaderUserId: session.userId },
          data: { consumedAt: now },
        });
        if (consumed.count !== 1) throw new TaskRecordEditError(`“${item.itemName}”附件状态已变化，请重新上传`);
        if (item.attachmentObjectKey && item.r2StorageId && item.attachmentObjectKey !== attachment.objectKey) {
          oldFiles.push({ r2StorageId: item.r2StorageId, objectKey: item.attachmentObjectKey });
        }
      }
      await writeOperationLogWithTransaction(tx, {
        userId: session.userId,
        username: session.username,
        page: "任务记录",
        action: "编辑",
        result: "成功",
        detail: `任务记录编号：${record.formalSubmission.recordNo}；替换图片/视频附件：${parsed.data.items.length}项`,
        request,
      });
      return { recordNo: record.formalSubmission.recordNo, replacedCount: parsed.data.items.length, oldFiles };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 30_000 });
    replacedFiles = result.oldFiles;
    if (replacedFiles.length) {
      await deleteTaskDraftFiles(replacedFiles)
        .then(() => db.taskAttachment.deleteMany({ where: { objectKey: { in: replacedFiles.map(file => file.objectKey) } } }))
        .catch(() => undefined);
    }
    return NextResponse.json({ message: `任务记录编辑成功，已更新${result.replacedCount}个附件`, replacedCount: result.replacedCount });
  } catch (error) {
    const known = error instanceof TaskRecordEditError;
    const message = known ? error.message : "任务记录编辑失败，请稍后重试";
    await writeOperationLog({ userId: session.userId, username: session.username, page: "任务记录", action: "编辑", result: "失败", detail: `任务实例ID：${id}；${message}`, request }).catch(() => undefined);
    return NextResponse.json({ message }, { status: known ? error.status : 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canTaskRecord(session, "delete")) return NextResponse.json({ message: "暂无任务记录删除权限" }, { status: 403 });
  const { id } = await params;
  try {
    if (await db.inspectionRectificationRound.findUnique({ where: { taskRecordId: id }, select: { id: true } })) return NextResponse.json({ message: "巡检整改任务须保留历史，不能删除" }, { status: 409 });
    const scope = await taskRecordDataScope(session);
    await db.$transaction(async tx => {
      const current = await tx.taskRecord.findFirst({ where: { AND: [{ id }, scope] }, include: { formalSubmission: { select: { id: true, recordNo: true, submittedAt: true } }, aiAnalysis: { select: { recordNo: true } } } });
      if (!current) throw new MissingTaskRecordError();
      if (current.formalSubmission) {
        await tx.taskSubmissionItem.deleteMany({ where: { submissionId: current.formalSubmission.id } });
        await tx.taskSubmission.delete({ where: { id: current.formalSubmission.id } });
      }
      await tx.taskAttachment.deleteMany({ where: { taskRecordId: current.id } });
      const removed = await tx.taskRecord.deleteMany({ where: { AND: [{ id: current.id }, scope] } });
      if (removed.count !== 1) throw new MissingTaskRecordError();
      await writeOperationLogWithTransaction(tx, {
        userId: session.userId,
        username: session.username,
        page: "任务记录",
        action: "删除",
        result: "成功",
        detail: `原任务实例ID：${current.id}；原记录编号：${current.formalSubmission?.recordNo || "-"}；同步删除智能分析记录：${current.aiAnalysis?.recordNo || "-"}；任务名称：${current.taskNameSnapshot || "-"}；任务类型：${taskTypeLabel(current.taskType)}；执行用户ID：${current.assignedUserId || "-"}；执行人：${current.assignedUserNameSnapshot || "-"}；原任务状态：${current.status === TaskRecordStatus.COMPLETED ? "已完成" : current.status === TaskRecordStatus.OVERDUE ? "已逾期" : "待完成"}；参与完成率：${current.includeCompletionRate !== false ? "参与" : "不参与"}；原任务创建时间：${formatTaskRecordDateTime(current.triggeredAt)}；原任务提交时间：${formatTaskRecordDateTime(current.formalSubmission?.submittedAt || current.completedAt)}；R2附件对象保留`,
        request,
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 30_000 });
    return NextResponse.json({ message: "任务记录删除成功，当前任务已恢复为未生成状态" });
  } catch (error) {
    const missing = error instanceof MissingTaskRecordError || (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025");
    await writeOperationLog({ userId: session.userId, username: session.username, page: "任务记录", action: "删除", result: "失败", detail: missing ? `任务记录已不存在：${id}` : `任务记录删除失败：${id}`, request }).catch(() => undefined);
    return NextResponse.json({ message: missing ? "该任务记录已不存在或已被其他用户删除" : "任务记录删除失败，请稍后重试" }, { status: missing ? 404 : 500 });
  }
}

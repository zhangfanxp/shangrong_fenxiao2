import { Prisma, TaskRecordStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { writeOperationLog, writeOperationLogWithTransaction } from "@/lib/operation-log";
import { createTaskAttachmentReadUrl } from "@/lib/task-r2-upload";
import { canTaskRecord, formatTaskRecordDateTime, taskRecordDataScope } from "@/lib/task-records";
import { taskTypeLabel } from "@/lib/store-h5-tasks";

class MissingTaskRecordError extends Error {}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canTaskRecord(session, "view")) return NextResponse.json({ message: "暂无任务记录查看权限" }, { status: 403 });
  const { id } = await params;
  try {
    const row = await db.taskRecord.findFirst({
      where: { AND: [{ id }, await taskRecordDataScope(session)] },
      include: { formalSubmission: { include: { items: { orderBy: { sortOrder: "asc" } } } } },
    });
    if (!row) return NextResponse.json({ message: "该任务记录已不存在或无权查看" }, { status: 404 });
    if (row.status !== TaskRecordStatus.COMPLETED) return NextResponse.json({ message: "当前任务尚未提交，暂无任务详情" }, { status: 409 });
    if (!row.formalSubmission) return NextResponse.json({ message: "已完成任务提交明细异常缺失，请联系系统管理员" }, { status: 500 });
    const items = await Promise.all(row.formalSubmission.items.map(async item => ({
      id: item.id,
      itemName: item.itemName,
      componentType: item.componentType,
      dataType: item.dataType,
      description: item.description,
      required: item.required,
      weight: item.weight,
      value: item.value,
      attachmentName: item.attachmentName,
      attachmentMimeType: item.attachmentMimeType,
      attachmentUrl: item.attachmentObjectKey && item.r2StorageId
        ? await createTaskAttachmentReadUrl({ r2StorageId: item.r2StorageId, objectKey: item.attachmentObjectKey }).catch(() => null)
        : null,
      sortOrder: item.sortOrder,
    })));
    await writeOperationLog({ userId: session.userId, username: session.username, page: "任务记录", action: "查看", result: "成功", detail: `记录编号：${row.formalSubmission.recordNo || "历史记录未编号"}；任务实例ID：${row.id}`, request }).catch(() => undefined);
    return NextResponse.json({
      id: row.id,
      recordNo: row.formalSubmission.recordNo || "-",
      taskName: row.taskNameSnapshot || row.formalSubmission.taskNameSnapshot,
      taskType: row.taskType || row.formalSubmission.taskType,
      taskTypeLabel: taskTypeLabel(row.taskType || row.formalSubmission.taskType),
      executor: `${row.assignedRoleNameSnapshot || "未知角色"}｜${row.assignedUserNameSnapshot || row.formalSubmission.userRealNameSnapshot}`,
      includeCompletionRate: row.includeCompletionRate !== false,
      createdAt: formatTaskRecordDateTime(row.triggeredAt),
      submittedAt: formatTaskRecordDateTime(row.formalSubmission.submittedAt),
      status: "COMPLETED",
      configVersion: row.configVersion || row.formalSubmission.configVersion,
      configSnapshot: row.configSnapshot || row.formalSubmission.configSnapshot,
      items,
    });
  } catch {
    await writeOperationLog({ userId: session.userId, username: session.username, page: "任务记录", action: "查看", result: "失败", detail: `任务实例ID：${id}`, request }).catch(() => undefined);
    return NextResponse.json({ message: "任务详情加载失败，请稍后重试" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canTaskRecord(session, "delete")) return NextResponse.json({ message: "暂无任务记录删除权限" }, { status: 403 });
  const { id } = await params;
  try {
    const scope = await taskRecordDataScope(session);
    await db.$transaction(async tx => {
      const current = await tx.taskRecord.findFirst({ where: { AND: [{ id }, scope] }, include: { formalSubmission: { select: { id: true, recordNo: true, submittedAt: true } } } });
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
        detail: `原任务实例ID：${current.id}；原记录编号：${current.formalSubmission?.recordNo || "-"}；任务名称：${current.taskNameSnapshot || "-"}；任务类型：${taskTypeLabel(current.taskType)}；执行用户ID：${current.assignedUserId || "-"}；执行人：${current.assignedUserNameSnapshot || "-"}；原任务状态：${current.status === TaskRecordStatus.COMPLETED ? "已完成" : "未完成"}；参与完成率：${current.includeCompletionRate !== false ? "参与" : "不参与"}；原任务创建时间：${formatTaskRecordDateTime(current.triggeredAt)}；原任务提交时间：${formatTaskRecordDateTime(current.formalSubmission?.submittedAt || current.completedAt)}；R2附件对象保留`,
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

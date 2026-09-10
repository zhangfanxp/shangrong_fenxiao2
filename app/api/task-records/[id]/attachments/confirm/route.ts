import { Prisma, TaskRecordStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { deleteTaskDraftFiles, TaskAttachmentError, verifyStoreTaskDirectUpload } from "@/lib/task-r2-upload";
import { verifyTaskRecordEditUploadToken } from "@/lib/task-record-edit-upload-token";
import { canTaskRecord, taskRecordDataScope } from "@/lib/task-records";
import { isStoreTaskSnapshot } from "@/lib/store-h5-tasks";

const inputSchema = z.object({ uploadToken: z.string().min(1), etag: z.string().max(200).nullable().optional() });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canTaskRecord(session, "edit")) return NextResponse.json({ message: "暂无任务记录编辑权限" }, { status: 403 });
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "上传确认参数不正确" }, { status: 400 });
  const { id } = await params;
  const grant = await verifyTaskRecordEditUploadToken(parsed.data.uploadToken).catch(() => null);
  if (!grant || grant.userId !== session.userId || grant.taskRecordId !== id) return NextResponse.json({ message: "上传凭证无效或已过期，请重新上传" }, { status: 400 });
  const cleanup = () => deleteTaskDraftFiles([{ r2StorageId: grant.r2StorageId, objectKey: grant.objectKey }]).catch(() => undefined);
  try {
    const record = await db.taskRecord.findFirst({
      where: { AND: [{ id }, await taskRecordDataScope(session)] },
      include: {
        task: { select: { r2StorageId: true } },
        aiAnalysis: { select: { id: true } },
        formalSubmission: { include: { items: { where: { id: grant.itemId } } } },
      },
    });
    if (!record) { await cleanup(); return NextResponse.json({ message: "该任务记录已不存在或无权编辑" }, { status: 404 }); }
    if (record.status !== TaskRecordStatus.COMPLETED || record.aiAnalysis) { await cleanup(); return NextResponse.json({ message: "仅已完成且尚未智能分析的任务记录支持编辑" }, { status: 409 }); }
    const item = record.formalSubmission?.items[0];
    if (!record.formalSubmission || !item || item.sortOrder !== grant.itemIndex || item.componentType !== "attachment" || (item.dataType !== "photo" && item.dataType !== "video")) {
      await cleanup();
      return NextResponse.json({ message: "任务附件配置已变化，请刷新后重试" }, { status: 409 });
    }
    const snapshot = isStoreTaskSnapshot(record.formalSubmission.configSnapshot) ? record.formalSubmission.configSnapshot : null;
    const currentR2StorageId = item.r2StorageId || snapshot?.storageSpace?.id || record.task.r2StorageId;
    if (currentR2StorageId !== grant.r2StorageId) { await cleanup(); return NextResponse.json({ message: "任务附件存储配置已变化，请刷新后重试" }, { status: 409 }); }
    await verifyStoreTaskDirectUpload({
      r2StorageId: grant.r2StorageId,
      objectKey: grant.objectKey,
      expectedSize: grant.size,
      expectedMimeType: grant.mimeType,
      etag: parsed.data.etag,
    });
    let attachment = await db.taskAttachment.findUnique({ where: { objectKey: grant.objectKey } });
    if (!attachment) {
      try {
        attachment = await db.taskAttachment.create({ data: {
          taskRecordId: record.id,
          itemIndex: grant.itemIndex,
          uploaderUserId: session.userId,
          r2StorageId: grant.r2StorageId,
          objectKey: grant.objectKey,
          originalName: grant.originalName,
          mimeType: grant.mimeType,
          size: grant.size,
        } });
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
        attachment = await db.taskAttachment.findUnique({ where: { objectKey: grant.objectKey } });
      }
    }
    if (!attachment || attachment.taskRecordId !== record.id || attachment.uploaderUserId !== session.userId || attachment.itemIndex !== grant.itemIndex || attachment.consumedAt) {
      await cleanup();
      return NextResponse.json({ message: "附件登记冲突，请重新上传" }, { status: 409 });
    }
    const previousDrafts = await db.taskAttachment.findMany({
      where: { taskRecordId: record.id, itemIndex: grant.itemIndex, uploaderUserId: session.userId, consumedAt: null, id: { not: attachment.id } },
      select: { id: true, r2StorageId: true, objectKey: true },
    });
    if (previousDrafts.length) {
      await deleteTaskDraftFiles(previousDrafts)
        .then(() => db.taskAttachment.deleteMany({ where: { id: { in: previousDrafts.map(row => row.id) }, consumedAt: null } }))
        .catch(() => undefined);
    }
    return NextResponse.json({ id: attachment.id, name: attachment.originalName, size: attachment.size, mimeType: attachment.mimeType, status: "success" });
  } catch (error) {
    await cleanup();
    const message = error instanceof TaskAttachmentError ? error.message : "确认R2附件失败，请重新上传";
    return NextResponse.json({ message }, { status: 400 });
  }
}

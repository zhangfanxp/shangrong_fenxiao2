import { availableMobileTaskWhere } from "@/lib/mobile-task-availability";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getMobileH5TaskSession, mobileH5TaskChannel, mobileH5UnauthorizedMessage } from "@/lib/mobile-h5-task-session";
import { dateKeyAsDbDate, isStoreTaskSnapshot, shanghaiDateKey } from "@/lib/store-h5-tasks";
import { verifyStoreH5UploadToken } from "@/lib/store-h5-upload-token";
import { deleteTaskDraftFiles, TaskAttachmentError, verifyStoreTaskDirectUpload } from "@/lib/task-r2-upload";

const inputSchema = z.object({ uploadToken: z.string().min(1), etag: z.string().max(200).nullable().optional() });

export async function POST(request: Request, { params }: { params: Promise<{ taskInstanceId: string }> }) {
  const channel = mobileH5TaskChannel(request);
  const session = await getMobileH5TaskSession(request, "attachment");
  if (!session) return NextResponse.json({ message: mobileH5UnauthorizedMessage(channel) }, { status: 401 });
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "上传确认参数不正确" }, { status: 400 });
  const { taskInstanceId } = await params;
  try {
    const grant = await verifyStoreH5UploadToken(parsed.data.uploadToken).catch(() => null);
    if (!grant || grant.userId !== session.userId || grant.taskRecordId !== taskInstanceId) return NextResponse.json({ message: "上传凭证无效或已过期，请重新上传" }, { status: 400 });
    const record = await db.taskRecord.findFirst({
      where: { id: taskInstanceId, assignedUserId: session.userId, ...availableMobileTaskWhere() },
      include: { task: { select: { r2StorageId: true } } },
    });
    if (!record) return NextResponse.json({ message: "任务不存在、已完成或不属于当前用户" }, { status: 404 });
    if (!isStoreTaskSnapshot(record.configSnapshot)) return NextResponse.json({ message: "任务配置快照异常" }, { status: 500 });
    const item = record.configSnapshot.submitItems[grant.itemIndex];
    const currentR2StorageId = record.configSnapshot.storageSpace?.id || record.task.r2StorageId;
    if (!item || item.component !== "attachment" || !["photo", "video", "document"].includes(item.dataType || "") || currentR2StorageId !== grant.r2StorageId) {
      return NextResponse.json({ message: "任务附件配置已变化，请刷新后重试" }, { status: 409 });
    }
    await verifyStoreTaskDirectUpload({
      r2StorageId: grant.r2StorageId, objectKey: grant.objectKey,
      expectedSize: grant.size, expectedMimeType: grant.mimeType, etag: parsed.data.etag,
    });
    const attachment = await db.$transaction(async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT \`id\` FROM \`TaskRecord\` WHERE \`id\` = ${record.id} FOR UPDATE`);
      const existing = await tx.taskAttachment.findUnique({ where: { objectKey: grant.objectKey } });
      if (existing) return existing;
      const writable = await tx.taskRecord.findFirst({ where: { id: record.id, assignedUserId: session.userId, ...availableMobileTaskWhere() }, select: { id: true } });
      if (!writable) return null;
      const uploadedCount = await tx.taskAttachment.count({ where: { taskRecordId: record.id, itemIndex: grant.itemIndex, uploaderUserId: session.userId, consumedAt: null } });
      if (uploadedCount >= item.weight) return null;
      return tx.taskAttachment.create({ data: {
        taskRecordId: record.id, itemIndex: grant.itemIndex, uploaderUserId: session.userId,
        r2StorageId: grant.r2StorageId, objectKey: grant.objectKey, originalName: grant.originalName,
        mimeType: grant.mimeType, size: grant.size,
      } });
    });
    if (!attachment) {
      await deleteTaskDraftFiles([{ r2StorageId: grant.r2StorageId, objectKey: grant.objectKey }]).catch(() => undefined);
      return NextResponse.json({ message: `任务已提交、状态发生变化或“${item.name}”已达到${item.weight}个附件上限，请刷新后重试` }, { status: 409 });
    }
    if (!attachment || attachment.taskRecordId !== record.id || attachment.uploaderUserId !== session.userId || attachment.itemIndex !== grant.itemIndex) return NextResponse.json({ message: "附件登记冲突，请重新上传" }, { status: 409 });
    return NextResponse.json({ id: attachment.id, name: attachment.originalName, size: attachment.size, mimeType: attachment.mimeType, status: "success" });
  } catch (error) {
    const message = error instanceof TaskAttachmentError ? error.message : "确认R2附件失败，请重新上传";
    return NextResponse.json({ message }, { status: 400 });
  }
}

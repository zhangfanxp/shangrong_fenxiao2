import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getMobileH5TaskSession, mobileH5TaskChannel, mobileH5UnauthorizedMessage } from "@/lib/mobile-h5-task-session";
import { dateKeyAsDbDate, isStoreTaskSnapshot, shanghaiDateKey } from "@/lib/store-h5-tasks";
import { deleteTaskDraftFiles, deleteUploadedTaskFiles, TaskAttachmentError, uploadStoreTaskFile } from "@/lib/task-r2-upload";

export const runtime = "nodejs";

const deleteSchema = z.object({ attachmentId: z.string().trim().min(1) });

export async function POST(request: Request, { params }: { params: Promise<{ taskInstanceId: string }> }) {
  const channel = mobileH5TaskChannel(request);
  const session = await getMobileH5TaskSession(request, "attachment");
  if (!session) return NextResponse.json({ message: mobileH5UnauthorizedMessage(channel) }, { status: 401 });
  const { taskInstanceId } = await params;
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const itemIndex = Number(formData.get("itemIndex"));
    if (!(file instanceof File) || !Number.isInteger(itemIndex) || itemIndex < 0) return NextResponse.json({ message: "附件上传参数不正确" }, { status: 400 });
    const record = await db.taskRecord.findFirst({ where: { id: taskInstanceId, assignedUserId: session.userId, dueDate: { gte: new Date() }, status: "PENDING" }, include: { task: { select: { r2StorageId: true } } } });
    if (!record) return NextResponse.json({ message: "任务不存在、已完成或不属于当前用户" }, { status: 404 });
    if (!isStoreTaskSnapshot(record.configSnapshot)) return NextResponse.json({ message: "任务配置快照异常" }, { status: 500 });
    const item = record.configSnapshot.submitItems[itemIndex];
    if (!item || item.component !== "attachment" || !["photo", "video", "document"].includes(item.dataType || "")) return NextResponse.json({ message: "当前任务项不支持附件上传" }, { status: 400 });
    const uploadedCount = await db.taskAttachment.count({ where: { taskRecordId: record.id, itemIndex, uploaderUserId: session.userId, consumedAt: null } });
    if (uploadedCount >= item.weight) return NextResponse.json({ message: `“${item.name}”最多上传${item.weight}个附件` }, { status: 409 });
    const r2StorageId = record.configSnapshot.storageSpace?.id || record.task.r2StorageId;
    if (!r2StorageId) return NextResponse.json({ message: "当前任务未配置可用存储空间" }, { status: 409 });
    const body = Buffer.from(await file.arrayBuffer());
    const uploaded = await uploadStoreTaskFile({
      r2StorageId, taskRecordNo: record.recordNo || record.id, itemIndex,
      dataType: item.dataType as "photo" | "video" | "document",
      file: { name: file.name, type: file.type || "application/octet-stream", size: file.size, body },
    });
    try {
      const attachment = await db.taskAttachment.create({ data: {
        taskRecordId: record.id, itemIndex, uploaderUserId: session.userId, r2StorageId,
        objectKey: uploaded.objectKey, originalName: uploaded.name, mimeType: uploaded.type, size: uploaded.size,
      } });
      return NextResponse.json({ id: attachment.id, name: attachment.originalName, size: attachment.size, mimeType: attachment.mimeType, status: "success" }, { status: 201 });
    } catch (error) {
      await deleteUploadedTaskFiles(r2StorageId, [uploaded]);
      throw error;
    }
  } catch (error) {
    const message = error instanceof TaskAttachmentError ? error.message : "附件上传失败，请重新上传";
    return NextResponse.json({ message }, { status: 400 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ taskInstanceId: string }> }) {
  const channel = mobileH5TaskChannel(request);
  const session = await getMobileH5TaskSession(request, "attachment");
  if (!session) return NextResponse.json({ message: mobileH5UnauthorizedMessage(channel) }, { status: 401 });
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "附件删除参数不正确" }, { status: 400 });
  const { taskInstanceId } = await params;
  try {
    const attachment = await db.taskAttachment.findFirst({
      where: { id: parsed.data.attachmentId, taskRecordId: taskInstanceId, uploaderUserId: session.userId, consumedAt: null, taskRecord: { status: "PENDING", dueDate: { gte: new Date() } } },
      select: { id: true, r2StorageId: true, objectKey: true },
    });
    if (!attachment) return NextResponse.json({ message: "附件不存在或当前任务已不能修改" }, { status: 404 });
    await deleteTaskDraftFiles([attachment]);
    await db.taskAttachment.deleteMany({ where: { id: attachment.id, consumedAt: null } });
    return NextResponse.json({ message: "附件已删除" });
  } catch (error) {
    const message = error instanceof TaskAttachmentError ? error.message : "附件删除失败，请稍后重试";
    return NextResponse.json({ message }, { status: 400 });
  }
}

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStoreH5Session } from "@/lib/store-h5-auth";
import { dateKeyAsDbDate, isStoreTaskSnapshot, shanghaiDateKey } from "@/lib/store-h5-tasks";
import { deleteUploadedTaskFiles, TaskAttachmentError, uploadStoreTaskFile } from "@/lib/task-r2-upload";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ taskInstanceId: string }> }) {
  const session = await getStoreH5Session();
  if (!session) return NextResponse.json({ message: "当前账号已无门店H5使用权限，请重新登录或联系管理员" }, { status: 401 });
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

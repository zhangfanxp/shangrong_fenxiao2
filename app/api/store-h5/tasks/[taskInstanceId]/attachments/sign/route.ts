import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getMobileH5TaskSession, mobileH5TaskChannel, mobileH5UnauthorizedMessage } from "@/lib/mobile-h5-task-session";
import { dateKeyAsDbDate, isStoreTaskSnapshot, shanghaiDateKey } from "@/lib/store-h5-tasks";
import { createStoreH5UploadToken } from "@/lib/store-h5-upload-token";
import { createStoreTaskDirectUpload, TaskAttachmentError } from "@/lib/task-r2-upload";
import { TASK_VIDEO_MAX_BYTES } from "@/lib/task-attachment-rules";

const inputSchema = z.object({
  itemIndex: z.number().int().min(0),
  name: z.string().trim().min(1).max(255),
  type: z.string().trim().min(1).max(100),
  size: z.number().int().positive().max(TASK_VIDEO_MAX_BYTES, "任务视频不能超过100MB"),
});

export async function POST(request: Request, { params }: { params: Promise<{ taskInstanceId: string }> }) {
  const channel = mobileH5TaskChannel(request);
  const session = await getMobileH5TaskSession(request, "attachment");
  if (!session) return NextResponse.json({ message: mobileH5UnauthorizedMessage(channel) }, { status: 401 });
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0].message || "附件参数不正确" }, { status: 400 });
  const { taskInstanceId } = await params;
  try {
    const record = await db.taskRecord.findFirst({
      where: { id: taskInstanceId, assignedUserId: session.userId, dueDate: { gte: new Date() }, status: "PENDING" },
      include: { task: { select: { r2StorageId: true } } },
    });
    if (!record) return NextResponse.json({ message: "任务不存在、已完成或不属于当前用户" }, { status: 404 });
    if (!isStoreTaskSnapshot(record.configSnapshot)) return NextResponse.json({ message: "任务配置快照异常" }, { status: 500 });
    const item = record.configSnapshot.submitItems[parsed.data.itemIndex];
    if (!item || item.component !== "attachment" || !["photo", "video", "document"].includes(item.dataType || "")) return NextResponse.json({ message: "当前任务项不支持附件上传" }, { status: 400 });
    const uploadedCount = await db.taskAttachment.count({ where: { taskRecordId: record.id, itemIndex: parsed.data.itemIndex, uploaderUserId: session.userId, consumedAt: null } });
    if (uploadedCount >= item.weight) return NextResponse.json({ message: `“${item.name}”最多上传${item.weight}个附件` }, { status: 409 });
    const r2StorageId = record.configSnapshot.storageSpace?.id || record.task.r2StorageId;
    if (!r2StorageId) return NextResponse.json({ message: "当前任务未配置可用存储空间" }, { status: 409 });
    const direct = await createStoreTaskDirectUpload({
      r2StorageId, taskRecordNo: record.recordNo || record.id, itemIndex: parsed.data.itemIndex,
      dataType: item.dataType as "photo" | "video" | "document", file: parsed.data,
    });
    const uploadToken = await createStoreH5UploadToken({
      userId: session.userId, taskRecordId: record.id, itemIndex: parsed.data.itemIndex,
      r2StorageId, objectKey: direct.objectKey, originalName: direct.name,
      mimeType: direct.mimeType, size: direct.size,
    }, direct.expiresIn);
    return NextResponse.json({
      uploadUrl: direct.uploadUrl, uploadToken, expiresIn: direct.expiresIn,
      method: "PUT", headers: { "Content-Type": direct.mimeType, "If-None-Match": "*" },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof TaskAttachmentError ? error.message : "生成R2直传地址失败，请稍后重试";
    return NextResponse.json({ message }, { status: 400 });
  }
}

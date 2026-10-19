import { TaskRecordStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { taskAttachmentMaxBytes } from "@/lib/task-attachment-rules";
import { createStoreTaskDirectUpload, TaskAttachmentError } from "@/lib/task-r2-upload";
import { createTaskRecordEditUploadToken } from "@/lib/task-record-edit-upload-token";
import { canTaskRecord, taskRecordDataScope } from "@/lib/task-records";
import { isStoreTaskSnapshot } from "@/lib/store-h5-tasks";

const inputSchema = z.object({
  itemId: z.string().trim().min(1),
  name: z.string().trim().min(1).max(255),
  type: z.string().trim().min(1).max(100),
  size: z.number().int().positive().max(taskAttachmentMaxBytes("video"), "任务视频不能超过100MB"),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canTaskRecord(session, "edit")) return NextResponse.json({ message: "暂无任务记录编辑权限" }, { status: 403 });
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0].message || "附件参数不正确" }, { status: 400 });
  const { id } = await params;
  try {
    const record = await db.taskRecord.findFirst({
      where: { AND: [{ id }, await taskRecordDataScope(session)] },
      include: {
        task: { select: { r2StorageId: true } },
        aiAnalysis: { select: { id: true } },
        formalSubmission: { include: { items: { where: { id: parsed.data.itemId } } } },
      },
    });
    if (!record) return NextResponse.json({ message: "该任务记录已不存在或无权编辑" }, { status: 404 });
    if (await db.inspectionRectificationRound.findUnique({ where: { taskRecordId: id }, select: { id: true } })) return NextResponse.json({ message: "巡检整改任务须保留原提交照片，不能直接编辑" }, { status: 409 });
    if (record.status !== TaskRecordStatus.COMPLETED || record.aiAnalysis) return NextResponse.json({ message: "仅已完成且尚未智能分析的任务记录支持编辑" }, { status: 409 });
    const item = record.formalSubmission?.items[0];
    if (!record.formalSubmission || !item) return NextResponse.json({ message: "任务提交明细不存在，请刷新后重试" }, { status: 404 });
    if (item.componentType !== "attachment" || (item.dataType !== "photo" && item.dataType !== "video")) {
      return NextResponse.json({ message: "仅任务中的图片和视频附件支持重新上传" }, { status: 400 });
    }
    const snapshot = isStoreTaskSnapshot(record.formalSubmission.configSnapshot) ? record.formalSubmission.configSnapshot : null;
    const r2StorageId = item.r2StorageId || snapshot?.storageSpace?.id || record.task.r2StorageId;
    if (!r2StorageId) return NextResponse.json({ message: "当前任务未配置可用存储空间" }, { status: 409 });
    const direct = await createStoreTaskDirectUpload({
      r2StorageId,
      taskRecordNo: record.formalSubmission.recordNo,
      itemIndex: item.sortOrder,
      dataType: item.dataType,
      file: parsed.data,
    });
    const uploadToken = await createTaskRecordEditUploadToken({
      userId: session.userId,
      taskRecordId: record.id,
      itemId: item.id,
      itemIndex: item.sortOrder,
      r2StorageId,
      objectKey: direct.objectKey,
      originalName: direct.name,
      mimeType: direct.mimeType,
      size: direct.size,
    }, direct.expiresIn);
    return NextResponse.json({
      uploadUrl: direct.uploadUrl,
      uploadToken,
      expiresIn: direct.expiresIn,
      method: "PUT",
      headers: { "Content-Type": direct.mimeType, "If-None-Match": "*" },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof TaskAttachmentError ? error.message : "生成R2直传地址失败，请稍后重试";
    return NextResponse.json({ message }, { status: 400 });
  }
}

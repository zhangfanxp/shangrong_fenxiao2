import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { deleteTaskDraftFiles, TaskAttachmentError } from "@/lib/task-r2-upload";
import { canTaskRecord, taskRecordDataScope } from "@/lib/task-records";

const inputSchema = z.object({ attachmentIds: z.array(z.string().trim().min(1)).min(1).max(100) });

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canTaskRecord(session, "edit")) return NextResponse.json({ message: "暂无任务记录编辑权限" }, { status: 403 });
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "待清理附件参数不正确" }, { status: 400 });
  const { id } = await params;
  try {
    const record = await db.taskRecord.findFirst({ where: { AND: [{ id }, await taskRecordDataScope(session)] }, select: { id: true } });
    if (!record) return NextResponse.json({ message: "该任务记录已不存在或无权操作" }, { status: 404 });
    const drafts = await db.taskAttachment.findMany({
      where: { id: { in: [...new Set(parsed.data.attachmentIds)] }, taskRecordId: id, uploaderUserId: session.userId, consumedAt: null },
      select: { id: true, r2StorageId: true, objectKey: true },
    });
    if (drafts.length) {
      await deleteTaskDraftFiles(drafts);
      await db.taskAttachment.deleteMany({ where: { id: { in: drafts.map(draft => draft.id) }, consumedAt: null } });
    }
    return NextResponse.json({ cleanedCount: drafts.length });
  } catch (error) {
    const message = error instanceof TaskAttachmentError ? error.message : "临时附件清理失败";
    return NextResponse.json({ message }, { status: 500 });
  }
}

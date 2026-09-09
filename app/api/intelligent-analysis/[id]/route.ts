import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { canIntelligentAnalysis, intelligentAnalysisDataScope } from "@/lib/intelligent-analysis";
import { writeOperationLog } from "@/lib/operation-log";
import { createTaskAttachmentReadUrl } from "@/lib/task-r2-upload";
import { formatTaskRecordDateTime } from "@/lib/task-records";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canIntelligentAnalysis(session, "view")) return NextResponse.json({ message: "暂无智能分析查看权限" }, { status: 403 });
  const { id } = await params;
  try {
    const row = await db.taskAiAnalysis.findFirst({
      where: { AND: [{ id }, await intelligentAnalysisDataScope(session)] },
      include: {
        items: { orderBy: { sortOrder: "asc" } },
        taskRecord: {
          select: {
            formalSubmission: {
              select: {
                items: {
                  select: {
                    id: true,
                    dataType: true,
                    attachmentObjectKey: true,
                    attachmentName: true,
                    attachmentMimeType: true,
                    r2StorageId: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!row) return NextResponse.json({ message: "该智能分析记录已不存在或无权查看" }, { status: 404 });
    const submittedItems = new Map((row.taskRecord.formalSubmission?.items || []).map(item => [item.id, item]));
    const items = await Promise.all(row.items.map(async item => {
      const submittedItem = submittedItems.get(item.taskItemIdSnapshot);
      const isPhoto = submittedItem?.dataType === "photo";
      const photoAttachment = isPhoto && submittedItem.attachmentName
        ? {
            name: submittedItem.attachmentName,
            mimeType: submittedItem.attachmentMimeType,
            url: submittedItem.attachmentObjectKey && submittedItem.r2StorageId
              ? await createTaskAttachmentReadUrl({ r2StorageId: submittedItem.r2StorageId, objectKey: submittedItem.attachmentObjectKey }).catch(() => null)
              : null,
          }
        : null;
      return {
        id: item.id,
        taskItemName: item.taskItemNameSnapshot,
        hint: item.hintSnapshot || "-",
        analysisType: item.analysisTypeNameSnapshot,
        analysisPrompt: item.analysisPromptSnapshot,
        analysisResult: item.analysisResult,
        isQualified: item.isQualified,
        unqualifiedReason: item.unqualifiedReason || "-",
        analyzedAt: formatTaskRecordDateTime(item.analyzedAt),
        dataType: submittedItem?.dataType || null,
        photoAttachment,
      };
    }));
    await writeOperationLog({ userId: session.userId, username: session.username, page: "智能分析", action: "查看", result: "成功", detail: `记录编号：${row.recordNo}；任务记录编号：${row.taskRecordNo}`, request }).catch(() => undefined);
    return NextResponse.json({
      summary: {
        id: row.id,
        recordNo: row.recordNo,
        taskName: row.taskNameSnapshot,
        taskRecordNo: row.taskRecordNo,
        brandName: row.brandNameSnapshot,
        storeName: row.storeNameSnapshot,
        executorName: row.executorNameSnapshot,
        taskSubmittedAt: formatTaskRecordDateTime(row.taskSubmittedAt),
        analyzedAt: formatTaskRecordDateTime(row.analyzedAt),
      },
      items,
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch {
    await writeOperationLog({ userId: session.userId, username: session.username, page: "智能分析", action: "查看", result: "失败", detail: `智能分析记录ID：${id}`, request }).catch(() => undefined);
    return NextResponse.json({ message: "智能分析详情加载失败，请稍后重试" }, { status: 500 });
  }
}

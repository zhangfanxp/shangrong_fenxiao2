import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { canIntelligentAnalysis, intelligentAnalysisDataScope } from "@/lib/intelligent-analysis";
import { writeOperationLog, writeOperationLogWithTransaction } from "@/lib/operation-log";
import { createTaskAttachmentReadUrl } from "@/lib/task-r2-upload";
import { formatTaskRecordDateTime } from "@/lib/task-records";

class MissingIntelligentAnalysisError extends Error {}

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

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canIntelligentAnalysis(session, "delete")) return NextResponse.json({ message: "暂无智能分析删除权限" }, { status: 403 });
  const { id } = await params;
  try {
    const scope = await intelligentAnalysisDataScope(session);
    await db.$transaction(async tx => {
      const candidate = await tx.taskAiAnalysis.findFirst({
        where: { AND: [{ id }, scope] },
        select: { taskRecordId: true },
      });
      if (!candidate) throw new MissingIntelligentAnalysisError();

      await tx.$queryRaw(Prisma.sql`SELECT \`id\` FROM \`TaskRecord\` WHERE \`id\` = ${candidate.taskRecordId} FOR UPDATE`);
      const current = await tx.taskAiAnalysis.findFirst({
        where: { AND: [{ id, taskRecordId: candidate.taskRecordId }, scope] },
        select: {
          id: true,
          recordNo: true,
          taskRecordId: true,
          taskRecordNo: true,
          taskNameSnapshot: true,
          taskRecord: { select: { formalSubmission: { select: { id: true } } } },
        },
      });
      if (!current) throw new MissingIntelligentAnalysisError();

      const submissionId = current.taskRecord.formalSubmission?.id;
      if (submissionId) {
        await tx.taskSubmissionItem.updateMany({
          where: { submissionId },
          data: {
            aiAnalysisStatus: null,
            aiAnalysisResult: null,
            aiUnqualifiedReasonDescription: null,
            aiAnalysisFailureReason: null,
            aiAnalyzedAt: null,
            aiAnalyzedByUserId: null,
            aiAnalyzedByName: null,
          },
        });
      }
      const removed = await tx.taskAiAnalysis.deleteMany({ where: { id: current.id, taskRecordId: current.taskRecordId } });
      if (removed.count !== 1) throw new MissingIntelligentAnalysisError();
      await writeOperationLogWithTransaction(tx, {
        userId: session.userId,
        username: session.username,
        page: "智能分析",
        action: "删除",
        result: "成功",
        detail: `智能分析记录编号：${current.recordNo}；任务记录编号：${current.taskRecordNo}；任务名称：${current.taskNameSnapshot}；关联任务记录已恢复为未进行智能分析状态`,
        request,
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 30_000 });
    return NextResponse.json({ message: "智能分析记录删除成功，关联任务记录已恢复为未进行智能分析状态" });
  } catch (error) {
    const missing = error instanceof MissingIntelligentAnalysisError;
    await writeOperationLog({
      userId: session.userId,
      username: session.username,
      page: "智能分析",
      action: "删除",
      result: "失败",
      detail: missing ? `智能分析记录已不存在：${id}` : `智能分析记录删除失败：${id}`,
      request,
    }).catch(() => undefined);
    return NextResponse.json({ message: missing ? "该智能分析记录已不存在或无权删除" : "智能分析记录删除失败，请稍后重试" }, { status: missing ? 404 : 500 });
  }
}

import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { writeOperationLog, writeOperationLogWithTransaction } from "@/lib/operation-log";
import { canTaskRecord, taskRecordDataScope } from "@/lib/task-records";

const batchDeleteSchema = z.object({
  taskInstanceIds: z.array(z.string().trim().min(1)).min(1, "请先勾选需要删除的任务记录").max(1000, "单次最多删除1000条任务记录"),
});

class BatchDeleteError extends Error {
  constructor(message: string, readonly status = 409) {
    super(message);
  }
}

export async function DELETE(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canTaskRecord(session, "delete")) return NextResponse.json({ message: "暂无任务记录删除权限" }, { status: 403 });

  const parsed = batchDeleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0].message }, { status: 400 });

  const taskInstanceIds = [...new Set(parsed.data.taskInstanceIds)];
  const scope = await taskRecordDataScope(session);
  try {
    const result = await db.$transaction(async tx => {
      await tx.$queryRaw(Prisma.sql`
        SELECT \`id\`
        FROM \`TaskRecord\`
        WHERE \`id\` IN (${Prisma.join(taskInstanceIds)})
        FOR UPDATE
      `);
      const records = await tx.taskRecord.findMany({
        where: { AND: [{ id: { in: taskInstanceIds } }, scope] },
        include: {
          rectificationRound: { select: { id: true } },
          formalSubmission: { select: { id: true, recordNo: true } },
          aiAnalysis: { select: { recordNo: true } },
        },
      });
      if (records.length !== taskInstanceIds.length) {
        throw new BatchDeleteError("部分任务记录已不存在或不在当前权限范围内，请刷新列表后重试", 404);
      }

      const protectedRecords = records.filter(record => record.rectificationRound);
      if (protectedRecords.length) {
        throw new BatchDeleteError(`所选记录中有${protectedRecords.length}条巡检整改任务须保留历史，请取消勾选后重试`);
      }

      const submissionIds = records.flatMap(record => record.formalSubmission ? [record.formalSubmission.id] : []);
      if (submissionIds.length) {
        await tx.taskSubmissionItem.deleteMany({ where: { submissionId: { in: submissionIds } } });
        await tx.taskSubmission.deleteMany({ where: { id: { in: submissionIds } } });
      }
      await tx.taskAttachment.deleteMany({ where: { taskRecordId: { in: taskInstanceIds } } });
      const removed = await tx.taskRecord.deleteMany({ where: { AND: [{ id: { in: taskInstanceIds } }, scope] } });
      if (removed.count !== taskInstanceIds.length) {
        throw new BatchDeleteError("部分任务记录状态已发生变化，本次未删除任何记录，请刷新列表后重试");
      }

      const recordNos = records.map(record => record.formalSubmission?.recordNo || record.id);
      const visibleRecordNos = recordNos.slice(0, 50).join("、");
      const hiddenCount = Math.max(0, recordNos.length - 50);
      const aiAnalysisCount = records.filter(record => record.aiAnalysis).length;
      await writeOperationLogWithTransaction(tx, {
        userId: session.userId,
        username: session.username,
        page: "任务记录",
        action: "批量删除",
        result: "成功",
        detail: `批量删除任务记录：${removed.count}条；记录编号：${visibleRecordNos}${hiddenCount ? `等共${recordNos.length}条` : ""}；同步删除智能分析记录：${aiAnalysisCount}条；R2附件对象保留`,
        request,
      });
      return { deletedCount: removed.count, aiAnalysisCount };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 30_000 });

    return NextResponse.json({
      message: `已成功删除${result.deletedCount}条任务记录`,
      deletedCount: result.deletedCount,
      deletedAiAnalysisCount: result.aiAnalysisCount,
    });
  } catch (error) {
    const known = error instanceof BatchDeleteError;
    const message = known ? error.message : "任务记录批量删除失败，请稍后重试";
    await writeOperationLog({
      userId: session.userId,
      username: session.username,
      page: "任务记录",
      action: "批量删除",
      result: "失败",
      detail: `选中任务记录：${taskInstanceIds.length}条；${message}`,
      request,
    }).catch(() => undefined);
    return NextResponse.json({ message }, { status: known ? error.status : 500 });
  }
}

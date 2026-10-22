import { availableMobileTaskWhere } from "@/lib/mobile-task-availability";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";
import { getMobileH5TaskSession, mobileH5TaskChannel, mobileH5UnauthorizedMessage } from "@/lib/mobile-h5-task-session";
import { isStoreTaskSnapshot } from "@/lib/store-h5-tasks";
import { taskInputValueError } from "@/lib/task-input-values";
import { claimSharedTaskRecord, taskRecordEditorWhere, taskRecordParticipantWhere } from "@/lib/task-record-access";

const bodySchema = z.object({
  items: z.array(z.object({
    index: z.number().int().min(0),
    value: z.union([z.string(), z.number()]),
  })).max(200),
  fallbackItemIndexes: z.array(z.number().int().min(0)).max(200),
});

class DraftError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

export async function POST(request: Request, { params }: { params: Promise<{ taskInstanceId: string }> }) {
  const channel = mobileH5TaskChannel(request);
  const session = await getMobileH5TaskSession(request, "submit");
  if (!session) return NextResponse.json({ message: mobileH5UnauthorizedMessage(channel) }, { status: 401 });
  const { taskInstanceId } = await params;
  try {
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new DraftError("暂存内容格式不正确");
    const record = await db.taskRecord.findFirst({
      where: { id: taskInstanceId, AND: [taskRecordParticipantWhere(session.userId), availableMobileTaskWhere()] },
      select: { id: true, recordNo: true, configSnapshot: true, sharedExecution: true, editOwnerUserId: true, editOwnerNameSnapshot: true },
    });
    if (!record) throw new DraftError("任务不存在、已完成、已逾期或不属于当前用户", 404);
    if (record.sharedExecution && record.editOwnerUserId && record.editOwnerUserId !== session.userId) throw new DraftError(`${record.editOwnerNameSnapshot || "其他执行人"}已开始执行，当前只能查看`, 409);
    if (!isStoreTaskSnapshot(record.configSnapshot)) throw new DraftError("任务配置快照异常，请联系系统管理员", 500);

    const values = new Map<number, string | number>();
    for (const submitted of parsed.data.items) {
      if (values.has(submitted.index)) throw new DraftError("暂存内容存在重复项目");
      const item = record.configSnapshot.submitItems[submitted.index];
      if (!item || item.component === "attachment") throw new DraftError("暂存内容包含无效任务项");
      const inputError = item.component === "input" ? taskInputValueError(item, submitted.value) : null;
      if (inputError) throw new DraftError(inputError);
      if (item.component === "select" && String(submitted.value).trim() && !item.options.includes(String(submitted.value).trim())) throw new DraftError(`“${item.name}”选项无效，请重新选择`);
      values.set(submitted.index, submitted.value);
    }
    const fallbackItemIndexes = [...new Set(parsed.data.fallbackItemIndexes)];
    for (const index of fallbackItemIndexes) {
      const item = record.configSnapshot.submitItems[index];
      if (!item || item.component !== "attachment" || !item.captureOnly || !["photo", "video"].includes(item.dataType || "")) throw new DraftError("相册补传项目无效");
    }

    const now = new Date();
    const updated = await db.$transaction(async tx => {
      const editable = await claimSharedTaskRecord(tx, record.id, session.userId, session.realName, now);
      if (!editable) return { count: 0 };
      return tx.taskRecord.updateMany({
        where: { id: record.id, AND: [taskRecordEditorWhere(session.userId), availableMobileTaskWhere(now)] },
        data: {
          draftValues: [...values].map(([index, value]) => ({ index, value })) as Prisma.InputJsonValue,
          draftCaptureFallbacks: fallbackItemIndexes as Prisma.InputJsonValue,
          draftSavedAt: now,
        },
      });
    });
    if (updated.count !== 1) throw new DraftError("任务已完成或已逾期，无法继续暂存", 409);
    await writeOperationLog({ userId: session.userId, username: session.username, client: session.clientName, page: "任务详情", action: "暂存", result: "成功", detail: `任务实例：${record.recordNo || record.id}`, request }).catch(() => undefined);
    return NextResponse.json({ message: "任务已暂存", savedAt: now.toISOString() });
  } catch (error) {
    const message = error instanceof DraftError ? error.message : "任务暂存失败，请稍后重试";
    const status = error instanceof DraftError ? error.status : 500;
    await writeOperationLog({ userId: session.userId, username: session.username, client: session.clientName, page: "任务详情", action: "暂存", result: "失败", detail: message, request }).catch(() => undefined);
    return NextResponse.json({ message }, { status });
  }
}

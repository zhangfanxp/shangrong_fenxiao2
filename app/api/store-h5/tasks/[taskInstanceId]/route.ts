import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";
import { getMobileH5TaskSession, mobileH5TaskChannel, mobileH5UnauthorizedMessage } from "@/lib/mobile-h5-task-session";
import { dateKeyAsDbDate, isStoreTaskSnapshot, shanghaiDateKey, taskTypeLabel } from "@/lib/store-h5-tasks";

export async function GET(request: Request, { params }: { params: Promise<{ taskInstanceId: string }> }) {
  const channel = mobileH5TaskChannel(request);
  const session = await getMobileH5TaskSession(request, "view");
  if (!session) return NextResponse.json({ message: mobileH5UnauthorizedMessage(channel) }, { status: 401 });
  const { taskInstanceId } = await params;
  const record = await db.taskRecord.findFirst({
    where: { id: taskInstanceId, assignedUserId: session.userId, dueDate: { gte: new Date() } },
    select: { id: true, recordNo: true, taskNameSnapshot: true, taskType: true, targetType: true, targetPersonnelNameSnapshot: true, targetPersonnelPositionSnapshot: true, storeNameSnapshot: true, brandNameSnapshot: true, executionDate: true, dueDate: true, status: true, configVersion: true, configSnapshot: true, draftValues: true, draftCaptureFallbacks: true, draftSavedAt: true, attachments: { where: { uploaderUserId: session.userId, consumedAt: null }, select: { id: true, itemIndex: true, originalName: true }, orderBy: { createdAt: "asc" } } },
  });
  if (!record) return NextResponse.json({ message: "任务不存在或不属于当前用户" }, { status: 404 });
  if (record.status !== "PENDING") return NextResponse.json({ message: "当前任务已经完成，请勿重复提交。" }, { status: 409 });
  if (!isStoreTaskSnapshot(record.configSnapshot)) return NextResponse.json({ message: "任务内容加载失败，请联系系统管理员" }, { status: 500 });
  await writeOperationLog({ userId: session.userId, username: session.username, client: session.clientName, page: "任务详情", action: "打开", result: "成功", detail: `任务实例：${record.recordNo || record.id}`, request }).catch(() => undefined);
  return NextResponse.json({
    id: record.id, recordNo: record.recordNo, taskName: record.taskNameSnapshot || record.configSnapshot.taskName,
    taskType: record.taskType, taskTypeLabel: taskTypeLabel(record.taskType), storeName: record.storeNameSnapshot,
    brandName: record.brandNameSnapshot, executionDate: record.executionDate, dueDate: record.dueDate, configVersion: record.configVersion,
    targetType: record.targetType, targetPersonnelName: record.targetPersonnelNameSnapshot, targetPersonnelPosition: record.targetPersonnelPositionSnapshot,
    items: record.configSnapshot.submitItems,
    draftAttachments: record.attachments.map(attachment => ({ id: attachment.id, itemIndex: attachment.itemIndex, name: attachment.originalName })),
    draft: record.draftSavedAt ? { values: record.draftValues, fallbackItemIndexes: record.draftCaptureFallbacks, savedAt: record.draftSavedAt } : null,
  });
}

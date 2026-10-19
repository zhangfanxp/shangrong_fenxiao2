import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { availableMobileTaskWhere } from "@/lib/mobile-task-availability";
import { writeOperationLog } from "@/lib/operation-log";
import { getMobileH5TaskSession, mobileH5TaskChannel, mobileH5UnauthorizedMessage } from "@/lib/mobile-h5-task-session";
import { dateKeyAsDbDate, expireOverdueTaskInstances, shanghaiDateKey, taskTypeLabel } from "@/lib/store-h5-tasks";

export async function GET(request: Request) {
  const channel = mobileH5TaskChannel(request);
  const session = await getMobileH5TaskSession(request, "query");
  if (!session) return NextResponse.json({ message: mobileH5UnauthorizedMessage(channel) }, { status: 401 });
  try {
    const today = shanghaiDateKey();
    const now = new Date();
    await expireOverdueTaskInstances(now);
    const rows = await db.taskRecord.findMany({
      where: { assignedUserId: session.userId, ...availableMobileTaskWhere(now) },
      select: { id: true, recordNo: true, taskNameSnapshot: true, taskType: true, targetType: true, targetPersonnelNameSnapshot: true, targetPersonnelPositionSnapshot: true, triggeredAt: true, dueDate: true, storeNameSnapshot: true },
      orderBy: [{ triggeredAt: "asc" }, { id: "asc" }],
    });
    await writeOperationLog({ userId: session.userId, username: session.username, client: session.clientName, page: "待完成任务", action: "打开", result: "成功", detail: `今日待办：${rows.length}项`, request }).catch(() => undefined);
    return NextResponse.json({ date: today, rows: rows.map(row => ({ ...row, taskName: row.taskNameSnapshot || "未命名任务", taskTypeLabel: taskTypeLabel(row.taskType), targetPersonnelName: row.targetPersonnelNameSnapshot, targetPersonnelPosition: row.targetPersonnelPositionSnapshot })) });
  } catch {
    return NextResponse.json({ message: "任务数据加载失败，请稍后重试" }, { status: 500 });
  }
}

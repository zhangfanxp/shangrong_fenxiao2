import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";
import { getStoreH5Session } from "@/lib/store-h5-auth";
import { dateKeyAsDbDate, expireOverdueTaskInstances, shanghaiDateKey, taskTypeLabel } from "@/lib/store-h5-tasks";

export async function GET(request: Request) {
  const session = await getStoreH5Session();
  if (!session) return NextResponse.json({ message: "当前账号已无门店H5使用权限，请重新登录或联系管理员" }, { status: 401 });
  try {
    const today = shanghaiDateKey();
    const now = new Date();
    await expireOverdueTaskInstances(now);
    const rows = await db.taskRecord.findMany({
      where: { assignedUserId: session.userId, status: "PENDING", dueDate: { gte: now } },
      select: { id: true, recordNo: true, taskNameSnapshot: true, taskType: true, triggeredAt: true, dueDate: true, storeNameSnapshot: true },
      orderBy: [{ triggeredAt: "asc" }, { id: "asc" }],
    });
    await writeOperationLog({ userId: session.userId, username: session.username, client: "门店员工移动端", page: "待完成任务", action: "打开", result: "成功", detail: `今日待办：${rows.length}项`, request }).catch(() => undefined);
    return NextResponse.json({ date: today, rows: rows.map(row => ({ ...row, taskName: row.taskNameSnapshot || "未命名任务", taskTypeLabel: taskTypeLabel(row.taskType) })) });
  } catch {
    return NextResponse.json({ message: "任务数据加载失败，请稍后重试" }, { status: 500 });
  }
}

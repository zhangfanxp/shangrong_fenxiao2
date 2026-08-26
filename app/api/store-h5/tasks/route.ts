import { TaskRecordStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";
import { getStoreH5Session } from "@/lib/store-h5-auth";
import { expireOverdueTaskInstances, shanghaiDateKey, taskTypeLabel } from "@/lib/store-h5-tasks";

export async function GET(request: Request) {
  const session = await getStoreH5Session();
  if (!session) return NextResponse.json({ message: "当前账号已无门店H5使用权限，请重新登录或联系管理员" }, { status: 401 });
  const url = new URL(request.url);
  const requestedStatus = url.searchParams.get("status");
  const status = requestedStatus === "completed" ? TaskRecordStatus.COMPLETED : requestedStatus === "overdue" ? TaskRecordStatus.OVERDUE : TaskRecordStatus.PENDING;
  const statusKey = status === TaskRecordStatus.COMPLETED ? "completed" : status === TaskRecordStatus.OVERDUE ? "overdue" : "pending";
  const requestedStoreId = url.searchParams.get("storeId") || "";
  const store = session.stores.find(item => item.id === requestedStoreId) || session.stores[0];
  if (!store) return NextResponse.json({ date: shanghaiDateKey(), status: statusKey, stores: [], selectedStoreId: null, rows: [] });
  try {
    const now = new Date();
    await expireOverdueTaskInstances(now);
    const rows = await db.taskRecord.findMany({
      where: {
        assignedUserId: session.userId,
        storeId: store.id,
        status,
        ...(status === TaskRecordStatus.PENDING ? { dueDate: { gte: now } } : {}),
      },
      select: { id: true, recordNo: true, taskNameSnapshot: true, taskType: true, triggeredAt: true, dueDate: true, completedAt: true, executionDate: true, storeNameSnapshot: true },
      orderBy: status === TaskRecordStatus.PENDING ? [{ dueDate: "asc" }, { id: "asc" }] : status === TaskRecordStatus.COMPLETED ? [{ completedAt: "desc" }, { id: "desc" }] : [{ dueDate: "desc" }, { id: "desc" }],
      take: 200,
    });
    const statusLabel = status === TaskRecordStatus.COMPLETED ? "已完成" : status === TaskRecordStatus.OVERDUE ? "已逾期" : "待完成";
    await writeOperationLog({ userId: session.userId, username: session.username, client: "门店员工移动端", page: `${statusLabel}任务`, action: "打开", result: "成功", detail: `门店：${store.name}；数量：${rows.length}`, request }).catch(() => undefined);
    return NextResponse.json({
      date: shanghaiDateKey(), status: statusKey,
      stores: session.stores, selectedStoreId: store.id,
      rows: rows.map(row => ({ ...row, taskName: row.taskNameSnapshot || "未命名任务", taskTypeLabel: taskTypeLabel(row.taskType) })),
    });
  } catch {
    return NextResponse.json({ message: "任务数据加载失败，请稍后重试" }, { status: 500 });
  }
}

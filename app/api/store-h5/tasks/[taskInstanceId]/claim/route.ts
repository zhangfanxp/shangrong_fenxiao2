import { availableMobileTaskWhere } from "@/lib/mobile-task-availability";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getMobileH5TaskSession, mobileH5TaskChannel, mobileH5UnauthorizedMessage } from "@/lib/mobile-h5-task-session";
import { writeOperationLog } from "@/lib/operation-log";
import { claimSharedTaskRecord, taskRecordParticipantWhere } from "@/lib/task-record-access";

export async function POST(request: Request, { params }: { params: Promise<{ taskInstanceId: string }> }) {
  const channel = mobileH5TaskChannel(request);
  const session = await getMobileH5TaskSession(request, "submit");
  if (!session) return NextResponse.json({ message: mobileH5UnauthorizedMessage(channel) }, { status: 401 });
  const { taskInstanceId } = await params;
  const now = new Date();
  try {
    const record = await db.$transaction(async tx => {
      const record = await tx.taskRecord.findFirst({
        where: { id: taskInstanceId, AND: [taskRecordParticipantWhere(session.userId), availableMobileTaskWhere(now)] },
        select: { id: true, recordNo: true },
      });
      if (!record || !await claimSharedTaskRecord(tx, record.id, session.userId, session.realName, now)) return null;
      return record;
    });
    if (!record) return NextResponse.json({ message: "任务已由其他执行人开始处理，或已完成/逾期，请刷新后查看" }, { status: 409 });
    await writeOperationLog({ userId: session.userId, username: session.username, client: session.clientName, page: "任务详情", action: "开始执行", result: "成功", detail: `任务实例：${record.recordNo || record.id}`, request }).catch(() => undefined);
    return NextResponse.json({ message: "已取得该任务的执行权限" });
  } catch {
    return NextResponse.json({ message: "开始执行失败，请稍后重试" }, { status: 500 });
  }
}

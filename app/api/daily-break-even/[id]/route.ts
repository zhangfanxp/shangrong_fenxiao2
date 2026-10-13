import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import {
  DailyBreakEvenError,
  canDailyBreakEven,
  dailyBreakEvenDataScope,
  dailyBreakEvenSelect,
  dailyBreakEvenSourceWhere,
  loadDailyBreakEvenSource,
  serializeDailyBreakEven,
} from "@/lib/daily-break-even";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canDailyBreakEven(session, "view")) return NextResponse.json({ message: "暂无每日保本营业额查看权限" }, { status: 403 });
  const id = (await params).id;
  try {
    const source = await loadDailyBreakEvenSource();
    const row = await db.taskSubmission.findFirst({
      where: { AND: [{ id }, dailyBreakEvenSourceWhere(source), await dailyBreakEvenDataScope(session)] },
      select: dailyBreakEvenSelect(source),
    });
    if (!row) return NextResponse.json({ message: "每日保本营业额记录不存在或无权查看" }, { status: 404 });
    const detail = serializeDailyBreakEven(row, source);
    await writeOperationLog({
      userId: session.userId,
      username: session.username,
      client: "运营PC端",
      page: "每日保本营业额",
      action: "查看",
      result: "成功",
      detail: `任务记录编号：${detail.taskRecordNo}`,
      request,
    }).catch(() => undefined);
    return NextResponse.json({ detail }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    const message = error instanceof DailyBreakEvenError ? error.message : "每日保本营业额详情加载失败，请稍后重试";
    const status = error instanceof DailyBreakEvenError ? error.status : 500;
    await writeOperationLog({ userId: session.userId, username: session.username, client: "运营PC端", page: "每日保本营业额", action: "查看", result: "失败", detail: `记录ID：${id}；${message}`, request }).catch(() => undefined);
    return NextResponse.json({ message }, { status });
  }
}

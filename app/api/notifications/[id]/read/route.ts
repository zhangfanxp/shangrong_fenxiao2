import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { markNotificationRead } from "@/lib/notifications";
import { writeOperationLog } from "@/lib/operation-log";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  const { id } = await params;
  if (!id || !await markNotificationRead(session.userId, id)) return NextResponse.json({ message: "通知不存在、已停止或已无权查看" }, { status: 404 });
  await writeOperationLog({ userId: session.userId, username: session.username, page: "我的通知", action: "查看通知", result: "成功", detail: `通知ID：${id}`, request }).catch(() => undefined);
  return NextResponse.json({ read: true });
}

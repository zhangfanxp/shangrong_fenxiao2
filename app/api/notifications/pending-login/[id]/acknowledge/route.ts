import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { acknowledgeLoginNotification } from "@/lib/notifications";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  const { id } = await params;
  if (!id || !await acknowledgeLoginNotification(session.userId, id)) return NextResponse.json({ message: "通知不存在、尚未发布或已无权操作" }, { status: 404 });
  return NextResponse.json({ acknowledged: true });
}

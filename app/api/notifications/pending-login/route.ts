import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { pendingLoginNotifications } from "@/lib/notifications";

export async function GET() {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  return NextResponse.json({ rows: await pendingLoginNotifications(session.userId) }, { headers: { "Cache-Control": "no-store" } });
}

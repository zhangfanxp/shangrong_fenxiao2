import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { currentUserNotifications } from "@/lib/notifications";

export async function GET(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(10, Number(url.searchParams.get("pageSize")) || 20));
  return NextResponse.json(await currentUserNotifications(session.userId, page, pageSize), { headers: { "Cache-Control": "no-store" } });
}

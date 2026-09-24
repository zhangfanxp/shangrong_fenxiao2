import { NextResponse } from "next/server";
import { getMobileH5TaskSession, mobileH5TaskChannel, mobileH5UnauthorizedMessage } from "@/lib/mobile-h5-task-session";
import { countPendingStoreTaskInstances } from "@/lib/store-h5-tasks";

export async function GET(request: Request) {
  const channel = mobileH5TaskChannel(request);
  const session = await getMobileH5TaskSession(request, "query");
  if (!session) return NextResponse.json({ message: mobileH5UnauthorizedMessage(channel) }, { status: 401 });
  try {
    const count = await countPendingStoreTaskInstances(session.userId);
    return NextResponse.json({ count }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ message: "待完成任务数量加载失败，请稍后重试" }, { status: 500 });
  }
}

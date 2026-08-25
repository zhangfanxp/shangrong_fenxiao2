import { NextResponse } from "next/server";
import { publishDueNotifications } from "@/lib/notifications";

export async function POST(request: Request) {
  const configuredSecret = process.env.NOTIFICATION_SCHEDULER_SECRET || process.env.TASK_SCHEDULER_SECRET;
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!configuredSecret || bearer !== configuredSecret) return NextResponse.json({ message: "定时任务认证失败" }, { status: 401 });
  try {
    return NextResponse.json(await publishDueNotifications());
  } catch {
    return NextResponse.json({ message: "通知定时发布失败，调度器将在下次执行时重试" }, { status: 500 });
  }
}

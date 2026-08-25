import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { writeOperationLog } from "@/lib/operation-log";
import { canPublishNotification, createNotification, formatShanghaiDateTime } from "@/lib/notifications";

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canPublishNotification(session, "save")) return NextResponse.json({ message: "暂无发布通知保存权限" }, { status: 403 });
  try {
    const result = await createNotification(session, await request.json().catch(() => null), request);
    if (!result.ok) return NextResponse.json({ message: result.message }, { status: result.status });
    return NextResponse.json({
      id: result.notification.id,
      recordNo: result.notification.recordNo,
      releaseAt: result.notification.releaseAt,
      createdAt: result.notification.createdAt,
      createdAtText: formatShanghaiDateTime(result.notification.createdAt),
      createdByName: result.notification.createdByName,
      duplicate: result.duplicate,
    }, { status: result.duplicate ? 200 : 201 });
  } catch {
    await writeOperationLog({ userId: session.userId, username: session.username, page: "发布通知", action: "保存", result: "失败", detail: "通知保存失败", request }).catch(() => undefined);
    return NextResponse.json({ message: "通知保存失败，请稍后重试" }, { status: 500 });
  }
}

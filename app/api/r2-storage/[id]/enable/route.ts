import { RecordStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";
import { r2ErrorResponse } from "@/lib/r2-api";
import { changeR2Status } from "@/lib/r2-config-service";
import { canR2Storage } from "@/lib/r2-permissions";
import { versionedActionSchema } from "@/lib/r2-validation";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canR2Storage(session, "enable")) return NextResponse.json({ message: "暂无此操作权限" }, { status: 403 });
  const parsed = versionedActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "请求参数无效，请刷新后重试" }, { status: 400 });
  const { id } = await params;
  try {
    const row = await changeR2Status(id, RecordStatus.ENABLED, parsed.data.updatedAt);
    await writeOperationLog({ userId: session.userId, username: session.username, page: "R2存储空间", action: "启用", result: "成功", detail: `启用R2存储空间：${row.recordNo}`, request }).catch(() => undefined);
    return NextResponse.json({ message: "R2存储空间启用成功" });
  } catch (error) {
    await writeOperationLog({ userId: session.userId, username: session.username, page: "R2存储空间", action: "启用", result: "失败", detail: "R2存储空间启用失败", request }).catch(() => undefined);
    return r2ErrorResponse(error, "R2存储空间启用失败，请稍后重试");
  }
}

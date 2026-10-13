import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  canLaborRecord,
  laborRecordDataScope,
  laborRecordDetailSelect,
  serializeLaborRecordDetail,
} from "@/lib/labor-records";
import { writeOperationLog } from "@/lib/operation-log";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canLaborRecord(session, "view")) return NextResponse.json({ message: "暂无用工记录查看权限" }, { status: 403 });
  const { id } = await context.params;
  try {
    const row = await db.storeLaborRecord.findFirst({
      where: { AND: [{ id }, await laborRecordDataScope(session)] },
      select: laborRecordDetailSelect,
    });
    if (!row) return NextResponse.json({ message: "用工记录不存在或无权查看" }, { status: 404 });
    await writeOperationLog({
      userId: session.userId,
      username: session.username,
      client: "运营PC端",
      page: "用工记录",
      action: "查看",
      result: "成功",
      detail: `门店：${row.storeNameSnapshot}；日期：${row.businessDate.toISOString().slice(0, 10)}`,
      request,
    }).catch(() => undefined);
    return NextResponse.json(serializeLaborRecordDetail(row), { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "用工考勤详情加载失败";
    await writeOperationLog({
      userId: session.userId,
      username: session.username,
      client: "运营PC端",
      page: "用工记录",
      action: "查看",
      result: "失败",
      detail: `记录ID：${id}；${detail}`,
      request,
    }).catch(() => undefined);
    return NextResponse.json({ message: "用工考勤详情加载失败，请稍后重试" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { canLaborCost, laborCostDataScope, laborCostRecordSelect, serializeLaborCostDetail } from "@/lib/labor-costs";
import { writeOperationLog } from "@/lib/operation-log";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canLaborCost(session, "view")) return NextResponse.json({ message: "暂无人力成本查看权限" }, { status: 403 });
  const { id } = await context.params;
  try {
    const row = await db.dailyAttendanceRecord.findFirst({
      where: { AND: [{ id }, await laborCostDataScope(session)] },
      select: laborCostRecordSelect,
    });
    if (!row) return NextResponse.json({ message: "人力成本记录不存在或无权查看" }, { status: 404 });
    await writeOperationLog({ userId: session.userId, username: session.username, client: "运营PC端", page: "人力成本", action: "查看", result: "成功", detail: `记录编号：${row.recordNo}`, request }).catch(() => undefined);
    return NextResponse.json(serializeLaborCostDetail(row), { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch {
    await writeOperationLog({ userId: session.userId, username: session.username, client: "运营PC端", page: "人力成本", action: "查看", result: "失败", detail: `记录ID：${id}；人力成本详情加载失败`, request }).catch(() => undefined);
    return NextResponse.json({ message: "人力成本详情加载失败，请稍后重试" }, { status: 500 });
  }
}

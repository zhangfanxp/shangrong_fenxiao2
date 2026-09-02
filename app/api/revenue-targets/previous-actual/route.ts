import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { actualRevenueDataScope } from "@/lib/actual-revenue";
import { db } from "@/lib/db";
import { canRevenueTarget, previousMonth } from "@/lib/revenue-targets";

export async function GET(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canRevenueTarget(session, "create")) return NextResponse.json({ message: "暂无目标营业额新增权限" }, { status: 403 });
  const search = new URL(request.url).searchParams;
  const storeId = search.get("storeId")?.trim() || "";
  const targetMonth = search.get("targetMonth")?.trim() || "";
  if (!storeId) return NextResponse.json({ message: "请选择系统中的正式门店记录" }, { status: 400 });
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(targetMonth)) return NextResponse.json({ message: "请选择所属月份" }, { status: 400 });
  try {
    const actualMonth = previousMonth(targetMonth);
    const actual = await db.actualRevenueMonthly.findFirst({
      where: { AND: [{ storeId, statMonth: actualMonth }, await actualRevenueDataScope(session)] },
      select: { id: true, monthlyRevenue: true, monthlyTarget: { select: { id: true, targetMonth: true } } },
    });
    return NextResponse.json(actual ? {
      exists: true,
      actualMonth,
      actualRevenue: actual.monthlyRevenue.toFixed(2),
      actualRevenueRecordId: actual.id,
      targetExists: Boolean(actual.monthlyTarget),
    } : { exists: false, actualMonth, actualRevenue: null, actualRevenueRecordId: null, targetExists: false });
  } catch {
    return NextResponse.json({ message: "上月实际营业额查询失败，请稍后重试" }, { status: 500 });
  }
}

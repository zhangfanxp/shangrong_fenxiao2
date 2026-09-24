import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  MONTHLY_PURCHASE_SALES_YEAR_MAX, MONTHLY_PURCHASE_SALES_YEAR_MIN,
  canMonthlyPurchaseSales, monthlyPurchaseSalesStoreScope,
} from "@/lib/monthly-purchase-sales-ratios";

export async function GET(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canMonthlyPurchaseSales(session, "query") && !canMonthlyPurchaseSales(session, "create")) return NextResponse.json({ message: "暂无门店月份查询权限" }, { status: 403 });
  const search = new URL(request.url).searchParams;
  const aliasId = search.get("aliasId")?.trim() || "";
  const year = Number(search.get("year"));
  if (!aliasId) return NextResponse.json({ message: "请选择系统中已配置的美团管家门店别名" }, { status: 400 });
  if (!Number.isInteger(year) || year < MONTHLY_PURCHASE_SALES_YEAR_MIN || year > MONTHLY_PURCHASE_SALES_YEAR_MAX) return NextResponse.json({ message: "请输入2026-2999之间的四位年份" }, { status: 400 });
  try {
    const store = await db.store.findFirst({
      where: { AND: [await monthlyPurchaseSalesStoreScope(session), { id: aliasId, meituanManagerName: { not: null } }] },
      select: {
        id: true,
        monthlyPurchaseSalesRatios: { where: { year }, select: { month: true }, orderBy: { month: "asc" } },
      },
    });
    if (!store) return NextResponse.json({ message: "当前门店别名不存在或无权访问" }, { status: 404 });
    return NextResponse.json({ aliasId, year, unavailableMonths: store.monthlyPurchaseSalesRatios.map(row => row.month) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ message: "门店已占用月份加载失败，请稍后重试" }, { status: 500 });
  }
}

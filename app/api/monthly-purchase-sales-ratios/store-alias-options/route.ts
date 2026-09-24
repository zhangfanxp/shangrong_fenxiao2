import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { canMonthlyPurchaseSales, monthlyPurchaseSalesStoreScope } from "@/lib/monthly-purchase-sales-ratios";

export async function GET(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canMonthlyPurchaseSales(session, "query") && !canMonthlyPurchaseSales(session, "create")) return NextResponse.json({ message: "暂无门店别名查询权限" }, { status: 403 });
  const keyword = new URL(request.url).searchParams.get("keyword")?.trim().slice(0, 50) || "";
  try {
    const rows = await db.store.findMany({
      where: { AND: [await monthlyPurchaseSalesStoreScope(session), { meituanManagerName: { not: null, ...(keyword ? { contains: keyword } : {}) } }] },
      select: { id: true, name: true, meituanManagerName: true, brand: { select: { code: true, name: true } } },
      orderBy: [{ meituanManagerName: "asc" }, { name: "asc" }],
      take: 50,
    });
    return NextResponse.json(rows.flatMap(row => row.meituanManagerName ? [{ aliasId: row.id, aliasName: row.meituanManagerName, storeId: row.id, storeName: row.name, brandCode: row.brand.code, brandName: row.brand.name }] : []), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ message: "门店别名数据加载失败，请稍后重试" }, { status: 500 });
  }
}

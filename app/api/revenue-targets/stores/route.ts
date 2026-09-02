import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { actualRevenueStoreScope } from "@/lib/actual-revenue";
import { db } from "@/lib/db";
import { canRevenueTarget } from "@/lib/revenue-targets";

export async function GET(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canRevenueTarget(session, "create")) return NextResponse.json({ message: "暂无目标营业额新增权限" }, { status: 403 });
  const search = new URL(request.url).searchParams;
  const brand = search.get("brand")?.trim().slice(0, 100) || "";
  const keyword = search.get("keyword")?.trim().slice(0, 100) || "";
  try {
    const scope = await actualRevenueStoreScope(session);
    const stores = await db.store.findMany({
      where: {
        AND: [
          scope,
          { brand: { status: "ENABLED", ...(brand ? { OR: [{ id: brand }, { code: brand }, { name: brand }] } : {}) } },
          ...(keyword ? [{ name: { contains: keyword } }] : []),
        ],
      },
      select: { id: true, name: true, region: true, brand: { select: { id: true, code: true, name: true } } },
      orderBy: [{ name: "asc" }],
      take: 30,
    });
    return NextResponse.json(stores.map(store => ({
      storeId: store.id,
      storeName: store.name,
      brandId: store.brand.id,
      brandCode: store.brand.code,
      brandName: store.brand.name,
      regionName: store.region || "-",
    })));
  } catch {
    return NextResponse.json({ message: "门店数据加载失败，请稍后重试" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { canStoreResearch, researchStoreDataScope } from "@/lib/store-research-records";

export async function GET(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canStoreResearch(session, "query")) return NextResponse.json({ message: "暂无巡店调研表查询权限" }, { status: 403 });
  const search = new URL(request.url).searchParams;
  const keyword = search.get("keyword")?.trim().slice(0, 50) || "";
  const brand = search.get("brand")?.trim() || "";
  try {
    const rows = await db.store.findMany({
      where: {
        ...(await researchStoreDataScope(session)),
        operationStatus: { not: "CLOSED" },
        ...(keyword ? { name: { contains: keyword } } : {}),
        ...(brand ? { brand: { OR: [{ id: brand }, { code: brand }, { name: brand }], status: "ENABLED" } } : { brand: { status: "ENABLED" } }),
      },
      select: { id: true, name: true, brand: { select: { id: true, name: true } } },
      orderBy: [{ name: "asc" }],
      take: 30,
    });
    return NextResponse.json(rows.map(row => ({ storeId: row.id, storeName: row.name, brandId: row.brand.id, brandName: row.brand.name })));
  } catch {
    return NextResponse.json({ message: "门店数据加载失败，请稍后重试" }, { status: 500 });
  }
}

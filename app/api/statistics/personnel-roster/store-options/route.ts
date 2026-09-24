import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { canPersonnelRoster, personnelRosterStoreScope } from "@/lib/personnel-roster";

export async function GET(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canPersonnelRoster(session, "query")) return NextResponse.json({ message: "暂无花名册查询权限" }, { status: 403 });
  const search = new URL(request.url).searchParams;
  const brandCode = search.get("brandCode")?.trim().slice(0, 100) || "";
  const keyword = search.get("keyword")?.trim().slice(0, 100) || "";
  try {
    const rows = await db.store.findMany({
      where: {
        AND: [
          await personnelRosterStoreScope(session),
          { operationStatus: { not: "CLOSED" } },
          { brand: { status: "ENABLED", ...(brandCode ? { OR: [{ id: brandCode }, { code: brandCode }, { name: brandCode }] } : {}) } },
          ...(keyword ? [{ name: { contains: keyword } }] : []),
        ],
      },
      select: { id: true, name: true, brand: { select: { code: true, name: true } } },
      orderBy: [{ name: "asc" }],
      take: 30,
    });
    return NextResponse.json(rows.map(row => ({ storeId: row.id, storeName: row.name, brandCode: row.brand.code, brandName: row.brand.name })));
  } catch {
    return NextResponse.json({ message: "门店数据加载失败，请稍后重试" }, { status: 500 });
  }
}


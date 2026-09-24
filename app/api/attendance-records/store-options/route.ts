import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { attendanceStoreDataScope, canAttendanceRecord } from "@/lib/attendance-records";
import { db } from "@/lib/db";

export async function GET(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canAttendanceRecord(session, "query")) return NextResponse.json({ message: "暂无考勤记录查询权限" }, { status: 403 });
  const search = new URL(request.url).searchParams;
  const brand = search.get("brand")?.trim().slice(0, 100) || "";
  const keyword = search.get("keyword")?.trim().slice(0, 100) || "";
  try {
    const rows = await db.store.findMany({
      where: {
        AND: [
          await attendanceStoreDataScope(session),
          { operationStatus: { not: "CLOSED" } },
          { brand: { status: "ENABLED", ...(brand ? { OR: [{ id: brand }, { code: brand }, { name: brand }] } : {}) } },
          ...(keyword ? [{ name: { contains: keyword } }] : []),
        ],
      },
      select: { id: true, name: true, brand: { select: { id: true, code: true, name: true } } },
      orderBy: [{ name: "asc" }],
      take: 30,
    });
    return NextResponse.json(rows.map(row => ({ storeId: row.id, storeName: row.name, brandCode: row.brand.code, brandName: row.brand.name })));
  } catch {
    return NextResponse.json({ message: "门店数据加载失败，请稍后重试" }, { status: 500 });
  }
}

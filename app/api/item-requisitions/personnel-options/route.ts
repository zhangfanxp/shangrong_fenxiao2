import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { canItemRequisition, selectablePersonnelWhere } from "@/lib/item-requisitions";

export async function GET(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canItemRequisition(session, "create") && !canItemRequisition(session, "edit")) {
    return NextResponse.json({ message: "无领用人员选择权限" }, { status: 403 });
  }
  const keyword = (new URL(request.url).searchParams.get("keyword") || "").trim();
  if (keyword.length > 50) return NextResponse.json({ message: "领用人搜索内容不能超过50个字符" }, { status: 400 });
  try {
    const rows = await db.personnel.findMany({
      where: { AND: [await selectablePersonnelWhere(session), keyword ? { name: { contains: keyword } } : {}] },
      select: {
        id: true, recordNo: true, name: true, organization: true, department: true, status: true,
        store: { select: { id: true, name: true, brand: { select: { id: true, name: true } } } },
      },
      orderBy: [{ name: "asc" }, { recordNo: "asc" }],
      take: 30,
    });
    return NextResponse.json({ rows: rows.map(row => ({
      personnelId: row.id,
      recordNo: row.recordNo,
      name: row.name,
      personnelBelonging: row.organization,
      departmentStore: row.organization === "总部" ? row.department : row.store?.name || null,
      brand: row.store?.brand.name || null,
      status: row.status,
    })) });
  } catch {
    return NextResponse.json({ message: "人员数据加载失败，请稍后重试" }, { status: 500 });
  }
}

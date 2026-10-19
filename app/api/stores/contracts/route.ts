import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiSession } from "@/lib/auth";
import { canStoreListAction } from "@/lib/store-permissions";

export async function GET() {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!["query", "create", "edit", "view"].some(action => canStoreListAction(session.permissions, action as "query" | "create" | "edit" | "view"))) return NextResponse.json({ message: "暂无门店合同查看权限" }, { status: 403 });

  const rows = await db.contract.findMany({
    where: { store: null },
    select: {
      id: true, recordNo: true, brandId: true, storeName: true, cooperationType: true,
      province: true, city: true, district: true, address: true, trialOpenDate: true,
      ownerName: true, ownerPhone: true, ownerIdNumber: true,
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  return NextResponse.json(rows);
}

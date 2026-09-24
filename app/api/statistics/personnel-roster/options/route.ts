import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { getBusinessDictionaries } from "@/lib/business-dictionaries";
import { db } from "@/lib/db";
import { canPersonnelRoster, personnelRosterScope } from "@/lib/personnel-roster";

export async function GET() {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canPersonnelRoster(session, "query")) return NextResponse.json({ message: "暂无花名册查询权限" }, { status: 403 });
  try {
    const [dictionaries, scope, databaseBrands] = await Promise.all([
      getBusinessDictionaries(["BRAND", "DEPARTMENT", "POSITION_LEVEL", "PERSONNEL_STATUS"]),
      personnelRosterScope(session),
      db.brand.findMany({ where: { status: "ENABLED" }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
    ]);
    const allowedIds = scope.brandIds === null ? null : new Set(scope.brandIds);
    const brands = (dictionaries.BRAND || []).flatMap(option => {
      const matched = databaseBrands.find(brand => brand.code === option.value || brand.name === option.value || brand.name === option.label);
      if (allowedIds && (!matched || !allowedIds.has(matched.id))) return [];
      return [{ label: option.label, value: matched?.code || option.value }];
    });
    return NextResponse.json({
      brands,
      departments: dictionaries.DEPARTMENT || [],
      positionLevels: dictionaries.POSITION_LEVEL || [],
      personnelStatuses: dictionaries.PERSONNEL_STATUS || [],
      canViewHeadquarters: scope.canViewHeadquarters,
    });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "花名册筛选项加载失败，请稍后重试" }, { status: 500 });
  }
}


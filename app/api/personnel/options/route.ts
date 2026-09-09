import { RecordStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { canPersonnel } from "@/lib/personnel-service";
import { getBusinessDictionaries } from "@/lib/business-dictionaries";
import { getBrandDayHourConfig } from "@/lib/brand-day-hour-config";

export async function GET() {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canPersonnel(session, "query")) return NextResponse.json({ message: "无人员档案查询权限" }, { status: 403 });
  const [brands, stores, dictionaries, users, brandDayHours] = await Promise.all([
    db.brand.findMany({ where: { status: RecordStatus.ENABLED }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.store.findMany({ where: { operationStatus: { not: "CLOSED" } }, select: { id: true, name: true, operationStatus: true, managerName: true, brand: { select: { id: true, name: true } } }, orderBy: { name: "asc" } }),
    getBusinessDictionaries(["DEPARTMENT", "POSITION_LEVEL", "PERSONNEL_STATUS", "SOCIAL_SECURITY_STATUS"]),
    db.user.findMany({ where: { status: RecordStatus.ENABLED, OR: [{ personnelProfile: null }] }, select: { id: true, username: true, realName: true, role: { select: { name: true } } }, orderBy: { realName: "asc" } }),
    getBrandDayHourConfig(),
  ]);
  return NextResponse.json({
    organizations: ["总部", ...brands.map(item => item.name)], brands, stores, users,
    departments: dictionaries.DEPARTMENT || [],
    positions: (dictionaries.POSITION_LEVEL || []).map(option => ({ id: option.value, ...option })),
    personnelStatuses: dictionaries.PERSONNEL_STATUS || [],
    socialSecurityStatuses: dictionaries.SOCIAL_SECURITY_STATUS || [], brandDayHours,
  });
}

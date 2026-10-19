import { RecordStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiSession, sessionHasPermission } from "@/lib/auth";
import { getBusinessDictionaryOptions } from "@/lib/business-dictionaries";
import { db } from "@/lib/db";

export async function GET() {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!sessionHasPermission(session, "settings:users")) return NextResponse.json({ message: "暂无用户管理权限" }, { status: 403 });
  const [roles, brands, stores, regions, regionAssignments] = await Promise.all([
    db.role.findMany({ where: { status: RecordStatus.ENABLED }, orderBy: [{ type: "asc" }, { name: "asc" }], select: { id: true, name: true, code: true, status: true } }),
    db.brand.findMany({ where: { status: RecordStatus.ENABLED }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.store.findMany({ where: { operationStatus: { not: "CLOSED" }, brand: { status: RecordStatus.ENABLED } }, orderBy: [{ brand: { name: "asc" } }, { name: "asc" }], select: { id: true, name: true, brandId: true, brand: { select: { name: true } } } }),
    getBusinessDictionaryOptions("STORE_AREA"),
    db.userManagedRegion.findMany({ select: { region: true, userId: true, user: { select: { realName: true, username: true } } } }),
  ]);
  const assignmentByRegion = new Map(regionAssignments.map(assignment => [assignment.region, assignment]));
  return NextResponse.json({ roles, brands, stores, regions: regions.map(region => {
    const assignment = assignmentByRegion.get(region.value);
    return { ...region, assignedUserId: assignment?.userId ?? null, assignedUserName: assignment ? `${assignment.user.realName}（${assignment.user.username}）` : null };
  }) }, { headers: { "Cache-Control": "no-store" } });
}

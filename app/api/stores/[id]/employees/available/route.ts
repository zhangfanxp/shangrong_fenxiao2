import { PersonnelStatus, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiSession, sessionHasPermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { storeEmployeeSelect } from "@/lib/store-employees";
import { synchronizeStoreLeadership } from "@/lib/store-leadership";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!sessionHasPermission(session, "stores:employees:edit")) return NextResponse.json({ message: "暂无门店员工编辑权限" }, { status: 403 });

  const { id } = await params;
  await synchronizeStoreLeadership([id]);
  const store = await db.store.findUnique({ where: { id }, select: { managerUserId: true, managerName: true, chefUserId: true, chefName: true } });
  if (!store) return NextResponse.json({ message: "门店不存在或已删除" }, { status: 404 });

  const url = new URL(request.url);
  const name = (url.searchParams.get("name") || "").trim().slice(0, 8);
  const positionLevels = [...new Set(url.searchParams.getAll("positionLevels").map(value => value.trim()).filter(Boolean))];
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const requestedPageSize = Number(url.searchParams.get("pageSize")) || 20;
  const pageSize = [20, 50, 100].includes(requestedPageSize) ? requestedPageSize : 20;
  const leaderUserIds = [store.managerUserId, store.chefUserId].filter((value): value is string => Boolean(value));
  const leaderNames = [store.managerName, store.chefName].filter((value): value is string => Boolean(value));
  const exclusions: Prisma.PersonnelWhereInput[] = [];
  exclusions.push({ platformUser: { is: { role: { name: { in: ["店长", "厨师长"] } } } } });
  if (leaderUserIds.length) exclusions.push({ platformUserId: { in: leaderUserIds } });
  if (leaderNames.length) exclusions.push({ platformUserId: null, name: { in: leaderNames } });
  const where: Prisma.PersonnelWhereInput = {
    storeId: null,
    organization: { not: "总部" },
    status: PersonnelStatus.ACTIVE,
    deletedAt: null,
    ...(name ? { name: { contains: name } } : {}),
    ...(positionLevels.length ? { positionLevel: { in: positionLevels } } : {}),
    ...(exclusions.length ? { NOT: exclusions } : {}),
  };
  const [total, rows] = await db.$transaction([
    db.personnel.count({ where }),
    db.personnel.findMany({ where, select: storeEmployeeSelect, orderBy: [{ positionLevel: "asc" }, { name: "asc" }], skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  const canViewPhone = session.permissions.includes("*") || session.permissions.includes("personnel:sensitive");
  return NextResponse.json({
    rows: rows.map(personnel => {
      const phone = canViewPhone ? personnel.phone : `${personnel.phone.slice(0, 3)}****${personnel.phone.slice(-4)}`;
      return { ...personnel, phone, phoneMasked: phone };
    }),
    total,
    page,
    pageSize,
  }, { headers: { "Cache-Control": "no-store" } });
}

import { PersonnelStatus, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiSession, sessionHasPermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { personnelInclude, personnelLog } from "@/lib/personnel-service";
import { isStoreLeader } from "@/lib/store-employees";
import { synchronizeStoreLeadership } from "@/lib/store-leadership";

export async function GET(_: Request, { params }: { params: Promise<{ id: string; personnelId: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!sessionHasPermission(session, "stores:list:view")) return NextResponse.json({ message: "暂无门店列表权限" }, { status: 403 });

  const { id, personnelId } = await params;
  await synchronizeStoreLeadership([id]);
  const store = await db.store.findUnique({ where: { id }, select: { managerUserId: true, managerName: true, chefUserId: true, chefName: true } });
  if (!store) return NextResponse.json({ message: "门店不存在或已删除" }, { status: 404 });
  const row = await db.personnel.findFirst({
    where: { id: personnelId, organization: { not: "总部" }, status: PersonnelStatus.ACTIVE, deletedAt: null, OR: [{ storeId: id }, { storeId: null }] },
    include: personnelInclude,
  });
  if (!row) return NextResponse.json({ message: "员工不存在、已离职或归属已发生变化" }, { status: 404 });
  if (isStoreLeader(row, store)) return NextResponse.json({ message: "店长和厨师长不属于普通员工列表" }, { status: 404 });
  if (!row.storeId && !sessionHasPermission(session, "stores:employees:edit")) return NextResponse.json({ message: "暂无待分配员工查看权限" }, { status: 403 });
  await personnelLog(session.userId, "门店员工查看", "成功", `查看人员档案：${row.recordNo}`);
  if (session.permissions.includes("*") || session.permissions.includes("personnel:sensitive")) return NextResponse.json(row);
  return NextResponse.json({
    ...row,
    phone: `${row.phone.slice(0, 3)}****${row.phone.slice(-4)}`,
    idNumber: `${row.idNumber.slice(0, 4)}**********${row.idNumber.slice(-4)}`,
    homeAddress: "******",
    currentAddress: "******",
    baseSalary: new Prisma.Decimal(0),
    laborCost: new Prisma.Decimal(0),
    salaryHistory: row.salaryHistory.map(item => ({ ...item, oldSalary: new Prisma.Decimal(0), newSalary: new Prisma.Decimal(0) })),
  });
}

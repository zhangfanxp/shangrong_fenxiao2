import { PersonnelStatus, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession, sessionHasPermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { getLaborCostPolicyVersions } from "@/lib/labor-cost-policy";
import { writeOperationLog } from "@/lib/operation-log";
import { buildPersonnelLaborCostReport, shanghaiYearMonth } from "@/lib/personnel-labor-costs";
import { isStoreLeader, storeEmployeeSelect } from "@/lib/store-employees";
import { synchronizeStoreLeadership } from "@/lib/store-leadership";
import { canStoreListAction } from "@/lib/store-permissions";

const saveSchema = z.object({
  employeeIds: z.array(z.string().min(1)).max(500, "单个门店最多维护500名普通员工").refine(ids => new Set(ids).size === ids.length, "普通员工记录不能重复"),
});

class StoreEmployeeConflictError extends Error {}

const storeSelect = {
  id: true,
  recordNo: true,
  name: true,
  managerUserId: true,
  managerName: true,
  chefUserId: true,
  chefName: true,
  workdayHours: true,
  brand: { select: { name: true } },
  personnel: {
    where: { status: PersonnelStatus.ACTIVE, deletedAt: null },
    orderBy: [{ positionLevel: "asc" }, { name: "asc" }],
    select: { ...storeEmployeeSelect, baseSalary: true, hireDate: true, resignationDate: true, salaryHistory: { select: { oldSalary: true, newSalary: true, effectiveDate: true, createdAt: true }, orderBy: [{ effectiveDate: "asc" as const }, { createdAt: "asc" as const }] }, positionHistory: { select: { oldOrganization: true, newOrganization: true, effectiveDate: true, createdAt: true }, orderBy: [{ effectiveDate: "asc" as const }, { createdAt: "asc" as const }] } },
  },
} satisfies Prisma.StoreSelect;

function maskedPhone(phone: string) {
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}

async function employeeSnapshot(storeId: string, database: Prisma.TransactionClient = db) {
  const store = await database.store.findUnique({ where: { id: storeId }, select: storeSelect });
  if (!store) return null;
  const current = shanghaiYearMonth();
  const [restDays, policyVersions] = await Promise.all([
    database.restDay.findMany({ where: { year: current.year }, select: { startDate: true, endDate: true, holidayType: true } }),
    getLaborCostPolicyVersions(database),
  ]);
  const workdayHours = store.workdayHours === null ? null : Number(store.workdayHours);
  const managerNames = [...new Set(store.personnel.filter(personnel => ["店长", "主管"].includes(personnel.positionLevel)).map(personnel => personnel.name))];
  const chefNames = [...new Set(store.personnel.filter(personnel => personnel.positionLevel === "厨师长").map(personnel => personnel.name))];
  return {
    id: store.id,
    recordNo: store.recordNo,
    name: store.name,
    managerName: managerNames.join("、") || null,
    chefName: chefNames.join("、") || null,
    employees: store.personnel.filter(personnel => !isStoreLeader(personnel, store)).map(personnel => {
      const costs = buildPersonnelLaborCostReport({ year: current.year, baseSalary: Number(personnel.baseSalary), workdayHours, organization: personnel.organization, hireDate: personnel.hireDate, resignationDate: personnel.resignationDate, salaryHistory: personnel.salaryHistory, positionHistory: personnel.positionHistory, restDays, policyVersions })[current.month - 1];
      const { baseSalary: _baseSalary, hireDate: _hireDate, resignationDate: _resignationDate, salaryHistory: _salaryHistory, positionHistory: _positionHistory, ...safePersonnel } = personnel;
      return { ...safePersonnel, phone: maskedPhone(personnel.phone), laborCost: costs.dailyLaborCost ?? Number(personnel.laborCost) };
    }),
  };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canStoreListAction(session.permissions, "view") && !sessionHasPermission(session, "stores:employees:edit")) return NextResponse.json({ message: "暂无门店员工查看权限" }, { status: 403 });

  const { id } = await params;
  await synchronizeStoreLeadership([id]);
  const snapshot = await employeeSnapshot(id);
  if (!snapshot) return NextResponse.json({ message: "门店不存在或已删除" }, { status: 404 });
  await writeOperationLog({ userId: session.userId, username: session.username, page: "门店列表", action: "查看员工", result: "成功", detail: `查看门店员工：${snapshot.recordNo}（${snapshot.name}）`, request }).catch(() => undefined);
  return NextResponse.json(snapshot);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!sessionHasPermission(session, "stores:employees:edit")) return NextResponse.json({ message: "暂无门店员工编辑权限" }, { status: 403 });
  const parsed = saveSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0].message }, { status: 400 });

  const { id } = await params;
  await synchronizeStoreLeadership([id]);
  const store = await db.store.findUnique({ where: { id }, select: { id: true, recordNo: true, name: true, managerUserId: true, managerName: true, chefUserId: true, chefName: true, brand: { select: { name: true } } } });
  if (!store) return NextResponse.json({ message: "门店不存在或已删除" }, { status: 404 });

  const requestedIds = new Set(parsed.data.employeeIds);
  const currentRows = await db.personnel.findMany({
    where: { storeId: id, status: PersonnelStatus.ACTIVE, deletedAt: null },
    select: { ...storeEmployeeSelect, organization: true, store: { select: { name: true } } },
  });
  const currentEmployees = currentRows.filter(personnel => !isStoreLeader(personnel, store));
  const requestedRows = parsed.data.employeeIds.length ? await db.personnel.findMany({
    where: { id: { in: parsed.data.employeeIds }, status: PersonnelStatus.ACTIVE, deletedAt: null },
    select: { ...storeEmployeeSelect, organization: true, store: { select: { name: true } } },
  }) : [];
  if (requestedRows.length !== parsed.data.employeeIds.length) return NextResponse.json({ message: "部分人员档案不存在、已离职或已删除，请刷新后重试" }, { status: 409 });
  if (requestedRows.some(personnel => personnel.organization === "总部")) return NextResponse.json({ message: "总部人员不能分配到门店员工列表" }, { status: 400 });
  if (requestedRows.some(personnel => isStoreLeader(personnel, store))) return NextResponse.json({ message: "店长和厨师长不属于普通员工，不能重复添加" }, { status: 400 });
  if (requestedRows.some(personnel => personnel.storeId && personnel.storeId !== id)) return NextResponse.json({ message: "部分员工已被安排至其他门店，请刷新后重新选择" }, { status: 409 });

  const toRemove = currentEmployees.filter(personnel => !requestedIds.has(personnel.id));
  const toAdd = requestedRows.filter(personnel => !personnel.storeId);
  try {
    await db.$transaction(async transaction => {
      for (const personnel of toRemove) {
        const updated = await transaction.personnel.updateMany({
          where: { id: personnel.id, storeId: id, status: PersonnelStatus.ACTIVE, deletedAt: null },
          data: { storeId: null, version: { increment: 1 } },
        });
        if (updated.count !== 1) throw new StoreEmployeeConflictError("员工归属已发生变化，请刷新后重试");
        await transaction.positionHistory.create({ data: {
          personnelId: personnel.id,
          oldOrganization: personnel.organization,
          newOrganization: personnel.organization,
          oldStoreName: personnel.store?.name || store.name,
          newStoreName: "未安排门店",
          oldPositionLevel: personnel.positionLevel,
          newPositionLevel: personnel.positionLevel,
          effectiveDate: new Date(),
          reason: "通过门店员工列表移除",
          operatorId: session.userId,
          operatorName: session.realName,
        } });
      }
      for (const personnel of toAdd) {
        const updated = await transaction.personnel.updateMany({
          where: { id: personnel.id, storeId: null, status: PersonnelStatus.ACTIVE, deletedAt: null },
          data: { storeId: id, organization: store.brand.name, department: null, version: { increment: 1 } },
        });
        if (updated.count !== 1) throw new StoreEmployeeConflictError("部分员工已被其他门店选用，请刷新后重试");
        await transaction.positionHistory.create({ data: {
          personnelId: personnel.id,
          oldOrganization: personnel.organization,
          newOrganization: store.brand.name,
          oldStoreName: "未安排门店",
          newStoreName: store.name,
          oldPositionLevel: personnel.positionLevel,
          newPositionLevel: personnel.positionLevel,
          effectiveDate: new Date(),
          reason: "通过门店员工列表添加",
          operatorId: session.userId,
          operatorName: session.realName,
        } });
      }
    });
    const snapshot = await employeeSnapshot(id);
    await writeOperationLog({ userId: session.userId, username: session.username, page: "门店列表", action: "编辑员工", result: "成功", detail: `保存门店员工：${store.recordNo}（新增${toAdd.length}人，移除${toRemove.length}人）`, request }).catch(() => undefined);
    return NextResponse.json(snapshot);
  } catch (error) {
    if (error instanceof StoreEmployeeConflictError) return NextResponse.json({ message: error.message }, { status: 409 });
    throw error;
  }
}

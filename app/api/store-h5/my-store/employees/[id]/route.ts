import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getLaborCostPolicyVersions } from "@/lib/labor-cost-policy";
import { writeOperationLog } from "@/lib/operation-log";
import { buildPersonnelLaborCostReport, shanghaiYearMonth } from "@/lib/personnel-labor-costs";
import { personnelInclude } from "@/lib/personnel-service";
import { getStoreH5Session } from "@/lib/store-h5-auth";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getStoreH5Session("store-h5:my-store:employees:view");
  if (!session) return NextResponse.json({ message: "登录状态已失效或暂无员工详情权限" }, { status: 401 });
  if (!session.storeId) return NextResponse.json({ message: "当前账号尚未关联门店" }, { status: 409 });
  try {
    const current = shanghaiYearMonth();
    const [row, restDays, policyVersions] = await Promise.all([
      db.personnel.findFirst({ where: { id: (await params).id, storeId: session.storeId, deletedAt: null }, include: personnelInclude }),
      db.restDay.findMany({ where: { year: current.year }, select: { startDate: true, endDate: true, holidayType: true } }),
      getLaborCostPolicyVersions(),
    ]);
    if (!row) return NextResponse.json({ message: "员工记录不存在或不属于当前门店" }, { status: 404 });
    const workdayHours = row.store?.workdayHours === null || row.store?.workdayHours === undefined ? null : Number(row.store.workdayHours);
    const cost = buildPersonnelLaborCostReport({
      year: current.year,
      baseSalary: Number(row.baseSalary),
      workdayHours,
      organization: row.organization,
      hireDate: row.hireDate,
      resignationDate: row.resignationDate,
      salaryHistory: row.salaryHistory,
      positionHistory: row.positionHistory,
      restDays,
      policyVersions,
    })[current.month - 1];
    await writeOperationLog({ userId: session.userId, username: session.username, client: "门店员工移动端", page: "我的门店-员工", action: "查看", result: "成功", detail: `员工：${row.recordNo} ${row.name}`, request }).catch(() => undefined);
    return NextResponse.json({ ...row, dailyLaborCost: cost?.dailyLaborCost ?? null, hourlyLaborCost: cost?.hourlyLaborCost ?? null }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch {
    return NextResponse.json({ message: "员工详情加载失败，请稍后重试" }, { status: 500 });
  }
}

import { PersonnelStatus, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { getLaborCostPolicyVersions } from "@/lib/labor-cost-policy";
import { buildPersonnelLaborCostReport, shanghaiYearMonth } from "@/lib/personnel-labor-costs";
import { canPersonnel, personnelInclude, personnelLog, toDate } from "@/lib/personnel-service";

const schema = z.object({ newSalary: z.number().min(0, "调整后工资不能小于0"), effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "请选择调薪日期"), reason: z.string().trim().min(1, "请输入调薪原因").max(200) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession(); if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canPersonnel(session, "salary")) return NextResponse.json({ message: "无人员档案调薪权限" }, { status: 403 });
  const parsed = schema.safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0].message }, { status: 400 }); const { id } = await params;
  try {
    const current = await db.personnel.findFirst({ where: { id, deletedAt: null }, include: { store: { select: { workdayHours: true } }, salaryHistory: { orderBy: [{ effectiveDate: "asc" }, { createdAt: "asc" }] }, positionHistory: { select: { oldOrganization: true, newOrganization: true, effectiveDate: true, createdAt: true }, orderBy: [{ effectiveDate: "asc" }, { createdAt: "asc" }] } } }); if (!current) return NextResponse.json({ message: "人员档案不存在或已删除" }, { status: 404 });
    if (current.status !== PersonnelStatus.ACTIVE) return NextResponse.json({ message: "离职员工不允许再次调薪" }, { status: 400 });
    const currentMonth = shanghaiYearMonth();
    const [restDays, policyVersions] = await Promise.all([
      db.restDay.findMany({ where: { year: currentMonth.year }, select: { startDate: true, endDate: true, holidayType: true } }),
      getLaborCostPolicyVersions(),
    ]);
    const effectiveDate = toDate(parsed.data.effectiveDate);
    const nextHistory = { oldSalary: current.baseSalary, newSalary: parsed.data.newSalary, effectiveDate, createdAt: new Date() };
    const workdayHours = current.store?.workdayHours === null || current.store?.workdayHours === undefined ? null : Number(current.store.workdayHours);
    const currentLaborCost = buildPersonnelLaborCostReport({ year: currentMonth.year, baseSalary: parsed.data.newSalary, workdayHours, organization: current.organization, hireDate: current.hireDate, resignationDate: current.resignationDate, salaryHistory: [...current.salaryHistory, nextHistory], positionHistory: current.positionHistory, restDays, policyVersions })[currentMonth.month - 1].dailyLaborCost ?? 0;
    await db.$transaction([db.salaryHistory.create({ data: { personnelId: id, oldSalary: current.baseSalary, newSalary: new Prisma.Decimal(parsed.data.newSalary), effectiveDate, reason: parsed.data.reason, operatorId: session.userId, operatorName: session.realName } }), db.personnel.update({ where: { id }, data: { baseSalary: new Prisma.Decimal(parsed.data.newSalary), laborCost: new Prisma.Decimal(currentLaborCost), version: { increment: 1 } } })]);
    const row = await db.personnel.findUniqueOrThrow({ where: { id }, include: personnelInclude }); await personnelLog(session.userId, "调薪", "成功", `人员：${row.recordNo}；已保存调薪历史`); return NextResponse.json(row);
  } catch (error) { const message = error instanceof Error ? error.message : "调薪失败，请稍后重试"; await personnelLog(session.userId, "调薪", "失败", message); return NextResponse.json({ message }, { status: 400 }); }
}

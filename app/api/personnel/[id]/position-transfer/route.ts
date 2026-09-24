import { PersonnelStatus, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { canPersonnel, personnelInclude, personnelLog, toDate, validatePersonnelRelations } from "@/lib/personnel-service";

const schema = z.object({ organization: z.string().min(1, "请选择人员归属"), department: z.string().nullable().optional(), storeId: z.string().nullable().optional(), positionLevel: z.string().min(1, "请选择所属岗位星级"), effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "请选择生效日期"), reason: z.string().trim().min(1, "请输入变动原因").max(200) }).superRefine((data, ctx) => {
  if (data.organization === "总部" && !data.department) ctx.addIssue({ code: "custom", path: ["department"], message: "请选择总部部门" });
  if (data.organization !== "总部" && !data.storeId) ctx.addIssue({ code: "custom", path: ["storeId"], message: "请选择部门/店面" });
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession(); if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canPersonnel(session, "position")) return NextResponse.json({ message: "无人员档案调岗权限" }, { status: 403 });
  const parsed = schema.safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0].message }, { status: 400 }); const { id } = await params;
  try {
    const current = await db.personnel.findFirst({ where: { id, deletedAt: null }, include: { store: { select: { name: true } } } }); if (!current) return NextResponse.json({ message: "人员档案不存在或已删除" }, { status: 404 });
    if (current.status !== PersonnelStatus.ACTIVE) return NextResponse.json({ message: "离职员工不允许普通调岗" }, { status: 400 });
    const relation = await validatePersonnelRelations({ ...parsed.data, name: current.name, phone: current.phone, idNumber: current.idNumber, birthday: current.birthday, birthdayCalendar: current.birthdayCalendar, status: current.status, hireDate: current.hireDate.toISOString().slice(0, 10), contractSignDate: current.contractSignDate.toISOString().slice(0, 10), contractYears: current.contractYears, contractExpiryDate: current.contractExpiryDate.toISOString().slice(0, 10), homeAddress: current.homeAddress, currentAddress: current.currentAddress, supplementaryMaterial: current.supplementaryMaterial, baseSalary: Number(current.baseSalary), laborCost: Number(current.laborCost), workdayHours: current.workdayHours === null ? null : Number(current.workdayHours), socialSecurity: current.socialSecurity, platformAccess: current.platformAccess, platformUserId: current.platformUserId, remark: current.remark }, id);
    const nextStore = parsed.data.storeId ? await db.store.findUnique({ where: { id: parsed.data.storeId }, select: { name: true } }) : null;
    const oldWorkplace = current.organization === "总部" ? current.department || "-" : current.store?.name || "未安排门店";
    const newWorkplace = parsed.data.organization === "总部" ? parsed.data.department! : nextStore?.name || "未安排门店";
    await db.$transaction([db.positionHistory.create({ data: { personnelId: id, oldOrganization: current.organization, newOrganization: parsed.data.organization, oldStoreName: oldWorkplace, newStoreName: newWorkplace, oldPositionLevel: current.positionLevel, newPositionLevel: relation.positionLevel, effectiveDate: toDate(parsed.data.effectiveDate), reason: parsed.data.reason, operatorId: session.userId, operatorName: session.realName } }), db.personnel.update({ where: { id }, data: { organization: parsed.data.organization, department: parsed.data.organization === "总部" ? parsed.data.department : null, storeId: parsed.data.organization === "总部" ? null : parsed.data.storeId, positionLevel: relation.positionLevel, laborCost: new Prisma.Decimal(relation.laborCost), workdayHours: relation.workdayHours === null ? null : new Prisma.Decimal(relation.workdayHours), version: { increment: 1 } } })]);
    const row = await db.personnel.findUniqueOrThrow({ where: { id }, include: personnelInclude }); await personnelLog(session.userId, "调岗", "成功", `人员：${row.recordNo}；已保存调岗历史`); return NextResponse.json(row);
  } catch (error) { const message = error instanceof Error ? error.message : "调岗失败，请稍后重试"; await personnelLog(session.userId, "调岗", "失败", message); return NextResponse.json({ message }, { status: 400 }); }
}

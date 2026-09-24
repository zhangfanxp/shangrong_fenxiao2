import { PersonnelStatus, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { personnelInputSchema } from "@/lib/personnel-validation";
import { canPersonnel, personnelData, personnelInclude, personnelLog, validatePersonnelRelations } from "@/lib/personnel-service";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession(); if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  const editMode = new URL(request.url).searchParams.get("mode") === "edit";
  if (editMode ? !canPersonnel(session, "edit") : !canPersonnel(session, "view")) return NextResponse.json({ message: editMode ? "无人员档案编辑权限" : "无人员档案查看权限" }, { status: 403 });
  const { id } = await params; const row = await db.personnel.findFirst({ where: { id, deletedAt: null }, include: personnelInclude });
  if (!row) return NextResponse.json({ message: "人员档案不存在或已删除" }, { status: 404 });
  await personnelLog(session.userId, editMode ? "编辑加载" : "查看", "成功", `${editMode ? "编辑加载" : "查看"}人员档案：${row.recordNo}`);
  if (editMode || canPersonnel(session, "sensitive")) return NextResponse.json(row);
  return NextResponse.json({ ...row, phone: `${row.phone.slice(0, 3)}****${row.phone.slice(-4)}`, idNumber: `${row.idNumber.slice(0, 4)}**********${row.idNumber.slice(-4)}`, homeAddress: "******", currentAddress: "******", baseSalary: new Prisma.Decimal(0), laborCost: new Prisma.Decimal(0), salaryHistory: row.salaryHistory.map(item => ({ ...item, oldSalary: new Prisma.Decimal(0), newSalary: new Prisma.Decimal(0) })) });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession(); if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canPersonnel(session, "edit")) return NextResponse.json({ message: "无人员档案编辑权限" }, { status: 403 });
  const parsed = personnelInputSchema.safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0].message }, { status: 400 });
  const { id } = await params;
  try {
    const current = await db.personnel.findFirst({ where: { id, deletedAt: null } }); if (!current) return NextResponse.json({ message: "人员档案不存在或已删除" }, { status: 404 });
    if (current.status === PersonnelStatus.RESIGNED) return NextResponse.json({ message: "离职人员仅允许查看，不能通过普通编辑恢复或变更任职信息" }, { status: 400 });
    if (parsed.data.version !== current.version) return NextResponse.json({ message: "当前人员档案已被其他用户修改，请刷新后重新操作" }, { status: 409 });
    const updateData = { ...parsed.data, baseSalary: Number(current.baseSalary), laborCost: null, workdayHours: null };
    const relation = await validatePersonnelRelations(updateData, id);
    const result = await db.personnel.updateMany({ where: { id, version: current.version, deletedAt: null }, data: { ...personnelData(updateData, relation.positionLevel, relation.workdayHours, relation.laborCost), version: { increment: 1 } } });
    if (!result.count) return NextResponse.json({ message: "当前人员档案已被其他用户修改，请刷新后重新操作" }, { status: 409 });
    const row = await db.personnel.findUniqueOrThrow({ where: { id }, include: personnelInclude }); await personnelLog(session.userId, "编辑", "成功", `编辑人员档案：${row.recordNo}`); return NextResponse.json(row);
  } catch (error) {
    const message = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" ? "该身份证号码已存在人员档案" : error instanceof Error ? error.message : "人员档案保存失败，请稍后重试";
    await personnelLog(session.userId, "编辑", "失败", message); return NextResponse.json({ message }, { status: 400 });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession(); if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canPersonnel(session, "delete")) return NextResponse.json({ message: "无人员档案删除权限" }, { status: 403 });
  const { id } = await params; const row = await db.personnel.findFirst({ where: { id, deletedAt: null }, include: { _count: { select: { salaryHistory: true, positionHistory: true, itemRequisitions: true } } } });
  if (!row) return NextResponse.json({ message: "人员档案不存在或已删除" }, { status: 404 });
  if (row._count.salaryHistory || row._count.positionHistory || row._count.itemRequisitions || row.platformUserId) return NextResponse.json({ message: "该人员已有业务历史或平台账号关联，不能删除，请使用离职流程" }, { status: 400 });
  await db.personnel.update({ where: { id }, data: { deletedAt: new Date() } }); await personnelLog(session.userId, "删除", "成功", `删除误录人员档案：${row.recordNo}`); return NextResponse.json({ message: "人员档案已删除" });
}

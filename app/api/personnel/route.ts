import { PersonnelStatus, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { personnelInputSchema } from "@/lib/personnel-validation";
import { canPersonnel, nextPersonnelRecordNo, personnelData, personnelInclude, personnelLog, toDate, validatePersonnelRelations } from "@/lib/personnel-service";

export async function GET(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canPersonnel(session, "query")) return NextResponse.json({ message: "无人员档案查询权限" }, { status: 403 });
  const url = new URL(request.url); const sp = url.searchParams;
  const name = (sp.get("name") || "").trim(); const phone = (sp.get("phone") || "").trim(); const idNumber = (sp.get("idNumber") || "").trim().toUpperCase();
  const organization = sp.get("organization") || ""; const status = sp.get("status") || ""; const startDate = sp.get("startDate") || ""; const endDate = sp.get("endDate") || "";
  const page = Math.max(1, Number(sp.get("page")) || 1); const pageSize = Math.min(100, Math.max(10, Number(sp.get("pageSize")) || 10));
  if (startDate && endDate && startDate > endDate) return NextResponse.json({ message: "入职开始日期不能晚于入职截止日期" }, { status: 400 });
  const where: Prisma.PersonnelWhereInput = {
    deletedAt: null,
    ...(name ? { name: { contains: name } } : {}), ...(phone ? { phone: { contains: phone } } : {}), ...(idNumber ? { idNumber: { contains: idNumber } } : {}),
    ...(organization ? { organization } : {}), ...(Object.values(PersonnelStatus).includes(status as PersonnelStatus) ? { status: status as PersonnelStatus } : {}),
    ...(startDate || endDate ? { hireDate: { ...(startDate ? { gte: toDate(startDate) } : {}), ...(endDate ? { lte: new Date(`${endDate}T23:59:59.999`) } : {}) } } : {}),
  };
  const [total, rows] = await db.$transaction([
    db.personnel.count({ where }),
    db.personnel.findMany({ where, include: personnelInclude, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  await personnelLog(session.userId, "筛选", "成功", `查询人员档案，共${total}条`);
  const exposeSensitive = canPersonnel(session, "sensitive"); const exposeSalary = exposeSensitive || canPersonnel(session, "salary");
  const safeRows = rows.map(row => ({ ...row, phone: exposeSensitive ? row.phone : `${row.phone.slice(0, 3)}****${row.phone.slice(-4)}`, idNumber: exposeSensitive ? row.idNumber : `${row.idNumber.slice(0, 4)}**********${row.idNumber.slice(-4)}`, homeAddress: exposeSensitive ? row.homeAddress : "", currentAddress: exposeSensitive ? row.currentAddress : "", baseSalary: exposeSalary ? row.baseSalary : new Prisma.Decimal(0), laborCost: exposeSalary ? row.laborCost : new Prisma.Decimal(0), salaryHistory: exposeSensitive ? row.salaryHistory : row.salaryHistory.map(item => ({ ...item, oldSalary: new Prisma.Decimal(0), newSalary: new Prisma.Decimal(0) })) }));
  return NextResponse.json({ rows: safeRows, total, page, pageSize });
}

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canPersonnel(session, "create")) return NextResponse.json({ message: "无人员档案新增权限" }, { status: 403 });
  const parsed = personnelInputSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0].message }, { status: 400 });
  try {
    const relation = await validatePersonnelRelations(parsed.data);
    const row = await db.$transaction(async tx => {
      const recordNo = await nextPersonnelRecordNo(tx);
      return tx.personnel.create({ data: { ...personnelData(parsed.data, relation.positionLevel, relation.workdayHours), recordNo, createdByUserId: session.userId }, include: personnelInclude });
    });
    await personnelLog(session.userId, "新增", "成功", `新增人员档案：${row.recordNo} ${row.name}`);
    return NextResponse.json(row, { status: 201 });
  } catch (error) {
    const message = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" ? "该身份证号码已存在人员档案" : error instanceof Error ? error.message : "人员档案新增失败，请稍后重试";
    await personnelLog(session.userId, "新增", "失败", message); return NextResponse.json({ message }, { status: 400 });
  }
}

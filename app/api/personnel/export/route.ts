import { PersonnelStatus, Prisma } from "@prisma/client";
import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { canPersonnel, personnelInclude, personnelLog, toDate } from "@/lib/personnel-service";

const schema = z.object({ ids: z.array(z.string()).optional(), filters: z.object({ name: z.string().optional(), phone: z.string().optional(), idNumber: z.string().optional(), organization: z.string().optional(), status: z.string().optional(), startDate: z.string().optional(), endDate: z.string().optional() }).optional() });
const date = (value: Date | null) => value ? value.toISOString().slice(0, 10) : "";

export async function POST(request: Request) {
  const session = await requireApiSession(); if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canPersonnel(session, "export")) return NextResponse.json({ message: "无人员档案导出权限" }, { status: 403 });
  const parsed = schema.safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ message: "导出条件不正确" }, { status: 400 }); const filters = parsed.data.filters || {};
  const where: Prisma.PersonnelWhereInput = { deletedAt: null, ...(parsed.data.ids?.length ? { id: { in: parsed.data.ids } } : { ...(filters.name?.trim() ? { name: { contains: filters.name.trim() } } : {}), ...(filters.phone?.trim() ? { phone: { contains: filters.phone.trim() } } : {}), ...(filters.idNumber?.trim() ? { idNumber: { contains: filters.idNumber.trim().toUpperCase() } } : {}), ...(filters.organization ? { organization: filters.organization } : {}), ...(Object.values(PersonnelStatus).includes(filters.status as PersonnelStatus) ? { status: filters.status as PersonnelStatus } : {}), ...(filters.startDate || filters.endDate ? { hireDate: { ...(filters.startDate ? { gte: toDate(filters.startDate) } : {}), ...(filters.endDate ? { lte: new Date(`${filters.endDate}T23:59:59.999`) } : {}) } } : {}) }) };
  const rows = await db.personnel.findMany({ where, include: personnelInclude, orderBy: { createdAt: "desc" } });
  const data = rows.map(row => ({ "记录编号": row.recordNo, "姓名": row.name, "手机号": row.phone, "身份证": row.idNumber, "员工生日": row.birthday || "", "人员状态": row.status === "ACTIVE" ? "在职" : "离职", "入职时间": date(row.hireDate), "所属岗位星级": row.positionLevel, "人员归属": row.organization, "部门/店面": row.organization === "总部" ? row.department || "" : row.store?.name || "未安排门店", "离职日期": date(row.resignationDate), "离职原因": row.resignationReason || "", "合同签署日期": date(row.contractSignDate), "合同年限": row.contractYears ?? "", "合同到期日": date(row.contractExpiryDate), "家庭住址": row.homeAddress, "现住址": row.currentAddress, "需补充材料": row.supplementaryMaterial || "", "基本工资": Number(row.baseSalary), "用工成本": Number(row.laborCost), "工作日小时": row.workdayHours === null ? "" : Number(row.workdayHours), "社保情况": row.socialSecurity === "INSURED" ? "是" : "已签补充协议", "平台权限": row.platformAccess === "YES" ? "有" : row.platformAccess === "NO" ? "无" : "", "平台用户": row.platformUser?.username || "", "备注信息": row.remark || "", "调薪历史": row.salaryHistory.map(item => `${date(item.effectiveDate)}：${item.oldSalary}→${item.newSalary}（${item.reason}，${item.operatorName}）`).join("；"), "调岗历史": row.positionHistory.map(item => `${date(item.effectiveDate)}：${item.oldOrganization}/${item.oldStoreName}/${item.oldPositionLevel}→${item.newOrganization}/${item.newStoreName}/${item.newPositionLevel}（${item.reason}，${item.operatorName}）`).join("；"), "创建人": row.createdBy?.realName || "", "创建时间": row.createdAt.toISOString().replace("T", " ").slice(0, 19) }));
  const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet("人员档案"); const exportHeaders = data.length ? Object.keys(data[0]) : ["记录编号", "姓名", "手机号", "身份证", "人员状态"];
  sheet.addRow(exportHeaders); data.forEach(item => sheet.addRow(exportHeaders.map(header => item[header as keyof typeof item]))); sheet.getRow(1).font = { bold: true }; sheet.views = [{ state: "frozen", ySplit: 1 }]; sheet.columns.forEach(column => { column.width = 18; });
  const buffer = await workbook.xlsx.writeBuffer();
  await personnelLog(session.userId, "批量导出", "成功", `导出人员档案${rows.length}条`); return new NextResponse(buffer, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename*=UTF-8''%E4%BA%BA%E5%91%98%E6%A1%A3%E6%A1%88_${new Date().toISOString().slice(0, 10)}.xlsx` } });
}

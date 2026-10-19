import { BirthdayCalendar, PlatformAccess, PersonnelStatus, Prisma, SocialSecurityStatus } from "@prisma/client";
import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildPersonnelImportWorkbook, normalizePersonnelImportHeader, personnelImportRequiredFields } from "@/lib/personnel-import-template";
import { personnelInputSchema } from "@/lib/personnel-validation";
import { canPersonnel, nextPersonnelRecordNo, personnelData, personnelLog, validatePersonnelRelations } from "@/lib/personnel-service";

const text = (row: Record<string, unknown>, key: string) => String(row[key] ?? "").trim();

export async function GET() {
  const session = await requireApiSession(); if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canPersonnel(session, "import")) return NextResponse.json({ message: "无人员档案导入权限" }, { status: 403 });
  const workbook = buildPersonnelImportWorkbook();
  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": "attachment; filename*=UTF-8''%E4%BA%BA%E5%91%98%E6%A1%A3%E6%A1%88%E5%AF%BC%E5%85%A5%E6%A8%A1%E6%9D%BF.xlsx" } });
}

export async function POST(request: Request) {
  const session = await requireApiSession(); if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canPersonnel(session, "import")) return NextResponse.json({ message: "无人员档案导入权限" }, { status: 403 });
  const form = await request.formData(); const file = form.get("file"); if (!(file instanceof File)) return NextResponse.json({ message: "请选择.xlsx文件" }, { status: 400 });
  if (!file.name.toLowerCase().endsWith(".xlsx")) return NextResponse.json({ message: "仅支持.xlsx文件" }, { status: 400 });
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ message: "导入文件不能超过10MB" }, { status: 400 });
  try {
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(await file.arrayBuffer()); const first = workbook.worksheets[0]; if (!first) return NextResponse.json({ message: "导入文件没有工作表" }, { status: 400 });
    const fileHeaders = Array.from({ length: first.columnCount }, (_, index) => normalizePersonnelImportHeader(first.getRow(1).getCell(index + 1).text));
    const missingRequiredHeaders = personnelImportRequiredFields.filter(field => !fileHeaders.includes(field));
    if (missingRequiredHeaders.length) return NextResponse.json({ message: `导入文件缺少必填字段：${missingRequiredHeaders.join("、")}` }, { status: 400 });
    const rows: Record<string, unknown>[] = [];
    first.eachRow((sheetRow, rowNumber) => { if (rowNumber === 1) return; const item: Record<string, unknown> = {}; fileHeaders.forEach((actualHeader, index) => { if (actualHeader) item[actualHeader] = sheetRow.getCell(index + 1).text.trim(); }); if (Object.values(item).some(Boolean)) rows.push(item); });
    if (!rows.length) return NextResponse.json({ message: "导入文件没有可读取的数据" }, { status: 400 });
    if (rows.length > 5000) return NextResponse.json({ message: "单次最多导入5000条人员档案" }, { status: 400 });
    const stores = await db.store.findMany({ include: { brand: { select: { name: true } } } }); const users = await db.user.findMany({ select: { id: true, username: true } });
    const seen = new Set<string>(); const errors: string[] = []; let success = 0;
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index]; const excelRow = index + 2; const idNumber = text(row, "身份证").toUpperCase();
      try {
        const missingRequiredValues = personnelImportRequiredFields.filter(field => !text(row, field));
        if (missingRequiredValues.length) throw new Error(`${missingRequiredValues.join("、")}为必填项`);
        if (seen.has(idNumber)) throw new Error("身份证号码在导入文件中重复"); seen.add(idNumber);
        const organization = text(row, "人员归属"); const workplace = text(row, "部门/店面"); const store = organization === "总部" ? undefined : stores.find(item => item.name === workplace); if (organization !== "总部" && !store) throw new Error("部门/店面不存在");
        if (text(row, "人员状态") !== "在职") throw new Error("人员状态仅支持“在职”，离职请通过正式离职流程办理");
        if (!["是", "已签补充协议"].includes(text(row, "社保情况"))) throw new Error("社保情况必须为“是”或“已签补充协议”");
        if (text(row, "生日历法") && !["农历", "公历"].includes(text(row, "生日历法"))) throw new Error("生日历法必须为“农历”或“公历”");
        if (text(row, "平台权限") && !["有", "无"].includes(text(row, "平台权限"))) throw new Error("平台权限必须为“有”或“无”");
        const platformName = text(row, "平台用户账号"); const platformUser = platformName ? users.find(item => item.username === platformName) : undefined;
        const input = personnelInputSchema.parse({ name: text(row, "姓名"), phone: text(row, "手机号"), idNumber, hireDate: text(row, "入职时间"), positionLevel: text(row, "所属岗位星级"), organization, department: organization === "总部" ? workplace : null, storeId: store?.id || null, status: PersonnelStatus.ACTIVE, contractSignDate: text(row, "合同签署日期"), contractYears: text(row, "合同年限") ? Number(text(row, "合同年限")) : null, contractExpiryDate: text(row, "合同到期日"), homeAddress: text(row, "家庭住址"), currentAddress: text(row, "现住址"), supplementaryMaterial: text(row, "需补充材料") || null, baseSalary: Number(text(row, "基本工资")), socialSecurity: text(row, "社保情况") === "已签补充协议" ? SocialSecurityStatus.AGREEMENT : SocialSecurityStatus.INSURED, birthdayCalendar: text(row, "生日历法") === "公历" ? BirthdayCalendar.SOLAR : BirthdayCalendar.LUNAR, birthday: text(row, "员工生日(月-日)") || null, platformAccess: text(row, "平台权限") === "有" ? PlatformAccess.YES : text(row, "平台权限") === "无" ? PlatformAccess.NO : null, platformUserId: platformUser?.id || null, remark: text(row, "备注信息") || null });
        if (input.platformAccess === PlatformAccess.YES && !platformUser) throw new Error("平台用户账号不存在或未启用"); const relation = await validatePersonnelRelations(input);
        await db.$transaction(async tx => { const recordNo = await nextPersonnelRecordNo(tx); await tx.personnel.create({ data: { ...personnelData(input, relation.positionLevel, relation.workdayHours, relation.laborCost), recordNo, createdByUserId: session.userId } }); }); success++;
      } catch (error) { const reason = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" ? "身份证号码或平台账号已存在人员档案" : error instanceof Error ? error.message : "数据校验失败"; errors.push(`第${excelRow}行：${reason}`); }
    }
    await personnelLog(session.userId, "批量导入", "成功", `导入成功${success}条，失败${errors.length}条`); return NextResponse.json({ success, failed: errors.length, errors });
  } catch (error) { const message = error instanceof Error ? error.message : "Excel文件解析失败"; await personnelLog(session.userId, "批量导入", "失败", message); return NextResponse.json({ message }, { status: 400 }); }
}

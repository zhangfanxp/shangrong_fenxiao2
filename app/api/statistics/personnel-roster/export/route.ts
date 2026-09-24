import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";
import {
  canPersonnelRoster,
  personnelRosterDataScope,
  personnelRosterFilterWhere,
  personnelRosterSelect,
  readPersonnelRosterFilters,
  serializePersonnelRoster,
  validatePersonnelRosterFilters,
} from "@/lib/personnel-roster";

const schema = z.object({
  personnelIds: z.array(z.string().min(1)).max(50_000).optional(),
  filters: z.object({
    nameKeyword: z.string().max(50).optional(),
    mobileKeyword: z.string().max(30).optional(),
    idCardKeyword: z.string().max(30).optional(),
    belonging: z.string().max(20).optional(),
    brandCode: z.string().max(100).optional(),
    storeId: z.string().max(191).optional(),
    departmentCode: z.string().max(100).optional(),
    positionLevel: z.string().max(100).optional(),
    personnelStatus: z.string().max(30).optional(),
    birthdayPeriod: z.string().max(30).optional(),
    joinStartDate: z.string().max(10).optional(),
    joinEndDate: z.string().max(10).optional(),
    leaveStartDate: z.string().max(10).optional(),
    leaveEndDate: z.string().max(10).optional(),
    contractExpireStartDate: z.string().max(10).optional(),
    contractExpireEndDate: z.string().max(10).optional(),
  }).optional(),
});

function timestamp() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const value = (type: string) => parts.find(part => part.type === type)?.value || "";
  return `${value("year")}${value("month")}${value("day")}_${value("hour")}${value("minute")}${value("second")}`;
}

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canPersonnelRoster(session, "export")) return NextResponse.json({ message: "暂无花名册导出权限" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "导出条件不正确" }, { status: 400 });
  const personnelIds = [...new Set(parsed.data.personnelIds || [])];
  const search = new URLSearchParams(parsed.data.filters || {});
  const filters = readPersonnelRosterFilters(search);
  const filterError = validatePersonnelRosterFilters(filters, search);
  if (filterError) return NextResponse.json({ message: filterError }, { status: 400 });
  try {
    const scope = await personnelRosterDataScope(session);
    const where = personnelIds.length ? { AND: [scope, { id: { in: personnelIds } }] } : { AND: [scope, await personnelRosterFilterWhere(filters)] };
    const rows = await db.personnel.findMany({ where, select: personnelRosterSelect, orderBy: [{ status: "asc" }, { hireDate: "desc" }, { id: "desc" }] });
    if (personnelIds.length && rows.length !== personnelIds.length) return NextResponse.json({ message: "部分人员已不存在或无权导出，请刷新列表后重试" }, { status: 403 });
    const exposeSensitive = canPersonnelRoster(session, "export-sensitive");
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "餐饮运营管理系统";
    const sheet = workbook.addWorksheet("花名册一览表");
    sheet.columns = [
      { header: "姓名", key: "name", width: 12 },
      { header: "手机号", key: "mobile", width: 16 },
      { header: "身份证", key: "idCard", width: 22 },
      { header: "员工生日", key: "birthday", width: 14 },
      { header: "人员状态", key: "personnelStatus", width: 12 },
      { header: "入职时间", key: "joinDate", width: 14 },
      { header: "岗位星级", key: "positionLevel", width: 16 },
      { header: "人员归属", key: "belonging", width: 16 },
      { header: "部门/店面", key: "departmentStore", width: 24 },
      { header: "离职日期", key: "leaveDate", width: 14 },
      { header: "合同签署日期", key: "contractSignedDate", width: 16 },
      { header: "合同年限", key: "contractTerm", width: 16 },
      { header: "合同到期日", key: "contractExpireDate", width: 16 },
      { header: "家庭住址", key: "registeredAddress", width: 30 },
      { header: "现住址", key: "currentAddress", width: 30 },
    ];
    for (const item of rows.map(row => serializePersonnelRoster(row, exposeSensitive))) {
      sheet.addRow({
        ...item,
        birthday: item.birthday || "-",
        personnelStatus: item.personnelStatus === "ACTIVE" ? "在职" : "已离职",
        belonging: item.belongingType === "HEADQUARTERS" ? "总部" : item.brandName || "-",
        departmentStore: item.belongingType === "HEADQUARTERS" ? item.departmentName || "-" : item.storeName || "-",
        leaveDate: item.leaveDate || "-",
        contractSignedDate: item.contractSignedDate || "-",
        contractExpireDate: item.contractIndefinite ? "无固定期限" : item.contractExpireDate || "-",
        registeredAddress: item.registeredAddress || "-",
        currentAddress: item.currentAddress || "-",
      });
    }
    sheet.getRow(1).height = 24;
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1677FF" } };
    sheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = { from: "A1", to: "O1" };
    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = `花名册一览表_${timestamp()}.xlsx`;
    await writeOperationLog({ userId: session.userId, username: session.username, client: "运营PC端", page: "花名册一览表", action: "批量导出", result: "成功", detail: `${personnelIds.length ? "按勾选人员" : "按当前筛选条件"}导出 ${rows.length} 条；${exposeSensitive ? "包含" : "不包含"}完整敏感信息`, request }).catch(() => undefined);
    return new NextResponse(Buffer.from(buffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}` } });
  } catch {
    await writeOperationLog({ userId: session.userId, username: session.username, client: "运营PC端", page: "花名册一览表", action: "批量导出", result: "失败", detail: "花名册导出失败", request }).catch(() => undefined);
    return NextResponse.json({ message: "花名册导出失败，请稍后重试" }, { status: 500 });
  }
}


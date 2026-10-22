import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { requireApiSession, sessionHasPermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";
import { userImportFields } from "@/lib/user-import";
import { RecordStatus } from "@prisma/client";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!sessionHasPermission(session, "settings:users")) return NextResponse.json({ message: "暂无用户管理权限" }, { status: 403 });

  const roles = await db.role.findMany({ where: { status: RecordStatus.ENABLED }, orderBy: [{ type: "asc" }, { name: "asc" }], select: { name: true, code: true } });
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "餐饮运营管理系统";
  const sheet = workbook.addWorksheet("用户导入模板");
  sheet.columns = userImportFields.map(field => ({ key: field.key, width: field.width, style: { numFmt: "@" } }));
  const header = sheet.getRow(1);
  userImportFields.forEach((field, index) => {
    const cell = header.getCell(index + 1);
    cell.value = field.required
      ? { richText: [{ text: "*", font: { color: { argb: "FFFF0000" }, bold: true } }, { text: field.header, font: { bold: true, color: { argb: "FF1F1F1F" } } }] }
      : { richText: [{ text: field.header, font: { bold: true, color: { argb: "FF1F1F1F" } } }, { text: "（选填）", font: { color: { argb: "FF8C8C8C" } } }] };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F7FA" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = { bottom: { style: "thin", color: { argb: "FFD9D9D9" } } };
  });
  header.height = 28;
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: "A1", to: `${String.fromCharCode(64 + userImportFields.length)}1` };

  const guide = workbook.addWorksheet("填写说明");
  guide.columns = [{ width: 22 }, { width: 96 }];
  guide.addRows([
    ["项目", "说明"],
    ["必填字段", "账号、真实姓名、初始密码、角色；模板表头红色 * 表示必填。"],
    ["账号规则", "2–30 位，只能包含英文字母、数字和下划线，且必须以英文字母开头；账号不能与系统中已有账号或本文件其他账号重复。"],
    ["初始密码", "至少 8 位。导入成功后，用户可使用该账号和密码登录。"],
    ["角色", `请填写一个已启用角色的名称或编码：${roles.map(role => `${role.name}（${role.code}）`).join("、") || "当前没有已启用角色"}。`],
    ["选填字段", "手机号、用户标签、账号状态。手机号须为 11 位中国大陆手机号；标签可用 | 分隔多个标签。"],
    ["账号状态", "可填写 启用、禁用、ENABLED 或 DISABLED；留空时默认启用。"],
    ["权限配置", "导入用户的类型为自定义用户，并使用所选角色的权限。运营 H5 品牌/店铺权限及区域负责人权限可在导入后到用户列表中配置。"],
    ["导入规则", "支持 .xlsx 文件，单次最多 500 条。系统会校验全部数据；任何一条不符合要求时，本次均不会写入。"],
  ]);
  guide.getRow(1).font = { bold: true, color: { argb: "FF1F1F1F" } };
  guide.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F7FA" } };
  guide.eachRow(row => { row.alignment = { vertical: "middle", wrapText: true }; });
  guide.getRow(1).height = 26;
  for (let index = 2; index <= guide.rowCount; index++) guide.getRow(index).height = 36;

  const buffer = await workbook.xlsx.writeBuffer();
  await writeOperationLog({ userId: session.userId, username: session.username, page: "用户列表", action: "下载导入模板", result: "成功", detail: "下载用户批量导入模板", request }).catch(() => undefined);
  return new NextResponse(Buffer.from(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent("用户批量导入模板.xlsx")}`,
    },
  });
}

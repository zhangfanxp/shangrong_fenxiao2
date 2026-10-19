import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { contractImportFields } from "@/lib/contract-import";
import { writeOperationLog } from "@/lib/operation-log";
import { canContractAction } from "@/lib/contract-permissions";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canContractAction(session.permissions, "import")) return NextResponse.json({ message: "暂无合同导入权限" }, { status: 403 });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "餐饮运营管理系统";
  const sheet = workbook.addWorksheet("合同导入模板");
  sheet.columns = contractImportFields.map(field => ({ key: field.key, width: field.width }));
  const header = sheet.getRow(1);
  contractImportFields.forEach((field, index) => {
    const cell = header.getCell(index + 1);
    cell.value = field.required
      ? { richText: [{ text: "*", font: { color: { argb: "FFFF0000" }, bold: true } }, { text: field.header, font: { bold: true, color: { argb: "FF1F1F1F" } } }] }
      : { richText: [{ text: field.header, font: { bold: true, color: { argb: "FF1F1F1F" } } }] };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F7FA" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = { bottom: { style: "thin", color: { argb: "FFD9D9D9" } } };
  });
  header.height = 28;
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: "A1", to: `${String.fromCharCode(64 + contractImportFields.length)}1` };
  for (const column of [6, 7, 8]) sheet.getColumn(column).numFmt = "yyyy-mm-dd";

  const buffer = await workbook.xlsx.writeBuffer();
  await writeOperationLog({ userId: session.userId, username: session.username, page: "合同管理", action: "下载导入模板", result: "成功", detail: "下载合同批量导入模板", request }).catch(() => undefined);
  return new NextResponse(Buffer.from(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent("合同批量导入模板.xlsx")}`,
    },
  });
}

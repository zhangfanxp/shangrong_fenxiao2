import ExcelJS from "exceljs";

export type PersonnelImportRequirement = "required" | "optional" | "conditional";

type PersonnelImportTemplateColumn = {
  key: string;
  requirement: PersonnelImportRequirement;
  example: string | number;
  note: string;
  width?: number;
};

export const personnelImportTemplateColumns: readonly PersonnelImportTemplateColumn[] = [
  { key: "姓名", requirement: "required", example: "张三", note: "最多8个汉字", width: 16 },
  { key: "手机号", requirement: "required", example: "13800138001", note: "11位手机号", width: 18 },
  { key: "身份证", requirement: "required", example: "11010519491231002X", note: "18位有效身份证号码", width: 24 },
  { key: "入职时间", requirement: "required", example: "2026-08-20", note: "格式：YYYY-MM-DD", width: 20 },
  { key: "所属岗位星级", requirement: "required", example: "店长·五星", note: "填写数据字典中的岗位星级", width: 22 },
  { key: "人员归属", requirement: "required", example: "奋小二", note: "填写“总部”或已启用的品牌名称", width: 20 },
  { key: "部门/店面", requirement: "required", example: "奋小二·静安店", note: "总部人员填写总部部门；其他人员填写门店名称", width: 24 },
  { key: "人员状态", requirement: "required", example: "在职", note: "批量导入仅支持“在职”", width: 18 },
  { key: "合同签署日期", requirement: "required", example: "2026-08-20", note: "格式：YYYY-MM-DD", width: 22 },
  { key: "合同年限", requirement: "optional", example: 5, note: "正整数，1至50年；可留空", width: 18 },
  { key: "合同到期日", requirement: "required", example: "2031-08-19", note: "格式：YYYY-MM-DD，不能早于合同签署日期", width: 22 },
  { key: "家庭住址", requirement: "required", example: "示例家庭住址", note: "最多50个字符", width: 24 },
  { key: "现住址", requirement: "required", example: "示例现住址", note: "最多50个字符", width: 24 },
  { key: "需补充材料", requirement: "optional", example: "", note: "最多50个字符；可留空", width: 20 },
  { key: "基本工资", requirement: "required", example: 6500, note: "填写大于或等于0的数字", width: 18 },
  { key: "社保情况", requirement: "required", example: "是", note: "填写“是”或“已签补充协议”", width: 20 },
  { key: "生日历法", requirement: "optional", example: "农历", note: "填写“农历”或“公历”；留空默认为农历", width: 20 },
  { key: "员工生日(月-日)", requirement: "optional", example: "01-15", note: "格式：MM-DD；可留空", width: 22 },
  { key: "平台权限", requirement: "optional", example: "无", note: "填写“有”或“无”；可留空", width: 18 },
  { key: "平台用户账号", requirement: "conditional", example: "", note: "平台权限为“有”时必填，填写已启用且未绑定的账号", width: 24 },
  { key: "备注信息", requirement: "optional", example: "示例行，请导入前删除", note: "最多50个字符；可留空", width: 28 },
];

export const personnelImportRequiredFields = personnelImportTemplateColumns
  .filter(column => column.requirement === "required")
  .map(column => column.key);

const requirementLabel: Record<PersonnelImportRequirement, string> = {
  required: "必填",
  optional: "选填",
  conditional: "条件必填",
};

const requirementFill: Record<PersonnelImportRequirement, string> = {
  required: "FFFDECEC",
  optional: "FFEAF2F8",
  conditional: "FFFFF3E0",
};

export function normalizePersonnelImportHeader(value: string) {
  return value
    .replace(/^\s*[＊*]\s*/, "")
    .replace(/\s*[（(](?:必填|选填|条件必填)[）)]\s*$/, "")
    .trim();
}

export function buildPersonnelImportWorkbook() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "餐饮管理系统";
  workbook.subject = "人员档案批量导入模板";

  const sheet = workbook.addWorksheet("人员档案导入", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  const headerRow = sheet.addRow(personnelImportTemplateColumns.map(column => {
    const prefix = column.requirement === "optional" ? "" : "* ";
    return `${prefix}${column.key}（${requirementLabel[column.requirement]}）`;
  }));
  const exampleRow = sheet.addRow(personnelImportTemplateColumns.map(column => column.example));

  headerRow.height = 36;
  exampleRow.height = 26;
  headerRow.eachCell((cell, columnNumber) => {
    const column = personnelImportTemplateColumns[columnNumber - 1];
    const label = `${column.key}（${requirementLabel[column.requirement]}）`;
    cell.value = column.requirement === "optional"
      ? label
      : {
          richText: [
            { font: { bold: true, color: { argb: "FFC62828" } }, text: "* " },
            { font: { bold: true, color: { argb: "FF1F2937" } }, text: label },
          ],
        };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: requirementFill[column.requirement] } };
    cell.font = { ...cell.font, bold: true, color: { argb: "FF1F2937" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: "FFD1D5DB" } },
      left: { style: "thin", color: { argb: "FFD1D5DB" } },
      bottom: { style: "thin", color: { argb: "FFD1D5DB" } },
      right: { style: "thin", color: { argb: "FFD1D5DB" } },
    };
  });
  exampleRow.eachCell(cell => {
    cell.alignment = { vertical: "middle", wrapText: false };
    cell.font = { color: { argb: "FF4B5563" } };
  });
  sheet.columns.forEach((column, index) => { column.width = personnelImportTemplateColumns[index]?.width || 18; });
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: personnelImportTemplateColumns.length } };

  const instructionSheet = workbook.addWorksheet("填写说明", {
    views: [{ state: "frozen", ySplit: 4 }],
  });
  instructionSheet.mergeCells("A1:D1");
  instructionSheet.getCell("A1").value = "人员档案导入填写说明";
  instructionSheet.getCell("A1").font = { bold: true, size: 14, color: { argb: "FF1F2937" } };
  instructionSheet.getCell("A1").alignment = { vertical: "middle" };
  instructionSheet.getRow(1).height = 28;
  instructionSheet.mergeCells("A2:D2");
  instructionSheet.getCell("A2").value = "红色 * 表示必填或条件必填；请保留“人员档案导入”工作表的表头，并在删除示例行后填写数据。";
  instructionSheet.getCell("A2").font = { color: { argb: "FF4B5563" }, italic: true };
  instructionSheet.addRow([]);
  instructionSheet.addRow(["字段", "填写要求", "填写规则", "示例"]);
  personnelImportTemplateColumns.forEach(column => {
    instructionSheet.addRow([column.key, requirementLabel[column.requirement], column.note, column.example]);
  });
  const instructionHeader = instructionSheet.getRow(4);
  instructionHeader.height = 26;
  instructionHeader.eachCell(cell => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF374151" } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });
  instructionSheet.getColumn(1).width = 24;
  instructionSheet.getColumn(2).width = 16;
  instructionSheet.getColumn(3).width = 52;
  instructionSheet.getColumn(4).width = 28;
  instructionSheet.getRows(5, personnelImportTemplateColumns.length)?.forEach(row => {
    row.height = 24;
    row.eachCell(cell => {
      cell.alignment = { vertical: "middle", wrapText: true };
      cell.border = { bottom: { style: "thin", color: { argb: "FFE5E7EB" } } };
    });
  });

  return workbook;
}

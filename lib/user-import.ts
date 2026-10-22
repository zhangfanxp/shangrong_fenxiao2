import ExcelJS from "exceljs";

export type UserImportField = {
  key: keyof UserImportRow;
  header: string;
  required?: boolean;
  width: number;
};

export type UserImportRow = {
  username: string;
  realName: string;
  password: string;
  role: string;
  phone: string;
  tags: string;
  status: string;
};

export const userImportFields: UserImportField[] = [
  { key: "username", header: "账号", required: true, width: 22 },
  { key: "realName", header: "真实姓名", required: true, width: 18 },
  { key: "password", header: "初始密码", required: true, width: 22 },
  { key: "role", header: "角色", required: true, width: 24 },
  { key: "phone", header: "手机号", width: 18 },
  { key: "tags", header: "用户标签", width: 30 },
  { key: "status", header: "账号状态", width: 18 },
];

export type ParsedUserImportRow = { row: number; excelRow: number; data: UserImportRow };

function cellValueText(cell: ExcelJS.Cell, trim = true) {
  const value = cell.value;
  const resolved = value && typeof value === "object" && "result" in value ? value.result : value;
  if (resolved === null || resolved === undefined) return "";
  if (resolved instanceof Date) return resolved.toISOString();
  const text = typeof resolved === "object" && "richText" in resolved ? resolved.richText.map(part => part.text).join("") : String(resolved);
  return trim ? text.trim() : text;
}

function normalizedHeader(value: string) {
  return value.normalize("NFKC").replace(/^\s*\*\s*/, "").replace(/\s*[（(]选填[）)]\s*$/, "").replace(/\s+/g, "").trim();
}

export function parseUserImportSheet(sheet: ExcelJS.Worksheet) {
  const columns = new Map<keyof UserImportRow, number>();
  const headers = new Map(userImportFields.map(field => [field.header, field]));
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, column) => {
    const field = headers.get(normalizedHeader(cellValueText(cell)));
    if (field && !columns.has(field.key)) columns.set(field.key, column);
  });
  const missing = userImportFields.filter(field => field.required && !columns.has(field.key)).map(field => field.header);
  if (missing.length) throw new Error(`导入模板缺少必填字段：${missing.join("、")}`);

  const rows: ParsedUserImportRow[] = [];
  for (let excelRow = 2; excelRow <= sheet.rowCount; excelRow++) {
    const row = sheet.getRow(excelRow);
    const data = Object.fromEntries(userImportFields.map(field => [
      field.key,
      columns.has(field.key) ? cellValueText(row.getCell(columns.get(field.key)!), field.key !== "password") : "",
    ])) as UserImportRow;
    if (!userImportFields.some(field => data[field.key] !== "")) continue;
    rows.push({ row: rows.length + 1, excelRow, data });
  }
  if (!rows.length) throw new Error("模板第 2 行开始没有可导入的用户数据");
  return rows;
}

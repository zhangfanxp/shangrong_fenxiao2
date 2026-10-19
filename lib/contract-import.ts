import ExcelJS from "exceljs";
import districtData from "@/District/pca-code.json";

type DistrictNode = { code: string; name: string; children?: DistrictNode[] };

export type ContractImportField = {
  key: keyof ContractImportRow;
  header: string;
  required?: boolean;
  width: number;
};

export type ContractImportRow = {
  brandName: string;
  storeName: string;
  status: string;
  cooperationType: string;
  archiveBox: string;
  trialOpenDate: string;
  startDate: string;
  endDate: string;
  ownerName: string;
  ownerPhone: string;
  ownerIdNumber: string;
  contactName: string;
  contactPhone: string;
  province: string;
  city: string;
  district: string;
  address: string;
  cooperationFee: string;
  brandFee: string;
  financeServiceFee: string;
  designFee: string;
  deposit: string;
  depositRecipient: string;
  remark: string;
};

export const contractImportFields: ContractImportField[] = [
  { key: "brandName", header: "品牌", required: true, width: 16 },
  { key: "storeName", header: "门店名称", required: true, width: 24 },
  { key: "status", header: "合同状态", required: true, width: 16 },
  { key: "cooperationType", header: "合作类型", required: true, width: 16 },
  { key: "archiveBox", header: "档案盒号", required: true, width: 16 },
  { key: "trialOpenDate", header: "试营业日期", width: 15 },
  { key: "startDate", header: "合同开始日期", required: true, width: 17 },
  { key: "endDate", header: "合同截止日期", required: true, width: 17 },
  { key: "ownerName", header: "签约业主", required: true, width: 16 },
  { key: "ownerPhone", header: "业主联系电话", width: 18 },
  { key: "ownerIdNumber", header: "业主身份证号", width: 22 },
  { key: "contactName", header: "经办人", required: true, width: 16 },
  { key: "contactPhone", header: "经办人电话", required: true, width: 18 },
  { key: "province", header: "省", width: 16 },
  { key: "city", header: "市", width: 16 },
  { key: "district", header: "区/县", width: 16 },
  { key: "address", header: "详细地址", width: 32 },
  { key: "cooperationFee", header: "合作费", width: 14 },
  { key: "brandFee", header: "品牌使用费", width: 16 },
  { key: "financeServiceFee", header: "财务服务费", width: 18 },
  { key: "designFee", header: "设计费", width: 14 },
  { key: "deposit", header: "保证金", width: 14 },
  { key: "depositRecipient", header: "保证金收款人", width: 18 },
  { key: "remark", header: "备注", width: 32 },
];

export type ContractImportIssue = { row: number; excelRow: number; messages: string[] };
export type ParsedContractImportRow = { row: number; excelRow: number; data: ContractImportRow };

function cellValueText(cell: ExcelJS.Cell) {
  const value = cell.value;
  const resolved = value && typeof value === "object" && "result" in value ? value.result : value;
  if (resolved === null || resolved === undefined) return "";
  if (resolved instanceof Date) return formatDate(resolved);
  if (typeof resolved === "object" && "richText" in resolved) return resolved.richText.map(part => part.text).join("").trim();
  return String(resolved).trim();
}

function formatDate(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function excelSerialToDate(value: number) {
  const date = new Date(Math.round((value - 25_569) * 86_400_000));
  return Number.isNaN(date.getTime()) ? "" : formatDate(date);
}

function dateValueText(cell: ExcelJS.Cell) {
  const value = cell.value;
  const resolved = value && typeof value === "object" && "result" in value ? value.result : value;
  if (resolved instanceof Date) return formatDate(resolved);
  if (typeof resolved === "number") return excelSerialToDate(resolved);
  return cellValueText(cell).replaceAll("/", "-");
}

function normalizedHeader(value: string) {
  return value.normalize("NFKC").replace(/^\s*\*\s*/, "").replace(/\s+/g, "").trim();
}

export function parseContractImportSheet(sheet: ExcelJS.Worksheet) {
  const columns = new Map<keyof ContractImportRow, number>();
  const headers = new Map(contractImportFields.map(field => [field.header, field]));
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, column) => {
    const field = headers.get(normalizedHeader(cellValueText(cell)));
    if (field && !columns.has(field.key)) columns.set(field.key, column);
  });
  const missing = contractImportFields.filter(field => !columns.has(field.key)).map(field => field.header);
  if (missing.length) throw new Error(`导入模板缺少字段：${missing.join("、")}`);

  const rows: ParsedContractImportRow[] = [];
  for (let excelRow = 2; excelRow <= sheet.rowCount; excelRow++) {
    const row = sheet.getRow(excelRow);
    const hasValue = contractImportFields.some(field => cellValueText(row.getCell(columns.get(field.key)!)) !== "");
    if (!hasValue) continue;
    const data = Object.fromEntries(contractImportFields.map(field => [
      field.key,
      ["trialOpenDate", "startDate", "endDate"].includes(field.key)
        ? dateValueText(row.getCell(columns.get(field.key)!))
        : cellValueText(row.getCell(columns.get(field.key)!)),
    ])) as ContractImportRow;
    rows.push({ row: rows.length + 1, excelRow, data });
  }
  if (!rows.length) throw new Error("模板第 2 行开始没有可导入的合同数据");
  return rows;
}

export function validateContractImportDistrict(data: Pick<ContractImportRow, "province" | "city" | "district">) {
  const values = [data.province, data.city, data.district];
  if (!values.some(Boolean)) return undefined;
  if (values.some(value => !value)) return "省、市、区/县须同时填写";
  const province = (districtData as DistrictNode[]).find(item => item.name === data.province);
  if (!province) return `省“${data.province}”与地区数据不匹配`;
  const city = province.children?.find(item => item.name === data.city);
  if (!city) return `市“${data.city}”与省“${data.province}”不匹配，请使用完整名称`;
  const district = city.children?.find(item => item.name === data.district);
  if (!district) return `区/县“${data.district}”与“${data.city}”不匹配，请使用完整名称`;
  return undefined;
}

export function parseNonnegativeAmount(value: string, label: string) {
  if (!value) return { value: 0 };
  const normalized = value.normalize("NFKC").replace(/[￥¥,，\s]/g, "");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return { error: `${label}须为最多两位小数的非负金额` };
  const parsed = Number(normalized);
  return Number.isSafeInteger(Math.round(parsed * 100)) ? { value: parsed } : { error: `${label}数值不正确` };
}

export function isStrictDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day;
}

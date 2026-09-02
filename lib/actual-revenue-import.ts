import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";

export const MAX_ACTUAL_REVENUE_FILE_SIZE = 200 * 1024 * 1024;

export type ImportField =
  | "storeName" | "businessDate" | "revenueAmount" | "discountAmount" | "operatingIncome"
  | "orderCount" | "dinerCount" | "tableCount" | "preDiscountPerCapita" | "postDiscountPerCapita"
  | "preDiscountAvgOrder" | "postDiscountAvgOrder" | "tableOpenRate" | "tableTurnoverRate"
  | "seatOccupancyRate" | "avgDiningDurationMinutes";

export const fieldAliases: Record<ImportField, string[]> = {
  storeName: ["门店名称", "门店"],
  businessDate: ["营业日"],
  revenueAmount: ["营业额(元)"],
  discountAmount: ["优惠金额(元)"],
  operatingIncome: ["营业收入(元)"],
  orderCount: ["订单量"],
  dinerCount: ["用餐人数"],
  tableCount: ["消费桌数"],
  preDiscountPerCapita: ["折前人均(元)", "折前人家(元)"],
  postDiscountPerCapita: ["折后人均(元)"],
  preDiscountAvgOrder: ["折前单均(元)"],
  postDiscountAvgOrder: ["折后单均(元)"],
  tableOpenRate: ["开台率"],
  tableTurnoverRate: ["翻台率"],
  seatOccupancyRate: ["上座率"],
  avgDiningDurationMinutes: ["平均用餐时长(分钟)"],
};

const requiredFields: ImportField[] = ["storeName", "businessDate", "revenueAmount", "discountAmount", "operatingIncome", "orderCount", "dinerCount", "tableCount"];

export function normalizeExcelHeader(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/[（【]/g, "(")
    .replace(/[）】]/g, ")")
    .replace(/[：﹕]/g, ":")
    .replace(/\s+/g, "")
    .toLowerCase();
}

const aliasesToField = new Map<string, ImportField>(Object.entries(fieldAliases).flatMap(([field, aliases]) => aliases.map(alias => [normalizeExcelHeader(alias), field as ImportField])));

export function resolveHeaderColumns(rows: ExcelJS.Row[]) {
  const columns = new Map<ImportField, number>();
  for (const row of rows) {
    row.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
      const field = aliasesToField.get(normalizeExcelHeader(cell.text || cell.value));
      if (field && !columns.has(field)) columns.set(field, columnNumber);
    });
  }
  const missing = requiredFields.filter(field => !columns.has(field));
  if (missing.length) {
    const labels = missing.map(field => fieldAliases[field][0]);
    const seen = [...new Set(rows.flatMap(row => {
      const values: string[] = [];
      row.eachCell({ includeEmpty: false }, cell => values.push(String(cell.text || cell.value || "")));
      return values;
    }).filter(Boolean))];
    const preview = seen.slice(0, 12).join("、") || "无";
    const suffix = seen.length > 12 ? `等${seen.length}项` : "";
    throw new Error(`导入文件缺少必要字段：${labels.join("、")}（前五行已识别：${preview}${suffix}）`);
  }
  return columns;
}

function cellResult(cell: ExcelJS.Cell) {
  const value = cell.value;
  if (value && typeof value === "object" && "formula" in value) {
    const result = (value as ExcelJS.CellFormulaValue).result;
    if (result === undefined || result === null || result === "") throw new Error("公式单元格缺少计算结果");
    return result;
  }
  return value;
}

function decimalText(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  return String(value ?? "").trim().replace(/,/g, "").replace(/^¥\s*/, "");
}

export function parseDecimalCell(cell: ExcelJS.Cell, label: string, required = false, nonNegative = true) {
  const raw = decimalText(cellResult(cell));
  if (!raw) {
    if (required) throw new Error(`${label}不能为空`);
    return null;
  }
  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(raw)) throw new Error(`${label}必须为数字`);
  const value = new Prisma.Decimal(raw);
  if (nonNegative && value.isNegative()) throw new Error(`${label}不能为负数`);
  return value;
}

export function parseIntegerCell(cell: ExcelJS.Cell, label: string, required = false) {
  const raw = decimalText(cellResult(cell));
  if (!raw) {
    if (required) throw new Error(`${label}不能为空`);
    return null;
  }
  if (!/^\d+$/.test(raw)) throw new Error(`${label}必须为非负整数`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) throw new Error(`${label}数值过大`);
  return value;
}

export function parseRateCell(cell: ExcelJS.Cell, label: string) {
  const rawValue = cellResult(cell);
  const raw = decimalText(rawValue);
  if (!raw) return null;
  const percent = raw.endsWith("%");
  const numeric = percent ? raw.slice(0, -1) : raw;
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(numeric)) throw new Error(`${label}格式不正确`);
  let value = new Prisma.Decimal(numeric);
  if (percent) value = value.div(100);
  if (value.isNegative()) throw new Error(`${label}不能为负数`);
  return value;
}

function excelSerialToDate(serial: number) {
  if (!Number.isFinite(serial) || serial <= 0) throw new Error("营业日格式不正确");
  const utc = Math.round((serial - 25569) * 86400 * 1000);
  const result = new Date(utc);
  if (Number.isNaN(result.getTime())) throw new Error("营业日格式不正确");
  return result;
}

export function parseBusinessDate(cell: ExcelJS.Cell) {
  const value = cellResult(cell);
  let date: Date;
  let expected: [number, number, number] | undefined;
  if (value instanceof Date) date = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  else if (typeof value === "number") date = excelSerialToDate(value);
  else {
    const text = String(value ?? "").trim().replace(/[./年]/g, "-").replace(/月/g, "-").replace(/日/g, "").replace(/-+/g, "-");
    const matched = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
    if (!matched) throw new Error("营业日格式不正确");
    expected = [Number(matched[1]), Number(matched[2]), Number(matched[3])];
    date = new Date(Date.UTC(expected[0], expected[1] - 1, expected[2]));
  }
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  if (year < 2000 || year > 2100 || (expected && (year !== expected[0] || month !== expected[1] || day !== expected[2]))) throw new Error("营业日格式不正确");
  return date;
}

export type ParsedActualRevenueRow = {
  excelRow: number;
  storeName: string;
  businessDate: Date;
  statMonth: string;
  revenueAmount: Prisma.Decimal;
  discountAmount: Prisma.Decimal | null;
  operatingIncome: Prisma.Decimal | null;
  orderCount: number | null;
  dinerCount: number | null;
  tableCount: number | null;
  preDiscountPerCapita: Prisma.Decimal | null;
  postDiscountPerCapita: Prisma.Decimal | null;
  preDiscountAvgOrder: Prisma.Decimal | null;
  postDiscountAvgOrder: Prisma.Decimal | null;
  tableOpenRate: Prisma.Decimal | null;
  tableTurnoverRate: Prisma.Decimal | null;
  seatOccupancyRate: Prisma.Decimal | null;
  avgDiningDurationMinutes: Prisma.Decimal | null;
};

export function isBlankDataRow(row: ExcelJS.Row, columns: Map<ImportField, number>) {
  return [...columns.values()].every(column => String(row.getCell(column).text || "").trim() === "");
}

export function parseDataRow(row: ExcelJS.Row, columns: Map<ImportField, number>): ParsedActualRevenueRow {
  const cell = (field: ImportField) => row.getCell(columns.get(field) || 0);
  const storeName = String(cell("storeName").text || cellResult(cell("storeName")) || "").trim();
  if (!storeName) throw new Error("门店名称不能为空");
  const businessDate = parseBusinessDate(cell("businessDate"));
  const statMonth = `${businessDate.getUTCFullYear()}-${String(businessDate.getUTCMonth() + 1).padStart(2, "0")}`;
  return {
    excelRow: row.number,
    storeName,
    businessDate,
    statMonth,
    revenueAmount: parseDecimalCell(cell("revenueAmount"), "营业额", true)!,
    discountAmount: parseDecimalCell(cell("discountAmount"), "优惠金额"),
    operatingIncome: parseDecimalCell(cell("operatingIncome"), "营业收入"),
    orderCount: parseIntegerCell(cell("orderCount"), "订单量"),
    dinerCount: parseIntegerCell(cell("dinerCount"), "用餐人数"),
    tableCount: parseIntegerCell(cell("tableCount"), "消费桌数"),
    preDiscountPerCapita: columns.has("preDiscountPerCapita") ? parseDecimalCell(cell("preDiscountPerCapita"), "折前人均") : null,
    postDiscountPerCapita: columns.has("postDiscountPerCapita") ? parseDecimalCell(cell("postDiscountPerCapita"), "折后人均") : null,
    preDiscountAvgOrder: columns.has("preDiscountAvgOrder") ? parseDecimalCell(cell("preDiscountAvgOrder"), "折前单均") : null,
    postDiscountAvgOrder: columns.has("postDiscountAvgOrder") ? parseDecimalCell(cell("postDiscountAvgOrder"), "折后单均") : null,
    tableOpenRate: columns.has("tableOpenRate") ? parseRateCell(cell("tableOpenRate"), "开台率") : null,
    tableTurnoverRate: columns.has("tableTurnoverRate") ? parseRateCell(cell("tableTurnoverRate"), "翻台率") : null,
    seatOccupancyRate: columns.has("seatOccupancyRate") ? parseRateCell(cell("seatOccupancyRate"), "上座率") : null,
    avgDiningDurationMinutes: columns.has("avgDiningDurationMinutes") ? parseDecimalCell(cell("avgDiningDurationMinutes"), "平均用餐时长") : null,
  };
}

export function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

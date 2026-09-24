import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import {
  ProductCategorySalesError,
  normalizeProductCategoryHeader,
  normalizeProductCategoryStoreAlias,
  normalizeProductCategoryText,
  type ProductCategorySalesInputDetail,
} from "@/lib/product-category-sales-ratios";

export const PRODUCT_CATEGORY_SALES_REQUIRED_HEADERS = [
  "城市", "门店", "菜品大类", "销售数量", "销售数量占比", "销售额（元）", "销售额占比",
  "菜品收入（元）", "菜品收入占比", "菜品优惠（元）", "菜品优惠占比",
] as const;

export type ProductCategorySalesRequiredHeader = (typeof PRODUCT_CATEGORY_SALES_REQUIRED_HEADERS)[number];
export type ParsedProductCategorySalesDetail = ProductCategorySalesInputDetail & { city: string; rowNo: number };
export type ParsedProductCategorySalesGroup = { storeAlias: string; excelRows: number[]; details: ParsedProductCategorySalesDetail[]; errors: string[] };

export function productCategorySalesRowText(row: ExcelJS.Row) {
  const values: string[] = [];
  row.eachCell({ includeEmpty: false }, cell => values.push(normalizeProductCategoryText(cell.text)));
  return values.join(" ");
}

function validDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day;
}

export function parseProductCategorySalesPeriod(text: string) {
  const match = text.match(/营业日期\s*[:：]?\s*[【\[]?\s*(\d{4})[\/.\-年](\d{1,2})[\/.\-月](\d{1,2})日?\s*(?:至|到|~|—|－|-)\s*(\d{4})[\/.\-年](\d{1,2})[\/.\-月](\d{1,2})日?\s*[】\]]?/);
  if (!match) throw new ProductCategorySalesError("导入文件第2行不存在可识别的营业日期", 400);
  const [, startYear, startMonth, startDay, endYear, endMonth, endDay] = match.map(Number);
  if (!validDate(startYear, startMonth, startDay) || !validDate(endYear, endMonth, endDay)) throw new ProductCategorySalesError("导入文件营业日期无法解析", 400);
  if (startYear !== endYear || startMonth !== endMonth) throw new ProductCategorySalesError("导入文件营业日期跨越多个自然月份，无法识别唯一所属月份", 400);
  const start = new Date(Date.UTC(startYear, startMonth - 1, startDay));
  const end = new Date(Date.UTC(endYear, endMonth - 1, endDay));
  if (start > end) throw new ProductCategorySalesError("导入文件营业日期起止顺序不正确", 400);
  return { year: startYear, month: startMonth, start, end };
}

function mergedCellText(cell: ExcelJS.Cell) {
  return normalizeProductCategoryHeader(cell.isMerged ? cell.master.text : cell.text);
}

export function parseProductCategorySalesHeaderColumns(sheet: ExcelJS.Worksheet) {
  const columns = new Map<ProductCategorySalesRequiredHeader, number>();
  const row3 = sheet.getRow(3);
  const row4 = sheet.getRow(4);
  const maxColumn = Math.max(sheet.columnCount, row3.cellCount, row4.cellCount);
  let inheritedTop = "";
  for (let column = 1; column <= maxColumn; column++) {
    const ownTop = mergedCellText(row3.getCell(column));
    if (ownTop) inheritedTop = ownTop;
    const top = ownTop || inheritedTop;
    const bottom = mergedCellText(row4.getCell(column));
    const topWithoutUnit = top.replace(/（元）$/, "");
    const candidates = [...new Set([bottom, `${top}${bottom}`, `${topWithoutUnit}${bottom}`, top].filter(Boolean))];
    const matched = candidates.find(candidate => PRODUCT_CATEGORY_SALES_REQUIRED_HEADERS.includes(candidate as ProductCategorySalesRequiredHeader)) as ProductCategorySalesRequiredHeader | undefined;
    if (!matched) continue;
    if (columns.has(matched) && columns.get(matched) !== column) throw new ProductCategorySalesError(`导入文件字段重复：${matched}`, 400);
    columns.set(matched, column);
  }
  for (const header of PRODUCT_CATEGORY_SALES_REQUIRED_HEADERS) if (!columns.has(header)) throw new ProductCategorySalesError(`导入文件缺少必要字段：${header}`, 400);
  return columns;
}

function rawCellValue(cell: ExcelJS.Cell) {
  const value = cell.value;
  if (value && typeof value === "object" && "result" in value) return value.result;
  return value;
}

function parseDecimal(cell: ExcelJS.Cell, label: string, allowNegative = false) {
  const raw = rawCellValue(cell);
  if (raw === null || raw === undefined || String(raw).trim() === "") throw new Error(`${label}为空`);
  const normalized = String(raw).normalize("NFKC").replace(/[￥¥,，\s]/g, "");
  const pattern = allowNegative ? /^-?\d+(?:\.\d{1,2})?$/ : /^\d+(?:\.\d{1,2})?$/;
  if (!pattern.test(normalized)) throw new Error(`${label}格式错误`);
  const value = new Prisma.Decimal(normalized);
  if ((!allowNegative && value.isNegative()) || value.abs().greaterThanOrEqualTo("10000000000000000")) throw new Error(allowNegative ? `${label}超出允许范围` : `${label}必须是有效的非负数`);
  return value.toDecimalPlaces(2);
}

function validateImportedRatio(cell: ExcelJS.Cell, label: string) {
  const raw = rawCellValue(cell);
  if (raw === null || raw === undefined || String(raw).trim() === "") throw new Error(`${label}为空`);
  const text = String(raw).normalize("NFKC").replace(/[,%％，\s]/g, "");
  if (!/^\d+(?:\.\d+)?$/.test(text)) throw new Error(`${label}格式错误`);
  const number = Number(text);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${label}格式错误`);
}

export function parseProductCategorySalesRows(sheet: ExcelJS.Worksheet, columns: Map<ProductCategorySalesRequiredHeader, number>) {
  const groups = new Map<string, ParsedProductCategorySalesGroup>();
  let rawRowCount = 0;
  for (let rowNo = 5; rowNo <= sheet.rowCount; rowNo++) {
    const row = sheet.getRow(rowNo);
    const cityText = normalizeProductCategoryText(row.getCell(columns.get("城市")!).text);
    if (cityText.replace(/\s+/g, "") === "合计") break;
    if (PRODUCT_CATEGORY_SALES_REQUIRED_HEADERS.every(header => !normalizeProductCategoryText(row.getCell(columns.get(header)!).text))) continue;
    rawRowCount++;
    const storeAlias = normalizeProductCategoryText(row.getCell(columns.get("门店")!).text);
    const key = storeAlias ? normalizeProductCategoryStoreAlias(storeAlias) : `__blank_store_${rowNo}`;
    const group = groups.get(key) || { storeAlias, excelRows: [], details: [], errors: [] };
    group.excelRows.push(rowNo);
    try {
      if (!storeAlias) throw new Error("门店为空");
      if (storeAlias.length > 100) throw new Error("门店名称不能超过100个字符");
      const city = cityText;
      if (!city) throw new Error("城市为空");
      if (city.length > 100) throw new Error("城市不能超过100个字符");
      const categoryName = normalizeProductCategoryText(row.getCell(columns.get("菜品大类")!).text);
      if (!categoryName) throw new Error("菜品大类为空");
      if (categoryName.length > 100) throw new Error("菜品大类不能超过100个字符");
      validateImportedRatio(row.getCell(columns.get("销售数量占比")!), "销售数量占比");
      validateImportedRatio(row.getCell(columns.get("销售额占比")!), "销售额占比");
      validateImportedRatio(row.getCell(columns.get("菜品收入占比")!), "菜品收入占比");
      validateImportedRatio(row.getCell(columns.get("菜品优惠占比")!), "菜品优惠占比");
      group.details.push({
        rowNo,
        city,
        categoryName,
        salesQuantity: parseDecimal(row.getCell(columns.get("销售数量")!), "销售数量"),
        salesAmount: parseDecimal(row.getCell(columns.get("销售额（元）")!), "销售额（元）"),
        dishIncome: parseDecimal(row.getCell(columns.get("菜品收入（元）")!), "菜品收入（元）"),
        dishDiscount: parseDecimal(row.getCell(columns.get("菜品优惠（元）")!), "菜品优惠（元）", true),
        sortOrder: rowNo - 4,
      });
    } catch (error) {
      group.errors.push(`第${rowNo}行：${error instanceof Error ? error.message : "数据格式错误"}`);
    }
    groups.set(key, group);
  }
  if (!rawRowCount) throw new ProductCategorySalesError("第5行开始没有可读取的业务数据", 400);
  return { groups: [...groups.values()], rawRowCount };
}

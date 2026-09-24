import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import {
  parseProductCategorySalesHeaderColumns,
  parseProductCategorySalesPeriod,
  parseProductCategorySalesRows,
} from "../lib/product-category-sales-import";
import {
  calculateProductCategorySales,
  canProductCategorySales,
  normalizeProductCategoryHeader,
  normalizeProductCategoryStoreAlias,
  normalizeProductCategoryText,
  productCategorySalesFiltersSchema,
} from "../lib/product-category-sales-ratios";

assert.equal(canProductCategorySales({ permissions: ["product-category-sales:import"] }, "import"), true);
assert.equal(canProductCategorySales({ permissions: ["product-category-sales:import"] }, "delete"), false);
assert.equal(canProductCategorySales({ permissions: ["operations:view"] }, "query"), true);
assert.equal(canProductCategorySales({ permissions: ["operations:view"] }, "import"), false);
assert.equal(productCategorySalesFiltersSchema.safeParse({ month: "2026-09" }).success, true);
assert.equal(productCategorySalesFiltersSchema.safeParse({ month: "2026-13" }).success, false);
assert.equal(normalizeProductCategoryText("　奋小二  南山　"), "奋小二 南山");
assert.equal(normalizeProductCategoryStoreAlias("奋小二（南山店）"), "奋小二南山店");
assert.equal(normalizeProductCategoryStoreAlias("奋小二(Nanshan)"), "奋小二Nanshan");
assert.equal(normalizeProductCategoryStoreAlias("奋小二（南山店）"), normalizeProductCategoryStoreAlias("奋小二南山店"));
assert.equal(normalizeProductCategoryHeader("销售额 (元)"), "销售额（元）");

const period = parseProductCategorySalesPeriod("营业日期：【2026/09/01 至 2026/09/23】");
assert.equal(period.year, 2026);
assert.equal(period.month, 9);
assert.throws(() => parseProductCategorySalesPeriod("营业日期：2026/09/25 至 2026/10/05"), /跨越多个自然月份/);

const workbook = new ExcelJS.Workbook();
const sheet = workbook.addWorksheet("菜品销售统计");
sheet.getCell("A1").value = "菜品销售统计";
sheet.getCell("A2").value = "营业日期：【2026/09/01 至 2026/09/23】";
sheet.mergeCells("A3:A4"); sheet.getCell("A3").value = "城市";
sheet.mergeCells("B3:B4"); sheet.getCell("B3").value = "门店";
sheet.mergeCells("C3:C4"); sheet.getCell("C3").value = "菜品大类";
sheet.mergeCells("D3:E3"); sheet.getCell("D3").value = "销售数量"; sheet.getCell("D4").value = "销售数量"; sheet.getCell("E4").value = "占比";
sheet.mergeCells("F3:G3"); sheet.getCell("F3").value = "销售额（元）"; sheet.getCell("F4").value = "销售额（元）"; sheet.getCell("G4").value = "占比";
sheet.mergeCells("H3:I3"); sheet.getCell("H3").value = "菜品收入（元）"; sheet.getCell("H4").value = "菜品收入（元）"; sheet.getCell("I4").value = "占比";
sheet.mergeCells("J3:K3"); sheet.getCell("J3").value = "菜品优惠（元）"; sheet.getCell("J4").value = "菜品优惠（元）"; sheet.getCell("K4").value = "占比";

sheet.addRow(["深圳", "奋小二南山", "特色小吃", 100, "20%", 1000, "25%", 900, "25%", -4, "0%"]);
sheet.addRow(["深圳", "奋小二南山", "火锅类", 400, "80%", 3000, "75%", 2700, "75%", 0, "0%"]);
sheet.addRow(["合计", "", "", 500, "100%", 4000, "100%", 3600, "100%", -4, "100%"]);
sheet.addRow(["不应读取", "错误门店", "错误分类", 1, "1%", 1, "1%", 1, "1%", 1, "1%"]);
const columns = parseProductCategorySalesHeaderColumns(sheet);
assert.equal(columns.get("销售数量占比"), 5);
assert.equal(columns.get("销售额占比"), 7);
const rows = parseProductCategorySalesRows(sheet, columns);
assert.equal(rows.rawRowCount, 2);
assert.equal(rows.groups.length, 1);
assert.equal(rows.groups[0].details.length, 2);
assert.equal(rows.groups[0].details[0].dishDiscount.toFixed(2), "-4.00");

const calculated = calculateProductCategorySales(rows.groups[0].details);
assert.equal(calculated.totalSalesQuantity.toFixed(2), "500.00");
assert.equal(calculated.totalSalesAmount.toFixed(2), "4000.00");
assert.equal(calculated.details[0].salesQuantityRatio?.toFixed(4), "20.0000");
assert.equal(calculated.details[1].salesAmountRatio?.toFixed(4), "75.0000");
assert.equal(calculated.details[0].dishDiscountRatio?.toFixed(4), "100.0000");

process.stdout.write("product category sales verification passed\n");

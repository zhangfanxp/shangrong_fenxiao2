import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import { nextMonth } from "../lib/actual-revenue";
import { normalizeExcelHeader, parseDataRow, resolveHeaderColumns } from "../lib/actual-revenue-import";

assert.equal(nextMonth("2026-08"), "2026-09");
assert.equal(nextMonth("2026-12"), "2027-01");
assert.equal(normalizeExcelHeader(" 营业额（元） "), "营业额(元)");
assert.equal(normalizeExcelHeader("折前人家（元）"), "折前人家(元)");

const workbook = new ExcelJS.Workbook();
const sheet = workbook.addWorksheet("营业额");
const headers = ["门店", "营业日", "营业额（元）", "优惠金额(元)", "营业收入（元）", "订单量", "用餐人数", "消费桌数", "折前人家（元）", "折后人均(元)", "折前单均(元)", "折后单均（元）", "开台率", "翻台率", "上座率", "平均用餐时长（分钟）"];
headers.forEach((header, index) => { sheet.getCell(3, index + 2).value = header; });
const row = sheet.getRow(6);
row.getCell(2).value = "奋小二·静安店";
row.getCell(3).value = "2026-08-13";
row.getCell(4).value = { formula: "10000+2500.25", result: 12500.25 };
row.getCell(5).value = 500;
row.getCell(6).value = 12000.25;
row.getCell(7).value = 100;
row.getCell(8).value = 220;
row.getCell(9).value = 80;
row.getCell(10).value = 60;
row.getCell(11).value = 55;
row.getCell(12).value = 125;
row.getCell(13).value = 120;
row.getCell(14).value = "80%";
row.getCell(15).value = 1.8;
row.getCell(16).value = "75%";
row.getCell(17).value = 85.5;

const columns = resolveHeaderColumns([sheet.getRow(1), sheet.getRow(2), sheet.getRow(3), sheet.getRow(4), sheet.getRow(5)]);
const parsed = parseDataRow(row, columns);
assert.equal(parsed.storeName, "奋小二·静安店");
assert.equal(parsed.statMonth, "2026-08");
assert.equal(parsed.revenueAmount.toFixed(2), "12500.25");
assert.equal(parsed.tableOpenRate?.toFixed(2), "0.80");
assert.equal(parsed.tableTurnoverRate?.toFixed(2), "1.80");
assert.equal(parsed.avgDiningDurationMinutes?.toFixed(1), "85.5");

row.getCell(3).value = "2026-02-31";
assert.throws(() => parseDataRow(row, columns), /营业日格式不正确/);

const precise = new Prisma.Decimal("0.1").plus(new Prisma.Decimal("0.2"));
assert.equal(precise.toFixed(2), "0.30");

console.log("实际营业额核心规则验证通过：月份、表头兼容、公式结果、日期、比率和精确金额。 ");

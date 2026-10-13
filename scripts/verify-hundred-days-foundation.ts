import assert from "node:assert/strict";
import {
  canHundredDays,
  hundredDaysFilterWhere,
  hundredDaysFiltersSchema,
  hundredDaysRecordId,
  hundredDaysSourceWhere,
  parseHundredDaysRecordId,
  serializeHundredDaysRows,
  type HundredDaysSource,
} from "../lib/hundred-days-foundation";

assert.equal(canHundredDays({ permissions: ["hundred-days:query"] }, "query"), true);
assert.equal(canHundredDays({ permissions: ["hundred-days:query"] }, "export"), false);
assert.equal(canHundredDays({ permissions: ["hundred-days:export"] }, "export"), true);
assert.equal(canHundredDays({ permissions: ["operations:view"] }, "query"), true);
assert.equal(canHundredDays({ permissions: ["operations:view"] }, "export"), false);

assert.equal(hundredDaysFiltersSchema.safeParse({}).success, true);
assert.equal(hundredDaysFiltersSchema.safeParse({ platform: "MEITUAN" }).success, true);
assert.equal(hundredDaysFiltersSchema.safeParse({ platform: "ELEME" }).success, false);
assert.equal(hundredDaysFiltersSchema.safeParse({ startDate: "2026-10-01", endDate: "2026-10-31" }).success, true);
assert.equal(hundredDaysFiltersSchema.safeParse({ startDate: "2026-10-31", endDate: "2026-10-01" }).success, false);
assert.equal(hundredDaysFiltersSchema.safeParse({ startDate: "2026-02-30" }).success, false);
assert.deepEqual(hundredDaysFilterWhere({ brand: "奋小二", storeNameKeyword: "静安", platform: "KUAISHOU", startDate: "", endDate: "" }), {
  OR: [{ brandIdSnapshot: "奋小二" }, { brandNameSnapshot: "奋小二" }],
  storeNameSnapshot: { contains: "静安" },
});

const formula = (left: string, right: string) => ({
  formula: {
    expression: `{{${left}}} / {{${right}}}`,
    displayExpression: "测试公式",
    referenceKeys: [left, right],
    divisionByZero: "NULL",
    rpn: [
      { type: "FIELD" as const, fieldKey: left },
      { type: "FIELD" as const, fieldKey: right },
      { type: "OPERATOR" as const, operator: "/" as const },
    ],
  },
});

const metric = (sortOrder: number, itemName: string) => ({ sourceFieldKey: `task-item:${sortOrder}`, sortOrder, itemName });
const source: HundredDaysSource = {
  sourceRecordNo: "202610080001",
  templateId: "task-1",
  platforms: [{
    code: "KUAISHOU",
    label: "快手团购",
    metrics: {
      shopScore: metric(0, "快手团购_店铺分"),
      rating: metric(1, "快手团购_评分"),
      weeklyOrders: metric(2, "快手团购_周单量"),
      weeklyReviews: metric(3, "快手团购_周评价数"),
      weeklyPositiveReviews: metric(4, "快手团购_周好评数"),
      weeklyNegativeReviews: metric(5, "快手团购_周差评数"),
      productQuality: metric(6, "快手团购_产品质量(内容)"),
      serviceExperience: metric(7, "快手团购_服务体验(内容)"),
      environmentExperience: metric(8, "快手团购_环境卫生体验(内容)"),
    },
    rates: {
      reviewRate: { sourceFieldConfig: formula("task-item:3", "task-item:2") },
      positiveRate: { sourceFieldConfig: formula("task-item:4", "task-item:3") },
      negativeRate: { sourceFieldConfig: formula("task-item:5", "task-item:3") },
    },
  }],
};

assert.deepEqual(hundredDaysSourceWhere(source), { taskIdSnapshot: "task-1" });
assert.equal(hundredDaysRecordId("submission-1", "KUAISHOU"), "submission-1:KUAISHOU");
assert.deepEqual(parseHundredDaysRecordId("submission-1:KUAISHOU"), { submissionId: "submission-1", platformCode: "KUAISHOU" });
assert.equal(parseHundredDaysRecordId("submission-1:UNKNOWN"), null);

const [row] = serializeHundredDaysRows({
  id: "submission-1",
  brandNameSnapshot: "奋小二",
  storeNameSnapshot: "静安店",
  executionDate: new Date("2026-10-05T00:00:00.000Z"),
  items: [
    { sortOrder: 0, itemName: "快手团购_店铺分", value: "92" },
    { sortOrder: 1, itemName: "快手团购_评分", value: "4.8" },
    { sortOrder: 2, itemName: "快手团购_周单量", value: "200" },
    { sortOrder: 3, itemName: "快手团购_周评价数", value: "100" },
    { sortOrder: 4, itemName: "快手团购_周好评数", value: "95" },
    { sortOrder: 5, itemName: "快手团购_周差评数", value: "5" },
    { sortOrder: 6, itemName: "快手团购_产品质量(内容)", value: "口味稳定" },
    { sortOrder: 7, itemName: "快手团购_服务体验(内容)", value: "服务热情" },
    { sortOrder: 8, itemName: "快手团购_环境卫生体验(内容)", value: "环境整洁" },
  ],
}, source);
assert.equal(row.id, "submission-1:KUAISHOU");
assert.equal(row.weekDate, "2026-10-05");
assert.equal(row.platformName, "快手团购");
assert.equal(row.shopScore, 92);
assert.equal(row.rating, 4.8);
assert.equal(row.reviewRate, 0.5);
assert.equal(row.positiveRate, 0.95);
assert.equal(row.negativeRate, 0.05);
assert.equal(row.productQuality, "口味稳定");

process.stdout.write("hundred-days foundation verification passed\n");

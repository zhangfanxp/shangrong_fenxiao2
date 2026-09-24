import assert from "node:assert/strict";
import {
  canDailySalesReport,
  dailySalesReportFilterWhere,
  dailySalesReportFiltersSchema,
  dailySalesReportSourceWhere,
  serializeDailySalesReport,
  type DailySalesReportSource,
} from "../lib/daily-sales-report";

assert.equal(canDailySalesReport({ permissions: ["daily-sales-report:query"] }, "query"), true);
assert.equal(canDailySalesReport({ permissions: ["daily-sales-report:query"] }, "export"), false);
assert.equal(canDailySalesReport({ permissions: ["daily-sales-report:export"] }, "export"), true);
assert.equal(canDailySalesReport({ permissions: ["operations:view"] }, "query"), true);
assert.equal(canDailySalesReport({ permissions: ["operations:view"] }, "export"), false);

assert.equal(dailySalesReportFiltersSchema.safeParse({}).success, true);
assert.equal(dailySalesReportFiltersSchema.safeParse({ startDate: "2026-09-01", endDate: "2026-09-30" }).success, true);
assert.equal(dailySalesReportFiltersSchema.safeParse({ startDate: "2026-09-30", endDate: "2026-09-01" }).success, false);
assert.equal(dailySalesReportFiltersSchema.safeParse({ startDate: "2026-02-30" }).success, false);
assert.equal(dailySalesReportFiltersSchema.safeParse({ startDate: "2026-09-00" }).success, false);
assert.deepEqual(dailySalesReportFilterWhere({ brand: "奋小二", storeNameKeyword: "静安", startDate: "", endDate: "" }), {
  OR: [{ brandIdSnapshot: "奋小二" }, { brandNameSnapshot: "奋小二" }],
  storeNameSnapshot: { contains: "静安" },
});

const source: DailySalesReportSource = {
  sourceRecordNo: "202609240001",
  templateId: "task-1",
  metrics: {
    actualSalesAmount: { sortOrder: 0, itemName: "【营业数据】实际销售额" },
    receivedAmount: { sortOrder: 1, itemName: "【营业数据】实收金额" },
    scanCashAmount: { sortOrder: 2, itemName: "【业绩构成】扫码/现金" },
    meituanAmount: { sortOrder: 3, itemName: "【业绩构成】美团团购" },
    douyinAmount: { sortOrder: 4, itemName: "【业绩构成】抖音" },
    kuaishouAmount: { sortOrder: 5, itemName: "【业绩构成】快手" },
    gaodeAmount: { sortOrder: 6, itemName: "【业绩构成】高德" },
    takeawayAmount: { sortOrder: 7, itemName: "【业绩构成】外卖" },
  },
};
assert.deepEqual(dailySalesReportSourceWhere(source), { taskIdSnapshot: "task-1" });

const serialized = serializeDailySalesReport({
  id: "submission-1",
  brandNameSnapshot: "奋小二",
  storeNameSnapshot: "静安店",
  executionDate: new Date("2026-09-24T00:00:00.000Z"),
  userRealNameSnapshot: "张三",
  items: [
    { sortOrder: 0, itemName: "【营业数据】实际销售额", value: "12345.6" },
    { sortOrder: 1, itemName: "【营业数据】实收金额", value: "12000.00" },
    { sortOrder: 2, itemName: "【业绩构成】扫码/现金", value: null },
    { sortOrder: 3, itemName: "【业绩构成】美团团购", value: "2000" },
    { sortOrder: 4, itemName: "【业绩构成】抖音", value: "1000.5" },
    { sortOrder: 5, itemName: "【业绩构成】快手", value: "500" },
    { sortOrder: 6, itemName: "【业绩构成】高德", value: "250" },
    { sortOrder: 7, itemName: "【业绩构成】外卖", value: "800.25" },
  ],
}, source);
assert.equal(serialized.businessDate, "2026-09-24");
assert.equal(serialized.actualSalesAmount, 12345.6);
assert.equal(serialized.receivedAmount, 12000);
assert.equal(serialized.scanCashAmount, null);
assert.equal(serialized.gaodeAmount, 250);
assert.equal(serialized.takeawayAmount, 800.25);

process.stdout.write("daily sales report verification passed\n");

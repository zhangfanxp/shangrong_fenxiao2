import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import {
  calculateRevenueDailyTargets, canRevenueTarget, previousMonth, revenueTargetFilterWhere,
  serializeRevenueTarget, weekdayText,
} from "../lib/revenue-targets";

assert.equal(previousMonth("2026-09"), "2026-08");
assert.equal(previousMonth("2027-01"), "2026-12");
assert.throws(() => previousMonth("2027-00"), /所属月份格式不正确/);

assert.deepEqual(revenueTargetFilterWhere({}), {});
assert.deepEqual(revenueTargetFilterWhere({ brand: "奋小二", storeKeyword: "南山", targetMonth: "2026-09" }), {
  AND: [
    { OR: [{ brandId: "奋小二" }, { brandCode: "奋小二" }, { brandNameSnapshot: "奋小二" }] },
    { storeNameSnapshot: { contains: "南山" } },
    { targetMonth: "2026-09" },
  ],
});

const session = { userId: "user-1", username: "admin", realName: "管理员", role: "ADMIN", permissions: ["revenue-targets:create"] };
assert.equal(canRevenueTarget(session, "create"), true);
assert.equal(canRevenueTarget(session, "delete"), false);
assert.equal(canRevenueTarget({ ...session, permissions: ["operations:view"] }, "query"), true);
assert.equal(canRevenueTarget({ ...session, permissions: ["actual-revenue:set-monthly-target"] }, "query"), true);
assert.equal(canRevenueTarget({ ...session, permissions: ["actual-revenue:set-monthly-target"] }, "view"), true);
assert.equal(canRevenueTarget({ ...session, permissions: ["actual-revenue:set-monthly-target"] }, "export"), false);

assert.deepEqual(serializeRevenueTarget({
  id: "target-1",
  recordNo: "202609020001",
  targetMonth: "2026-09",
  brandNameSnapshot: "奋小二",
  storeNameSnapshot: "奋小二南山店",
  regionNameSnapshot: null,
  targetAmount: new Prisma.Decimal("500000"),
  dailyTargetStatus: "PENDING",
}), {
  id: "target-1",
  recordNo: "202609020001",
  targetMonth: "2026-09",
  brandName: "奋小二",
  storeName: "奋小二南山店",
  regionName: "-",
  targetAmount: "500000.00",
  dailyTargetStatus: "PENDING",
});

assert.equal(weekdayText(new Date("2026-09-01T00:00:00.000Z")), "星期二");

const weekdayOccurrences = Array.from({ length: 7 }, () => 0);
const previousDaily = Array.from({ length: 28 }, (_, index) => {
  const businessDate = new Date(Date.UTC(2026, 7, index + 1));
  const weekday = businessDate.getUTCDay();
  weekdayOccurrences[weekday] += 1;
  const base = 1000 + weekday * 100;
  return { businessDate, revenueAmount: new Prisma.Decimal(weekday === 1 && weekdayOccurrences[weekday] === 4 ? base * 2 : base) };
});
const calculated = calculateRevenueDailyTargets({ targetMonth: "2026-09", targetAmount: new Prisma.Decimal(260000), previousDaily });
assert.equal(calculated.dailyTargets.length, 30);
assert.equal(calculated.initialAverages[1].toFixed(2), "1375.00");
assert.equal(calculated.secondaryAverages[1].toFixed(2), "1100.00");
assert.equal(calculated.excludedCounts[1], 1);
assert.equal(calculated.dailyTargets.reduce((total, item) => total.plus(item.targetAmount), new Prisma.Decimal(0)).toFixed(2), "260000.00");
assert.equal(calculated.dailyTargets[0].targetDate.toISOString().slice(0, 10), "2026-09-01");
assert.equal(calculated.dailyTargets[0].weekday, "星期二");

assert.throws(() => calculateRevenueDailyTargets({ targetMonth: "2026-09", targetAmount: new Prisma.Decimal(260000), previousDaily: previousDaily.filter(item => item.businessDate.getUTCDay() !== 0) }), /缺少星期日数据/);
const allMondayOutliers = previousDaily.map((item, index) => item.businessDate.getUTCDay() === 1 ? { ...item, revenueAmount: new Prisma.Decimal(index % 2 ? 1 : 100) } : item);
assert.throws(() => calculateRevenueDailyTargets({ targetMonth: "2026-09", targetAmount: new Prisma.Decimal(260000), previousDaily: allMondayOutliers }), /没有有效样本/);

console.log("目标营业额核心规则验证通过：跨年月份、权限、星期二次均值、20%异常值剔除、目标月填充和分级尾差对齐。");

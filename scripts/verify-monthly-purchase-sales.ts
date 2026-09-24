import assert from "node:assert/strict";
import {
  calculateMonthlyPurchaseSalesRatios, canMonthlyPurchaseSales,
  monthlyPurchaseSalesCreateSchema, monthlyPurchaseSalesFiltersSchema,
  normalizeMeituanAlias,
} from "../lib/monthly-purchase-sales-ratios";

const session = { permissions: ["monthly-purchase-sales:create"] };
assert.equal(canMonthlyPurchaseSales(session, "create"), true);
assert.equal(canMonthlyPurchaseSales(session, "delete"), false);
assert.equal(canMonthlyPurchaseSales({ permissions: ["operations:view"] }, "query"), true);
assert.equal(canMonthlyPurchaseSales({ permissions: ["operations:view"] }, "create"), false);

assert.equal(monthlyPurchaseSalesFiltersSchema.safeParse({ year: "2026", month: "12" }).success, true);
assert.equal(monthlyPurchaseSalesFiltersSchema.safeParse({ year: "2025" }).success, false);
assert.equal(monthlyPurchaseSalesFiltersSchema.safeParse({ year: "3000" }).success, false);
assert.equal(monthlyPurchaseSalesCreateSchema.safeParse({ aliasId: "store-1", year: 2026, month: 7, preDiscountSales: 100000.5, postDiscountSales: null, purchaseAmount: 30000, remark: "" }).success, true);
assert.equal(monthlyPurchaseSalesCreateSchema.safeParse({ aliasId: "store-1", year: 2026, month: 7, preDiscountSales: 0, postDiscountSales: null, purchaseAmount: 0, remark: "" }).success, false);

const ratios = calculateMonthlyPurchaseSalesRatios({ preDiscountSales: "100000", postDiscountSales: "80000", purchaseAmount: "30000" });
assert.equal(ratios.preDiscountPurchaseSalesRatio.toFixed(4), "30.0000");
assert.equal(ratios.postDiscountPurchaseSalesRatio?.toFixed(4), "37.5000");
assert.equal(calculateMonthlyPurchaseSalesRatios({ preDiscountSales: 100, postDiscountSales: null, purchaseAmount: 0 }).postDiscountPurchaseSalesRatio, null);
assert.equal(normalizeMeituanAlias("　奋小二南山　"), "奋小二南山");

process.stdout.write("monthly purchase-sales verification passed\n");

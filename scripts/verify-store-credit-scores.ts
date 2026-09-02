import assert from "node:assert/strict";
import { readCreditScoreSnapshot, storeCreditScoreFilterWhere, validDate } from "../lib/store-credit-scores";
import { storeReviewFilterWhere } from "../lib/store-reviews";

assert.equal(validDate(undefined), true);
assert.equal(validDate("2026-09-02"), true);
assert.equal(validDate("2026-02-29"), false);
assert.equal(validDate("2024-02-29"), true);
assert.equal(validDate("2026-13-01"), false);

const creditWhere = storeCreditScoreFilterWhere({
  brand: "BRAND_CODE",
  storeId: "store-1",
  assessmentStartDate: "2026-09-01",
  assessmentEndDate: "2026-09-02",
  supervisorUserId: "supervisor-1",
});
assert.equal(creditWhere.reviewType, "STORE_CREDIT_SCORE");
assert.equal(creditWhere.storeId, "store-1");
assert.equal(creditWhere.reviewerUserId, "supervisor-1");
assert.deepEqual(creditWhere.OR, [
  { brandId: "BRAND_CODE" }, { brandCodeSnapshot: "BRAND_CODE" }, { brandNameSnapshot: "BRAND_CODE" },
]);
assert.equal((creditWhere.assessmentDate as { gte: Date }).gte.toISOString(), "2026-08-31T16:00:00.000Z");
assert.equal((creditWhere.assessmentDate as { lte: Date }).lte.toISOString(), "2026-09-02T15:59:59.999Z");

const regularReviewWhere = storeReviewFilterWhere({});
assert.deepEqual(regularReviewWhere.reviewType, { in: ["FRONT_HALL_AUDIT", "BACK_KITCHEN_AUDIT"] });

const snapshot = readCreditScoreSnapshot({
  scoreMode: "CUSTOM_SCORE",
  scoreModeLabel: "允许自定义得分",
  sections: [{ children: [{ items: [{ id: "item-1", breachAmount: "500" }] }] }],
});
assert.equal(snapshot.valid, true);
assert.equal(snapshot.scoreMode, "CUSTOM_SCORE");
assert.equal(snapshot.scoreModeLabel, "允许自定义得分");
assert.equal(snapshot.breachAmounts.get("item-1"), "500");

assert.equal(readCreditScoreSnapshot({ scoreMode: "CUSTOM_SCORE", sections: "broken" }).valid, false);
assert.equal(readCreditScoreSnapshot(null).valid, false);

console.log("门店信用得分规则验证通过");

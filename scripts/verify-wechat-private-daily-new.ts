import assert from "node:assert/strict";
import {
  canWechatPrivateDailyNew,
  wechatPrivateDailyNewFilterWhere,
  wechatPrivateDailyNewFiltersSchema,
  wechatPrivateDailyNewSourceWhere,
} from "../lib/wechat-private-daily-new";

assert.equal(canWechatPrivateDailyNew({ permissions: ["wechat-private-daily-new:query"] }, "query"), true);
assert.equal(canWechatPrivateDailyNew({ permissions: ["wechat-private-daily-new:query"] }, "export"), false);
assert.equal(canWechatPrivateDailyNew({ permissions: ["operations:view"] }, "query"), true);
assert.equal(canWechatPrivateDailyNew({ permissions: ["operations:view"] }, "export"), false);

assert.equal(wechatPrivateDailyNewFiltersSchema.safeParse({}).success, true);
assert.equal(wechatPrivateDailyNewFiltersSchema.safeParse({ startDate: "2026-09-01", endDate: "2026-09-30" }).success, true);
assert.equal(wechatPrivateDailyNewFiltersSchema.safeParse({ startDate: "2026-09-30", endDate: "2026-09-01" }).success, false);
assert.equal(wechatPrivateDailyNewFiltersSchema.safeParse({ startDate: "2026-02-30" }).success, false);
assert.deepEqual(wechatPrivateDailyNewFilterWhere({ brand: "奋小二", storeNameKeyword: "静安", startDate: "", endDate: "" }), {
  OR: [{ brandIdSnapshot: "奋小二" }, { brandNameSnapshot: "奋小二" }],
  storeNameSnapshot: { contains: "静安" },
});
assert.deepEqual(wechatPrivateDailyNewSourceWhere({ sourceRecordNo: "202610190001", templateId: "task-1", metricSortOrder: 8, metricItemName: "【微信新增】今日新增好友" }), {
  taskIdSnapshot: "task-1",
  items: { some: { sortOrder: 8, itemName: "【微信新增】今日新增好友", value: { not: null } } },
});

process.stdout.write("wechat private daily-new verification passed\n");

import assert from "node:assert/strict";
import {
  canDailyBreakEven,
  dailyBreakEvenFiltersSchema,
  filterDailyBreakEvenByAchievement,
  serializeDailyBreakEven,
  type DailyBreakEvenSource,
} from "../lib/daily-break-even";

assert.equal(canDailyBreakEven({ permissions: ["daily-break-even:query"] }, "query"), true);
assert.equal(canDailyBreakEven({ permissions: ["daily-break-even:query"] }, "export"), false);
assert.equal(canDailyBreakEven({ permissions: ["daily-break-even:view"] }, "view"), true);
assert.equal(canDailyBreakEven({ permissions: ["daily-break-even:export"] }, "export"), true);
assert.equal(canDailyBreakEven({ permissions: ["operations:view"] }, "query"), true);
assert.equal(canDailyBreakEven({ permissions: ["operations:view"] }, "view"), true);
assert.equal(canDailyBreakEven({ permissions: ["operations:view"] }, "export"), false);

assert.equal(dailyBreakEvenFiltersSchema.safeParse({ startDate: "2026-10-02", endDate: "2026-10-01" }).success, false);
assert.equal(dailyBreakEvenFiltersSchema.safeParse({ achievement: "QUALIFIED" }).success, true);
assert.equal(dailyBreakEvenFiltersSchema.safeParse({ achievement: "UNKNOWN" }).success, false);

const source: DailyBreakEvenSource = {
  sourceRecordNo: "202610090001",
  templateId: "task-1",
  receivedAmount: { sourceFieldKey: "task-item:0", sortOrder: 0, itemName: "【营业数据】实收金额" },
  monthlyBreakEvenRevenue: { sourceFieldKey: "system-source:store-cost:monthly-break-even-revenue", sourceFieldConfig: {} },
  dailyBreakEvenRevenue: {
    sourceFieldKey: "formula:daily",
    sourceFieldConfig: {
      formula: {
        expression: "{{system-source:store-cost:monthly-break-even-revenue}} / 30",
        displayExpression: "[月保本营业额] / 30",
        referenceKeys: ["system-source:store-cost:monthly-break-even-revenue"],
        rpn: [
          { type: "FIELD", fieldKey: "system-source:store-cost:monthly-break-even-revenue" },
          { type: "NUMBER", value: 30 },
          { type: "OPERATOR", operator: "/" },
        ],
      },
    },
  },
  achievement: {
    sourceFieldKey: "judgment:achievement",
    sourceFieldConfig: {
      judgment: {
        conditions: [
          {
            leftExpression: "{{task-item:0}}",
            rightExpression: "{{formula:daily}}",
            leftReferenceKeys: ["task-item:0"],
            rightReferenceKeys: ["formula:daily"],
            leftRpn: [{ type: "FIELD", fieldKey: "task-item:0" }],
            rightRpn: [{ type: "FIELD", fieldKey: "formula:daily" }],
            operator: "GTE",
            result: "合格",
          },
          {
            leftExpression: "{{task-item:0}}",
            rightExpression: "{{formula:daily}}",
            leftReferenceKeys: ["task-item:0"],
            rightReferenceKeys: ["formula:daily"],
            leftRpn: [{ type: "FIELD", fieldKey: "task-item:0" }],
            rightRpn: [{ type: "FIELD", fieldKey: "formula:daily" }],
            operator: "LT",
            result: "不合格",
          },
        ],
      },
    },
  },
};

const row = serializeDailyBreakEven({
  id: "submission-1",
  recordNo: "20261009000001",
  executionDate: new Date("2026-10-09T00:00:00.000Z"),
  submittedAt: new Date("2026-10-09T01:02:03.000Z"),
  brandNameSnapshot: "测试品牌",
  storeNameSnapshot: "测试门店",
  userRealNameSnapshot: "测试上报人",
  store: {
    costProfile: {
      storeRent: 3000,
      employeeWages: 6000,
      dormitoryRent: 1000,
      propertyFee: 1000,
      utilitiesFee: 3000,
      otherCost: 1000,
      ratioCoefficient: 0.5,
    },
  },
  items: [{ sortOrder: 0, itemName: "【营业数据】实收金额", value: "1100" }],
}, source);

assert.equal(row.monthlyBreakEvenRevenue, 30000);
assert.equal(row.dailyBreakEvenRevenue, 1000);
assert.equal(row.achievementCode, "QUALIFIED");
assert.equal(row.achievementLabel, "合格");
assert.deepEqual(filterDailyBreakEvenByAchievement([row], "QUALIFIED").map(item => item.id), ["submission-1"]);
assert.equal(filterDailyBreakEvenByAchievement([row], "UNQUALIFIED").length, 0);

console.log("每日保本营业额核心规则验证通过");

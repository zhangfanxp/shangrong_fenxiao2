import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { createSession } from "../lib/auth";
import { nextActualRevenueRecordNo } from "../lib/actual-revenue";
import { db } from "../lib/db";

const baseUrl = process.env.REVENUE_TARGET_TEST_BASE_URL || "http://127.0.0.1:3011";
const statMonth = "2098-11";
const targetMonth = "2098-12";

async function main() {
  const users = await db.user.findMany({ where: { status: "ENABLED", role: { status: "ENABLED" } }, include: { role: true }, orderBy: { createdAt: "asc" } });
  const user = users.find(candidate => Array.isArray(candidate.role.permissions) && candidate.role.permissions.includes("*"));
  assert(user, "没有可用于验证的超级管理员用户");
  const permissions = Array.isArray(user.role.permissions) ? user.role.permissions.filter((item): item is string => typeof item === "string") : [];
  const store = await db.store.findFirst({ include: { brand: true }, orderBy: { createdAt: "asc" } });
  assert(store, "没有可用于验证的门店");
  const token = await createSession({ userId: user.id, username: user.username, realName: user.realName, role: user.role.code, permissions });
  const cookie = `canyin_session=${token}`;
  const api = async (path: string, init: RequestInit = {}) => fetch(`${baseUrl}${path}`, { ...init, headers: { Cookie: cookie, ...(init.headers || {}) } });

  const clean = async () => {
    const source = await db.actualRevenueMonthly.findUnique({ where: { storeId_statMonth: { storeId: store.id, statMonth } }, include: { monthlyTarget: true } });
    if (!source) return;
    if (source.monthlyTarget) await db.storeMonthlyTarget.delete({ where: { id: source.monthlyTarget.id } });
    await db.actualRevenueDaily.deleteMany({ where: { monthlyRecordId: source.id } });
    await db.actualRevenueMonthly.delete({ where: { id: source.id } });
  };

  await clean();
  try {
    const source = await db.$transaction(async tx => tx.actualRevenueMonthly.create({ data: {
      recordNo: await nextActualRevenueRecordNo(tx),
      statMonth,
      brandId: store.brandId,
      brandNameSnapshot: store.brand.name,
      storeId: store.id,
      storeNameSnapshot: store.name,
      regionNameSnapshot: store.region,
      storeManagerNameSnapshot: store.managerName,
      supervisorNameSnapshot: store.supervisorName,
      cooperationTypeSnapshot: store.cooperationType,
      monthlyRevenue: "368520.00",
      createdByUserId: user.id,
      createdByName: user.realName,
    } }));
    const previousMonthDayCount = new Date(Date.UTC(2098, 11, 0)).getUTCDate();
    const weekdayOccurrences = Array.from({ length: 7 }, () => 0);
    await db.actualRevenueDaily.createMany({ data: Array.from({ length: previousMonthDayCount }, (_, index) => {
      const businessDate = new Date(Date.UTC(2098, 10, index + 1));
      const weekday = businessDate.getUTCDay();
      weekdayOccurrences[weekday] += 1;
      const base = 9000 + weekday * 500;
      return {
        monthlyRecordId: source.id,
        storeId: store.id,
        businessDate,
        revenueAmount: weekday === 1 && weekdayOccurrences[weekday] === 4 ? base * 2 : base,
      };
    }) });

    const storesResponse = await api(`/api/revenue-targets/stores?brand=${encodeURIComponent(store.brand.name)}&keyword=${encodeURIComponent(store.name.slice(0, 2))}`);
    const stores = await storesResponse.json();
    assert.equal(storesResponse.status, 200, JSON.stringify(stores));
    assert(stores.some((item: { storeId: string }) => item.storeId === store.id), "门店权限搜索未返回验证门店");

    const previousResponse = await api(`/api/revenue-targets/previous-actual?storeId=${store.id}&targetMonth=${targetMonth}`);
    const previous = await previousResponse.json();
    assert.equal(previousResponse.status, 200, JSON.stringify(previous));
    assert.equal(previous.exists, true);
    assert.equal(previous.actualMonth, statMonth);
    assert.equal(previous.actualRevenue, "368520.00");

    const createResponse = await api("/api/revenue-targets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetMonth, brand: store.brand.name, storeId: store.id, targetAmount: 500000, remark: "HTTP链路验证" }) });
    const created = await createResponse.json();
    assert.equal(createResponse.status, 201, JSON.stringify(created));
    assert.match(created.recordNo, /^\d{12}$/);

    const listResponse = await api(`/api/revenue-targets?brand=${encodeURIComponent(store.brand.name)}&storeKeyword=${encodeURIComponent(store.name)}&targetMonth=${targetMonth}&page=1&pageSize=20`);
    const list = await listResponse.json();
    assert.equal(listResponse.status, 200, JSON.stringify(list));
    assert.equal(list.total, 1);
    assert.equal(list.rows[0].targetAmount, "500000.00");
    assert.equal(list.rows[0].dailyTargetStatus, "PENDING");

    const detailResponse = await api(`/api/revenue-targets/${created.id}`);
    const detail = await detailResponse.json();
    assert.equal(detailResponse.status, 200, JSON.stringify(detail));
    assert.equal(detail.overview.previousActualRevenue, "368520.00");
    assert.equal(detail.overview.remark, "HTTP链路验证");
    assert.deepEqual(detail.dailyTargets, []);

    const duplicateResponse = await api("/api/revenue-targets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetMonth, storeId: store.id, targetAmount: 510000 }) });
    const duplicate = await duplicateResponse.json();
    assert.equal(duplicateResponse.status, 409, JSON.stringify(duplicate));
    assert.match(duplicate.message, /已存在/);

    const actualDuplicateResponse = await api(`/api/actual-revenue/${source.id}/monthly-target`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetMonth, targetAmount: 520000 }) });
    assert.equal(actualDuplicateResponse.status, 409, await actualDuplicateResponse.text());

    const exportResponse = await api("/api/revenue-targets/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filters: { targetMonth, storeKeyword: store.name } }) });
    assert.equal(exportResponse.status, 200, await exportResponse.text());
    assert.match(exportResponse.headers.get("content-type") || "", /spreadsheetml/);

    const deleteResponse = await api(`/api/revenue-targets/${created.id}`, { method: "DELETE" });
    const deleted = await deleteResponse.json();
    assert.equal(deleteResponse.status, 200, JSON.stringify(deleted));
    const unlocked = await db.actualRevenueMonthly.findUnique({ where: { id: source.id }, include: { monthlyTarget: true } });
    assert.equal(unlocked?.monthlyTarget, null);
    assert.equal(unlocked?.dailyTargetStatus, "NOT_GENERATED");

    const actualCreateResponse = await api(`/api/actual-revenue/${source.id}/monthly-target`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetMonth, targetAmount: 530000 }) });
    const actualCreated = await actualCreateResponse.json();
    assert.equal(actualCreateResponse.status, 200, JSON.stringify(actualCreated));
    const sharedTarget = await db.storeMonthlyTarget.findUnique({ where: { sourceActualRevenueId: source.id } });
    assert(sharedTarget);
    assert.equal(sharedTarget.sourceType, "ACTUAL_REVENUE");
    assert.match(sharedTarget.recordNo, /^\d{12}$/);

    const actualTargetListResponse = await api(`/api/revenue-targets?brand=${encodeURIComponent(store.brand.name)}&storeKeyword=${encodeURIComponent(store.name)}&targetMonth=${targetMonth}&page=1&pageSize=20`);
    const actualTargetList = await actualTargetListResponse.json();
    assert.equal(actualTargetListResponse.status, 200, JSON.stringify(actualTargetList));
    assert.equal(actualTargetList.total, 1);
    assert.equal(actualTargetList.rows[0].id, sharedTarget.id);
    assert.equal(actualTargetList.rows[0].targetAmount, "530000.00");

    const calculateResponse = await api(`/api/revenue-targets/${sharedTarget.id}/calculate-daily`, { method: "POST" });
    const calculateResult = await calculateResponse.json();
    assert.equal(calculateResponse.status, 200, JSON.stringify(calculateResult));
    const targetMonthDayCount = new Date(Date.UTC(2098, 12, 0)).getUTCDate();
    assert.equal(calculateResult.generatedCount, targetMonthDayCount);
    assert.equal(calculateResult.totalAmount, "530000.00");
    const generatedTarget = await db.storeMonthlyTarget.findUnique({ where: { id: sharedTarget.id }, include: { dailyTargets: { orderBy: { targetDate: "asc" } }, sourceActualRevenue: true } });
    assert.equal(generatedTarget?.dailyTargetStatus, "GENERATED");
    assert.equal(generatedTarget?.sourceActualRevenue.dailyTargetStatus, "GENERATED");
    assert.equal(generatedTarget?.dailyTargets.length, targetMonthDayCount);
    assert.equal(generatedTarget?.dailyTargets.reduce((total, item) => total.plus(item.targetAmount), new Prisma.Decimal(0)).toFixed(2), "530000.00");

    const generatedDetailResponse = await api(`/api/revenue-targets/${sharedTarget.id}`);
    const generatedDetail = await generatedDetailResponse.json();
    assert.equal(generatedDetailResponse.status, 200, JSON.stringify(generatedDetail));
    assert.equal(generatedDetail.dailyTargets.length, targetMonthDayCount);
    assert.match(generatedDetail.dailyTargets[0].weekday, /^星期[一二三四五六日]$/);

    const repeatedCalculateResponse = await api(`/api/revenue-targets/${sharedTarget.id}/calculate-daily`, { method: "POST" });
    const repeatedCalculate = await repeatedCalculateResponse.json();
    assert.equal(repeatedCalculateResponse.status, 409, JSON.stringify(repeatedCalculate));
    assert.match(repeatedCalculate.message, /不支持重复计算/);
    const protectedDeleteResponse = await api(`/api/revenue-targets/${sharedTarget.id}`, { method: "DELETE" });
    const protectedDelete = await protectedDeleteResponse.json();
    assert.equal(protectedDeleteResponse.status, 409, JSON.stringify(protectedDelete));
    assert.match(protectedDelete.message, /不支持删除/);
    console.log("目标营业额HTTP链路验证通过：统一数据源、防重、二次均值立即计算、月目标金额对齐、每日明细、禁止重复计算及生成后删除保护。");
  } finally {
    await clean();
    await db.$disconnect();
  }
}

main().catch(async error => {
  console.error(error);
  await db.$disconnect();
  process.exitCode = 1;
});

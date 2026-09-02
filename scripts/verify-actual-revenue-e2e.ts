import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { createSession } from "../lib/auth";
import { db } from "../lib/db";

const baseUrl = process.env.ACTUAL_REVENUE_TEST_BASE_URL || "http://127.0.0.1:3011";
const statMonth = "2099-11";
const targetMonth = "2099-12";

async function workbookFile(storeName: string, date: string, revenue: number) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("营业数据");
  const headers: Array<[number, string]> = [
    [2, "门店名称"], [3, "营业日"], [6, "营业额（元）"], [7, "优惠金额(元)"], [8, "营业收入（元）"],
    [9, "订单量"], [10, "用餐人数"], [11, "消费桌数"], [12, "折前人家（元）"], [13, "折后人均(元)"],
    [14, "折前单均(元)"], [15, "折后单均（元）"], [16, "开台率"], [17, "翻台率"], [18, "上座率"], [19, "平均用餐时长（分钟）"],
  ];
  headers.forEach(([column, header]) => { sheet.getCell(3, column).value = header; });
  const row = sheet.getRow(6);
  row.getCell(2).value = storeName;
  row.getCell(3).value = date;
  row.getCell(6).value = { formula: `${revenue}-0`, result: revenue };
  row.getCell(7).value = 100;
  row.getCell(8).value = revenue - 100;
  row.getCell(9).value = 88;
  row.getCell(10).value = 168;
  row.getCell(11).value = 62;
  row.getCell(12).value = 80;
  row.getCell(13).value = 75;
  row.getCell(14).value = 150;
  row.getCell(15).value = 145;
  row.getCell(16).value = "80%";
  row.getCell(17).value = 1.8;
  row.getCell(18).value = "75%";
  row.getCell(19).value = 85.5;
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function main() {
  const user = await db.user.findFirst({ where: { status: "ENABLED", role: { status: "ENABLED" } }, include: { role: true }, orderBy: { createdAt: "asc" } });
  assert(user, "没有可用于验证的启用用户");
  const permissions = Array.isArray(user.role.permissions) ? user.role.permissions.filter((item): item is string => typeof item === "string") : [];
  assert(permissions.includes("*") || ["query", "import", "export", "view", "set-monthly-target", "daily-target-preview", "delete"].every(action => permissions.includes(`actual-revenue:${action}`)), "验证用户缺少实际营业额完整权限");
  const store = await db.store.findFirst({ include: { brand: true }, orderBy: { createdAt: "asc" } });
  assert(store, "没有可用于验证的门店");
  const token = await createSession({ userId: user.id, username: user.username, realName: user.realName, role: user.role.code, permissions });
  const cookie = `canyin_session=${token}`;
  const api = async (path: string, init: RequestInit = {}) => fetch(`${baseUrl}${path}`, { ...init, headers: { Cookie: cookie, ...(init.headers || {}) } });
  const clean = async () => {
    const monthly = await db.actualRevenueMonthly.findUnique({ where: { storeId_statMonth: { storeId: store.id, statMonth } } });
    if (!monthly) return;
    await db.$transaction([
      db.storeDailyTarget.deleteMany({ where: { storeId: store.id, targetDate: { gte: new Date(`${targetMonth}-01T00:00:00.000Z`), lt: new Date("2100-01-01T00:00:00.000Z") } } }),
      db.storeMonthlyTarget.deleteMany({ where: { sourceActualRevenueId: monthly.id } }),
      db.actualRevenueDaily.deleteMany({ where: { monthlyRecordId: monthly.id } }),
      db.actualRevenueMonthly.delete({ where: { id: monthly.id } }),
    ]);
  };

  await clean();
  try {
    const sendImport = async (date: string, revenue: number) => {
      const form = new FormData();
      form.append("file", new Blob([await workbookFile(store.name, date, revenue)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "实际营业额验证.xlsx");
      const response = await api("/api/actual-revenue/import", { method: "POST", body: form });
      return { response, data: await response.json() };
    };

    const first = await sendImport("2099-11-03", 10000.1);
    assert.equal(first.response.status, 200, JSON.stringify(first.data));
    assert.equal(first.data.added, 1);

    const overwrite = await sendImport("2099-11-03", 12345.67);
    assert.equal(overwrite.response.status, 200, JSON.stringify(overwrite.data));
    assert.equal(overwrite.data.overwritten, 1);

    const listResponse = await api(`/api/actual-revenue?storeKeyword=${encodeURIComponent(store.name)}&startMonth=${statMonth}&endMonth=${statMonth}&page=1&pageSize=20`);
    const list = await listResponse.json();
    assert.equal(listResponse.status, 200, JSON.stringify(list));
    assert.equal(list.total, 1);
    assert.equal(list.rows[0].monthlyRevenue, "12345.67");
    assert.match(list.rows[0].recordNo, /^\d{12}$/);
    const recordId = list.rows[0].id as string;

    const detailResponse = await api(`/api/actual-revenue/${recordId}`);
    const detail = await detailResponse.json();
    assert.equal(detailResponse.status, 200, JSON.stringify(detail));
    assert.equal(detail.dailyDetails.length, 1);
    assert.equal(detail.dailyDetails[0].businessDate, "2099-11-03");

    const targetResponse = await api(`/api/actual-revenue/${recordId}/monthly-target`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetMonth, targetAmount: 500000 }) });
    const target = await targetResponse.json();
    assert.equal(targetResponse.status, 200, JSON.stringify(target));
    assert.equal(target.targetMonth, targetMonth);

    const locked = await sendImport("2099-11-04", 8000);
    assert.equal(locked.response.status, 200, JSON.stringify(locked.data));
    assert.equal(locked.data.skipped, 1);

    const previewResponse = await api(`/api/actual-revenue/${recordId}/daily-target-preview`);
    const preview = await previewResponse.json();
    assert.equal(previewResponse.status, 200, JSON.stringify(preview));
    assert.equal(preview.available, false);

    const exportResponse = await api("/api/actual-revenue/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recordIds: [recordId] }) });
    assert.equal(exportResponse.status, 200, await exportResponse.text());
    assert.match(exportResponse.headers.get("content-type") || "", /spreadsheetml/);

    const deleteResponse = await api(`/api/actual-revenue/${recordId}`, { method: "DELETE" });
    const deleted = await deleteResponse.json();
    assert.equal(deleteResponse.status, 409, JSON.stringify(deleted));
    assert.match(deleted.message, /不支持删除/);
    console.log("实际营业额HTTP链路验证通过：导入、覆盖、汇总、详情、目标锁定、预览、导出和删除保护。 ");
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

import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";
import {
  MonthlyPurchaseSalesError, calculateMonthlyPurchaseSalesRatios,
  canMonthlyPurchaseSales, monthlyPurchaseSalesStoreScope,
  nextMonthlyPurchaseSalesRecordNo, normalizeMeituanAlias,
} from "@/lib/monthly-purchase-sales-ratios";

export const runtime = "nodejs";
export const maxDuration = 300;

const REQUIRED_HEADERS = ["门店", "折前销售额", "折后销售额", "要货金额", "折前要货占销比", "折后要货占销比"] as const;
const MAX_FILE_SIZE = 200 * 1024 * 1024;

type ParsedRow = {
  rowNo: number;
  storeAlias: string;
  preDiscountSales: number;
  postDiscountSales: number | null;
  purchaseAmount: number;
};
type FailedRow = { rowNo: number; storeAlias: string; reason: string };

function rowText(row: ExcelJS.Row) {
  const values: string[] = [];
  row.eachCell({ includeEmpty: false }, cell => values.push(cell.text.trim()));
  return values.join(" ");
}

function validDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day;
}

function parsePeriod(text: string) {
  const match = text.match(/(\d{4})[\/.\-年](\d{1,2})[\/.\-月](\d{1,2})日?\s*(?:至|到|~|—|-)\s*(\d{4})[\/.\-年](\d{1,2})[\/.\-月](\d{1,2})日?/);
  if (!match) throw new MonthlyPurchaseSalesError("导入文件没有可识别的营业日期", 400);
  const [, startYear, startMonth, startDay, endYear, endMonth, endDay] = match.map(Number);
  if (!validDate(startYear, startMonth, startDay) || !validDate(endYear, endMonth, endDay)) throw new MonthlyPurchaseSalesError("导入文件营业日期格式无法解析", 400);
  if (startYear < 2026 || startYear > 2999 || endYear < 2026 || endYear > 2999) throw new MonthlyPurchaseSalesError("导入文件所属年份仅支持2026-2999", 400);
  if (startYear !== endYear || startMonth !== endMonth) throw new MonthlyPurchaseSalesError("导入文件营业日期跨越多个自然月份，无法识别唯一所属月份", 400);
  const start = new Date(Date.UTC(startYear, startMonth - 1, startDay));
  const end = new Date(Date.UTC(endYear, endMonth - 1, endDay));
  if (start > end) throw new MonthlyPurchaseSalesError("导入文件营业日期起止顺序不正确", 400);
  return { year: startYear, month: startMonth, start, end };
}

function cellRawValue(cell: ExcelJS.Cell) {
  const value = cell.value;
  if (value && typeof value === "object" && "result" in value) return value.result;
  return value;
}

function parseMoney(cell: ExcelJS.Cell, label: string, allowBlank: boolean, allowZero: boolean) {
  const raw = cellRawValue(cell);
  if (raw === null || raw === undefined || String(raw).trim() === "") {
    if (allowBlank) return null;
    throw new Error(`${label}为空`);
  }
  const normalized = String(raw).normalize("NFKC").replace(/[￥¥,，\s]/g, "");
  if (!/^[+-]?\d+(?:\.\d{1,2})?$/.test(normalized)) throw new Error(`${label}格式不正确`);
  const value = Number(normalized);
  if (!Number.isFinite(value) || (allowZero ? value < 0 : value <= 0)) throw new Error(allowZero ? `${label}不能为负数` : `${label}必须大于0`);
  return value;
}

function parseWorkbookRows(sheet: ExcelJS.Worksheet, columns: Map<string, number>) {
  const rows: ParsedRow[] = [];
  const failures: FailedRow[] = [];
  for (let rowNo = 4; rowNo <= sheet.rowCount; rowNo++) {
    const row = sheet.getRow(rowNo);
    const isBlank = REQUIRED_HEADERS.every(header => !row.getCell(columns.get(header)!).text.trim());
    if (isBlank) continue;
    const storeAlias = normalizeMeituanAlias(row.getCell(columns.get("门店")!).text).slice(0, 100);
    try {
      if (!storeAlias) throw new Error("门店为空");
      rows.push({
        rowNo,
        storeAlias,
        preDiscountSales: parseMoney(row.getCell(columns.get("折前销售额")!), "折前销售额", false, false)!,
        postDiscountSales: parseMoney(row.getCell(columns.get("折后销售额")!), "折后销售额", true, false),
        purchaseAmount: parseMoney(row.getCell(columns.get("要货金额")!), "要货金额", false, true)!,
      });
    } catch (error) {
      failures.push({ rowNo, storeAlias, reason: error instanceof Error ? error.message : "数据校验失败" });
    }
  }
  return { rows, failures };
}

async function parseFile(file: File) {
  if (!file.name.toLowerCase().endsWith(".xlsx")) throw new MonthlyPurchaseSalesError("仅支持.xlsx格式文件", 400);
  if (file.size > MAX_FILE_SIZE) throw new MonthlyPurchaseSalesError("导入文件不能超过200MB", 413);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(await file.arrayBuffer()) as never);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new MonthlyPurchaseSalesError("导入文件没有工作表", 400);
  if (!rowText(sheet.getRow(1)).includes("门店订销对比表")) throw new MonthlyPurchaseSalesError("导入文件格式不正确，请选择门店订销对比表", 400);
  const period = parsePeriod(rowText(sheet.getRow(2)));
  const columns = new Map<string, number>();
  sheet.getRow(3).eachCell({ includeEmpty: false }, (cell, column) => {
    const header = cell.text.normalize("NFKC").trim();
    if (REQUIRED_HEADERS.includes(header as (typeof REQUIRED_HEADERS)[number]) && !columns.has(header)) columns.set(header, column);
  });
  for (const header of REQUIRED_HEADERS) if (!columns.has(header)) throw new MonthlyPurchaseSalesError(`缺少必要字段：${header}`, 400);
  const parsed = parseWorkbookRows(sheet, columns);
  if (!parsed.rows.length && !parsed.failures.length) throw new MonthlyPurchaseSalesError("第4行开始没有可读取的门店数据", 400);
  return { ...period, ...parsed };
}

type StoreSnapshot = { id: string; name: string; meituanManagerName: string | null; brand: { code: string; name: string } };

async function importOne(row: ParsedRow, store: StoreSnapshot, year: number, month: number, batchId: string, session: { userId: string; username: string; realName: string }) {
  const amounts = calculateMonthlyPurchaseSalesRatios(row);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await db.$transaction(async tx => {
        const existing = await tx.monthlyPurchaseSalesRatio.findUnique({ where: { storeId_year_month: { storeId: store.id, year, month } } });
        if (existing?.sourceType === "MANUAL") throw new MonthlyPurchaseSalesError("当前门店该月份已存在手工创建记录", 409);
        if (existing) {
          const same = existing.preDiscountSales.equals(amounts.preDiscountSales)
            && (existing.postDiscountSales === null ? amounts.postDiscountSales === null : amounts.postDiscountSales !== null && existing.postDiscountSales.equals(amounts.postDiscountSales))
            && existing.purchaseAmount.equals(amounts.purchaseAmount)
            && existing.preDiscountPurchaseSalesRatio.equals(amounts.preDiscountPurchaseSalesRatio)
            && (existing.postDiscountPurchaseSalesRatio === null ? amounts.postDiscountPurchaseSalesRatio === null : amounts.postDiscountPurchaseSalesRatio !== null && existing.postDiscountPurchaseSalesRatio.equals(amounts.postDiscountPurchaseSalesRatio));
          if (same) return "skipped" as const;
          await tx.monthlyPurchaseSalesRatio.update({ where: { id: existing.id }, data: {
            storeNameSnapshot: store.name,
            aliasId: store.id,
            meituanAliasSnapshot: store.meituanManagerName!,
            brandCode: store.brand.code,
            brandNameSnapshot: store.brand.name,
            ...amounts,
            lastImportBatchId: batchId,
            updatedByUserId: session.userId,
            updatedByNameSnapshot: session.realName,
          } });
          return "updated" as const;
        }
        const recordNo = await nextMonthlyPurchaseSalesRecordNo(tx);
        await tx.monthlyPurchaseSalesRatio.create({ data: {
          recordNo,
          storeId: store.id,
          storeNameSnapshot: store.name,
          aliasId: store.id,
          meituanAliasSnapshot: store.meituanManagerName!,
          brandCode: store.brand.code,
          brandNameSnapshot: store.brand.name,
          year,
          month,
          ...amounts,
          sourceType: "IMPORT",
          lastImportBatchId: batchId,
          createdByUserId: session.userId,
          createdByUsername: session.username,
          createdByNameSnapshot: session.realName,
        } });
        return "inserted" as const;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 10000 });
    } catch (error) {
      if (error instanceof MonthlyPurchaseSalesError) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2002" || error.code === "P2034") && attempt < 2) continue;
      throw error;
    }
  }
  throw new Error("导入处理失败");
}

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canMonthlyPurchaseSales(session, "import")) return NextResponse.json({ message: "暂无每月采销比导入权限" }, { status: 403 });
  let fileName = "";
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new MonthlyPurchaseSalesError("请选择.xlsx文件", 400);
    fileName = file.name;
    const parsed = await parseFile(file);
    const allStores = await db.store.findMany({ where: { meituanManagerName: { not: null } }, select: { id: true, name: true, meituanManagerName: true, brand: { select: { code: true, name: true } } } });
    const scopedStores = await db.store.findMany({ where: { AND: [await monthlyPurchaseSalesStoreScope(session), { meituanManagerName: { not: null } }] }, select: { id: true } });
    const allowedIds = new Set(scopedStores.map(store => store.id));
    const storesByAlias = new Map<string, StoreSnapshot[]>();
    for (const store of allStores) {
      const alias = normalizeMeituanAlias(store.meituanManagerName);
      if (!alias) continue;
      storesByAlias.set(alias, [...(storesByAlias.get(alias) || []), store]);
    }
    const batchNo = `PSI${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()).replaceAll("-", "")}${randomUUID().replaceAll("-", "").slice(0, 8)}`;
    const totalCount = parsed.rows.length + parsed.failures.length;
    const batch = await db.monthlyPurchaseSalesImportBatch.create({ data: {
      batchNo,
      fileName: file.name.slice(0, 255),
      year: parsed.year,
      month: parsed.month,
      periodStart: parsed.start,
      periodEnd: parsed.end,
      totalCount,
      operatorUserId: session.userId,
      operatorNameSnapshot: session.realName,
    } });
    const failures: FailedRow[] = [...parsed.failures];
    let insertedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    for (const row of parsed.rows) {
      const matches = storesByAlias.get(row.storeAlias) || [];
      if (!matches.length) { failures.push({ rowNo: row.rowNo, storeAlias: row.storeAlias, reason: "未找到美团管家别名" }); continue; }
      if (matches.length > 1) { failures.push({ rowNo: row.rowNo, storeAlias: row.storeAlias, reason: "美团管家别名匹配到多个门店，请先修正门店别名配置" }); continue; }
      const store = matches[0];
      if (!allowedIds.has(store.id)) { failures.push({ rowNo: row.rowNo, storeAlias: row.storeAlias, reason: "无当前门店数据权限" }); continue; }
      try {
        const result = await importOne(row, store, parsed.year, parsed.month, batch.id, session);
        if (result === "inserted") insertedCount++;
        else if (result === "updated") updatedCount++;
        else skippedCount++;
      } catch (error) {
        failures.push({ rowNo: row.rowNo, storeAlias: row.storeAlias, reason: error instanceof MonthlyPurchaseSalesError ? error.message : "导入处理失败" });
      }
    }
    if (failures.length) await db.monthlyPurchaseSalesImportFailure.createMany({ data: failures.map(item => ({ batchId: batch.id, excelRowNo: item.rowNo, storeAlias: item.storeAlias || null, failureReason: item.reason.slice(0, 255) })) });
    await db.monthlyPurchaseSalesImportBatch.update({ where: { id: batch.id }, data: { insertedCount, updatedCount, skippedCount, failedCount: failures.length } });
    await writeOperationLog({ userId: session.userId, username: session.username, page: "每月采销比", action: "批量导入", result: "成功", detail: `导入批次号：${batchNo}；源文件：${file.name}；统计年月：${parsed.year}-${String(parsed.month).padStart(2, "0")}；总记录数：${totalCount}；新增：${insertedCount}；更新：${updatedCount}；跳过：${skippedCount}；失败：${failures.length}`, request }).catch(() => undefined);
    return NextResponse.json({
      batchId: batch.id,
      year: parsed.year,
      month: parsed.month,
      totalCount,
      insertedCount,
      updatedCount,
      skippedCount,
      failedCount: failures.length,
      successCount: insertedCount + updatedCount,
      failedRows: failures,
    });
  } catch (error) {
    const message = error instanceof MonthlyPurchaseSalesError ? error.message : "门店订销对比表导入失败，请稍后重试";
    const status = error instanceof MonthlyPurchaseSalesError ? error.status : 500;
    await writeOperationLog({ userId: session.userId, username: session.username, page: "每月采销比", action: "批量导入", result: "失败", detail: `${fileName ? `源文件：${fileName}；` : ""}${message}`, request }).catch(() => undefined);
    return NextResponse.json({ message }, { status });
  }
}

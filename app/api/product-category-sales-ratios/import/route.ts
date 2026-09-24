import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";
import {
  parseProductCategorySalesHeaderColumns,
  parseProductCategorySalesPeriod,
  parseProductCategorySalesRows,
  productCategorySalesRowText,
  type ParsedProductCategorySalesGroup,
} from "@/lib/product-category-sales-import";
import {
  ProductCategorySalesError,
  calculateProductCategorySales,
  canProductCategorySales,
  nextProductCategorySalesRecordNo,
  normalizeProductCategoryStoreAlias,
  normalizeProductCategoryText,
  productCategorySalesStoreScope,
} from "@/lib/product-category-sales-ratios";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_FILE_SIZE = 200 * 1024 * 1024;

type FailedStore = { storeAlias: string; reason: string; excelRows: number[] };
type StoreSnapshot = { id: string; name: string; meituanManagerName: string | null; brand: { code: string; name: string } };

async function parseFile(file: File) {
  if (!file.name.toLowerCase().endsWith(".xlsx")) throw new ProductCategorySalesError("仅支持导入.xlsx格式文件", 400);
  if (file.size > MAX_FILE_SIZE) throw new ProductCategorySalesError("导入文件不能超过200MB", 413);
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(Buffer.from(await file.arrayBuffer()) as never);
  } catch {
    throw new ProductCategorySalesError("导入文件格式不正确，请选择“菜品销售统计”文件", 400);
  }
  const sheet = workbook.worksheets[0];
  if (!sheet || !productCategorySalesRowText(sheet.getRow(1)).includes("菜品销售统计")) throw new ProductCategorySalesError("导入文件格式不正确，请选择“菜品销售统计”文件", 400);
  const period = parseProductCategorySalesPeriod(productCategorySalesRowText(sheet.getRow(2)));
  const columns = parseProductCategorySalesHeaderColumns(sheet);
  return { ...period, ...parseProductCategorySalesRows(sheet, columns) };
}

function validateGroup(group: ParsedProductCategorySalesGroup) {
  if (group.errors.length) throw new ProductCategorySalesError(group.errors.join("；"), 400);
  if (!group.details.length) throw new ProductCategorySalesError("没有可导入的菜品大类数据", 400);
  const cities = [...new Set(group.details.map(item => item.city))];
  if (cities.length !== 1) throw new ProductCategorySalesError("同一门店存在多个城市值，请检查源文件", 400);
  const seen = new Set<string>();
  for (const detail of group.details) {
    if (seen.has(detail.categoryName)) throw new ProductCategorySalesError(`同一门店存在重复菜品大类：${detail.categoryName}`, 400);
    seen.add(detail.categoryName);
  }
  return { city: cities[0], calculated: calculateProductCategorySales(group.details) };
}

function existingMatches(existing: {
  citySnapshot: string;
  totalSalesQuantity: Prisma.Decimal;
  totalSalesAmount: Prisma.Decimal;
  details: Array<{
    categoryName: string; salesQuantity: Prisma.Decimal; salesAmount: Prisma.Decimal;
    dishIncome: Prisma.Decimal; dishDiscount: Prisma.Decimal; sortOrder: number;
  }>;
}, city: string, calculated: ReturnType<typeof calculateProductCategorySales>) {
  if (existing.citySnapshot !== city || !existing.totalSalesQuantity.equals(calculated.totalSalesQuantity) || !existing.totalSalesAmount.equals(calculated.totalSalesAmount) || existing.details.length !== calculated.details.length) return false;
  const currentByCategory = new Map(calculated.details.map(item => [item.categoryName, item]));
  return existing.details.every(old => {
    const current = currentByCategory.get(old.categoryName);
    return Boolean(current)
      && old.salesQuantity.equals(current!.salesQuantity)
      && old.salesAmount.equals(current!.salesAmount)
      && old.dishIncome.equals(current!.dishIncome)
      && old.dishDiscount.equals(current!.dishDiscount);
  });
}

async function importGroup(group: ParsedProductCategorySalesGroup, store: StoreSnapshot, year: number, month: number, batchId: string, session: { userId: string; username: string; realName: string }) {
  const { city, calculated } = validateGroup(group);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await db.$transaction(async tx => {
        const existing = await tx.productCategorySalesMonthly.findUnique({
          where: { storeId_year_month: { storeId: store.id, year, month } },
          include: { details: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } },
        });
        if (existing && existingMatches(existing, city, calculated)) return "skipped" as const;
        if (existing) {
          await tx.productCategorySalesDetail.deleteMany({ where: { monthlyRecordId: existing.id } });
          await tx.productCategorySalesDetail.createMany({ data: calculated.details.map(detail => ({ monthlyRecordId: existing.id, ...detail })) });
          await tx.productCategorySalesMonthly.update({ where: { id: existing.id }, data: {
            storeNameSnapshot: store.name,
            aliasId: store.id,
            meituanAliasSnapshot: group.storeAlias,
            brandCode: store.brand.code,
            brandNameSnapshot: store.brand.name,
            citySnapshot: city,
            totalSalesQuantity: calculated.totalSalesQuantity,
            totalSalesAmount: calculated.totalSalesAmount,
            lastImportBatchId: batchId,
            updatedByUserId: session.userId,
            updatedByNameSnapshot: session.realName,
          } });
          return "updated" as const;
        }
        const recordNo = await nextProductCategorySalesRecordNo(tx);
        await tx.productCategorySalesMonthly.create({ data: {
          recordNo,
          year,
          month,
          storeId: store.id,
          storeNameSnapshot: store.name,
          aliasId: store.id,
          meituanAliasSnapshot: group.storeAlias,
          brandCode: store.brand.code,
          brandNameSnapshot: store.brand.name,
          citySnapshot: city,
          totalSalesQuantity: calculated.totalSalesQuantity,
          totalSalesAmount: calculated.totalSalesAmount,
          lastImportBatchId: batchId,
          createdByUserId: session.userId,
          createdByUsername: session.username,
          createdByNameSnapshot: session.realName,
          details: { create: calculated.details },
        } });
        return "inserted" as const;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 30000 });
    } catch (error) {
      if (error instanceof ProductCategorySalesError) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2002" || error.code === "P2034") && attempt < 2) continue;
      throw error;
    }
  }
  throw new Error("导入处理失败");
}

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canProductCategorySales(session, "import")) return NextResponse.json({ message: "暂无产品类别销售占比导入权限" }, { status: 403 });
  let fileName = "";
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new ProductCategorySalesError("请选择.xlsx文件", 400);
    fileName = file.name;
    const parsed = await parseFile(file);
    const allStores = await db.store.findMany({ where: { meituanManagerName: { not: null } }, select: { id: true, name: true, meituanManagerName: true, brand: { select: { code: true, name: true } } } });
    const scopedStores = await db.store.findMany({ where: { AND: [await productCategorySalesStoreScope(session), { meituanManagerName: { not: null } }] }, select: { id: true } });
    const allowedIds = new Set(scopedStores.map(store => store.id));
    const storesByAlias = new Map<string, StoreSnapshot[]>();
    for (const store of allStores) {
      const alias = normalizeProductCategoryStoreAlias(store.meituanManagerName);
      if (alias) storesByAlias.set(alias, [...(storesByAlias.get(alias) || []), store]);
    }
    const batchNo = `PCS${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()).replaceAll("-", "")}${randomUUID().replaceAll("-", "").slice(0, 8)}`;
    const batch = await db.productCategorySalesImportBatch.create({ data: {
      batchNo,
      fileName: file.name.slice(0, 255),
      periodStart: parsed.start,
      periodEnd: parsed.end,
      year: parsed.year,
      month: parsed.month,
      rawRowCount: parsed.rawRowCount,
      storeCount: parsed.groups.length,
      operatorUserId: session.userId,
      operatorNameSnapshot: session.realName,
    } });
    const failures: FailedStore[] = [];
    let insertedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    for (const group of parsed.groups) {
      try {
        if (group.errors.length) throw new ProductCategorySalesError(group.errors.join("；"), 400);
        const matches = storesByAlias.get(normalizeProductCategoryStoreAlias(group.storeAlias)) || [];
        if (!matches.length) throw new ProductCategorySalesError("未找到美团管家别名", 400);
        if (matches.length > 1) throw new ProductCategorySalesError("美团管家别名匹配到多个门店，请先修正门店别名配置", 400);
        const store = matches[0];
        if (!allowedIds.has(store.id)) throw new ProductCategorySalesError("无当前门店数据权限", 403);
        const result = await importGroup(group, store, parsed.year, parsed.month, batch.id, session);
        if (result === "inserted") insertedCount++;
        else if (result === "updated") updatedCount++;
        else skippedCount++;
      } catch (error) {
        failures.push({ storeAlias: group.storeAlias, reason: error instanceof ProductCategorySalesError ? error.message : "导入处理失败", excelRows: group.excelRows });
      }
    }
    if (failures.length) await db.productCategorySalesImportFailure.createMany({ data: failures.map(item => ({ batchId: batch.id, storeAlias: item.storeAlias.slice(0, 100) || null, failureReason: item.reason.slice(0, 255), excelRows: item.excelRows })) });
    await db.productCategorySalesImportBatch.update({ where: { id: batch.id }, data: { insertedCount, updatedCount, skippedCount, failedCount: failures.length } });
    await writeOperationLog({
      userId: session.userId, username: session.username, client: "运营PC端", page: "产品类别销售占比", action: "批量导入", result: "成功",
      detail: `导入批次号：${batchNo}；源文件：${file.name}；统计年月：${parsed.year}-${String(parsed.month).padStart(2, "0")}；识别门店：${parsed.groups.length}；新增：${insertedCount}；更新：${updatedCount}；跳过：${skippedCount}；失败：${failures.length}`,
      request,
    }).catch(() => undefined);
    return NextResponse.json({
      batchId: batch.id,
      periodStart: parsed.start.toISOString().slice(0, 10),
      periodEnd: parsed.end.toISOString().slice(0, 10),
      year: parsed.year,
      month: parsed.month,
      rawRowCount: parsed.rawRowCount,
      storeCount: parsed.groups.length,
      totalCount: parsed.groups.length,
      successCount: insertedCount + updatedCount,
      insertedCount,
      updatedCount,
      skippedCount,
      failedCount: failures.length,
      failedStores: failures,
    });
  } catch (error) {
    const message = error instanceof ProductCategorySalesError ? error.message : "菜品销售统计导入失败，请稍后重试";
    const status = error instanceof ProductCategorySalesError ? error.status : 500;
    await writeOperationLog({ userId: session.userId, username: session.username, client: "运营PC端", page: "产品类别销售占比", action: "批量导入", result: "失败", detail: `${fileName ? `源文件：${fileName}；` : ""}${message}`, request }).catch(() => undefined);
    return NextResponse.json({ message }, { status });
  }
}

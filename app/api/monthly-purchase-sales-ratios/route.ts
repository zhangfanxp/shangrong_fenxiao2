import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { writeOperationLog, writeOperationLogWithTransaction } from "@/lib/operation-log";
import {
  MONTHLY_PURCHASE_SALES_PAGE_SIZES, MonthlyPurchaseSalesError,
  calculateMonthlyPurchaseSalesRatios, canMonthlyPurchaseSales,
  isMonthlyPurchaseSalesUniqueError, monthlyPurchaseSalesCreateSchema,
  monthlyPurchaseSalesDataScope, monthlyPurchaseSalesFilterWhere,
  monthlyPurchaseSalesFiltersSchema, monthlyPurchaseSalesSelect,
  monthlyPurchaseSalesStoreScope, nextMonthlyPurchaseSalesRecordNo,
  serializeMonthlyPurchaseSales,
} from "@/lib/monthly-purchase-sales-ratios";

const pageName = "每月采销比";

export async function GET(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canMonthlyPurchaseSales(session, "query")) return NextResponse.json({ message: "暂无每月采销比查询权限" }, { status: 403 });
  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const requestedPageSize = Number(url.searchParams.get("pageSize")) || 20;
  const pageSize = MONTHLY_PURCHASE_SALES_PAGE_SIZES.includes(requestedPageSize as 20 | 50 | 100) ? requestedPageSize : 20;
  const parsed = monthlyPurchaseSalesFiltersSchema.safeParse({
    brandCode: url.searchParams.get("brandCode") || "",
    storeNameKeyword: url.searchParams.get("storeNameKeyword") || "",
    year: url.searchParams.get("year") || "",
    month: url.searchParams.get("month") || "",
  });
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message || "筛选条件不正确" }, { status: 400 });
  try {
    const where = { AND: [await monthlyPurchaseSalesDataScope(session), monthlyPurchaseSalesFilterWhere(parsed.data)] };
    const [rows, total] = await db.$transaction([
      db.monthlyPurchaseSalesRatio.findMany({ where, select: monthlyPurchaseSalesSelect, orderBy: [{ year: "desc" }, { month: "desc" }, { storeNameSnapshot: "asc" }], skip: (page - 1) * pageSize, take: pageSize }),
      db.monthlyPurchaseSalesRatio.count({ where }),
    ]);
    await writeOperationLog({ userId: session.userId, username: session.username, page: pageName, action: "筛选", result: "成功", detail: `筛选结果：${total} 条`, request }).catch(() => undefined);
    return NextResponse.json({ rows: rows.map(serializeMonthlyPurchaseSales), total, page, pageSize }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    await writeOperationLog({ userId: session.userId, username: session.username, page: pageName, action: "筛选", result: "失败", detail: "月度采销比列表加载失败", request }).catch(() => undefined);
    return NextResponse.json({ message: "月度采销比数据加载失败，请稍后重试" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canMonthlyPurchaseSales(session, "create")) return NextResponse.json({ message: "暂无每月采销比新增权限" }, { status: 403 });
  const parsed = monthlyPurchaseSalesCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message || "月度采销比信息不正确" }, { status: 400 });
  try {
    const store = await db.store.findFirst({
      where: { AND: [await monthlyPurchaseSalesStoreScope(session), { id: parsed.data.aliasId, meituanManagerName: { not: null } }] },
      select: { id: true, name: true, meituanManagerName: true, brand: { select: { code: true, name: true } } },
    });
    if (!store?.meituanManagerName) throw new MonthlyPurchaseSalesError("请选择系统中已配置的美团管家门店别名", 400);
    const storeAlias = store.meituanManagerName;
    const amounts = calculateMonthlyPurchaseSalesRatios(parsed.data);
    const createdAt = new Date();
    const created = await db.$transaction(async tx => {
      const existing = await tx.monthlyPurchaseSalesRatio.findUnique({ where: { storeId_year_month: { storeId: store.id, year: parsed.data.year, month: parsed.data.month } }, select: { id: true } });
      if (existing) throw new MonthlyPurchaseSalesError("当前门店在该年月已存在月度采销比记录，请勿重复创建", 409);
      const recordNo = await nextMonthlyPurchaseSalesRecordNo(tx, createdAt);
      const row = await tx.monthlyPurchaseSalesRatio.create({
        data: {
          recordNo,
          storeId: store.id,
          storeNameSnapshot: store.name,
          aliasId: store.id,
          meituanAliasSnapshot: storeAlias,
          brandCode: store.brand.code,
          brandNameSnapshot: store.brand.name,
          year: parsed.data.year,
          month: parsed.data.month,
          ...amounts,
          remark: parsed.data.remark || null,
          sourceType: "MANUAL",
          createdByUserId: session.userId,
          createdByUsername: session.username,
          createdByNameSnapshot: session.realName,
          createdAt,
        },
        select: monthlyPurchaseSalesSelect,
      });
      await writeOperationLogWithTransaction(tx, { userId: session.userId, username: session.username, page: pageName, action: "新增", result: "成功", detail: `记录编号：${recordNo}；门店：${store.name}；所属年月：${parsed.data.year}-${String(parsed.data.month).padStart(2, "0")}`, request, createdAt });
      return row;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 10000 });
    return NextResponse.json(serializeMonthlyPurchaseSales(created), { status: 201 });
  } catch (error) {
    const duplicate = isMonthlyPurchaseSalesUniqueError(error);
    const message = duplicate ? "当前门店在该年月已存在月度采销比记录，请勿重复创建" : error instanceof MonthlyPurchaseSalesError ? error.message : "月度采销比保存失败，请稍后重试";
    const status = duplicate ? 409 : error instanceof MonthlyPurchaseSalesError ? error.status : 500;
    await writeOperationLog({ userId: session.userId, username: session.username, page: pageName, action: "新增", result: "失败", detail: message, request }).catch(() => undefined);
    return NextResponse.json({ message }, { status });
  }
}

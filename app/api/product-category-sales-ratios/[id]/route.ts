import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { writeOperationLog, writeOperationLogWithTransaction } from "@/lib/operation-log";
import {
  ProductCategorySalesError,
  canProductCategorySales,
  formatProductCategorySalesDateTime,
  productCategorySalesDataScope,
} from "@/lib/product-category-sales-ratios";

const pageName = "产品类别销售占比";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canProductCategorySales(session, "view")) return NextResponse.json({ message: "暂无产品类别销售占比查看权限" }, { status: 403 });
  const { id } = await params;
  try {
    const row = await db.productCategorySalesMonthly.findFirst({
      where: { AND: [await productCategorySalesDataScope(session), { id }] },
      include: { details: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } },
    });
    if (!row) return NextResponse.json({ message: "当前记录已不存在或无权访问" }, { status: 404 });
    await writeOperationLog({
      userId: session.userId, username: session.username, client: "运营PC端", page: pageName,
      action: "查看", result: row.details.length ? "成功" : "失败",
      detail: row.details.length ? `记录编号：${row.recordNo}` : `记录编号：${row.recordNo}；系统数据异常：菜品大类明细为空`, request,
    }).catch(() => undefined);
    return NextResponse.json({
      summary: {
        recordNo: row.recordNo,
        storeAlias: row.meituanAliasSnapshot,
        storeName: row.storeNameSnapshot,
        brandName: row.brandNameSnapshot,
        year: row.year,
        month: row.month,
        city: row.citySnapshot,
        createdByName: row.createdByNameSnapshot,
        createdAt: formatProductCategorySalesDateTime(row.createdAt),
      },
      details: row.details.map(detail => ({
        id: detail.id,
        categoryName: detail.categoryName,
        salesQuantity: detail.salesQuantity.toFixed(2),
        salesQuantityRatio: detail.salesQuantityRatio?.toFixed(4) ?? null,
        salesAmount: detail.salesAmount.toFixed(2),
        salesAmountRatio: detail.salesAmountRatio?.toFixed(4) ?? null,
        dishIncome: detail.dishIncome.toFixed(2),
        dishIncomeRatio: detail.dishIncomeRatio?.toFixed(4) ?? null,
        dishDiscount: detail.dishDiscount.toFixed(2),
        dishDiscountRatio: detail.dishDiscountRatio?.toFixed(4) ?? null,
        sortOrder: detail.sortOrder,
      })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    await writeOperationLog({ userId: session.userId, username: session.username, client: "运营PC端", page: pageName, action: "查看", result: "失败", detail: `记录ID：${id}；详情加载失败`, request }).catch(() => undefined);
    return NextResponse.json({ message: "门店月度菜品销售明细加载失败，请稍后重试" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canProductCategorySales(session, "delete")) return NextResponse.json({ message: "暂无产品类别销售占比删除权限" }, { status: 403 });
  const { id } = await params;
  try {
    const current = await db.productCategorySalesMonthly.findFirst({
      where: { AND: [await productCategorySalesDataScope(session), { id }] },
    });
    if (!current) throw new ProductCategorySalesError("当前记录已不存在或已被其他用户删除", 404);
    await db.$transaction(async tx => {
      await tx.productCategorySalesDetail.deleteMany({ where: { monthlyRecordId: id } });
      const deleted = await tx.productCategorySalesMonthly.deleteMany({ where: { id } });
      if (!deleted.count) throw new ProductCategorySalesError("当前记录已不存在或已被其他用户删除", 404);
      await writeOperationLogWithTransaction(tx, {
        userId: session.userId,
        username: session.username,
        client: "运营PC端",
        page: pageName,
        action: "删除",
        result: "成功",
        detail: `原记录编号：${current.recordNo}；门店ID：${current.storeId}；门店名称：${current.storeNameSnapshot}；门店别名：${current.meituanAliasSnapshot}；品牌：${current.brandNameSnapshot}；所属年月：${current.year}-${String(current.month).padStart(2, "0")}；累计销售数量：${current.totalSalesQuantity.toFixed(2)}；累计销售金额：${current.totalSalesAmount.toFixed(2)}；删除人：${session.realName}`,
        request,
      });
    });
    return NextResponse.json({ success: true, recordNo: current.recordNo });
  } catch (error) {
    const message = error instanceof ProductCategorySalesError ? error.message : "产品类别销售占比记录删除失败，请稍后重试";
    const status = error instanceof ProductCategorySalesError ? error.status : 500;
    await writeOperationLog({ userId: session.userId, username: session.username, client: "运营PC端", page: pageName, action: "删除", result: "失败", detail: `记录ID：${id}；${message}`, request }).catch(() => undefined);
    return NextResponse.json({ message }, { status });
  }
}

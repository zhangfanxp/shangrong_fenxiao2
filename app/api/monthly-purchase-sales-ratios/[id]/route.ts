import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { writeOperationLog, writeOperationLogWithTransaction } from "@/lib/operation-log";
import {
  MonthlyPurchaseSalesError, calculateMonthlyPurchaseSalesRatios,
  canMonthlyPurchaseSales, isMonthlyPurchaseSalesUniqueError,
  monthlyPurchaseSalesDataScope, monthlyPurchaseSalesSelect,
  monthlyPurchaseSalesUpdateSchema, serializeMonthlyPurchaseSales,
} from "@/lib/monthly-purchase-sales-ratios";

const pageName = "每月采销比";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canMonthlyPurchaseSales(session, "view") && !canMonthlyPurchaseSales(session, "edit")) return NextResponse.json({ message: "暂无每月采销比查看权限" }, { status: 403 });
  const { id } = await params;
  try {
    const row = await db.monthlyPurchaseSalesRatio.findFirst({ where: { AND: [await monthlyPurchaseSalesDataScope(session), { id }] }, select: monthlyPurchaseSalesSelect });
    if (!row) return NextResponse.json({ message: "当前月度采销比记录已不存在或无权访问" }, { status: 404 });
    await writeOperationLog({ userId: session.userId, username: session.username, page: pageName, action: "查看", result: "成功", detail: `记录编号：${row.recordNo}`, request }).catch(() => undefined);
    return NextResponse.json(serializeMonthlyPurchaseSales(row), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ message: "月度采销比详情加载失败，请稍后重试" }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canMonthlyPurchaseSales(session, "edit")) return NextResponse.json({ message: "暂无每月采销比编辑权限" }, { status: 403 });
  const { id } = await params;
  const parsed = monthlyPurchaseSalesUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message || "月度采销比信息不正确" }, { status: 400 });
  try {
    const current = await db.monthlyPurchaseSalesRatio.findFirst({ where: { AND: [await monthlyPurchaseSalesDataScope(session), { id }] }, select: { id: true, recordNo: true, storeId: true, sourceType: true } });
    if (!current) throw new MonthlyPurchaseSalesError("当前月度采销比记录已不存在或无权访问", 404);
    if (current.sourceType !== "MANUAL") throw new MonthlyPurchaseSalesError("批量导入记录不支持手工编辑，请通过重新导入文件更新", 409);
    const amounts = calculateMonthlyPurchaseSalesRatios(parsed.data);
    const updated = await db.$transaction(async tx => {
      const conflict = await tx.monthlyPurchaseSalesRatio.findFirst({ where: { storeId: current.storeId, year: parsed.data.year, month: parsed.data.month, id: { not: id } }, select: { id: true } });
      if (conflict) throw new MonthlyPurchaseSalesError("当前门店在该年月已存在月度采销比记录", 409);
      const row = await tx.monthlyPurchaseSalesRatio.update({
        where: { id },
        data: { year: parsed.data.year, month: parsed.data.month, ...amounts, updatedByUserId: session.userId, updatedByNameSnapshot: session.realName },
        select: monthlyPurchaseSalesSelect,
      });
      await writeOperationLogWithTransaction(tx, { userId: session.userId, username: session.username, page: pageName, action: "编辑", result: "成功", detail: `记录编号：${row.recordNo}；所属年月：${row.year}-${String(row.month).padStart(2, "0")}`, request });
      return row;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 10000 });
    return NextResponse.json(serializeMonthlyPurchaseSales(updated));
  } catch (error) {
    const duplicate = isMonthlyPurchaseSalesUniqueError(error);
    const message = duplicate ? "当前门店在该年月已存在月度采销比记录" : error instanceof MonthlyPurchaseSalesError ? error.message : "月度采销比保存失败，请稍后重试";
    const status = duplicate ? 409 : error instanceof MonthlyPurchaseSalesError ? error.status : 500;
    await writeOperationLog({ userId: session.userId, username: session.username, page: pageName, action: "编辑", result: "失败", detail: `记录ID：${id}；${message}`, request }).catch(() => undefined);
    return NextResponse.json({ message }, { status });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canMonthlyPurchaseSales(session, "delete")) return NextResponse.json({ message: "暂无每月采销比删除权限" }, { status: 403 });
  const { id } = await params;
  try {
    const current = await db.monthlyPurchaseSalesRatio.findFirst({ where: { AND: [await monthlyPurchaseSalesDataScope(session), { id }] }, select: monthlyPurchaseSalesSelect });
    if (!current) throw new MonthlyPurchaseSalesError("当前月度采销比记录已不存在或无权访问", 404);
    await db.$transaction(async tx => {
      const result = await tx.monthlyPurchaseSalesRatio.deleteMany({ where: { id } });
      if (!result.count) throw new MonthlyPurchaseSalesError("当前月度采销比记录已不存在，请刷新后重新操作", 404);
      await writeOperationLogWithTransaction(tx, {
        userId: session.userId,
        username: session.username,
        page: pageName,
        action: "删除",
        result: "成功",
        detail: `原记录编号：${current.recordNo}；门店ID：${current.storeId}；门店名称：${current.storeNameSnapshot}；美团管家别名：${current.meituanAliasSnapshot}；品牌：${current.brandNameSnapshot}；所属年月：${current.year}-${String(current.month).padStart(2, "0")}；数据来源：${current.sourceType}；折前销售额：${current.preDiscountSales.toFixed(2)}；折后销售额：${current.postDiscountSales?.toFixed(2) ?? "-"}；要货金额：${current.purchaseAmount.toFixed(2)}；删除人：${session.realName}`,
        request,
      });
    });
    return NextResponse.json({ success: true, recordNo: current.recordNo });
  } catch (error) {
    const message = error instanceof MonthlyPurchaseSalesError ? error.message : "月度采销比删除失败，请稍后重试";
    const status = error instanceof MonthlyPurchaseSalesError ? error.status : 500;
    await writeOperationLog({ userId: session.userId, username: session.username, page: pageName, action: "删除", result: "失败", detail: `记录ID：${id}；${message}`, request }).catch(() => undefined);
    return NextResponse.json({ message }, { status });
  }
}

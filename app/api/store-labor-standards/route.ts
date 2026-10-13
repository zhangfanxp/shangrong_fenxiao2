import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { getBusinessDictionaryOptions } from "@/lib/business-dictionaries";
import { db } from "@/lib/db";
import { writeOperationLog, writeOperationLogWithTransaction } from "@/lib/operation-log";
import {
  STORE_LABOR_STANDARD_PAGE_SIZES,
  StoreLaborStandardBusinessError,
  canUseStoreLaborStandards,
  createStoreLaborStandardPolicyVersion,
  lockStoreLaborStandardBrands,
  nextStoreLaborStandardRecordNo,
  serializeStoreLaborStandard,
  storeLaborStandardFilterLogDetail,
  storeLaborStandardFilterWhere,
  storeLaborStandardFiltersSchema,
  storeLaborStandardInputSchema,
  storeLaborStandardSelect,
  validateStoreLaborStandardRules,
} from "@/lib/store-labor-standards";

export async function GET(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canUseStoreLaborStandards(session, "query")) return NextResponse.json({ message: "暂无门店用工标准查询权限" }, { status: 403 });
  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const requestedPageSize = Number(url.searchParams.get("pageSize")) || 20;
  const pageSize = STORE_LABOR_STANDARD_PAGE_SIZES.includes(requestedPageSize as (typeof STORE_LABOR_STANDARD_PAGE_SIZES)[number]) ? requestedPageSize : 20;
  const parsed = storeLaborStandardFiltersSchema.safeParse({ brandValue: url.searchParams.get("brandValue") || "" });
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message || "筛选参数不正确";
    await writeOperationLog({ userId: session.userId, username: session.username, page: "门店用工标准", action: "筛选", result: "失败", detail: message, request }).catch(() => undefined);
    return NextResponse.json({ message }, { status: 400 });
  }
  const detail = storeLaborStandardFilterLogDetail(parsed.data);
  try {
    const where = storeLaborStandardFilterWhere(parsed.data);
    const [total, rows] = await db.$transaction([
      db.storeLaborStandard.count({ where }),
      db.storeLaborStandard.findMany({
        where,
        select: storeLaborStandardSelect,
        orderBy: [{ brandValue: "asc" }, { lowerAmount: "asc" }, { upperAmount: "asc" }, { recordNo: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    await writeOperationLog({ userId: session.userId, username: session.username, page: "门店用工标准", action: "筛选", result: "成功", detail: `${detail}；结果 ${total} 条`, request }).catch(() => undefined);
    return NextResponse.json({ rows: rows.map(serializeStoreLaborStandard), total, page, pageSize }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    await writeOperationLog({ userId: session.userId, username: session.username, page: "门店用工标准", action: "筛选", result: "失败", detail, request }).catch(() => undefined);
    return NextResponse.json({ message: "门店用工标准数据加载失败，请稍后重试" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canUseStoreLaborStandards(session, "create")) return NextResponse.json({ message: "暂无门店用工标准新增权限" }, { status: 403 });
  const parsed = storeLaborStandardInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message || "门店用工标准信息不正确";
    await writeOperationLog({ userId: session.userId, username: session.username, page: "门店用工标准", action: "新增", result: "失败", detail: message, request }).catch(() => undefined);
    return NextResponse.json({ message }, { status: 400 });
  }

  try {
    const brandOptions = await getBusinessDictionaryOptions("BRAND");
    if (!brandOptions.some(option => option.value === parsed.data.brandValue)) {
      return NextResponse.json({ message: "所选品牌不在已启用的品牌数据字典中，请刷新后重试" }, { status: 400 });
    }
    const createdAt = new Date();
    const created = await db.$transaction(async tx => {
      await lockStoreLaborStandardBrands(tx, [parsed.data.brandValue]);
      await validateStoreLaborStandardRules(tx, parsed.data);
      const recordNo = await nextStoreLaborStandardRecordNo(tx, createdAt);
      const row = await tx.storeLaborStandard.create({
        data: {
          recordNo,
          brandValue: parsed.data.brandValue,
          assessmentMetric: parsed.data.assessmentMetric,
          lowerAmount: parsed.data.lowerAmount,
          upperAmount: parsed.data.upperAmount,
          standardHeadcount: parsed.data.standardHeadcount,
          remark: parsed.data.remark || null,
          createdByUserId: session.userId,
          createdByUsername: session.username,
          createdByNameSnapshot: session.realName,
          createdAt,
        },
        select: storeLaborStandardSelect,
      });
      await createStoreLaborStandardPolicyVersion(tx, row.brandValue, {
        userId: session.userId,
        username: session.username,
        realName: session.realName,
      });
      await writeOperationLogWithTransaction(tx, {
        userId: session.userId,
        username: session.username,
        page: "门店用工标准",
        action: "新增",
        result: "成功",
        detail: `记录编号：${recordNo}；品牌：${row.brandValue}；下限：${row.lowerAmount?.toFixed(2) ?? "空"}；上限：${row.upperAmount?.toFixed(2) ?? "空"}；标准用工：${row.standardHeadcount}人`,
        request,
        createdAt,
      });
      return row;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 10000 });
    return NextResponse.json(serializeStoreLaborStandard(created), { status: 201 });
  } catch (error) {
    if (error instanceof StoreLaborStandardBusinessError) {
      await writeOperationLog({ userId: session.userId, username: session.username, page: "门店用工标准", action: "新增", result: "失败", detail: error.message, request }).catch(() => undefined);
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    const message = error instanceof Error && error.name === "DictionaryConfigError" ? error.message : "门店用工标准新增失败，请稍后重试";
    await writeOperationLog({ userId: session.userId, username: session.username, page: "门店用工标准", action: "新增", result: "失败", detail: message, request }).catch(() => undefined);
    return NextResponse.json({ message }, { status: 500 });
  }
}

import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { actualRevenueDataScope } from "@/lib/actual-revenue";
import { db } from "@/lib/db";
import { writeOperationLog, writeOperationLogWithTransaction } from "@/lib/operation-log";
import {
  canRevenueTarget, createRevenueTargetWithTransaction, previousMonth, readRevenueTargetFilters,
  revenueTargetDataScope, revenueTargetFilterWhere, revenueTargetListSelect, serializeRevenueTarget,
  targetSourceSelect,
} from "@/lib/revenue-targets";

const createSchema = z.object({
  targetMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "请选择所属月份"),
  storeId: z.string().trim().min(1, "请选择系统中的正式门店记录"),
  brand: z.string().trim().max(100).optional(),
  targetAmount: z.union([z.string(), z.number()]).transform(String).refine(value => /^\d+$/.test(value) && new Prisma.Decimal(value).greaterThan(0), "当月目标营业额仅支持输入大于0的整数"),
  remark: z.string().max(200, "备注不能超过200个字符").optional().nullable(),
});

export async function GET(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canRevenueTarget(session, "query")) return NextResponse.json({ message: "暂无目标营业额查询权限" }, { status: 403 });
  const search = new URL(request.url).searchParams;
  const background = search.get("_background") === "1";
  const filters = readRevenueTargetFilters(search);
  const page = Math.max(1, Number(search.get("page")) || 1);
  const requestedPageSize = Number(search.get("pageSize")) || 20;
  const pageSize = [20, 50, 100].includes(requestedPageSize) ? requestedPageSize : 20;
  if (filters.targetMonth && !/^\d{4}-(0[1-9]|1[0-2])$/.test(filters.targetMonth)) return NextResponse.json({ message: "所属月份格式不正确" }, { status: 400 });
  try {
    const where = { AND: [await revenueTargetDataScope(session), revenueTargetFilterWhere(filters)] };
    const [rows, total] = await db.$transaction([
      db.storeMonthlyTarget.findMany({ where, select: revenueTargetListSelect, orderBy: [{ targetMonth: "desc" }, { storeNameSnapshot: "asc" }], skip: (page - 1) * pageSize, take: pageSize }),
      db.storeMonthlyTarget.count({ where }),
    ]);
    if (!background) await writeOperationLog({ userId: session.userId, username: session.username, page: "目标营业额", action: "筛选", result: "成功", detail: `筛选结果：${total} 条`, request }).catch(() => undefined);
    return NextResponse.json({ rows: rows.map(serializeRevenueTarget), total, page, pageSize }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch {
    if (!background) await writeOperationLog({ userId: session.userId, username: session.username, page: "目标营业额", action: "筛选", result: "失败", detail: "目标营业额列表加载失败", request }).catch(() => undefined);
    return NextResponse.json({ message: "目标营业额数据加载失败，请稍后重试" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canRevenueTarget(session, "create")) return NextResponse.json({ message: "暂无目标营业额新增权限" }, { status: 403 });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message || "目标营业额参数不正确" }, { status: 400 });
  const { targetMonth, storeId, brand, remark } = parsed.data;
  try {
    const actualScope = await actualRevenueDataScope(session);
    const target = await db.$transaction(async tx => {
      const source = await tx.actualRevenueMonthly.findFirst({
        where: { AND: [{ storeId, statMonth: previousMonth(targetMonth) }, actualScope] },
        select: targetSourceSelect,
      });
      if (!source) throw new Error("PREVIOUS_ACTUAL_NOT_FOUND");
      if (brand && ![source.store.brandId, source.store.brand.code, source.store.brand.name].includes(brand)) throw new Error("BRAND_STORE_MISMATCH");
      const created = await createRevenueTargetWithTransaction(tx, {
        source,
        targetMonth,
        targetAmount: new Prisma.Decimal(parsed.data.targetAmount),
        remark: remark?.trim() || null,
        sourceType: "MANUAL",
        session,
      });
      await writeOperationLogWithTransaction(tx, {
        userId: session.userId,
        username: session.username,
        page: "目标营业额",
        action: "新增",
        result: "成功",
        detail: `记录编号：${created.recordNo}；目标月份：${created.targetMonth}；门店：${created.storeNameSnapshot}；上月实际营业额：${created.previousActualRevenueSnapshot.toFixed(2)}；目标营业额：${created.targetAmount.toFixed(2)}；创建人：${session.realName}`,
        request,
      });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ message: "新记录已创建成功", id: target.id, recordNo: target.recordNo }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const duplicate = code === "MONTHLY_TARGET_EXISTS" || (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002");
    const message = code === "PREVIOUS_ACTUAL_NOT_FOUND" ? "当前门店暂无上月实际营业额，请先导入上月实际营业数据" : code === "BRAND_STORE_MISMATCH" ? "当前门店不属于所选品牌，请重新选择" : duplicate ? `当前门店${targetMonth}的目标营业额已存在，请勿重复创建` : "目标营业额创建失败，请稍后重试";
    await writeOperationLog({ userId: session.userId, username: session.username, page: "目标营业额", action: "新增", result: "失败", detail: `${message}；门店ID：${storeId}；目标月份：${targetMonth}`, request }).catch(() => undefined);
    return NextResponse.json({ message }, { status: code === "PREVIOUS_ACTUAL_NOT_FOUND" || duplicate ? 409 : code === "BRAND_STORE_MISMATCH" ? 400 : 500 });
  }
}

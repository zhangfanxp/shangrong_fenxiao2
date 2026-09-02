import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { writeOperationLog, writeOperationLogWithTransaction } from "@/lib/operation-log";
import { actualRevenueDataScope, canActualRevenue, nextMonth } from "@/lib/actual-revenue";
import { createRevenueTargetWithTransaction, targetSourceSelect } from "@/lib/revenue-targets";

const schema = z.object({
  targetMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  targetAmount: z.union([z.string(), z.number()]).transform(String).refine(value => /^\d+$/.test(value) && new Prisma.Decimal(value).greaterThan(0), "月目标仅支持输入大于0的整数"),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canActualRevenue(session, "set-monthly-target")) return NextResponse.json({ message: "暂无设置月目标权限" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message || "月目标参数不正确" }, { status: 400 });
  const { id } = await params;
  try {
    const scope = await actualRevenueDataScope(session);
    const target = await db.$transaction(async tx => {
      const source = await tx.actualRevenueMonthly.findFirst({ where: { AND: [{ id }, scope] }, select: targetSourceSelect });
      if (!source) throw new Error("ACTUAL_REVENUE_NOT_FOUND");
      if (source.monthlyTarget) throw new Error("MONTHLY_TARGET_EXISTS");
      const expectedMonth = nextMonth(source.statMonth);
      if (parsed.data.targetMonth !== expectedMonth) throw new Error("TARGET_MONTH_INVALID");
      const created = await createRevenueTargetWithTransaction(tx, {
        source,
        targetMonth: expectedMonth,
        targetAmount: new Prisma.Decimal(parsed.data.targetAmount),
        sourceType: "ACTUAL_REVENUE",
        session,
      });
      await writeOperationLogWithTransaction(tx, { userId: session.userId, username: session.username, page: "实际营业额", action: "设置月目标", result: "成功", detail: `实际营业额记录ID：${source.id}；目标记录编号：${created.recordNo}；门店：${source.storeNameSnapshot}；目标月份：${expectedMonth}；月目标：${created.targetAmount.toFixed(2)}`, request });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ message: "月目标设置成功", targetMonth: target.targetMonth, targetAmount: target.targetAmount.toFixed(2) });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const duplicate = code === "MONTHLY_TARGET_EXISTS" || (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002");
    const message = code === "ACTUAL_REVENUE_NOT_FOUND" ? "该实际营业额记录已不存在或无权操作" : duplicate ? "下一月份月目标已设置" : code === "TARGET_MONTH_INVALID" ? "目标月份必须为当前统计月份的下一月份" : "月目标保存失败，请稍后重试";
    await writeOperationLog({ userId: session.userId, username: session.username, page: "实际营业额", action: "设置月目标", result: "失败", detail: `${message}；记录ID：${id}`, request }).catch(() => undefined);
    return NextResponse.json({ message }, { status: code === "ACTUAL_REVENUE_NOT_FOUND" ? 404 : duplicate ? 409 : code === "TARGET_MONTH_INVALID" ? 400 : 500 });
  }
}

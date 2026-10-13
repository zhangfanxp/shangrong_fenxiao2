import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";
import { getStoreH5Session } from "@/lib/store-h5-auth";

const moneyField = (label: string) => z.number({ message: `请输入${label}` })
  .min(0, `${label}不能小于0`)
  .max(999999999999.99, `${label}数值过大`)
  .refine(value => Math.abs(value * 100 - Math.round(value * 100)) < 1e-8, `${label}最多支持小数点后两位`);

const schema = z.object({
  storeRent: moneyField("门店房租"),
  employeeWages: moneyField("员工工资"),
  dormitoryRent: moneyField("宿舍房租"),
  propertyFee: moneyField("物业费"),
  utilitiesFee: moneyField("水电费"),
  otherCost: moneyField("其他成本"),
});

type CostRecord = {
  storeRent: Prisma.Decimal;
  employeeWages: Prisma.Decimal;
  dormitoryRent: Prisma.Decimal;
  propertyFee: Prisma.Decimal;
  utilitiesFee: Prisma.Decimal;
  otherCost: Prisma.Decimal;
  ratioCoefficient: Prisma.Decimal;
};

const defaultCost: CostRecord = {
  storeRent: new Prisma.Decimal(0), employeeWages: new Prisma.Decimal(0), dormitoryRent: new Prisma.Decimal(0),
  propertyFee: new Prisma.Decimal(0), utilitiesFee: new Prisma.Decimal(0), otherCost: new Prisma.Decimal(0), ratioCoefficient: new Prisma.Decimal(1),
};

function responseData(store: { id: string; recordNo: string; name: string }, cost: CostRecord | null) {
  const value = cost ?? defaultCost;
  const fixedCost = value.storeRent.plus(value.employeeWages).plus(value.dormitoryRent).plus(value.propertyFee).plus(value.utilitiesFee).plus(value.otherCost);
  return {
    id: store.id, recordNo: store.recordNo, name: store.name,
    storeRent: value.storeRent.toFixed(2), employeeWages: value.employeeWages.toFixed(2), dormitoryRent: value.dormitoryRent.toFixed(2),
    propertyFee: value.propertyFee.toFixed(2), utilitiesFee: value.utilitiesFee.toFixed(2), otherCost: value.otherCost.toFixed(2),
    ratioCoefficient: value.ratioCoefficient.toFixed(4),
    monthlyBreakEvenRevenue: value.ratioCoefficient.greaterThan(0) ? fixedCost.dividedBy(value.ratioCoefficient).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2) : null,
  };
}

export async function GET(request: Request) {
  const session = await getStoreH5Session("store-h5:my-store:cost:view");
  if (!session) return NextResponse.json({ message: "登录状态已失效或暂无成本查看权限" }, { status: 401 });
  if (!session.storeId) return NextResponse.json({ message: "当前账号尚未关联门店" }, { status: 409 });
  try {
    const store = await db.store.findUnique({ where: { id: session.storeId }, select: { id: true, recordNo: true, name: true, costProfile: true } });
    if (!store) return NextResponse.json({ message: "当前门店不存在或已删除" }, { status: 404 });
    await writeOperationLog({ userId: session.userId, username: session.username, client: "门店员工移动端", page: "我的门店-成本", action: "查看", result: "成功", detail: `门店：${store.recordNo}（${store.name}）`, request }).catch(() => undefined);
    return NextResponse.json(responseData(store, store.costProfile), { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch {
    return NextResponse.json({ message: "门店成本加载失败，请稍后重试" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const session = await getStoreH5Session("store-h5:my-store:cost:edit");
  if (!session) return NextResponse.json({ message: "登录状态已失效或暂无成本编辑权限" }, { status: 401 });
  if (!session.storeId) return NextResponse.json({ message: "当前账号尚未关联门店" }, { status: 409 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message || "成本数据格式不正确" }, { status: 400 });
  try {
    const store = await db.store.findUnique({ where: { id: session.storeId }, select: { id: true, recordNo: true, name: true, costProfile: { select: { ratioCoefficient: true } } } });
    if (!store) return NextResponse.json({ message: "当前门店不存在或已删除" }, { status: 404 });
    const ratioCoefficient = store.costProfile?.ratioCoefficient ?? new Prisma.Decimal(1);
    const cost = await db.storeCost.upsert({ where: { storeId: store.id }, create: { storeId: store.id, ...parsed.data, ratioCoefficient }, update: parsed.data });
    await writeOperationLog({ userId: session.userId, username: session.username, client: "门店员工移动端", page: "我的门店-成本", action: "编辑", result: "成功", detail: `保存门店成本：${store.recordNo}（${store.name}）`, request }).catch(() => undefined);
    return NextResponse.json(responseData(store, cost));
  } catch {
    return NextResponse.json({ message: "门店成本保存失败，请稍后重试" }, { status: 500 });
  }
}

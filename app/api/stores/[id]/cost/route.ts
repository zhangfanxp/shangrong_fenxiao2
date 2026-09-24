import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession, sessionHasPermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";

const moneyField = (label: string) => z.number({ message: `请输入${label}` })
  .min(0, `${label}不能小于0`)
  .max(999999999999.99, `${label}数值过大`)
  .refine(value => Math.abs(value * 100 - Math.round(value * 100)) < 1e-8, `${label}最多支持小数点后两位`);

const storeCostSchema = z.object({
  storeRent: moneyField("门店房租"),
  employeeWages: moneyField("员工工资"),
  dormitoryRent: moneyField("宿舍房租"),
  propertyFee: moneyField("物业费"),
  utilitiesFee: moneyField("水电费"),
  otherCost: moneyField("其他成本"),
  ratioCoefficient: z.number({ message: "请输入比例系数" })
    .min(0.0001, "比例系数必须大于0")
    .max(999999.9999, "比例系数数值过大")
    .refine(value => Math.abs(value * 10000 - Math.round(value * 10000)) < 1e-8, "比例系数最多支持小数点后四位"),
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
  storeRent: new Prisma.Decimal(0),
  employeeWages: new Prisma.Decimal(0),
  dormitoryRent: new Prisma.Decimal(0),
  propertyFee: new Prisma.Decimal(0),
  utilitiesFee: new Prisma.Decimal(0),
  otherCost: new Prisma.Decimal(0),
  ratioCoefficient: new Prisma.Decimal(1),
};

function responseData(store: { id: string; recordNo: string; name: string }, cost: CostRecord | null) {
  const value = cost ?? defaultCost;
  const fixedCost = value.storeRent
    .plus(value.employeeWages)
    .plus(value.dormitoryRent)
    .plus(value.propertyFee)
    .plus(value.utilitiesFee)
    .plus(value.otherCost);
  const monthlyBreakEvenRevenue = value.ratioCoefficient.greaterThan(0)
    ? fixedCost.dividedBy(value.ratioCoefficient).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2)
    : null;
  return {
    id: store.id,
    recordNo: store.recordNo,
    name: store.name,
    storeRent: value.storeRent.toFixed(2),
    employeeWages: value.employeeWages.toFixed(2),
    dormitoryRent: value.dormitoryRent.toFixed(2),
    propertyFee: value.propertyFee.toFixed(2),
    utilitiesFee: value.utilitiesFee.toFixed(2),
    otherCost: value.otherCost.toFixed(2),
    ratioCoefficient: value.ratioCoefficient.toFixed(4),
    monthlyBreakEvenRevenue,
  };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!sessionHasPermission(session, "stores:list:view")) return NextResponse.json({ message: "暂无门店列表权限" }, { status: 403 });

  const store = await db.store.findUnique({
    where: { id: (await params).id },
    select: { id: true, recordNo: true, name: true, costProfile: true },
  });
  if (!store) return NextResponse.json({ message: "门店不存在或已删除" }, { status: 404 });
  await writeOperationLog({ userId: session.userId, username: session.username, page: "门店列表", action: "查看成本", result: "成功", detail: `查看门店成本：${store.recordNo}（${store.name}）`, request }).catch(() => undefined);
  return NextResponse.json(responseData(store, store.costProfile));
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!sessionHasPermission(session, "stores:list:view")) return NextResponse.json({ message: "暂无门店成本编辑权限" }, { status: 403 });

  const parsed = storeCostSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0].message }, { status: 400 });
  const store = await db.store.findUnique({ where: { id: (await params).id }, select: { id: true, recordNo: true, name: true } });
  if (!store) return NextResponse.json({ message: "门店不存在或已删除" }, { status: 404 });

  const cost = await db.storeCost.upsert({
    where: { storeId: store.id },
    create: { storeId: store.id, ...parsed.data },
    update: parsed.data,
  });
  await writeOperationLog({ userId: session.userId, username: session.username, page: "门店列表", action: "编辑成本", result: "成功", detail: `保存门店保本成本：${store.recordNo}（${store.name}）`, request }).catch(() => undefined);
  return NextResponse.json(responseData(store, cost));
}

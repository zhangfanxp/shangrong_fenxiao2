import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiSession, sessionHasPermission } from "@/lib/auth";
import { storeInputSchema } from "@/lib/store-validation";
import { businessDictionaryContains } from "@/lib/business-dictionaries";
import { storeContractSelect, validateStoreContract } from "@/lib/store-contract";

const details = { brand: true, contract: { select: storeContractSelect } } satisfies Prisma.StoreInclude;

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession(); if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!sessionHasPermission(session, "stores:list:view")) return NextResponse.json({ message: "暂无门店列表权限" }, { status: 403 });
  const { id } = await params;
  const store = await db.store.findUnique({ where: { id }, include: details });
  if (!store) return NextResponse.json({ message: "门店不存在或已删除" }, { status: 404 });
  return NextResponse.json(store);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession(); if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!sessionHasPermission(session, "stores:list:view")) return NextResponse.json({ message: "暂无门店列表权限" }, { status: 403 });
  const result = storeInputSchema.safeParse(await request.json());
  if (!result.success) return NextResponse.json({ message: result.error.issues[0].message }, { status: 400 });
  const { id } = await params;
  const brand = await db.brand.findUnique({ where: { id: result.data.brandId }, select: { id: true, name: true } });
  if (!brand) return NextResponse.json({ message: "所选品牌不存在或已删除" }, { status: 400 });
  const [brandValid, cooperationValid, operationValid, areaValid, locationTypeValid] = await Promise.all([
    businessDictionaryContains("BRAND", brand.name),
    businessDictionaryContains("COOPERATION_TYPE", result.data.cooperationType),
    businessDictionaryContains("STORE_OPERATION_STATUS", result.data.operationStatus),
    businessDictionaryContains("STORE_AREA", result.data.region),
    businessDictionaryContains("LOCATION_TYPE", result.data.locationType),
  ]);
  if (!brandValid) return NextResponse.json({ message: "所选品牌不在已启用的数据字典中" }, { status: 400 });
  if (!cooperationValid) return NextResponse.json({ message: "所选合作类型不存在或已停用" }, { status: 400 });
  if (!operationValid) return NextResponse.json({ message: "所选运营状态不存在或已停用" }, { status: 400 });
  if (!areaValid) return NextResponse.json({ message: "所选门店区域不存在或已停用" }, { status: 400 });
  if (!locationTypeValid) return NextResponse.json({ message: "所选位置类型不存在或已停用" }, { status: 400 });
  const contractCheck = await validateStoreContract(result.data.contractId, result.data, id);
  if (contractCheck.message) return NextResponse.json({ message: contractCheck.message }, { status: 400 });
  try {
    const store = await db.store.update({ where: { id }, data: result.data, include: details });
    return NextResponse.json(store);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return NextResponse.json({ message: "门店不存在或已删除" }, { status: 404 });
    throw error;
  }
}

import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiSession } from "@/lib/auth";
import { canStoreListAction } from "@/lib/store-permissions";
import { storeInputSchema } from "@/lib/store-validation";
import { businessDictionaryContains } from "@/lib/business-dictionaries";
import { storeContractSelect, validateStoreContract } from "@/lib/store-contract";
import { synchronizeStoreLeadership } from "@/lib/store-leadership";
import { resolveStoreRegionManager, synchronizeStoreRegionManagers } from "@/lib/store-supervisor";
import { writeOperationLog } from "@/lib/operation-log";
import { getConfiguredWorkdayHours } from "@/lib/brand-day-hour-config";

const details = { brand: true, contract: { select: storeContractSelect } } satisfies Prisma.StoreInclude;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession(); if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canStoreListAction(session.permissions, "view")) return NextResponse.json({ message: "暂无门店查看权限" }, { status: 403 });
  const { id } = await params;
  await synchronizeStoreLeadership([id]);
  const existing = await db.store.findUnique({ where: { id }, select: { region: true } });
  if (existing?.region) await synchronizeStoreRegionManagers([existing.region]);
  else if (existing) await db.store.update({ where: { id }, data: { supervisorUserId: null, supervisorName: null } });
  const store = await db.store.findUnique({ where: { id }, include: details });
  if (!store) return NextResponse.json({ message: "门店不存在或已删除" }, { status: 404 });
  await writeOperationLog({ userId: session.userId, username: session.username, page: "门店列表", action: "查看", result: "成功", detail: `查看门店：${store.recordNo}`, request }).catch(() => undefined);
  return NextResponse.json(store);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession(); if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canStoreListAction(session.permissions, "edit")) return NextResponse.json({ message: "暂无门店编辑权限" }, { status: 403 });
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
  const workdayHours = result.data.workdayHours ?? await getConfiguredWorkdayHours(brand.name);
  if (workdayHours === undefined) return NextResponse.json({ message: "当前品牌尚未配置工作日小时，请填写后保存" }, { status: 400 });
  const regionManager = await resolveStoreRegionManager(result.data.region);
  const contractCheck = await validateStoreContract(result.data.contractId, result.data, id);
  if (contractCheck.message) return NextResponse.json({ message: contractCheck.message }, { status: 400 });
  try {
    const store = await db.$transaction(async transaction => {
      await transaction.store.update({ where: { id }, data: { ...result.data, workdayHours, supervisorUserId: regionManager?.id || null, supervisorName: regionManager?.realName || null } });
      await synchronizeStoreLeadership([id], transaction);
      return transaction.store.findUniqueOrThrow({ where: { id }, include: details });
    });
    await writeOperationLog({ userId: session.userId, username: session.username, page: "门店列表", action: "编辑", result: "成功", detail: `编辑门店：${store.recordNo}`, request }).catch(() => undefined);
    return NextResponse.json(store);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return NextResponse.json({ message: "门店不存在或已删除" }, { status: 404 });
    throw error;
  }
}

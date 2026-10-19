import { CooperationType, StoreOperationStatus } from "@prisma/client";
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

export async function GET(request: Request) {
  const session = await requireApiSession(); if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canStoreListAction(session.permissions, "query")) return NextResponse.json({ message: "暂无门店查询权限" }, { status: 403 });
  const url = new URL(request.url);
  const keyword = url.searchParams.get("keyword")?.trim() || "";
  const status = url.searchParams.get("status") || "";
  const brandId = url.searchParams.get("brandId") || "";
  const cooperationType = url.searchParams.get("cooperationType") || "";
  const city = url.searchParams.get("city")?.trim() || "";
  const startDate = url.searchParams.get("startDate") || "";
  const endDate = url.searchParams.get("endDate") || "";
  const formalOpenDate = startDate ? new Date(startDate) : undefined;
  const formalOpenDateEnd = endDate ? new Date(`${endDate}T23:59:59.999`) : undefined;

  // 先同步店长、厨师长及区域负责人，确保列表始终展示用户权限配置中的最新人员。
  await synchronizeStoreLeadership();
  await synchronizeStoreRegionManagers();
  const rows = await db.store.findMany({
    where: {
      ...(keyword ? { OR: [{ recordNo: { contains: keyword } }, { name: { contains: keyword } }, { managerName: { contains: keyword } }, { ownerName: { contains: keyword } }, { ownerPhone: { contains: keyword } }] } : {}),
      ...(status && Object.values(StoreOperationStatus).includes(status as StoreOperationStatus) ? { operationStatus: status as StoreOperationStatus } : {}),
      ...(brandId ? { brandId } : {}),
      ...(cooperationType && Object.values(CooperationType).includes(cooperationType as CooperationType) ? { cooperationType: cooperationType as CooperationType } : {}),
      ...(city ? { city } : {}),
      ...((formalOpenDate || formalOpenDateEnd) ? { formalOpenDate: { ...(formalOpenDate ? { gte: formalOpenDate } : {}), ...(formalOpenDateEnd ? { lte: formalOpenDateEnd } : {}) } } : {}),
    },
    include: { brand: true, contract: { select: storeContractSelect } },
    orderBy: { createdAt: "desc" }, take: 500,
  });
  await writeOperationLog({ userId: session.userId, username: session.username, page: "门店列表", action: "筛选", result: "成功", detail: keyword || status || brandId || cooperationType || city || startDate || endDate ? `关键字：${keyword || "全部"}；状态：${status || "全部"}；城市：${city || "全部"}` : "加载全部门店", request }).catch(() => undefined);
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const session = await requireApiSession(); if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canStoreListAction(session.permissions, "create")) return NextResponse.json({ message: "暂无新增门店权限" }, { status: 403 });
  const result = storeInputSchema.safeParse(await request.json());
  if (!result.success) return NextResponse.json({ message: result.error.issues[0].message }, { status: 400 });
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
  const contractCheck = await validateStoreContract(result.data.contractId, result.data);
  if (contractCheck.message) return NextResponse.json({ message: contractCheck.message }, { status: 400 });
  const number = await db.store.count();
  const store = await db.store.create({
    data: {
      ...result.data,
      workdayHours,
      supervisorUserId: regionManager?.id || null,
      supervisorName: regionManager?.realName || null,
      managerUserId: null,
      managerName: null,
      chefUserId: null,
      chefName: null,
      recordNo: `MD${new Date().getFullYear()}${String(number + 1).padStart(6, "0")}`,
    },
    include: { brand: true, contract: { select: storeContractSelect } },
  });
  await writeOperationLog({ userId: session.userId, username: session.username, page: "门店列表", action: "新增", result: "成功", detail: `新增门店：${store.recordNo}（${store.name}）`, request }).catch(() => undefined);
  return NextResponse.json(store, { status: 201 });
}

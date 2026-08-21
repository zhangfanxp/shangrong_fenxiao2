import { ContractStatus, CooperationType } from "@prisma/client";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiSession, sessionHasPermission } from "@/lib/auth";
import { contractInputSchema } from "@/lib/contract-validation";
import { businessDictionaryContains } from "@/lib/business-dictionaries";
import { writeOperationLog } from "@/lib/operation-log";

export async function GET(request: Request) {
  const session = await requireApiSession(); if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!sessionHasPermission(session, "stores:contracts:view")) return NextResponse.json({ message: "暂无合同管理权限" }, { status: 403 });
  const url = new URL(request.url);
  const keyword = url.searchParams.get("keyword")?.trim() || "";
  const status = url.searchParams.get("status") || "";
  const brandId = url.searchParams.get("brandId") || "";
  const cooperationType = url.searchParams.get("cooperationType") || "";
  const startDate = url.searchParams.get("startDate") || "";
  const endDate = url.searchParams.get("endDate") || "";
  const startDateFilter = startDate ? new Date(startDate) : undefined;
  const endDateFilter = endDate ? new Date(`${endDate}T23:59:59.999`) : undefined;

  const rows = await db.contract.findMany({
    where: {
      ...(keyword ? { OR: [
        { recordNo: { contains: keyword } }, { storeName: { contains: keyword } },
        { ownerName: { contains: keyword } }, { contactName: { contains: keyword } }, { ownerPhone: { contains: keyword } },
      ] } : {}),
      ...(status && Object.values(ContractStatus).includes(status as ContractStatus) ? { status: status as ContractStatus } : {}),
      ...(brandId ? { brandId } : {}),
      ...(cooperationType && Object.values(CooperationType).includes(cooperationType as CooperationType) ? { cooperationType: cooperationType as CooperationType } : {}),
      ...((startDateFilter || endDateFilter) ? { startDate: { ...(startDateFilter ? { gte: startDateFilter } : {}), ...(endDateFilter ? { lte: endDateFilter } : {}) } } : {}),
    },
    include: { brand: true, rebates: { orderBy: { createdAt: "asc" } } },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  await writeOperationLog({ userId: session.userId, username: session.username, page: "合同管理", action: "筛选", result: "成功", detail: keyword || status || brandId || cooperationType || startDate || endDate ? `关键字：${keyword || "全部"}；状态：${status || "全部"}；日期：${startDate || "不限"}至${endDate || "不限"}` : "加载全部合同", request }).catch(() => undefined);
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const session = await requireApiSession(); if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!sessionHasPermission(session, "stores:contracts:view")) return NextResponse.json({ message: "暂无合同管理权限" }, { status: 403 });
  const result = contractInputSchema.safeParse(await request.json());
  if (!result.success) return NextResponse.json({ message: result.error.issues[0].message }, { status: 400 });
  const brand = await db.brand.findUnique({ where: { id: result.data.brandId }, select: { id: true, name: true } });
  if (!brand) return NextResponse.json({ message: "所选品牌不存在或已删除" }, { status: 400 });
  const [brandValid, cooperationValid, statusValid, ...rebateChecks] = await Promise.all([
    businessDictionaryContains("BRAND", brand.name),
    businessDictionaryContains("COOPERATION_TYPE", result.data.cooperationType),
    businessDictionaryContains("CONTRACT_STATUS", result.data.status),
    ...result.data.rebates.map((rebate) => businessDictionaryContains("REBATE_TYPE", rebate.type)),
  ]);
  if (!brandValid) return NextResponse.json({ message: "所选品牌不在已启用的数据字典中" }, { status: 400 });
  if (!cooperationValid) return NextResponse.json({ message: "所选合作类型不存在或已停用" }, { status: 400 });
  if (!statusValid) return NextResponse.json({ message: "所选合同状态不存在或已停用" }, { status: 400 });
  if (rebateChecks.some((valid) => !valid)) return NextResponse.json({ message: "所选返利类型不存在或已停用" }, { status: 400 });

  const number = await db.contract.count();
  const data = result.data;
  if (data.status === ContractStatus.TERMINATED) return NextResponse.json({ message: "新建合同不能直接设为已解约" }, { status: 400 });
  const { rebates, ...contractData } = data;
  const contract = await db.contract.create({
    data: {
      ...contractData, recordNo: `HT${new Date().getFullYear()}${String(number + 1).padStart(6, "0")}`,
      startDate: new Date(data.startDate), endDate: new Date(data.endDate),
      trialOpenDate: data.trialOpenDate ? new Date(data.trialOpenDate) : undefined,
      rebates: { create: rebates },
    },
    include: { brand: true, rebates: { orderBy: { createdAt: "asc" } } },
  });
  await writeOperationLog({ userId: session.userId, username: session.username, page: "合同管理", action: "新增", result: "成功", detail: `新增合同：${contract.recordNo}（${contract.storeName}）`, request }).catch(() => undefined);
  return NextResponse.json(contract, { status: 201 });
}

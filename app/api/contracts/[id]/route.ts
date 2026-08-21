import { ContractStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireApiSession, sessionHasPermission } from "@/lib/auth";
import { contractInputSchema } from "@/lib/contract-validation";
import { businessDictionaryContains } from "@/lib/business-dictionaries";
import { writeOperationLog } from "@/lib/operation-log";

const statusSchema = z.object({ status: z.enum([ContractStatus.PENDING, ContractStatus.ACTIVE, ContractStatus.EXPIRING, ContractStatus.EXPIRED]) });
const terminationSchema = z.object({ status: z.literal(ContractStatus.TERMINATED), refundedDeposit: z.coerce.number().min(0, "退回保证金不能小于 0") });

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession(); if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!sessionHasPermission(session, "stores:contracts:view")) return NextResponse.json({ message: "暂无合同管理权限" }, { status: 403 });
  const { id } = await params;
  const contract = await db.contract.findUnique({ where: { id }, include: { brand: true, rebates: { orderBy: { createdAt: "asc" } } } });
  if (!contract) return NextResponse.json({ message: "合同不存在或已删除" }, { status: 404 });
  await writeOperationLog({ userId: session.userId, username: session.username, page: "合同管理", action: "查看", result: "成功", detail: `查看合同：${contract.recordNo}`, request }).catch(() => undefined);
  return NextResponse.json(contract);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession(); if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!sessionHasPermission(session, "stores:contracts:view")) return NextResponse.json({ message: "暂无合同管理权限" }, { status: 403 });
  const body = await request.json();
  const { id } = await params;
  const termination = terminationSchema.safeParse(body);
  if (termination.success) {
    const current = await db.contract.findUnique({ where: { id }, select: { deposit: true } });
    if (!current) return NextResponse.json({ message: "合同不存在或已删除" }, { status: 404 });
    if (termination.data.refundedDeposit > Number(current.deposit)) return NextResponse.json({ message: "退回保证金不能大于合同保证金" }, { status: 400 });
    const contract = await db.contract.update({ where: { id }, data: termination.data });
    await writeOperationLog({ userId: session.userId, username: session.username, page: "合同管理", action: "解约", result: "成功", detail: `解约合同：${contract.recordNo}`, request }).catch(() => undefined);
    return NextResponse.json(contract);
  }
  const status = statusSchema.safeParse(body);
  if (status.success && Object.keys(body).length === 1) {
    const contract = await db.contract.update({ where: { id }, data: status.data });
    await writeOperationLog({ userId: session.userId, username: session.username, page: "合同管理", action: "编辑", result: "成功", detail: `修改合同状态：${contract.recordNo} → ${contract.status}`, request }).catch(() => undefined);
    return NextResponse.json(contract);
  }

  const result = contractInputSchema.safeParse(body);
  if (!result.success) return NextResponse.json({ message: result.error.issues[0].message }, { status: 400 });
  if (result.data.status === ContractStatus.TERMINATED) return NextResponse.json({ message: "请通过“解约”操作录入退回保证金后完成解约" }, { status: 400 });
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
  const data = result.data;
  const { rebates, ...contractData } = data;
  const contract = await db.contract.update({
    where: { id },
    data: {
      ...contractData, startDate: new Date(data.startDate), endDate: new Date(data.endDate),
      trialOpenDate: data.trialOpenDate ? new Date(data.trialOpenDate) : null,
      rebates: { deleteMany: {}, create: rebates },
    },
    include: { brand: true, rebates: { orderBy: { createdAt: "asc" } } },
  });
  await writeOperationLog({ userId: session.userId, username: session.username, page: "合同管理", action: "编辑", result: "成功", detail: `编辑合同：${contract.recordNo}`, request }).catch(() => undefined);
  return NextResponse.json(contract);
}

import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { getBusinessDictionaryOptions } from "@/lib/business-dictionaries";
import { db } from "@/lib/db";
import { writeOperationLog, writeOperationLogWithTransaction } from "@/lib/operation-log";
import {
  StoreLaborStandardBusinessError,
  canUseStoreLaborStandards,
  createStoreLaborStandardPolicyVersion,
  lockStoreLaborStandardBrands,
  serializeStoreLaborStandard,
  storeLaborStandardSelect,
  storeLaborStandardUpdateSchema,
  validateStoreLaborStandardRules,
} from "@/lib/store-labor-standards";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canUseStoreLaborStandards(session, "view")) return NextResponse.json({ message: "暂无门店用工标准查看权限" }, { status: 403 });
  const { id } = await params;
  try {
    const row = await db.storeLaborStandard.findUnique({ where: { id }, select: storeLaborStandardSelect });
    if (!row) {
      const message = "当前门店用工标准记录已不存在，请刷新后重新操作";
      await writeOperationLog({ userId: session.userId, username: session.username, page: "门店用工标准", action: "查看", result: "失败", detail: `记录ID：${id}；${message}`, request }).catch(() => undefined);
      return NextResponse.json({ message }, { status: 404 });
    }
    await writeOperationLog({ userId: session.userId, username: session.username, page: "门店用工标准", action: "查看", result: "成功", detail: `记录编号：${row.recordNo}`, request }).catch(() => undefined);
    return NextResponse.json(serializeStoreLaborStandard(row), { headers: { "Cache-Control": "no-store" } });
  } catch {
    await writeOperationLog({ userId: session.userId, username: session.username, page: "门店用工标准", action: "查看", result: "失败", detail: `记录ID：${id}`, request }).catch(() => undefined);
    return NextResponse.json({ message: "门店用工标准详情加载失败，请稍后重试" }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canUseStoreLaborStandards(session, "edit")) return NextResponse.json({ message: "暂无门店用工标准编辑权限" }, { status: 403 });
  const { id } = await params;
  const parsed = storeLaborStandardUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message || "门店用工标准信息不正确";
    await writeOperationLog({ userId: session.userId, username: session.username, page: "门店用工标准", action: "编辑", result: "失败", detail: message, request }).catch(() => undefined);
    return NextResponse.json({ message }, { status: 400 });
  }

  let before: { recordNo: string; brandValue: string } | null;
  try {
    before = await db.storeLaborStandard.findUnique({ where: { id }, select: { recordNo: true, brandValue: true } });
  } catch {
    return NextResponse.json({ message: "门店用工标准保存失败，请稍后重试" }, { status: 500 });
  }
  if (!before) return NextResponse.json({ message: "当前门店用工标准记录已不存在，请刷新后重新操作" }, { status: 404 });

  try {
    if (parsed.data.brandValue !== before.brandValue) {
      const brandOptions = await getBusinessDictionaryOptions("BRAND");
      if (!brandOptions.some(option => option.value === parsed.data.brandValue)) {
        return NextResponse.json({ message: "所选品牌不在已启用的品牌数据字典中，请刷新后重试" }, { status: 400 });
      }
    }
    const updated = await db.$transaction(async tx => {
      await lockStoreLaborStandardBrands(tx, [before.brandValue, parsed.data.brandValue]);
      await validateStoreLaborStandardRules(tx, parsed.data, id);
      const result = await tx.storeLaborStandard.updateMany({
        where: { id, version: parsed.data.version },
        data: {
          brandValue: parsed.data.brandValue,
          assessmentMetric: parsed.data.assessmentMetric,
          lowerAmount: parsed.data.lowerAmount,
          upperAmount: parsed.data.upperAmount,
          standardHeadcount: parsed.data.standardHeadcount,
          remark: parsed.data.remark || null,
          updatedByUserId: session.userId,
          updatedByNameSnapshot: session.realName,
          version: { increment: 1 },
        },
      });
      if (!result.count) {
        const exists = await tx.storeLaborStandard.findUnique({ where: { id }, select: { id: true } });
        throw new StoreLaborStandardBusinessError(
          exists ? "当前门店用工标准记录已被其他用户修改，请刷新后重新操作" : "当前门店用工标准记录已不存在，请刷新后重新操作",
          exists ? 409 : 404,
        );
      }
      const row = await tx.storeLaborStandard.findUnique({ where: { id }, select: storeLaborStandardSelect });
      if (!row) throw new StoreLaborStandardBusinessError("当前门店用工标准记录已不存在，请刷新后重新操作", 404);
      const actor = { userId: session.userId, username: session.username, realName: session.realName };
      for (const brandValue of [...new Set([before.brandValue, row.brandValue])].sort((left, right) => left.localeCompare(right, "zh-CN"))) {
        await createStoreLaborStandardPolicyVersion(tx, brandValue, actor);
      }
      await writeOperationLogWithTransaction(tx, {
        userId: session.userId,
        username: session.username,
        page: "门店用工标准",
        action: "编辑",
        result: "成功",
        detail: `记录编号：${row.recordNo}；品牌：${row.brandValue}；下限：${row.lowerAmount?.toFixed(2) ?? "空"}；上限：${row.upperAmount?.toFixed(2) ?? "空"}；标准用工：${row.standardHeadcount}人`,
        request,
      });
      return row;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 10000 });
    return NextResponse.json(serializeStoreLaborStandard(updated));
  } catch (error) {
    if (error instanceof StoreLaborStandardBusinessError) {
      await writeOperationLog({ userId: session.userId, username: session.username, page: "门店用工标准", action: "编辑", result: "失败", detail: `${before.recordNo}；${error.message}`, request }).catch(() => undefined);
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    const message = error instanceof Error && error.name === "DictionaryConfigError" ? error.message : "门店用工标准保存失败，请稍后重试";
    await writeOperationLog({ userId: session.userId, username: session.username, page: "门店用工标准", action: "编辑", result: "失败", detail: `${before.recordNo}；${message}`, request }).catch(() => undefined);
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canUseStoreLaborStandards(session, "delete")) return NextResponse.json({ message: "暂无门店用工标准删除权限" }, { status: 403 });
  const { id } = await params;
  try {
    const deleted = await db.$transaction(async tx => {
      const before = await tx.storeLaborStandard.findUnique({ where: { id }, select: storeLaborStandardSelect });
      if (!before) throw new StoreLaborStandardBusinessError("当前门店用工标准记录已不存在，请刷新后重新操作", 404);
      await lockStoreLaborStandardBrands(tx, [before.brandValue]);
      const result = await tx.storeLaborStandard.deleteMany({ where: { id, version: before.version } });
      if (!result.count) throw new StoreLaborStandardBusinessError("当前门店用工标准记录已被其他用户修改，请刷新后重新操作", 409);
      await createStoreLaborStandardPolicyVersion(tx, before.brandValue, {
        userId: session.userId,
        username: session.username,
        realName: session.realName,
      });
      await writeOperationLogWithTransaction(tx, {
        userId: session.userId,
        username: session.username,
        page: "门店用工标准",
        action: "删除",
        result: "成功",
        detail: `原记录编号：${before.recordNo}；原品牌：${before.brandValue}；原下限：${before.lowerAmount?.toFixed(2) ?? "空"}；原上限：${before.upperAmount?.toFixed(2) ?? "空"}；原标准用工：${before.standardHeadcount}人`,
        request,
      });
      return before;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 10000 });
    return NextResponse.json({ success: true, recordNo: deleted.recordNo });
  } catch (error) {
    if (error instanceof StoreLaborStandardBusinessError) {
      await writeOperationLog({ userId: session.userId, username: session.username, page: "门店用工标准", action: "删除", result: "失败", detail: `记录ID：${id}；${error.message}`, request }).catch(() => undefined);
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    await writeOperationLog({ userId: session.userId, username: session.username, page: "门店用工标准", action: "删除", result: "失败", detail: `记录ID：${id}；服务端删除失败`, request }).catch(() => undefined);
    return NextResponse.json({ message: "门店用工标准删除失败，请稍后重试" }, { status: 500 });
  }
}

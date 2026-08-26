import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { writeOperationLog, writeOperationLogWithTransaction } from "@/lib/operation-log";
import { canStoreResearch, formatResearchDateTime, storeResearchDataScope } from "@/lib/store-research-records";

type SnapshotItem = {
  id?: unknown; itemId?: unknown; section?: unknown; subSection?: unknown; label?: unknown;
  component?: unknown; required?: unknown; value?: unknown;
};

function objectItems(value: Prisma.JsonValue): SnapshotItem[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const items = (value as { items?: unknown }).items;
  return Array.isArray(items) ? items.filter((item): item is SnapshotItem => !!item && typeof item === "object" && !Array.isArray(item)) : [];
}

function detailItems(configSnapshot: Prisma.JsonValue, resultSnapshot: Prisma.JsonValue) {
  const results = objectItems(resultSnapshot);
  const resultById = new Map(results.map(item => [String(item.itemId || item.id || ""), item]));
  const configured = objectItems(configSnapshot);
  const source = configured.length ? configured : results;
  return source.map((item, index) => {
    const id = String(item.id || item.itemId || `item_${index + 1}`);
    const result = resultById.get(id) || item;
    return {
      id,
      section: String(item.section || result.section || "调研内容"),
      subSection: String(item.subSection || result.subSection || "调研明细"),
      label: String(item.label || result.label || `调研项 ${index + 1}`),
      component: String(item.component || "input"),
      required: Boolean(item.required ?? result.required),
      value: String(result.value ?? ""),
      sortOrder: index,
    };
  });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canStoreResearch(session, "view")) return NextResponse.json({ message: "暂无巡店调研表查看权限" }, { status: 403 });
  const { id } = await params;
  try {
    const row = await db.researchTemplateRecord.findFirst({ where: { AND: [{ id }, await storeResearchDataScope(session)] } });
    if (!row) return NextResponse.json({ message: "该调研记录已不存在或无权查看" }, { status: 404 });
    await writeOperationLog({ userId: session.userId, username: session.username, page: "巡店调研表", action: "查看", result: "成功", detail: `记录编号：${row.recordNo}`, request }).catch(() => undefined);
    return NextResponse.json({
      id: row.id,
      recordNo: row.recordNo,
      researchMonth: row.researchMonth,
      brandName: row.brandNameSnapshot,
      storeName: row.storeNameSnapshot,
      templateType: row.templateType,
      storeManagerName: row.storeManagerNameSnapshot || "-",
      creatorRealName: row.supervisorRealName,
      creatorUsername: row.submittedUsername,
      submittedAt: formatResearchDateTime(row.submittedAt),
      configVersion: row.configVersion,
      configSnapshot: row.configSnapshot,
      items: detailItems(row.configSnapshot, row.resultSnapshot),
    });
  } catch {
    await writeOperationLog({ userId: session.userId, username: session.username, page: "巡店调研表", action: "查看", result: "失败", detail: `记录ID：${id}`, request }).catch(() => undefined);
    return NextResponse.json({ message: "调研详情加载失败，请稍后重试" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canStoreResearch(session, "delete")) return NextResponse.json({ message: "暂无巡店调研表删除权限" }, { status: 403 });
  const { id } = await params;
  try {
    const scope = await storeResearchDataScope(session);
    const found = await db.researchTemplateRecord.findFirst({ where: { AND: [{ id }, scope] } });
    if (!found) return NextResponse.json({ message: "该调研记录已不存在或已被其他用户删除" }, { status: 404 });
    await db.$transaction(async tx => {
      const current = await tx.researchTemplateRecord.findFirst({ where: { AND: [{ id }, scope] } });
      if (!current) throw new Prisma.PrismaClientKnownRequestError("调研记录不存在", { code: "P2025", clientVersion: Prisma.prismaVersion.client });
      await tx.researchTemplateRecord.delete({ where: { id: current.id } });
      await writeOperationLogWithTransaction(tx, {
        userId: session.userId,
        username: session.username,
        page: "巡店调研表",
        action: "删除",
        result: "成功",
        detail: `原记录编号：${current.recordNo}；门店ID：${current.storeId}；门店：${current.storeNameSnapshot}；品牌：${current.brandNameSnapshot}；调研月份：${current.researchMonth}；调研表类型：${current.templateType}；创建人：${current.supervisorRealName}；删除人：${session.realName}`,
        request,
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ message: "巡店调研记录删除成功，该门店对应月份现可重新调研" });
  } catch (error) {
    const missing = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
    await writeOperationLog({ userId: session.userId, username: session.username, page: "巡店调研表", action: "删除", result: "失败", detail: missing ? `调研记录已不存在：${id}` : `调研记录删除失败：${id}`, request }).catch(() => undefined);
    return NextResponse.json({ message: missing ? "该调研记录已不存在或已被其他用户删除" : "调研记录删除失败，请稍后重试" }, { status: missing ? 404 : 500 });
  }
}

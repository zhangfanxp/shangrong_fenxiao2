import { Prisma, RecordStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import {
  businessDataSourceFilterWhere, businessDataSourceInputSchema, businessDataSourceListSelect,
  canBusinessDataSource, nextBusinessDataSourceRecordNo, readBusinessDataSourceFilters,
  serializeBusinessDataSourceListRow, validateSourceAndBuildFields,
} from "@/lib/business-data-sources";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";

function uniqueConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function GET(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canBusinessDataSource(session, "query")) return NextResponse.json({ message: "暂无业务数据源查询权限" }, { status: 403 });
  const url = new URL(request.url);
  const filters = readBusinessDataSourceFilters(url.searchParams);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(20, Number(url.searchParams.get("pageSize")) || 20));
  const where = businessDataSourceFilterWhere(filters);
  try {
    const [rows, total] = await db.$transaction([
      db.businessDataSource.findMany({ where, select: businessDataSourceListSelect, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
      db.businessDataSource.count({ where }),
    ]);
    await writeOperationLog({ userId: session.userId, username: session.username, page: "业务数据源", action: "筛选", result: "成功", detail: `业务名称：${filters.businessNameKeyword || "全部"}；来源类型：${filters.sourceType || "全部"}；模版记录编号：${filters.templateRecordNo || "全部"}；结果：${total}条`, request }).catch(() => undefined);
    return NextResponse.json({ rows: rows.map(serializeBusinessDataSourceListRow), total, page, pageSize });
  } catch {
    return NextResponse.json({ message: "业务数据源加载失败，请稍后重试" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canBusinessDataSource(session, "create")) return NextResponse.json({ message: "暂无业务数据源新增权限" }, { status: 403 });
  const parsed = businessDataSourceInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message || "业务数据源内容格式不正确" }, { status: 400 });
  try {
    const resolved = await validateSourceAndBuildFields(parsed.data, session.userId);
    if (resolved.template.status !== RecordStatus.ENABLED) return NextResponse.json({ message: "所选模版已被禁用，请重新选择" }, { status: 400 });
    const created = await db.$transaction(async tx => {
      const recordNo = await nextBusinessDataSourceRecordNo(tx);
      return tx.businessDataSource.create({ data: {
        recordNo,
        businessName: parsed.data.businessName,
        sourceType: parsed.data.sourceType,
        templateId: resolved.template.templateId,
        templateRecordNoSnapshot: resolved.template.templateRecordNo,
        templateNameSnapshot: resolved.template.templateName,
        remark: parsed.data.remark || null,
        createdByUserId: session.userId,
        createdByUsername: session.username,
        createdByNameSnapshot: session.realName,
        fields: { create: resolved.fields },
      }, select: { id: true, recordNo: true } });
    });
    await writeOperationLog({ userId: session.userId, username: session.username, page: "业务数据源", action: "新增", result: "成功", detail: `新增业务数据源：${created.recordNo}；业务名称：${parsed.data.businessName}；字段：${parsed.data.fields.length}项`, request }).catch(() => undefined);
    return NextResponse.json({ message: "业务数据源新增成功", ...created }, { status: 201 });
  } catch (error) {
    const message = uniqueConflict(error) ? "当前模版已配置业务数据源，请勿重复创建" : error instanceof Error && error.message ? error.message : "业务数据源保存失败，请稍后重试";
    await writeOperationLog({ userId: session.userId, username: session.username, page: "业务数据源", action: "新增", result: "失败", detail: message, request }).catch(() => undefined);
    return NextResponse.json({ message }, { status: uniqueConflict(error) ? 409 : 400 });
  }
}

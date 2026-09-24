import { Prisma, RecordStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import {
  businessDataSourceInputSchema, canBusinessDataSource, fieldTypeLabels, findTemplateOption,
  originalTableFieldLabel, sourceTypeLabels, validateSourceAndBuildFields,
} from "@/lib/business-data-sources";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";

const editSchema = businessDataSourceInputSchema.extend({
  version: z.number().int().positive(),
});

function uniqueConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function findSource(id: string) {
  return db.businessDataSource.findUnique({
    where: { id },
    include: { fields: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } },
  });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canBusinessDataSource(session, "view") && !canBusinessDataSource(session, "edit")) return NextResponse.json({ message: "暂无业务数据源查看权限" }, { status: 403 });
  const source = await findSource((await params).id);
  if (!source) return NextResponse.json({ message: "业务数据源不存在或已删除" }, { status: 404 });
  const template = await findTemplateOption(source.sourceType, source.templateId).catch(() => null);
  const intent = new URL(request.url).searchParams.get("intent") === "edit" ? "编辑" : "查看";
  await writeOperationLog({ userId: session.userId, username: session.username, page: "业务数据源", action: intent, result: "成功", detail: `${intent}业务数据源：${source.recordNo}`, request }).catch(() => undefined);
  return NextResponse.json({
    source: {
      ...source,
      sourceTypeLabel: sourceTypeLabels[source.sourceType],
      templateStatus: template?.status || null,
      templateMissing: !template,
      fields: source.fields.map(field => ({
        ...field,
        fieldTypeLabel: fieldTypeLabels[field.fieldType],
        originalTableField: originalTableFieldLabel(field),
      })),
    },
  });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canBusinessDataSource(session, "edit")) return NextResponse.json({ message: "暂无业务数据源编辑权限" }, { status: 403 });
  const source = await findSource((await params).id);
  if (!source) return NextResponse.json({ message: "业务数据源不存在或已删除" }, { status: 404 });
  const parsed = editSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message || "业务数据源内容格式不正确" }, { status: 400 });
  if (source.version !== parsed.data.version) return NextResponse.json({ message: "当前业务数据源已被其他用户修改，请刷新后重新操作" }, { status: 409 });
  const sourceChanged = source.sourceType !== parsed.data.sourceType || source.templateId !== parsed.data.templateId;
  try {
    const resolved = await validateSourceAndBuildFields(parsed.data, session.userId);
    if (sourceChanged && resolved.template.status !== RecordStatus.ENABLED) return NextResponse.json({ message: "所选模版已被禁用，请重新选择" }, { status: 400 });
    const existingById = new Map(source.fields.map(field => [field.id, field]));
    const retainedIds = new Set<string>();
    let nextNewSortOrder = source.fields.reduce((maximum, field) => Math.max(maximum, field.sortOrder), -1) + 1;
    const fieldChanges = parsed.data.fields.map((inputField, index) => {
      const built = resolved.fields[index];
      if (sourceChanged) {
        if (inputField.id) throw new Error("更换模版记录后，请重新配置数据字典字段");
        return { kind: "create" as const, data: built };
      }
      if (!inputField.id) return { kind: "create" as const, data: { ...built, sortOrder: nextNewSortOrder++ } };
      const existing = existingById.get(inputField.id);
      if (!existing) throw new Error("部分数据字典字段已发生变化，请刷新后重试");
      if (retainedIds.has(existing.id)) throw new Error("当前数据源已存在相同数值字段");
      retainedIds.add(existing.id);
      if (existing.sourceFieldKey !== inputField.sourceFieldKey || existing.fieldType !== inputField.fieldType || (existing.unit || "") !== inputField.unit) {
        throw new Error("数值字段、字段类型和单位创建后不可修改");
      }
      return { kind: "update" as const, id: existing.id, remark: inputField.remark || null };
    });
    await db.$transaction(async tx => {
      const updated = await tx.businessDataSource.updateMany({
        where: { id: source.id, version: source.version },
        data: {
          businessName: parsed.data.businessName,
          sourceType: parsed.data.sourceType,
          templateId: parsed.data.templateId,
          ...(sourceChanged ? {
            templateRecordNoSnapshot: resolved.template.templateRecordNo,
            templateNameSnapshot: resolved.template.templateName,
          } : {}),
          remark: parsed.data.remark || null,
          updatedByUserId: session.userId,
          updatedByNameSnapshot: session.realName,
          version: { increment: 1 },
        },
      });
      if (!updated.count) throw new Error("当前业务数据源已被其他用户修改，请刷新后重新操作");
      if (sourceChanged) await tx.businessDataSourceField.deleteMany({ where: { businessDataSourceId: source.id } });
      else await tx.businessDataSourceField.deleteMany({ where: { businessDataSourceId: source.id, id: { notIn: [...retainedIds] } } });
      for (const change of fieldChanges) {
        if (change.kind === "create") await tx.businessDataSourceField.create({ data: { businessDataSourceId: source.id, ...change.data } });
        else await tx.businessDataSourceField.update({ where: { id: change.id }, data: { remark: change.remark } });
      }
    });
    await writeOperationLog({ userId: session.userId, username: session.username, page: "业务数据源", action: "编辑", result: "成功", detail: `编辑业务数据源：${source.recordNo}；字段：${parsed.data.fields.length}项`, request }).catch(() => undefined);
    return NextResponse.json({ message: "业务数据源保存成功" });
  } catch (error) {
    const message = uniqueConflict(error) ? "当前模版已配置业务数据源，请勿重复创建" : error instanceof Error && error.message ? error.message : "业务数据源保存失败，请稍后重试";
    await writeOperationLog({ userId: session.userId, username: session.username, page: "业务数据源", action: "编辑", result: "失败", detail: `业务数据源：${source.recordNo}；${message}`, request }).catch(() => undefined);
    return NextResponse.json({ message }, { status: message.includes("其他用户") || uniqueConflict(error) ? 409 : 400 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canBusinessDataSource(session, "delete")) return NextResponse.json({ message: "暂无业务数据源删除权限" }, { status: 403 });
  const source = await findSource((await params).id);
  if (!source) return NextResponse.json({ message: "业务数据源不存在或已删除" }, { status: 404 });
  try {
    await db.businessDataSource.delete({ where: { id: source.id } });
    await writeOperationLog({ userId: session.userId, username: session.username, page: "业务数据源", action: "删除", result: "成功", detail: `删除业务数据源：${source.recordNo}；同步删除字段：${source.fields.length}项`, request }).catch(() => undefined);
    return NextResponse.json({ message: "业务数据源删除成功" });
  } catch {
    await writeOperationLog({ userId: session.userId, username: session.username, page: "业务数据源", action: "删除", result: "失败", detail: `业务数据源：${source.recordNo}；业务数据源删除失败`, request }).catch(() => undefined);
    return NextResponse.json({ message: "业务数据源删除失败，请稍后重试" }, { status: 500 });
  }
}

import { Prisma, RecordStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import {
  businessDataSystemSourceSummary, businessDataSourceInputSchema, canBusinessDataSource, fieldTypeLabels, findTemplateOption,
  originalTableFieldLabel, readBusinessDataSystemSources, readStoredBusinessFormulaConfig, readStoredBusinessJudgmentConfig, sourceTypeLabels, validateSourceAndBuildFields,
} from "@/lib/business-data-sources";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";

const editSchema = businessDataSourceInputSchema.extend({
  version: z.number().int().positive(),
});

function uniqueConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function fieldNameConflict(error: unknown) {
  return uniqueConflict(error) && JSON.stringify((error as Prisma.PrismaClientKnownRequestError).meta || {}).includes("BusinessDSField_field_name_key");
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
      systemSources: readBusinessDataSystemSources(source.systemSources),
      systemSourceSummary: businessDataSystemSourceSummary(source.systemSources),
      sourceTypeLabel: sourceTypeLabels[source.sourceType],
      templateStatus: template?.status || null,
      templateMissing: !template,
      fields: source.fields.map(field => {
        const formula = readStoredBusinessFormulaConfig(field.sourceFieldConfig);
        const judgment = readStoredBusinessJudgmentConfig(field.sourceFieldConfig);
        return {
          ...field,
          fieldSource: formula ? "FORMULA" : judgment ? "JUDGMENT" : "SOURCE",
          formulaName: formula ? field.fieldNameSnapshot : null,
          formulaExpression: formula?.displayExpression || null,
          formulaReferenceKeys: formula?.referenceKeys || [],
          judgmentName: judgment ? field.fieldNameSnapshot : null,
          judgmentConditions: judgment?.conditions || [],
          judgmentReferenceKeys: judgment?.referenceKeys || [],
          fieldTypeLabel: fieldTypeLabels[field.fieldType],
          originalTableField: originalTableFieldLabel(field),
        };
      }),
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
  const previousSystemSources = readBusinessDataSystemSources(source.systemSources);
  const systemSourcesChanged = previousSystemSources.length !== parsed.data.systemSources.length
    || previousSystemSources.some(value => !parsed.data.systemSources.includes(value));
  const sourceChanged = source.sourceType !== parsed.data.sourceType || source.templateId !== parsed.data.templateId || systemSourcesChanged;
  try {
    const resolved = await validateSourceAndBuildFields(parsed.data, session.userId);
    if (sourceChanged && resolved.template.status !== RecordStatus.ENABLED) return NextResponse.json({ message: "所选模版已被禁用，请重新选择" }, { status: 400 });
    const existingById = new Map(source.fields.map(field => [field.id, field]));
    const retainedIds = new Set<string>();
    const customFieldRenames: string[] = [];
    const fieldChanges = parsed.data.fields.map((inputField, index) => {
      const built = resolved.fields[index];
      if (sourceChanged) {
        if (inputField.id) throw new Error("修改来源类型、模版记录或组合系统来源后，请重新配置数据字典字段");
        return { kind: "create" as const, data: built };
      }
      if (!inputField.id) return { kind: "create" as const, data: built };
      const existing = existingById.get(inputField.id);
      if (!existing) throw new Error("部分数据字典字段已发生变化，请刷新后重试");
      if (retainedIds.has(existing.id)) throw new Error("当前数据源已存在相同业务字段");
      retainedIds.add(existing.id);
      const existingFormula = readStoredBusinessFormulaConfig(existing.sourceFieldConfig);
      const builtFormula = readStoredBusinessFormulaConfig(built.sourceFieldConfig);
      const existingJudgment = readStoredBusinessJudgmentConfig(existing.sourceFieldConfig);
      const builtJudgment = readStoredBusinessJudgmentConfig(built.sourceFieldConfig);
      if ((Boolean(existingFormula) !== Boolean(builtFormula)) || (Boolean(existingJudgment) !== Boolean(builtJudgment)) || (Boolean(existingFormula) && Boolean(builtJudgment)) || (Boolean(existingJudgment) && Boolean(builtFormula))) {
        throw new Error("字段来源创建后不可修改");
      }
      if (existing.sourceFieldKey !== inputField.sourceFieldKey || existing.fieldType !== inputField.fieldType || (existing.unit || "") !== inputField.unit) {
        throw new Error("业务字段、字段类型和单位创建后不可修改");
      }
      if (existingFormula && builtFormula && existingFormula.expression !== builtFormula.expression) throw new Error("计算公式创建后不可修改");
      if (existingJudgment && builtJudgment && JSON.stringify(existingJudgment.conditions.map(condition => ({ leftExpression: condition.leftExpression, operator: condition.operator, rightExpression: condition.rightExpression, result: condition.result }))) !== JSON.stringify(builtJudgment.conditions.map(condition => ({ leftExpression: condition.leftExpression, operator: condition.operator, rightExpression: condition.rightExpression, result: condition.result })))) {
        throw new Error("判断条件创建后不可修改");
      }
      if ((existingFormula || existingJudgment) && existing.fieldNameSnapshot !== built.fieldNameSnapshot) customFieldRenames.push(`${existing.fieldNameSnapshot} → ${built.fieldNameSnapshot}`);
      return {
        kind: "update" as const,
        id: existing.id,
        fieldNameSnapshot: existingFormula || existingJudgment ? built.fieldNameSnapshot : existing.fieldNameSnapshot,
        remark: inputField.remark || null,
        sortOrder: built.sortOrder,
      };
    });
    await db.$transaction(async tx => {
      const updated = await tx.businessDataSource.updateMany({
        where: { id: source.id, version: source.version },
        data: {
          businessName: parsed.data.businessName,
          sourceType: parsed.data.sourceType,
          templateId: parsed.data.templateId,
          systemSources: parsed.data.systemSources,
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
        else await tx.businessDataSourceField.update({ where: { id: change.id }, data: { fieldNameSnapshot: change.fieldNameSnapshot, remark: change.remark, sortOrder: change.sortOrder } });
      }
    });
    await writeOperationLog({ userId: session.userId, username: session.username, page: "业务数据源", action: "编辑", result: "成功", detail: `编辑业务数据源：${source.recordNo}；组合来源：${businessDataSystemSourceSummary(parsed.data.systemSources)}；字段：${parsed.data.fields.length}项${customFieldRenames.length ? `；自定义字段重命名：${customFieldRenames.join("，")}` : ""}`, request }).catch(() => undefined);
    return NextResponse.json({ message: "业务数据源保存成功" });
  } catch (error) {
    const message = fieldNameConflict(error) ? "当前数据源已存在相同业务字段" : uniqueConflict(error) ? "保存数据与现有记录冲突，请刷新后重试" : error instanceof Error && error.message ? error.message : "业务数据源保存失败，请稍后重试";
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

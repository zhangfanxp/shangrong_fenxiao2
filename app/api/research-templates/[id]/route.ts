import { Prisma, RecordStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { getBusinessDictionaryOptions } from "@/lib/business-dictionaries";
import { db } from "@/lib/db";
import { writeOperationLog, type OperationLogResult } from "@/lib/operation-log";
import {
  createResearchConfig, deleteResearchConfig, normalizeResearchFileName, parseResearchDetails,
  readResearchConfig, researchFileExists, ResearchTemplateConfigError, writeResearchConfig,
} from "@/lib/research-template-config";
import { canResearchTemplate, type ResearchTemplatePermission } from "@/lib/research-template-permissions";
import { buildResearchConfig, researchTemplateInputSchema, sameTimestamp, serializeResearchTemplate } from "@/lib/research-template-service";

const editSchema = researchTemplateInputSchema.extend({ updatedAt: z.string().datetime({ offset: true }) });
function forbidden() { return NextResponse.json({ message: "暂无此操作权限" }, { status: 403 }); }
function uniqueConflict(error: unknown) { return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"; }
async function findTemplate(id: string) {
  return db.researchTemplate.findFirst({ where: { id, deletedAt: null }, include: { brandScopes: { orderBy: { id: "asc" } }, _count: { select: { records: true } } } });
}
async function log(userId: string, username: string, action: string, result: OperationLogResult, detail: string, request?: Request) {
  await writeOperationLog({ userId, username, page: "调研模版", action, result, detail, request }).catch(() => undefined);
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  const intent = new URL(request.url).searchParams.get("intent") || "view";
  const permission: ResearchTemplatePermission = intent === "edit" ? "edit" : "view";
  if (!canResearchTemplate(session, permission)) return forbidden();
  const template = await findTemplate((await params).id);
  if (!template) return NextResponse.json({ message: "调研模版不存在或已删除" }, { status: 404 });
  try {
    const config = await readResearchConfig(template.configFileName);
    const action = intent === "edit" ? "编辑" : "查看";
    await log(session.userId, session.username, action, "成功", `${action}调研模版：${template.recordNo}`, request);
    return NextResponse.json({ template: serializeResearchTemplate(template), config });
  } catch (error) {
    const message = error instanceof ResearchTemplateConfigError ? error.message : "调研配置文件加载失败，请联系系统管理员";
    await log(session.userId, session.username, intent === "edit" ? "编辑" : "查看", "失败", `调研模版：${template.recordNo}；${message}`, request);
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canResearchTemplate(session, "edit")) return forbidden();
  const template = await findTemplate((await params).id);
  if (!template) return NextResponse.json({ message: "调研模版不存在或已删除" }, { status: 404 });
  const body = editSchema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ message: body.error.issues[0].message }, { status: 400 });
  if (!sameTimestamp(template.updatedAt, body.data.updatedAt)) return NextResponse.json({ message: "当前调研模版已被其他用户修改，请刷新后重新操作。" }, { status: 409 });
  const input = body.data;
  let oldConfig;
  let nextFileName = template.configFileName;
  let nextFileCreated = false;
  try {
    oldConfig = await readResearchConfig(template.configFileName);
    nextFileName = normalizeResearchFileName(input.configFileBase);
    if (template._count.records > 0 && nextFileName !== template.configFileName) throw new ResearchTemplateConfigError("该调研模版已产生历史调研记录，配置文件名称不可修改。");
    if (nextFileName !== template.configFileName && (await researchFileExists(nextFileName) || await db.researchTemplate.findUnique({ where: { configFileName: nextFileName } }))) {
      throw new ResearchTemplateConfigError("调研明细配置文件名称已存在，请重新输入");
    }
    const [typeOptions, brandOptions] = await Promise.all([getBusinessDictionaryOptions("RESEARCH_TEMPLATE_TYPE"), getBusinessDictionaryOptions("BRAND")]);
    if (!typeOptions.some(option => option.value === input.templateType) && input.templateType !== template.templateType) throw new ResearchTemplateConfigError("所选调研模版类型不在已启用的Research_Template_Type数据字典中");
    const previousBrands = template.brandScopes.map(scope => scope.brandValue);
    const validBrands = new Set(brandOptions.map(option => option.value));
    input.applicableBrands = Array.from(new Set(input.applicableBrands));
    if (input.applicableBrands.some(brand => !validBrands.has(brand) && !previousBrands.includes(brand))) throw new ResearchTemplateConfigError("所选品牌不在已启用的BRAND数据字典中");
    const parsed = parseResearchDetails(input.detailText);
    const nextVersion = template.configVersion + 1;
    const nextConfig = buildResearchConfig(input, template.recordNo, nextVersion, template.status, parsed);
    if (nextFileName === template.configFileName) await writeResearchConfig(nextFileName, nextConfig);
    else {
      await createResearchConfig(nextFileName, nextConfig);
      nextFileCreated = true;
      try { await deleteResearchConfig(template.configFileName); }
      catch (error) { await deleteResearchConfig(nextFileName).catch(() => undefined); throw error; }
    }
    try {
      await db.$transaction(async tx => {
        const updated = await tx.researchTemplate.updateMany({ where: { id: template.id, updatedAt: template.updatedAt }, data: {
          templateType: input.templateType, configFileName: nextFileName, detailText: parsed.normalizedText,
          itemCount: parsed.itemCount, remark: input.remark || null, configVersion: nextVersion,
        } });
        if (!updated.count) throw new ResearchTemplateConfigError("当前调研模版已被其他用户修改，请刷新后重新操作。");
        await tx.researchTemplateBrand.deleteMany({ where: { researchTemplateId: template.id } });
        await tx.researchTemplateBrand.createMany({ data: input.applicableBrands.map(brandValue => ({ researchTemplateId: template.id, brandValue })) });
      });
    } catch (error) {
      if (nextFileCreated) await deleteResearchConfig(nextFileName).catch(() => undefined);
      await writeResearchConfig(template.configFileName, oldConfig);
      throw error;
    }
    await log(session.userId, session.username, "编辑", "成功", `编辑调研模版：${template.recordNo}，版本：${nextVersion}`, request);
    return NextResponse.json({ message: "调研模版保存成功" });
  } catch (error) {
    const message = error instanceof ResearchTemplateConfigError ? error.message : uniqueConflict(error) ? "调研明细配置文件名称已存在，请重新输入" : "调研配置文件保存失败，请稍后重试";
    await log(session.userId, session.username, "编辑", "失败", `调研模版：${template.recordNo}；${message}`, request);
    return NextResponse.json({ message }, { status: message.includes("其他用户") ? 409 : 400 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canResearchTemplate(session, "delete")) return forbidden();
  const template = await findTemplate((await params).id);
  if (!template) return NextResponse.json({ message: "调研模版不存在或已删除" }, { status: 404 });
  if (template._count.records > 0) return NextResponse.json({ message: "该调研模版已产生历史调研记录，暂不能删除，请使用“禁用”操作。" }, { status: 400 });
  try {
    const oldConfig = await readResearchConfig(template.configFileName);
    await deleteResearchConfig(template.configFileName);
    try {
      await db.$transaction([
        db.researchTemplateBrand.deleteMany({ where: { researchTemplateId: template.id } }),
        db.researchTemplate.update({ where: { id: template.id }, data: { deletedAt: new Date() } }),
      ]);
    } catch (error) { await writeResearchConfig(template.configFileName, oldConfig); throw error; }
    await log(session.userId, session.username, "删除", "成功", `删除调研模版：${template.recordNo}`, request);
    return NextResponse.json({ message: "调研模版删除成功" });
  } catch (error) {
    const message = error instanceof ResearchTemplateConfigError ? error.message : "调研模版删除失败，请稍后重试";
    await log(session.userId, session.username, "删除", "失败", `调研模版：${template.recordNo}；${message}`, request);
    return NextResponse.json({ message }, { status: 400 });
  }
}

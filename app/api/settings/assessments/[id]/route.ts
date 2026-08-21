import { AssessmentScoreMode, Prisma, RecordStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { canAssessment, type AssessmentPermission } from "@/lib/assessment-permissions";
import {
  AssessmentConfigError, assessmentFileExists, createAssessmentConfig, deleteAssessmentConfig,
  normalizeAssessmentFileName, parseAssessmentDetails, readAssessmentConfig, writeAssessmentConfig,
} from "@/lib/assessment-config";
import { db } from "@/lib/db";
import { writeOperationLog, type OperationLogResult } from "@/lib/operation-log";
import { getBusinessDictionaryOptions } from "@/lib/business-dictionaries";
import { assessmentBrands, assessmentScopeConflictMessage, assessmentScopeRows, findAssessmentScopeConflict, isUniqueConflict } from "@/lib/assessment-scope";

const editSchema = z.object({
  name: z.string().trim().min(1, "请选择考核表类型"),
  scoreMode: z.nativeEnum(AssessmentScoreMode, { message: "请选择评分模式" }),
  configFileBase: z.string().trim().min(1, "请输入考核明细配置文件名"),
  applicableBrands: z.array(z.string().trim().min(1)).default([]),
  detailText: z.string().min(1, "请输入考核明细项"),
  remark: z.string().trim().refine(value => Array.from(value).length <= 50, "备注不能超过50个汉字").optional().default(""),
  updatedAt: z.string().datetime({ offset: true }),
});
const statusSchema = z.object({ action: z.literal("status"), status: z.nativeEnum(RecordStatus), updatedAt: z.string().datetime({ offset: true }) });

function forbidden() { return NextResponse.json({ message: "暂无此操作权限" }, { status: 403 }); }
function sameTimestamp(date: Date, value: string) { return date.getTime() === new Date(value).getTime(); }
function rowJson<T extends { totalScore: Prisma.Decimal }>(row: T) { return { ...row, totalScore: Number(row.totalScore) }; }
function buildConfig(input: z.infer<typeof editSchema>, recordNo: string, version: number, parsed: ReturnType<typeof parseAssessmentDetails>) {
  return {
    recordNo,
    reviewName: input.name,
    assessmentType: input.name,
    scoreMode: input.scoreMode,
    scoreModeLabel: input.scoreMode === AssessmentScoreMode.BINARY ? "0或满分" : "允许自定义得分",
    applicableBrands: input.applicableBrands,
    configVersion: version,
    totalScore: parsed.totalScore,
    statistics: { sectionCount: parsed.sectionCount, subsectionCount: parsed.subsectionCount, itemCount: parsed.itemCount },
    sections: parsed.sections,
  };
}
async function findAssessment(id: string) {
  return db.assessment.findFirst({ where: { id, deletedAt: null }, include: { createdBy: { select: { realName: true } }, _count: { select: { records: true, leadH5Reviews: true } } } });
}
async function log(userId: string, action: string, result: OperationLogResult, detail: string) {
  await writeOperationLog({ userId, page: "考核表格", action, result, detail }).catch(() => undefined);
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  const intent = new URL(request.url).searchParams.get("intent") || "view";
  const permission: AssessmentPermission = intent === "preview" ? "preview" : intent === "edit" ? "edit" : "view";
  if (!canAssessment(session, permission)) return forbidden();
  const { id } = await params;
  const assessment = await findAssessment(id);
  if (!assessment) return NextResponse.json({ message: "考核表格不存在或已删除" }, { status: 404 });
  try {
    const config = await readAssessmentConfig(assessment.configFileName);
    const action = intent === "preview" ? "预览" : intent === "edit" ? "编辑" : "查看";
    await log(session.userId, action, "成功", `${action}考核表：${assessment.recordNo}`);
    return NextResponse.json({ assessment: rowJson(assessment), config });
  } catch (error) {
    const message = error instanceof AssessmentConfigError ? error.message : "考核明细配置文件加载失败，请联系系统管理员。";
    await log(session.userId, intent === "preview" ? "预览" : "查看", "失败", `考核表：${assessment.recordNo}；${message}`);
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  const { id } = await params;
  const assessment = await findAssessment(id);
  if (!assessment) return NextResponse.json({ message: "考核表格不存在或已删除" }, { status: 404 });
  const body = await request.json();
  if (body.action === "status") {
    const parsed = statusSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0].message }, { status: 400 });
    const enabling = parsed.data.status === RecordStatus.ENABLED;
    if (!canAssessment(session, enabling ? "enable" : "disable")) return forbidden();
    if (!sameTimestamp(assessment.updatedAt, parsed.data.updatedAt)) return NextResponse.json({ message: "当前考核表配置已被其他用户修改，请刷新后重新操作。" }, { status: 409 });
    const action = enabling ? "启用" : "禁用";
    const applicableBrands = assessmentBrands(assessment.applicableBrands);
    try {
      if (enabling) {
        const scopeConflict = await findAssessmentScopeConflict(applicableBrands, assessment.name, id);
        if (scopeConflict) throw new AssessmentConfigError(assessmentScopeConflictMessage(scopeConflict.brands));
      }
      await db.$transaction(async tx => {
        const result = await tx.assessment.updateMany({ where: { id, updatedAt: assessment.updatedAt }, data: { status: parsed.data.status } });
        if (!result.count) throw new AssessmentConfigError("当前考核表配置已被其他用户修改，请刷新后重新操作。");
        await tx.assessmentBrandScope.deleteMany({ where: { assessmentId: id } });
        if (enabling && applicableBrands.length) await tx.assessmentBrandScope.createMany({ data: assessmentScopeRows(applicableBrands, assessment.name).map(scope => ({ assessmentId: id, ...scope })) });
      });
      await log(session.userId, action, "成功", `${action}考核表：${assessment.recordNo}`);
      return NextResponse.json({ message: `考核表${action}成功` });
    } catch (error) {
      const message = error instanceof AssessmentConfigError ? error.message : isUniqueConflict(error) ? assessmentScopeConflictMessage() : `考核表${action}失败，请稍后重试`;
      await log(session.userId, action, "失败", `${action}考核表：${assessment.recordNo}；${message}`);
      return NextResponse.json({ message }, { status: message.includes("其他用户") ? 409 : 400 });
    }
  }
  if (!canAssessment(session, "edit")) return forbidden();
  const parsedBody = editSchema.safeParse(body);
  if (!parsedBody.success) return NextResponse.json({ message: parsedBody.error.issues[0].message }, { status: 400 });
  if (!sameTimestamp(assessment.updatedAt, parsedBody.data.updatedAt)) return NextResponse.json({ message: "当前考核表配置已被其他用户修改，请刷新后重新操作。" }, { status: 409 });
  const input = parsedBody.data;
  let oldConfig: Record<string, unknown> | undefined;
  let nextFileName = assessment.configFileName;
  try {
    oldConfig = await readAssessmentConfig(assessment.configFileName);
    nextFileName = normalizeAssessmentFileName(input.configFileBase);
    const hasHistory = assessment._count.records > 0 || assessment._count.leadH5Reviews > 0;
    if (hasHistory && nextFileName !== assessment.configFileName) throw new AssessmentConfigError("该考核表已产生历史考核记录，配置文件名称不可修改。");
    if (nextFileName !== assessment.configFileName && (await assessmentFileExists(nextFileName) || await db.assessment.findFirst({ where: { configFileName: nextFileName, id: { not: id }, deletedAt: null } }))) {
      throw new AssessmentConfigError("考核明细配置文件名称已存在，请重新输入");
    }
    const [brandOptions, assessmentTypeOptions] = await Promise.all([getBusinessDictionaryOptions("BRAND"), getBusinessDictionaryOptions("ASSESSMENT_TYPE")]);
    const assessmentTypeUnchanged = input.name === assessment.name;
    if (!assessmentTypeOptions.some(option => option.value === input.name) && !assessmentTypeUnchanged) throw new AssessmentConfigError("所选考核表类型不在已启用的Assessment_Type数据字典中");
    const validBrandValues = new Set(brandOptions.map(option => option.value));
    const previousBrands = Array.isArray(assessment.applicableBrands) ? assessment.applicableBrands.filter((value): value is string => typeof value === "string") : [];
    const applicableBrands = Array.from(new Set(input.applicableBrands));
    if (applicableBrands.some(value => !validBrandValues.has(value) && !previousBrands.includes(value))) throw new AssessmentConfigError("所选品牌不在已启用的BRAND数据字典中");
    input.applicableBrands = applicableBrands;
    if (assessment.status === RecordStatus.ENABLED) {
      const scopeConflict = await findAssessmentScopeConflict(applicableBrands, input.name, id);
      if (scopeConflict) throw new AssessmentConfigError(assessmentScopeConflictMessage(scopeConflict.brands));
    }
    const parsedDetails = parseAssessmentDetails(input.detailText);
    const nextVersion = assessment.configVersion + 1;
    const nextConfig = buildConfig(input, assessment.recordNo, nextVersion, parsedDetails);
    if (nextFileName === assessment.configFileName) await writeAssessmentConfig(nextFileName, nextConfig);
    else {
      await createAssessmentConfig(nextFileName, nextConfig);
      try { await deleteAssessmentConfig(assessment.configFileName); }
      catch (error) { await deleteAssessmentConfig(nextFileName).catch(() => undefined); throw error; }
    }
    try {
      await db.$transaction(async tx => {
        const result = await tx.assessment.updateMany({ where: { id, updatedAt: assessment.updatedAt }, data: {
          name: input.name, scoreMode: input.scoreMode, configFileName: nextFileName, applicableBrands,
          detailText: parsedDetails.normalizedText, sectionCount: parsedDetails.sectionCount,
          subsectionCount: parsedDetails.subsectionCount, itemCount: parsedDetails.itemCount,
          totalScore: parsedDetails.totalScore, remark: input.remark || null, configVersion: nextVersion,
        } });
        if (!result.count) throw new AssessmentConfigError("当前考核表配置已被其他用户修改，请刷新后重新操作。");
        await tx.assessmentBrandScope.deleteMany({ where: { assessmentId: id } });
        if (assessment.status === RecordStatus.ENABLED && applicableBrands.length) await tx.assessmentBrandScope.createMany({ data: assessmentScopeRows(applicableBrands, input.name).map(scope => ({ assessmentId: id, ...scope })) });
      });
    } catch (error) {
      if (nextFileName !== assessment.configFileName) await deleteAssessmentConfig(nextFileName).catch(() => undefined);
      await writeAssessmentConfig(assessment.configFileName, oldConfig);
      if (isUniqueConflict(error)) throw new AssessmentConfigError(assessmentScopeConflictMessage());
      throw error;
    }
    await log(session.userId, "编辑", "成功", `编辑考核表：${assessment.recordNo}，版本：${nextVersion}`);
    return NextResponse.json({ message: "考核表保存成功" });
  } catch (error) {
    const message = error instanceof AssessmentConfigError ? error.message : "考核明细配置文件保存失败，请稍后重试";
    await log(session.userId, "编辑", "失败", `考核表：${assessment.recordNo}；${message}`);
    return NextResponse.json({ message }, { status: message.includes("其他用户") ? 409 : 400 });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canAssessment(session, "delete")) return forbidden();
  const { id } = await params;
  const assessment = await findAssessment(id);
  if (!assessment) return NextResponse.json({ message: "考核表格不存在或已删除" }, { status: 404 });
  if (assessment._count.records > 0 || assessment._count.leadH5Reviews > 0) return NextResponse.json({ message: "该考核表已产生历史考核记录，暂不能删除，请使用“禁用”操作。" }, { status: 400 });
  try {
    const oldConfig = await readAssessmentConfig(assessment.configFileName);
    await deleteAssessmentConfig(assessment.configFileName);
    try { await db.$transaction([db.assessmentBrandScope.deleteMany({ where: { assessmentId: id } }), db.assessment.update({ where: { id }, data: { deletedAt: new Date() } })]); }
    catch (error) { await writeAssessmentConfig(assessment.configFileName, oldConfig); throw error; }
    await log(session.userId, "删除", "成功", `删除考核表：${assessment.recordNo}`);
    return NextResponse.json({ message: "考核表删除成功" });
  } catch (error) {
    const message = error instanceof AssessmentConfigError ? error.message : "考核表删除失败，请稍后重试";
    await log(session.userId, "删除", "失败", `考核表：${assessment.recordNo}；${message}`);
    return NextResponse.json({ message }, { status: 400 });
  }
}

import { Prisma, RecordStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { getBusinessDictionaryOptions } from "@/lib/business-dictionaries";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";
import {
  createResearchConfig, deleteResearchConfig, normalizeResearchFileName, parseResearchDetails,
  researchFileExists, ResearchTemplateConfigError, writeResearchConfig,
} from "@/lib/research-template-config";
import { canResearchTemplate } from "@/lib/research-template-permissions";
import { buildResearchConfig, researchTemplateInputSchema, serializeResearchTemplate } from "@/lib/research-template-service";

function forbidden() { return NextResponse.json({ message: "暂无此操作权限" }, { status: 403 }); }
function datePrefix() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const value = (type: string) => parts.find(part => part.type === type)?.value || "";
  return `${value("year")}${value("month")}${value("day")}`;
}
async function nextRecordNo() {
  const prefix = datePrefix();
  const last = await db.researchTemplate.findFirst({ where: { recordNo: { startsWith: prefix } }, select: { recordNo: true }, orderBy: { recordNo: "desc" } });
  return `${prefix}${String(last ? Number(last.recordNo.slice(8)) + 1 : 1).padStart(4, "0")}`;
}
function uniqueConflict(error: unknown) { return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"; }

export async function GET(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canResearchTemplate(session, "query")) return forbidden();
  const url = new URL(request.url);
  const templateType = (url.searchParams.get("templateType") || "").trim();
  const brand = (url.searchParams.get("brand") || "").trim();
  const statusValue = (url.searchParams.get("status") || "").trim();
  const status = statusValue === RecordStatus.ENABLED || statusValue === RecordStatus.DISABLED ? statusValue : undefined;
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(10, Number(url.searchParams.get("pageSize")) || 10));
  const where: Prisma.ResearchTemplateWhereInput = {
    deletedAt: null,
    ...(templateType ? { templateType } : {}),
    ...(status ? { status } : {}),
    ...(brand ? { brandScopes: { some: { brandValue: brand } } } : {}),
  };
  try {
    const [total, rows] = await db.$transaction([
      db.researchTemplate.count({ where }),
      db.researchTemplate.findMany({ where, include: { brandScopes: { orderBy: { id: "asc" } }, _count: { select: { records: true } } }, orderBy: [{ createdAt: "desc" }, { recordNo: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    await writeOperationLog({ userId: session.userId, username: session.username, page: "调研模版", action: "筛选", result: "成功", detail: `模版类型：${templateType || "全部"}；适用品牌：${brand || "全部"}；状态：${status || "全部"}`, request }).catch(() => undefined);
    return NextResponse.json({ rows: rows.map(serializeResearchTemplate), total, page, pageSize });
  } catch {
    return NextResponse.json({ message: "调研模版加载失败，请稍后重试" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canResearchTemplate(session, "create")) return forbidden();
  const body = researchTemplateInputSchema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ message: body.error.issues[0].message }, { status: 400 });
  const input = body.data;
  let fileName = "";
  let fileCreated = false;
  try {
    fileName = normalizeResearchFileName(input.configFileBase);
    const parsed = parseResearchDetails(input.detailText);
    const [typeOptions, brandOptions] = await Promise.all([getBusinessDictionaryOptions("RESEARCH_TEMPLATE_TYPE"), getBusinessDictionaryOptions("BRAND")]);
    if (!typeOptions.some(option => option.value === input.templateType)) throw new ResearchTemplateConfigError("所选调研模版类型不在已启用的Research_Template_Type数据字典中");
    const validBrands = new Set(brandOptions.map(option => option.value));
    input.applicableBrands = Array.from(new Set(input.applicableBrands));
    if (input.applicableBrands.some(brand => !validBrands.has(brand))) throw new ResearchTemplateConfigError("所选品牌不在已启用的BRAND数据字典中");
    if (await researchFileExists(fileName) || await db.researchTemplate.findUnique({ where: { configFileName: fileName } })) throw new ResearchTemplateConfigError("调研明细配置文件名称已存在，请重新输入");
    let recordNo = await nextRecordNo();
    await createResearchConfig(fileName, buildResearchConfig(input, recordNo, 1, RecordStatus.ENABLED, parsed));
    fileCreated = true;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const row = await db.researchTemplate.create({ data: {
          recordNo, templateType: input.templateType, configFileName: fileName, detailText: parsed.normalizedText,
          itemCount: parsed.itemCount, remark: input.remark || null, status: RecordStatus.ENABLED,
          createdByUserId: session.userId, createdByName: session.realName,
          brandScopes: { create: input.applicableBrands.map(brandValue => ({ brandValue })) },
        }, include: { brandScopes: true, _count: { select: { records: true } } } });
        await writeOperationLog({ userId: session.userId, username: session.username, page: "调研模版", action: "新增", result: "成功", detail: `新增调研模版：${recordNo}`, request }).catch(() => undefined);
        return NextResponse.json(serializeResearchTemplate(row), { status: 201 });
      } catch (error) {
        if (!uniqueConflict(error) || !(await db.researchTemplate.findUnique({ where: { recordNo }, select: { id: true } }))) throw error;
        recordNo = await nextRecordNo();
        await writeResearchConfig(fileName, buildResearchConfig(input, recordNo, 1, RecordStatus.ENABLED, parsed));
      }
    }
    throw new ResearchTemplateConfigError("记录编号生成失败，请稍后重试");
  } catch (error) {
    if (fileCreated && fileName) await deleteResearchConfig(fileName).catch(() => undefined);
    const message = error instanceof ResearchTemplateConfigError ? error.message : uniqueConflict(error) ? "调研明细配置文件名称已存在，请重新输入" : "调研明细配置文件创建失败，请稍后重试";
    await writeOperationLog({ userId: session.userId, username: session.username, page: "调研模版", action: "新增", result: "失败", detail: message, request }).catch(() => undefined);
    return NextResponse.json({ message }, { status: 400 });
  }
}

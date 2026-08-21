import { AssessmentScoreMode, Prisma, RecordStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { canAssessment } from "@/lib/assessment-permissions";
import {
  AssessmentConfigError, assessmentFileExists, createAssessmentConfig, deleteAssessmentConfig,
  normalizeAssessmentFileName, parseAssessmentDetails, writeAssessmentConfig,
} from "@/lib/assessment-config";
import { db } from "@/lib/db";

const assessmentSchema = z.object({
  name: z.string().trim().min(1, "请输入考核表名称").refine(value => Array.from(value).length <= 20, "考核表名称不能超过20个汉字"),
  scoreMode: z.nativeEnum(AssessmentScoreMode, { message: "请选择评分模式" }),
  configFileBase: z.string().trim().min(1, "请输入考核明细配置文件名"),
  detailText: z.string().min(1, "请输入考核明细项"),
  remark: z.string().trim().refine(value => Array.from(value).length <= 50, "备注不能超过50个汉字").optional().default(""),
});

function forbidden() { return NextResponse.json({ message: "暂无此操作权限" }, { status: 403 }); }
function scoreModeLabel(mode: AssessmentScoreMode) { return mode === AssessmentScoreMode.BINARY ? "0或满分" : "允许自定义得分"; }
function shanghaiDatePrefix() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (type: string) => parts.find(item => item.type === type)?.value || "";
  return `${part("year")}${part("month")}${part("day")}`;
}
async function nextRecordNo() {
  const prefix = shanghaiDatePrefix();
  const last = await db.assessment.findFirst({ where: { recordNo: { startsWith: prefix } }, select: { recordNo: true }, orderBy: { recordNo: "desc" } });
  const sequence = last ? Number(last.recordNo.slice(8)) + 1 : 1;
  return `${prefix}${String(sequence).padStart(4, "0")}`;
}
function buildConfig(input: z.infer<typeof assessmentSchema>, recordNo: string, version: number, parsed: ReturnType<typeof parseAssessmentDetails>) {
  return {
    recordNo,
    reviewName: input.name,
    scoreMode: input.scoreMode,
    scoreModeLabel: scoreModeLabel(input.scoreMode),
    configVersion: version,
    totalScore: parsed.totalScore,
    statistics: { sectionCount: parsed.sectionCount, subsectionCount: parsed.subsectionCount, itemCount: parsed.itemCount },
    sections: parsed.sections,
  };
}
function rowJson<T extends { totalScore: Prisma.Decimal }>(row: T) { return { ...row, totalScore: Number(row.totalScore) }; }

export async function GET(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canAssessment(session, "query")) return forbidden();
  const url = new URL(request.url);
  const keyword = (url.searchParams.get("keyword") || "").trim();
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(10, Number(url.searchParams.get("pageSize")) || 10));
  const where = { deletedAt: null, ...(keyword ? { name: { contains: keyword } } : {}) };
  try {
    const [total, rows] = await db.$transaction([
      db.assessment.count({ where }),
      db.assessment.findMany({ where, include: { createdBy: { select: { realName: true } }, _count: { select: { records: true } } }, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    await db.operationLog.create({ data: { userId: session.userId, page: "考核表格", action: "筛选", result: "成功", detail: keyword ? `考核表名称：${keyword}` : "加载全部考核表" } }).catch(() => undefined);
    return NextResponse.json({ rows: rows.map(rowJson), total, page, pageSize });
  } catch {
    return NextResponse.json({ message: "考核表格加载失败，请稍后重试" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canAssessment(session, "create")) return forbidden();
  const parsedBody = assessmentSchema.safeParse(await request.json());
  if (!parsedBody.success) return NextResponse.json({ message: parsedBody.error.issues[0].message }, { status: 400 });
  const input = parsedBody.data;
  let fileName = "";
  let fileCreated = false;
  try {
    fileName = normalizeAssessmentFileName(input.configFileBase);
    const parsedDetails = parseAssessmentDetails(input.detailText);
    if (await assessmentFileExists(fileName) || await db.assessment.findFirst({ where: { configFileName: fileName, deletedAt: null } })) {
      throw new AssessmentConfigError("考核明细配置文件名称已存在，请重新输入");
    }
    let recordNo = await nextRecordNo();
    await createAssessmentConfig(fileName, buildConfig(input, recordNo, 1, parsedDetails));
    fileCreated = true;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const assessment = await db.assessment.create({ data: {
          recordNo, name: input.name, scoreMode: input.scoreMode, configFileName: fileName,
          detailText: parsedDetails.normalizedText, sectionCount: parsedDetails.sectionCount,
          subsectionCount: parsedDetails.subsectionCount, itemCount: parsedDetails.itemCount,
          totalScore: parsedDetails.totalScore, remark: input.remark || null, status: RecordStatus.ENABLED,
          createdByUserId: session.userId,
        }, include: { createdBy: { select: { realName: true } } } });
        await db.operationLog.create({ data: { userId: session.userId, page: "考核表格", action: "新增", result: "成功", detail: `新增考核表：${recordNo}` } }).catch(() => undefined);
        return NextResponse.json(rowJson(assessment), { status: 201 });
      } catch (error) {
        const conflict = error as { code?: string; meta?: { target?: string | string[] } };
        const target = Array.isArray(conflict.meta?.target) ? conflict.meta?.target.join(",") : conflict.meta?.target || "";
        if (conflict.code !== "P2002" || (!String(target).includes("recordNo") && await db.assessment.findFirst({ where: { configFileName: fileName } }))) throw error;
        recordNo = await nextRecordNo();
        await writeAssessmentConfig(fileName, buildConfig(input, recordNo, 1, parsedDetails));
      }
    }
    throw new AssessmentConfigError("记录编号生成失败，请稍后重试");
  } catch (error) {
    if (fileCreated && fileName) await deleteAssessmentConfig(fileName).catch(() => undefined);
    const message = error instanceof AssessmentConfigError ? error.message : "考核明细配置文件创建失败，请稍后重试";
    await db.operationLog.create({ data: { userId: session.userId, page: "考核表格", action: "新增", result: "失败", detail: message } }).catch(() => undefined);
    return NextResponse.json({ message }, { status: 400 });
  }
}

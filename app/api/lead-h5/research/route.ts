import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getLeadH5Session } from "@/lib/lead-h5-auth";
import {
  LeadH5ResearchError,
  loadLeadH5ResearchConfig,
  researchTemplateMatchesBrand,
  STORE_RESEARCH_TYPE,
  validResearchMonth,
  validateResearchAnswers,
} from "@/lib/lead-h5-research";
import { leadH5StoreDataScope } from "@/lib/lead-h5-store-scope";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";

const bodySchema = z.object({
  researchMonth: z.string(),
  storeId: z.string().min(1),
  researchTemplateId: z.string().min(1),
  researchTemplateVersion: z.number().int().positive(),
  items: z.array(z.object({ itemId: z.string().min(1), value: z.string().max(2000) })),
});

function shanghaiDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const part = (type: string) => parts.find(value => value.type === type)?.value || "";
  return `${part("year")}${part("month")}${part("day")}`;
}

function shanghaiDateTime(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: string) => parts.find(value => value.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}:${part("second")}`;
}

export async function POST(request: Request) {
  const session = await getLeadH5Session("lead-h5:store-research:submit");
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !validResearchMonth(parsed.data?.researchMonth || "")) {
    return NextResponse.json({ message: parsed.success ? "调研月份无效" : parsed.error.issues[0].message }, { status: 400 });
  }
  const input = parsed.data;
  try {
    const [store, template, candidates] = await Promise.all([
      db.store.findFirst({
        where: { id: input.storeId, ...leadH5StoreDataScope(session), operationStatus: { not: "CLOSED" }, brand: { status: "ENABLED" } },
        include: { brand: true },
      }),
      db.researchTemplate.findFirst({
        where: { id: input.researchTemplateId, templateType: STORE_RESEARCH_TYPE, status: "ENABLED", deletedAt: null },
        include: { brandScopes: true },
      }),
      db.researchTemplate.findMany({
        where: { templateType: STORE_RESEARCH_TYPE, status: "ENABLED", deletedAt: null },
        include: { brandScopes: true },
      }),
    ]);
    if (!store) throw new LeadH5ResearchError("当前账号无权访问该店铺", 403);
    if (!template || !researchTemplateMatchesBrand(template.brandScopes.map(scope => scope.brandValue), store.brand)) {
      throw new LeadH5ResearchError("当前调研模版已失效，请返回首页重新进入调研", 409);
    }
    if (template.configVersion !== input.researchTemplateVersion) throw new LeadH5ResearchError("调研表配置已更新，请返回首页重新进入调研", 409);
    const matchedTemplates = candidates.filter(candidate => researchTemplateMatchesBrand(candidate.brandScopes.map(scope => scope.brandValue), store.brand));
    if (matchedTemplates.length !== 1) throw new LeadH5ResearchError("当前调研配置存在异常，请联系系统管理员。", 409);
    const config = await loadLeadH5ResearchConfig(template.configFileName);
    if (config.configVersion !== template.configVersion) throw new LeadH5ResearchError("调研表配置版本异常，请联系系统管理员。", 409);
    const resultSnapshot = validateResearchAnswers(config, input.items);
    const submittedAt = new Date();
    const dateKey = shanghaiDateKey(submittedAt);
    const record = await db.$transaction(async tx => {
      const duplicate = await tx.researchTemplateRecord.findUnique({
        where: { storeId_researchMonth_templateType: { storeId: store.id, researchMonth: input.researchMonth, templateType: STORE_RESEARCH_TYPE } },
        select: { id: true },
      });
      if (duplicate) throw new LeadH5ResearchError("该店铺当前月份的门店调研表已提交，请勿重复提交。", 409);
      const sequence = await tx.leadH5ResearchSequence.upsert({
        where: { dateKey },
        create: { dateKey, nextValue: 2 },
        update: { nextValue: { increment: 1 } },
      });
      const sequenceValue = sequence.nextValue - 1;
      if (sequenceValue > 9999) throw new LeadH5ResearchError("今日调研记录已达到上限，请联系系统管理员。", 500);
      return tx.researchTemplateRecord.create({
        data: {
          recordNo: `${dateKey}${String(sequenceValue).padStart(4, "0")}`,
          researchMonth: input.researchMonth,
          templateType: STORE_RESEARCH_TYPE,
          status: "SUBMITTED",
          storeId: store.id,
          storeNameSnapshot: store.name,
          brandId: store.brand.id,
          brandNameSnapshot: store.brand.name,
          storeManagerNameSnapshot: store.managerName,
          submittedByUserId: session.userId,
          submittedUsername: session.username,
          supervisorRealName: session.realName,
          researchTemplateId: template.id,
          researchTemplateRecordNo: template.recordNo,
          configVersion: template.configVersion,
          configSnapshot: config as unknown as Prisma.InputJsonValue,
          resultSnapshot: resultSnapshot as unknown as Prisma.InputJsonValue,
          submittedAt,
        },
        select: { recordNo: true, supervisorRealName: true, submittedAt: true, status: true },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    await writeOperationLog({
      userId: session.userId,
      username: session.username,
      client: "运营移动端",
      page: "门店调研表",
      action: "提交",
      result: "成功",
      detail: `记录编号：${record.recordNo}；调研月份：${input.researchMonth}；门店：${store.name}`,
      request,
    }).catch(() => undefined);
    return NextResponse.json({
      recordNo: record.recordNo,
      status: record.status,
      supervisorRealName: record.supervisorRealName,
      submittedAt: shanghaiDateTime(record.submittedAt),
      message: "当前门店调研表已提交服务器。",
    }, { status: 201 });
  } catch (error) {
    const duplicate = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
    const message = duplicate
      ? "该店铺当前月份的门店调研表已提交，请勿重复提交。"
      : error instanceof LeadH5ResearchError ? error.message : "调研表提交失败，请检查网络后重试。";
    const status = duplicate ? 409 : error instanceof LeadH5ResearchError ? error.status : 500;
    await writeOperationLog({ userId: session.userId, username: session.username, client: "运营移动端", page: "门店调研表", action: "提交", result: "失败", detail: message, request }).catch(() => undefined);
    return NextResponse.json({ message }, { status });
  }
}

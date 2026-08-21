import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getLeadH5Session } from "@/lib/lead-h5-auth";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";
import {
  BACK_KITCHEN_REVIEW_TYPE, brandMatches, FRONT_HALL_REVIEW_TYPE, getReviewDefinition,
  LeadH5ReviewError, loadReviewConfig, reviewDataScope, scoreReview, validReviewMonth,
} from "@/lib/lead-h5-reviews";

const bodySchema = z.object({
  scoreMonth: z.string(),
  scoreType: z.enum([FRONT_HALL_REVIEW_TYPE, BACK_KITCHEN_REVIEW_TYPE]),
  storeId: z.string().min(1),
  reviewTemplateId: z.string().min(1),
  reviewTemplateVersion: z.number().int().positive(),
  items: z.array(z.object({
    itemId: z.string().min(1),
    result: z.enum(["PASS", "PARTIAL", "FAIL"]),
    score: z.number().nullable().optional(),
  })),
});

function shanghaiDateKey() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
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
  const session = await getLeadH5Session();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !validReviewMonth(parsed.data?.scoreMonth || "")) return NextResponse.json({ message: parsed.success ? "评分月份无效" : parsed.error.issues[0].message }, { status: 400 });
  const input = parsed.data;
  const definition = getReviewDefinition(input.scoreType);
  if (!definition) return NextResponse.json({ message: "评分类型无效" }, { status: 400 });
  try {
    const [store, assessment] = await Promise.all([
      db.store.findFirst({ where: { id: input.storeId, ...reviewDataScope(session), operationStatus: { not: "CLOSED" }, brand: { status: "ENABLED" } }, include: { brand: true } }),
      db.assessment.findFirst({ where: { id: input.reviewTemplateId, name: definition.assessmentName, status: "ENABLED", deletedAt: null } }),
    ]);
    if (!store) throw new LeadH5ReviewError("当前账号无权访问该店铺", 403);
    if (!assessment || !brandMatches(assessment.applicableBrands, store.brand)) throw new LeadH5ReviewError("当前评分模板已失效，请返回首页重新进入评分", 409);
    if (assessment.configVersion !== input.reviewTemplateVersion) throw new LeadH5ReviewError("评分表配置已更新，请返回首页重新进入评分", 409);
    const candidates = await db.assessment.findMany({ where: { name: definition.assessmentName, status: "ENABLED", deletedAt: null }, select: { id: true, applicableBrands: true } });
    if (candidates.filter(candidate => brandMatches(candidate.applicableBrands, store.brand)).length !== 1) throw new LeadH5ReviewError("当前评分配置存在异常，请联系系统管理员。", 409);
    const config = await loadReviewConfig(assessment.configFileName);
    if (config.configVersion !== assessment.configVersion) throw new LeadH5ReviewError("评分表配置版本异常，请联系系统管理员。", 409);
    const scored = scoreReview(config, input.items);
    const dateKey = shanghaiDateKey();
    const responsiblePersonType = input.scoreType === FRONT_HALL_REVIEW_TYPE ? "STORE_MANAGER" : "HEAD_CHEF";
    const responsiblePersonName = (input.scoreType === FRONT_HALL_REVIEW_TYPE ? store.managerName : store.chefName)?.trim() || "-";
    const review = await db.$transaction(async tx => {
      const duplicate = await tx.leadH5Review.findUnique({ where: { storeId_reviewMonth_reviewType: { storeId: store.id, reviewMonth: input.scoreMonth, reviewType: input.scoreType } }, select: { id: true } });
      if (duplicate) throw new LeadH5ReviewError(`该店铺当前月份已完成${definition.title}，请勿重复提交。`, 409);
      const sequence = await tx.leadH5ReviewSequence.upsert({ where: { dateKey }, create: { dateKey, nextValue: 2 }, update: { nextValue: { increment: 1 } } });
      const sequenceValue = sequence.nextValue - 1;
      if (sequenceValue > 9999) throw new LeadH5ReviewError("今日评分记录已达到上限，请联系系统管理员。", 500);
      const assessmentDate = new Date();
      return tx.leadH5Review.create({ data: {
        recordNo: `${dateKey}${String(sequenceValue).padStart(4, "0")}`,
        reviewType: input.scoreType,
        reviewMonth: input.scoreMonth,
        storeId: store.id,
        storeNameSnapshot: store.name,
        brandId: store.brand.id,
        brandNameSnapshot: store.brand.name,
        responsiblePersonNameSnapshot: responsiblePersonName,
        responsiblePersonType,
        reviewerUserId: session.userId,
        reviewerUsername: session.username,
        reviewerRealName: session.realName,
        assessmentSupervisor: session.realName,
        assessmentDate,
        assessmentId: assessment.id,
        assessmentName: assessment.name,
        assessmentVersion: assessment.configVersion,
        configSnapshot: config as unknown as Prisma.InputJsonValue,
        maxScore: config.totalScore,
        actualScore: scored.actualScore,
        submittedAt: assessmentDate,
        items: { create: scored.items },
      }, select: { id: true, recordNo: true, actualScore: true, assessmentSupervisor: true, assessmentDate: true } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    await writeOperationLog({ userId: session.userId, username: session.username, client: "运营移动端", page: definition.title, action: "提交", result: "成功", detail: `记录编号：${review.recordNo}；评分月份：${input.scoreMonth}；门店：${store.name}；得分：${Number(review.actualScore)}`, request }).catch(() => undefined);
    return NextResponse.json({
      recordNo: review.recordNo,
      actualScore: Number(review.actualScore),
      assessmentSupervisor: review.assessmentSupervisor,
      assessmentDate: shanghaiDateTime(review.assessmentDate),
      message: "当前评分已提交服务器。",
    }, { status: 201 });
  } catch (error) {
    const duplicate = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
    const message = duplicate ? `该店铺当前月份已完成${definition.title}，请勿重复提交。` : error instanceof LeadH5ReviewError ? error.message : "评分提交失败，请检查网络后重试。";
    const status = duplicate ? 409 : error instanceof LeadH5ReviewError ? error.status : 500;
    await writeOperationLog({ userId: session.userId, username: session.username, client: "运营移动端", page: definition.title, action: "提交", result: "失败", detail: message, request }).catch(() => undefined);
    return NextResponse.json({ message }, { status });
  }
}

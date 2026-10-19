import type { Prisma } from "@prisma/client";
import { readAssessmentConfig, type AssessmentSection } from "@/lib/assessment-config";
import { leadH5StoreDataScope, leadH5StoreScopeInfo, type LeadH5DataAccess } from "@/lib/lead-h5-store-scope";

export const FRONT_HALL_REVIEW_TYPE = "FRONT_HALL_AUDIT";
export const FRONT_HALL_ASSESSMENT_NAME = "前厅稽核评分";
export const BACK_KITCHEN_REVIEW_TYPE = "BACK_KITCHEN_AUDIT";
export const BACK_KITCHEN_ASSESSMENT_NAME = "后厨稽核评分";
export const STORE_CREDIT_REVIEW_TYPE = "STORE_CREDIT_SCORE";
export const STORE_CREDIT_ASSESSMENT_NAME = "门店信用评分";

export const REVIEW_DEFINITIONS = [
  { reviewType: FRONT_HALL_REVIEW_TYPE, assessmentName: FRONT_HALL_ASSESSMENT_NAME, title: "前厅稽核评分", route: "front-hall" },
  { reviewType: BACK_KITCHEN_REVIEW_TYPE, assessmentName: BACK_KITCHEN_ASSESSMENT_NAME, title: "后厨稽核评分", route: "back-kitchen" },
  { reviewType: STORE_CREDIT_REVIEW_TYPE, assessmentName: STORE_CREDIT_ASSESSMENT_NAME, title: "门店信用评分", route: "store-credit" },
] as const;

export type LeadH5ReviewType = (typeof REVIEW_DEFINITIONS)[number]["reviewType"];

export function getReviewDefinition(value: string) {
  return REVIEW_DEFINITIONS.find(definition => definition.reviewType === value) || null;
}

export type ReviewResult = "PASS" | "PARTIAL" | "FAIL";
export type ReviewAnswer = { itemId: string; result: ReviewResult; score?: number | null; problemDescription?: string };
export type ReviewConfig = {
  recordNo?: string;
  reviewName: string;
  assessmentType?: string;
  scoreMode: "BINARY" | "CUSTOM_SCORE";
  scoreModeLabel?: string;
  configVersion: number;
  totalScore: number;
  photoAttachmentLimit?: number;
  nonFullScoreRequiresPhoto?: boolean;
  failRequiresProblemDescription?: boolean;
  partialRequiresProblemDescription?: boolean;
  sections: AssessmentSection[];
};

export class LeadH5ReviewError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export function validReviewMonth(value: string) {
  return /^\d{4}-(?:0[1-9]|1[0-2])$/.test(value);
}

export function reviewDataScope(access: LeadH5DataAccess): Prisma.StoreWhereInput {
  return leadH5StoreDataScope(access);
}

export function reviewDataScopeInfo(access: LeadH5DataAccess) {
  return leadH5StoreScopeInfo(access);
}

function isReviewConfig(value: Record<string, unknown>): value is Record<string, unknown> & ReviewConfig {
  return (value.scoreMode === "BINARY" || value.scoreMode === "CUSTOM_SCORE")
    && typeof value.configVersion === "number"
    && typeof value.totalScore === "number"
    && Array.isArray(value.sections);
}

export async function loadReviewConfig(fileName: string) {
  const config = await readAssessmentConfig(fileName);
  if (!isReviewConfig(config)) throw new LeadH5ReviewError("评分表配置异常，请联系系统管理员。", 500);
  const photoAttachmentLimit = Number.isInteger(config.photoAttachmentLimit) && Number(config.photoAttachmentLimit) >= 1 && Number(config.photoAttachmentLimit) <= 20 ? Number(config.photoAttachmentLimit) : 3;
  return {
    ...config,
    photoAttachmentLimit,
    nonFullScoreRequiresPhoto: config.nonFullScoreRequiresPhoto === true,
    failRequiresProblemDescription: config.failRequiresProblemDescription === true,
    partialRequiresProblemDescription: config.partialRequiresProblemDescription === true,
    sections: config.sections.map(section => ({
      ...section,
      children: section.children.map(subsection => ({
        ...subsection,
        items: subsection.items.map(item => ({ ...item, supportsPhoto: item.supportsPhoto === true })),
      })),
    })),
  };
}

export function findReviewConfigItem(config: ReviewConfig, itemId: string) {
  for (const section of config.sections) for (const subsection of section.children) {
    const item = subsection.items.find(candidate => candidate.id === itemId);
    if (item) return item;
  }
  return null;
}

export function brandMatches(applicableBrands: unknown, brand: { id: string; code: string; name: string }) {
  if (!Array.isArray(applicableBrands)) return false;
  const values = applicableBrands.filter((value): value is string => typeof value === "string");
  return values.includes(brand.id) || values.includes(brand.code) || values.includes(brand.name);
}

export function scoreReview(config: ReviewConfig, answers: ReviewAnswer[]) {
  const answerMap = new Map(answers.map(answer => [answer.itemId, answer]));
  if (answerMap.size !== answers.length) throw new LeadH5ReviewError("评分项目存在重复数据，请刷新后重试");
  const items: Array<{
    itemKey: string; sectionName: string; subsectionName: string; itemDescription: string; problemDescription: string;
    maxScore: number; result: ReviewResult; actualScore: number; sortOrder: number;
  }> = [];
  let totalTenths = 0;
  let sortOrder = 0;
  for (const section of config.sections) {
    for (const subsection of section.children) {
      for (const item of subsection.items) {
        sortOrder += 1;
        const answer = answerMap.get(item.id);
        if (!answer) throw new LeadH5ReviewError("还有未完成的评分项目，请完成后再提交。");
        if (config.scoreMode === "BINARY" && answer.result === "PARTIAL") throw new LeadH5ReviewError("当前评分表不支持部分合格评分");
        let scoreTenths = 0;
        const maxTenths = Math.round(item.maxScore * 10);
        if (answer.result === "PASS") scoreTenths = maxTenths;
        else if (answer.result === "FAIL") scoreTenths = 0;
        else {
          if (typeof answer.score !== "number" || !Number.isFinite(answer.score) || Math.round(answer.score * 10) !== answer.score * 10) {
            throw new LeadH5ReviewError("部分合格得分最多保留1位小数");
          }
          scoreTenths = Math.round(answer.score * 10);
          if (scoreTenths <= 0 || scoreTenths >= maxTenths) throw new LeadH5ReviewError(`“${item.description}”得分须大于0且小于${item.maxScore}`);
        }
        totalTenths += scoreTenths;
        items.push({
          itemKey: item.id, sectionName: section.name, subsectionName: subsection.name,
          itemDescription: item.description, problemDescription: answer.problemDescription?.trim() || "", maxScore: item.maxScore, result: answer.result,
          actualScore: scoreTenths / 10, sortOrder,
        });
      }
    }
  }
  if (answerMap.size !== items.length) throw new LeadH5ReviewError("评分项目与当前模板不一致，请刷新后重新评分");
  return { actualScore: totalTenths / 10, items };
}

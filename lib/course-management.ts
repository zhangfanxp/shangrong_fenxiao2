import type { Course, CourseLesson, Prisma } from "@prisma/client";
import { CoursewareType, RecordStatus } from "@prisma/client";
import { z } from "zod";
import type { Session } from "@/lib/auth";
import { getBusinessDictionaryOptions } from "@/lib/business-dictionaries";
import type { CourseAssetMetadata, CourseAssetType } from "@/lib/course-r2";
import { verifyConfirmedCourseAsset } from "@/lib/course-r2";
import { db } from "@/lib/db";
import { getPlatformConfig } from "@/lib/platform-config";

const r2CoverSchema = z.object({
  kind: z.literal("R2"),
  r2StorageId: z.string().min(1), objectKey: z.string().min(1).max(1024),
  originalName: z.string().min(1).max(255), mimeType: z.string().min(1).max(100), size: z.number().int().positive(), uploadProof: z.string().min(1).max(4096).optional(),
});
const defaultCoverSchema = z.object({ kind: z.literal("DEFAULT") });
const existingCoverSchema = z.object({ kind: z.literal("EXISTING") });
export const coverInputSchema = z.discriminatedUnion("kind", [r2CoverSchema, defaultCoverSchema, existingCoverSchema]);

export const courseInputSchema = z.object({
  courseDraftId: z.string().uuid().optional().nullable(),
  courseName: z.string().trim().min(1, "请输入课程名称").max(30, "课程名称不能超过30个字符"),
  courseDescription: z.string().trim().max(200, "课程简介不能超过200个字符").optional().nullable(),
  cover: coverInputSchema,
  applicablePosition: z.string().trim().min(1, "请输入适用岗位").max(30, "适用岗位不能超过30个字符"),
  brandCodes: z.array(z.string().min(1).max(100)).min(1, "请至少选择一个适用品牌"),
  status: z.nativeEnum(RecordStatus),
  version: z.number().int().positive().optional(),
});

const fileSchema = z.object({
  r2StorageId: z.string().min(1), objectKey: z.string().min(1).max(1024),
  originalName: z.string().min(1).max(255), mimeType: z.string().min(1).max(100), size: z.number().int().positive(), uploadProof: z.string().min(1).max(4096).optional(),
});

export const lessonInputSchema = z.object({
  chapterName: z.string().trim().min(1, "请输入章节名称").max(30, "章节名称不能超过30个字符"),
  chapterDescription: z.string().trim().max(200, "章节概述不能超过200个字符").optional().nullable(),
  cover: coverInputSchema,
  coursewareType: z.nativeEnum(CoursewareType),
  file: fileSchema.or(z.object({ kind: z.literal("EXISTING") })),
  remark: z.string().trim().max(200, "备注不能超过200个字符").optional().nullable(),
  version: z.number().int().positive().optional(),
});

export type CourseInput = z.infer<typeof courseInputSchema>;
export type LessonInput = z.infer<typeof lessonInputSchema>;

export function courseCan(session: Session, action: "query" | "create" | "view" | "edit" | "enable" | "disable" | "delete") {
  return session.permissions.includes("*") || session.permissions.includes("training:view") || session.permissions.includes(`courses:${action}`);
}

export function lessonCan(session: Session, action: "create" | "view" | "edit" | "delete" | "order") {
  return session.permissions.includes("*") || session.permissions.includes("training:view") || session.permissions.includes(`course-lessons:${action}`);
}

function shanghaiDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (type: string) => parts.find(item => item.type === type)?.value || "";
  return `${get("year")}${get("month")}${get("day")}`;
}

export async function nextCourseRecordNo(tx: Prisma.TransactionClient, now = new Date()) {
  const dateKey = shanghaiDateKey(now);
  const sequence = await tx.courseSequence.upsert({ where: { dateKey }, create: { dateKey, nextValue: 2 }, update: { nextValue: { increment: 1 } } });
  const value = sequence.nextValue - 1;
  if (value > 9999) throw new Error("当日课程流水号已达到上限");
  return `${dateKey}${String(value).padStart(4, "0")}`;
}

export async function nextLessonRecordNo(tx: Prisma.TransactionClient, now = new Date()) {
  const dateKey = shanghaiDateKey(now);
  const sequence = await tx.courseLessonSequence.upsert({ where: { dateKey }, create: { dateKey, nextValue: 2 }, update: { nextValue: { increment: 1 } } });
  const value = sequence.nextValue - 1;
  if (value > 9999) throw new Error("当日课时流水号已达到上限");
  return `${dateKey}${String(value).padStart(4, "0")}`;
}

export async function validatedBrands(codes: string[]) {
  const unique = [...new Set(codes)];
  const options = await getBusinessDictionaryOptions("BRAND");
  const byValue = new Map(options.map(option => [option.value, option]));
  if (!unique.length || unique.some(code => !byValue.has(code))) throw new Error("适用品牌不存在或已失效，请重新选择");
  return unique.map(code => ({ brandCode: code, brandLabel: byValue.get(code)!.label }));
}

function assetFromCover(cover: Extract<CourseInput["cover"], { kind: "R2" }>): CourseAssetMetadata {
  return { r2StorageId: cover.r2StorageId, objectKey: cover.objectKey, originalName: cover.originalName, mimeType: cover.mimeType, size: cover.size };
}

export async function resolveCoverInput(input: CourseInput["cover"] | LessonInput["cover"], type: "COURSE_COVER" | "LESSON_COVER", existing?: Course | CourseLesson | null, userId?: string) {
  if (input.kind === "EXISTING") {
    if (!existing) throw new Error("封面信息不存在，请重新上传");
    return {
      coverR2StorageId: existing.coverR2StorageId, coverObjectKey: existing.coverObjectKey,
      coverOriginalName: existing.coverOriginalName, coverMimeType: existing.coverMimeType,
      coverSizeBytes: existing.coverSizeBytes, coverDataUrl: existing.coverDataUrl,
    };
  }
  if (input.kind === "DEFAULT") {
    const platform = await getPlatformConfig();
    const dataUrl = type === "COURSE_COVER" ? platform.courseCoverDataUrl : platform.lessonCoverDataUrl;
    if (!dataUrl) throw new Error(type === "COURSE_COVER" ? "默认课程封面加载失败，请重新上传课程封面" : "默认课时封面加载失败，请重新上传课时封面");
    return { coverR2StorageId: null, coverObjectKey: null, coverOriginalName: null, coverMimeType: null, coverSizeBytes: null, coverDataUrl: dataUrl };
  }
  const asset = await verifyConfirmedCourseAsset(type, assetFromCover(input), userId || "", input.uploadProof);
  return { coverR2StorageId: asset.r2StorageId, coverObjectKey: asset.objectKey, coverOriginalName: asset.originalName, coverMimeType: asset.mimeType, coverSizeBytes: asset.size, coverDataUrl: null };
}

export function assetTypeForCourseware(type: CoursewareType): CourseAssetType {
  return type as CourseAssetType;
}

export function formatFileSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(bytes >= 10 * 1024 * 1024 ? 1 : 2)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function formatShanghaiDateTime(value: Date) {
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(value).replaceAll("/", "-");
}

export function serializeCourse(course: Course & { brands?: { brandCode: string; brandLabel: string }[]; _count?: { lessons?: number; learningProgress?: number } }) {
  return {
    id: course.id, recordNo: course.recordNo, courseName: course.courseName, courseDescription: course.courseDescription,
    applicablePosition: course.applicablePosition, status: course.status, createdByName: course.createdByName,
    createdAt: course.createdAt.toISOString(), createdAtText: formatShanghaiDateTime(course.createdAt), updatedAt: course.updatedAt.toISOString(), version: course.version,
    brandCodes: course.brands?.map(item => item.brandCode) || [], brands: course.brands || [],
    coverKind: course.coverObjectKey ? "R2" : "DEFAULT", coverDataUrl: course.coverDataUrl,
    coverUrl: course.coverObjectKey ? `/api/course-files?courseId=${encodeURIComponent(course.id)}&kind=cover` : course.coverDataUrl,
    lessonCount: course._count?.lessons ?? undefined, hasLearningProgress: Boolean(course._count?.learningProgress),
  };
}

export function serializeLesson(lesson: CourseLesson & { _count?: { learningProgress?: number } }) {
  return {
    id: lesson.id, recordNo: lesson.recordNo, courseId: lesson.courseId, courseDraftId: lesson.courseDraftId,
    chapterName: lesson.chapterName, chapterDescription: lesson.chapterDescription, coursewareType: lesson.coursewareType,
    originalFileName: lesson.originalFileName, fileSizeBytes: lesson.fileSizeBytes, fileSizeText: formatFileSize(lesson.fileSizeBytes), mimeType: lesson.mimeType,
    remark: lesson.remark, sortOrder: lesson.sortOrder, createdByName: lesson.createdByName,
    createdAt: lesson.createdAt.toISOString(), createdAtText: formatShanghaiDateTime(lesson.createdAt), updatedAt: lesson.updatedAt.toISOString(), version: lesson.version,
    coverKind: lesson.coverObjectKey ? "R2" : "DEFAULT", coverDataUrl: lesson.coverDataUrl,
    coverUrl: lesson.coverObjectKey ? `/api/course-files?lessonId=${encodeURIComponent(lesson.id)}&kind=cover` : lesson.coverDataUrl,
    fileUrl: `/api/course-files?lessonId=${encodeURIComponent(lesson.id)}&kind=file`, hasLearningProgress: Boolean(lesson._count?.learningProgress),
  };
}

export function safeCourseError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : "";
  const allowed = [
    "当日课程流水号已达到上限", "当日课时流水号已达到上限", "适用品牌不存在或已失效，请重新选择",
    "默认课程封面加载失败，请重新上传课程封面", "默认课时封面加载失败，请重新上传课时封面", "封面信息不存在，请重新上传",
    "启用课程至少需要添加一个课时", "当前课程暂无课时，暂不能启用", "课程草稿不存在或已失效", "课程不存在",
    "课时不存在", "该课程已产生学员学习记录，不支持删除，请使用“禁用”操作。", "该课时已有学员产生学习记录，不支持删除。",
    "当前课程已被其他用户修改，请刷新后重新操作", "当前课时已被其他用户修改，请刷新后重新操作",
    "课时顺序已被其他用户修改，请刷新后重试", "上传中的课件尚未完成", "更换课件类型后请重新选择对应格式文件",
  ];
  return allowed.includes(message) || /^(课程封面|课时封面|视频文件|音频文件|PDF文件|PPT文件|课程资源|系统尚未配置|未能确认|生成课件)/.test(message) ? message : fallback;
}

export const courseInclude = {
  brands: { select: { brandCode: true, brandLabel: true }, orderBy: { brandLabel: "asc" as const } },
  _count: { select: { lessons: { where: { deletedAt: null } }, learningProgress: true } },
};

export const lessonInclude = { _count: { select: { learningProgress: true } } };

export async function ownedDraft(id: string, userId: string) {
  return db.courseDraft.findFirst({ where: { id, createdByUserId: userId, expiresAt: { gt: new Date() } } });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession, sessionHasPermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";
import { getPlatformConfig, normalizeLoginTags, platformAssetVersion, savePlatformConfig } from "@/lib/platform-config";

const imagePattern = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/;
const inputSchema = z.object({
  platformName: z.string().trim().min(1, "请输入平台名称").max(30, "平台名称不能超过30个字符"),
  logoDataUrl: z.string().nullable().optional().refine(value => {
    if (value === undefined) return true;
    if (value === null) return true;
    const match = value.match(imagePattern);
    return Boolean(match && Math.ceil(match[2].length * 3 / 4) <= 2 * 1024 * 1024);
  }, "后台LOGO仅支持PNG、JPG或WEBP格式，且文件不能超过2MB"),
  loginBackgroundDataUrl: z.string().nullable().optional().refine(value => {
    if (value === undefined) return true;
    if (value === null) return true;
    const match = value.match(/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/);
    return Boolean(match && Math.ceil(match[2].length * 3 / 4) <= 5 * 1024 * 1024);
  }, "登录页背景图片仅支持PNG、JPG或JPEG格式，且文件不能超过5MB"),
  courseCoverDataUrl: z.string().nullable().optional().refine(value => {
    if (value === undefined || value === null) return true;
    const match = value.match(imagePattern);
    return Boolean(match && Math.ceil(match[2].length * 3 / 4) <= 5 * 1024 * 1024);
  }, "课程封面图片仅支持PNG、JPG、JPEG或WEBP格式，且文件不能超过5MB"),
  lessonCoverDataUrl: z.string().nullable().optional().refine(value => {
    if (value === undefined || value === null) return true;
    const match = value.match(imagePattern);
    return Boolean(match && Math.ceil(match[2].length * 3 / 4) <= 5 * 1024 * 1024);
  }, "课时封面图片仅支持PNG、JPG、JPEG或WEBP格式，且文件不能超过5MB"),
  leadPcLoginTags: z.string().trim().max(200, "运营PC端登录用户标签不能超过200个字符").optional().default(""),
  leadH5LoginTags: z.string().trim().max(200, "运营H5移动端登录用户标签不能超过200个字符").optional().default(""),
  storeH5LoginTags: z.string().trim().max(200, "门店H5移动端登录用户标签不能超过200个字符").optional().default(""),
  removeLogo: z.boolean().optional().default(false),
  removeLoginBackground: z.boolean().optional().default(false),
  removeCourseCover: z.boolean().optional().default(false),
  removeLessonCover: z.boolean().optional().default(false),
  automaticTaskExecutionTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "请选择正确的自动执行时间"),
  defaultTaskDeadlineDayOffset: z.union([z.literal(0), z.literal(1)]),
  defaultTaskDeadlineTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "请选择正确的默认截止时间"),
  dailyLearningR2StorageId: z.string().trim().min(1, "请选择正确的R2存储空间").nullable().optional(),
  trainingVideoR2StorageId: z.string().trim().min(1, "请选择正确的课件视频R2存储空间").nullable().optional(),
  trainingAudioR2StorageId: z.string().trim().min(1, "请选择正确的课件音频R2存储空间").nullable().optional(),
  trainingDocumentR2StorageId: z.string().trim().min(1, "请选择正确的课件文档R2存储空间").nullable().optional(),
});

export async function GET(request: Request) {
  const platform = await getPlatformConfig();
  const backgroundVersion = platform.loginBackgroundDataUrl ? platformAssetVersion(platform.loginBackgroundDataUrl) : null;
  const etag = `"${platformAssetVersion(`${platform.platformName}\0${backgroundVersion || ""}`)}"`;
  const headers = { "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=3600", ETag: etag };
  if (request.headers.get("if-none-match")?.split(",").map(value => value.trim()).includes(etag)) return new NextResponse(null, { status: 304, headers });
  return NextResponse.json({ platformName: platform.platformName, loginBackgroundUrl: backgroundVersion ? `/api/settings/login-background?v=${backgroundVersion}` : null }, { headers });
}

export async function PUT(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!sessionHasPermission(session, "settings:parameters")) return NextResponse.json({ message: "暂无系统参数维护权限" }, { status: 403 });
  try {
    const parsed = inputSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0].message }, { status: 400 });
    const current = await getPlatformConfig();
    const dailyLearningR2StorageId = parsed.data.dailyLearningR2StorageId === undefined ? current.dailyLearningR2StorageId : parsed.data.dailyLearningR2StorageId;
    const trainingVideoR2StorageId = parsed.data.trainingVideoR2StorageId === undefined ? current.trainingVideoR2StorageId : parsed.data.trainingVideoR2StorageId;
    const trainingAudioR2StorageId = parsed.data.trainingAudioR2StorageId === undefined ? current.trainingAudioR2StorageId : parsed.data.trainingAudioR2StorageId;
    const trainingDocumentR2StorageId = parsed.data.trainingDocumentR2StorageId === undefined ? current.trainingDocumentR2StorageId : parsed.data.trainingDocumentR2StorageId;
    const storageSelections = [
      { id: dailyLearningR2StorageId, label: "《每日学习》R2存储空间", businessType: "DAILY_LEARNING" },
      { id: trainingVideoR2StorageId, label: "课件视频R2存储空间", businessType: "TRAINING_MATERIAL_VIDEO" },
      { id: trainingAudioR2StorageId, label: "课件音频R2存储空间", businessType: "TRAINING_MATERIAL_AUDIO" },
      { id: trainingDocumentR2StorageId, label: "课件文档R2存储空间", businessType: "TRAINING_MATERIAL_DOCUMENT" },
    ];
    const selectedIds = [...new Set(storageSelections.flatMap(item => item.id ? [item.id] : []))];
    const enabledStorages = selectedIds.length ? await db.r2StorageConfig.findMany({ where: { id: { in: selectedIds }, status: "ENABLED", deletedAt: null }, select: { id: true } }) : [];
    const enabledIds = new Set(enabledStorages.map(storage => storage.id));
    const invalidStorage = storageSelections.find(item => item.id && !enabledIds.has(item.id));
    if (invalidStorage) return NextResponse.json({ message: `${invalidStorage.label}不存在或已停用，请重新选择` }, { status: 400 });
    const saved = await savePlatformConfig({
      platformName: parsed.data.platformName,
      logoDataUrl: parsed.data.removeLogo ? null : parsed.data.logoDataUrl ?? current.logoDataUrl,
      loginBackgroundDataUrl: parsed.data.removeLoginBackground ? null : parsed.data.loginBackgroundDataUrl ?? current.loginBackgroundDataUrl,
      courseCoverDataUrl: parsed.data.removeCourseCover ? null : parsed.data.courseCoverDataUrl ?? current.courseCoverDataUrl,
      lessonCoverDataUrl: parsed.data.removeLessonCover ? null : parsed.data.lessonCoverDataUrl ?? current.lessonCoverDataUrl,
      leadPcLoginTags: normalizeLoginTags(parsed.data.leadPcLoginTags),
      leadH5LoginTags: normalizeLoginTags(parsed.data.leadH5LoginTags),
      storeH5LoginTags: normalizeLoginTags(parsed.data.storeH5LoginTags),
      automaticTaskExecutionTime: parsed.data.automaticTaskExecutionTime,
      defaultTaskDeadlineDayOffset: parsed.data.defaultTaskDeadlineDayOffset,
      defaultTaskDeadlineTime: parsed.data.defaultTaskDeadlineTime,
      dailyLearningR2StorageId,
      trainingVideoR2StorageId,
      trainingAudioR2StorageId,
      trainingDocumentR2StorageId,
    });
    try {
      await db.$transaction(async tx => {
        for (const selection of storageSelections) {
          if (selection.id) {
            await tx.r2StorageReference.upsert({
              where: { businessType_businessId: { businessType: selection.businessType, businessId: "PLATFORM" } },
              create: { r2ConfigId: selection.id, businessType: selection.businessType, businessId: "PLATFORM" },
              update: { r2ConfigId: selection.id },
            });
          } else {
            await tx.r2StorageReference.deleteMany({ where: { businessType: selection.businessType, businessId: "PLATFORM" } });
          }
        }
      });
    } catch (error) {
      await savePlatformConfig(current).catch(() => undefined);
      throw error;
    }
    await writeOperationLog({ userId: session.userId, username: session.username, page: "系统参数", action: "修改参数", result: "成功", detail: `保存平台信息；平台名称：${saved.platformName}`, request }).catch(() => undefined);
    return NextResponse.json({ success: true, message: "系统参数已保存成功" });
  } catch {
    return NextResponse.json({ message: "平台信息保存失败，请稍后重试" }, { status: 500 });
  }
}

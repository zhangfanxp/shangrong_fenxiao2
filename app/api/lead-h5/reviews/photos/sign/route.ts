import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getLeadH5Session } from "@/lib/lead-h5-auth";
import { createLeadH5ReviewPhotoUploadToken } from "@/lib/lead-h5-review-upload-token";
import { brandMatches, findReviewConfigItem, getReviewDefinition, loadReviewConfig, reviewDataScope, validReviewMonth } from "@/lib/lead-h5-reviews";
import { createLeadH5ReviewPhotoDirectUpload, TaskAttachmentError } from "@/lib/task-r2-upload";

const inputSchema = z.object({
  storeId: z.string().min(1), scoreMonth: z.string(), scoreType: z.string().min(1),
  reviewTemplateId: z.string().min(1), reviewTemplateVersion: z.number().int().positive(), itemId: z.string().min(1),
  name: z.string().trim().min(1).max(255), type: z.string().trim().min(1).max(100), size: z.number().int().positive().max(10 * 1024 * 1024),
});

export async function POST(request: Request) {
  const session = await getLeadH5Session();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !validReviewMonth(parsed.data?.scoreMonth || "")) return NextResponse.json({ message: "拍照上传参数无效" }, { status: 400 });
  const input = parsed.data;
  const definition = getReviewDefinition(input.scoreType);
  if (!definition) return NextResponse.json({ message: "评分类型无效" }, { status: 400 });
  try {
    const [store, assessment] = await Promise.all([
      db.store.findFirst({ where: { id: input.storeId, ...reviewDataScope(session), operationStatus: { not: "CLOSED" }, brand: { status: "ENABLED" } }, include: { brand: true } }),
      db.assessment.findFirst({ where: { id: input.reviewTemplateId, name: definition.assessmentName, status: "ENABLED", deletedAt: null } }),
    ]);
    if (!store) return NextResponse.json({ message: "当前账号无权访问该店铺" }, { status: 403 });
    if (!assessment || assessment.configVersion !== input.reviewTemplateVersion || !brandMatches(assessment.applicableBrands, store.brand)) return NextResponse.json({ message: "当前评分模板已更新，请返回首页重新进入评分" }, { status: 409 });
    const config = await loadReviewConfig(assessment.configFileName);
    const item = findReviewConfigItem(config, input.itemId);
    if (!item?.supportsPhoto) return NextResponse.json({ message: "当前考评项不支持拍照" }, { status: 400 });
    const currentCount = await db.leadH5ReviewPhoto.count({ where: { uploaderUserId: session.userId, storeId: input.storeId, reviewMonth: input.scoreMonth, reviewType: input.scoreType, assessmentId: assessment.id, assessmentVersion: assessment.configVersion, itemKey: item.id, consumedAt: null } });
    if (currentCount >= config.photoAttachmentLimit) return NextResponse.json({ message: `该考评项最多上传${config.photoAttachmentLimit}张照片` }, { status: 400 });
    const direct = await createLeadH5ReviewPhotoDirectUpload({ r2StorageId: assessment.r2StorageId, storeId: store.id, reviewType: input.scoreType, itemKey: item.id, file: input });
    const uploadToken = await createLeadH5ReviewPhotoUploadToken({
      userId: session.userId, storeId: store.id, reviewMonth: input.scoreMonth, reviewType: input.scoreType,
      assessmentId: assessment.id, assessmentVersion: assessment.configVersion, itemKey: item.id,
      r2StorageId: direct.r2StorageId, objectKey: direct.objectKey, originalName: direct.name, mimeType: direct.mimeType, size: direct.size,
    }, direct.expiresIn);
    return NextResponse.json({ uploadUrl: direct.uploadUrl, uploadToken, expiresIn: direct.expiresIn, method: "PUT", headers: { "Content-Type": direct.mimeType, "If-None-Match": "*" } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ message: error instanceof TaskAttachmentError ? error.message : "生成照片上传地址失败，请稍后重试" }, { status: 400 });
  }
}

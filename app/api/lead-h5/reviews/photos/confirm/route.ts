import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getLeadH5Session, leadH5ReviewPermission } from "@/lib/lead-h5-auth";
import { verifyLeadH5ReviewPhotoUploadToken } from "@/lib/lead-h5-review-upload-token";
import { brandMatches, findReviewConfigItem, getReviewDefinition, loadReviewConfig, reviewDataScope } from "@/lib/lead-h5-reviews";
import { createTaskAttachmentReadUrl, deleteTaskDraftFiles, TaskAttachmentError, verifyStoreTaskDirectUpload } from "@/lib/task-r2-upload";

const inputSchema = z.object({ uploadToken: z.string().min(1), etag: z.string().max(200).nullable().optional() });

export async function POST(request: Request) {
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "上传确认参数无效" }, { status: 400 });
  const grant = await verifyLeadH5ReviewPhotoUploadToken(parsed.data.uploadToken).catch(() => null);
  const requiredPermission = grant ? leadH5ReviewPermission(grant.reviewType, "submit") : null;
  const session = requiredPermission ? await getLeadH5Session(requiredPermission) : null;
  if (!session) return NextResponse.json({ message: "登录状态已失效或暂无该评分提交权限" }, { status: 401 });
  if (!grant || grant.userId !== session.userId) return NextResponse.json({ message: "上传凭证无效或已过期，请重新上传" }, { status: 400 });
  const cleanup = () => deleteTaskDraftFiles([{ r2StorageId: grant.r2StorageId, objectKey: grant.objectKey }]).catch(() => undefined);
  try {
    const definition = getReviewDefinition(grant.reviewType);
    if (!definition) throw new TaskAttachmentError("评分类型无效");
    const [store, assessment] = await Promise.all([
      db.store.findFirst({ where: { id: grant.storeId, ...reviewDataScope(session), operationStatus: { not: "CLOSED" }, brand: { status: "ENABLED" } }, include: { brand: true } }),
      db.assessment.findFirst({ where: { id: grant.assessmentId, name: definition.assessmentName, status: "ENABLED", deletedAt: null } }),
    ]);
    if (!store || !assessment || assessment.configVersion !== grant.assessmentVersion || !brandMatches(assessment.applicableBrands, store.brand)) throw new TaskAttachmentError("当前评分模板已更新，请重新进入评分");
    if (assessment.r2StorageId !== grant.r2StorageId) throw new TaskAttachmentError("当前考核表的存储空间配置已变化，请重新上传");
    const config = await loadReviewConfig(assessment.configFileName);
    const item = findReviewConfigItem(config, grant.itemKey);
    if (!item?.supportsPhoto) throw new TaskAttachmentError("当前考评项不支持拍照");
    await verifyStoreTaskDirectUpload({ r2StorageId: grant.r2StorageId, objectKey: grant.objectKey, expectedSize: grant.size, expectedMimeType: grant.mimeType, etag: parsed.data.etag });
    const existing = await db.leadH5ReviewPhoto.findUnique({ where: { objectKey: grant.objectKey } });
    if (existing) {
      if (existing.uploaderUserId !== session.userId || existing.itemKey !== grant.itemKey) throw new TaskAttachmentError("照片登记冲突，请重新上传");
      await db.r2StorageReference.upsert({
        where: { businessType_businessId: { businessType: "LEAD_H5_REVIEW_PHOTO_DATA", businessId: grant.r2StorageId } },
        create: { r2ConfigId: grant.r2StorageId, businessType: "LEAD_H5_REVIEW_PHOTO_DATA", businessId: grant.r2StorageId },
        update: { r2ConfigId: grant.r2StorageId },
      });
      const url = await createTaskAttachmentReadUrl({ r2StorageId: existing.r2StorageId, objectKey: existing.objectKey });
      return NextResponse.json({ id: existing.id, itemId: existing.itemKey, name: existing.originalName, size: existing.size, mimeType: existing.mimeType, url });
    }
    let photo;
    try {
      photo = await db.$transaction(async tx => {
        const count = await tx.leadH5ReviewPhoto.count({ where: { uploaderUserId: session.userId, storeId: grant.storeId, reviewMonth: grant.reviewMonth, reviewType: grant.reviewType, assessmentId: grant.assessmentId, assessmentVersion: grant.assessmentVersion, itemKey: grant.itemKey, consumedAt: null } });
        if (count >= config.photoAttachmentLimit) throw new TaskAttachmentError(`该考评项最多上传${config.photoAttachmentLimit}张照片`);
        const created = await tx.leadH5ReviewPhoto.create({ data: { uploaderUserId: session.userId, storeId: grant.storeId, reviewMonth: grant.reviewMonth, reviewType: grant.reviewType, assessmentId: grant.assessmentId, assessmentVersion: grant.assessmentVersion, itemKey: grant.itemKey, r2StorageId: grant.r2StorageId, objectKey: grant.objectKey, originalName: grant.originalName, mimeType: grant.mimeType, size: grant.size } });
        await tx.r2StorageReference.upsert({
          where: { businessType_businessId: { businessType: "LEAD_H5_REVIEW_PHOTO_DATA", businessId: grant.r2StorageId } },
          create: { r2ConfigId: grant.r2StorageId, businessType: "LEAD_H5_REVIEW_PHOTO_DATA", businessId: grant.r2StorageId },
          update: { r2ConfigId: grant.r2StorageId },
        });
        return created;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    }
    catch (error) { if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error; photo = await db.leadH5ReviewPhoto.findUnique({ where: { objectKey: grant.objectKey } }); }
    if (!photo || photo.uploaderUserId !== session.userId || photo.itemKey !== grant.itemKey) throw new TaskAttachmentError("照片登记冲突，请重新上传");
    const url = await createTaskAttachmentReadUrl({ r2StorageId: photo.r2StorageId, objectKey: photo.objectKey });
    return NextResponse.json({ id: photo.id, itemId: photo.itemKey, name: photo.originalName, size: photo.size, mimeType: photo.mimeType, url });
  } catch (error) {
    await cleanup();
    return NextResponse.json({ message: error instanceof TaskAttachmentError ? error.message : "确认照片上传失败，请重新上传" }, { status: 400 });
  }
}

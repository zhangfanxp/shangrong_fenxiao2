import { NextResponse } from "next/server";
import { getLeadH5Session, leadH5ReviewPermission } from "@/lib/lead-h5-auth";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";
import { brandMatches, getReviewDefinition, loadReviewConfig, reviewDataScope, validReviewMonth } from "@/lib/lead-h5-reviews";
import { createTaskAttachmentReadUrl } from "@/lib/task-r2-upload";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const storeId = url.searchParams.get("storeId") || "";
  const reviewMonth = url.searchParams.get("scoreMonth") || "";
  const reviewType = url.searchParams.get("scoreType") || "";
  const definition = getReviewDefinition(reviewType);
  if (!storeId || !validReviewMonth(reviewMonth) || !definition) return NextResponse.json({ message: "评分参数无效" }, { status: 400 });
  const session = await getLeadH5Session(leadH5ReviewPermission(reviewType, "view")!);
  if (!session) return NextResponse.json({ message: "登录状态已失效或暂无该评分页面权限" }, { status: 401 });
  try {
    const store = await db.store.findFirst({
      where: { id: storeId, ...reviewDataScope(session), operationStatus: { not: "CLOSED" }, brand: { status: "ENABLED" } },
      include: { brand: true },
    });
    if (!store) return NextResponse.json({ message: "当前账号无权访问该店铺" }, { status: 403 });
    const duplicate = await db.leadH5Review.findUnique({ where: { storeId_reviewMonth_reviewType: { storeId, reviewMonth, reviewType } }, select: { id: true } });
    if (duplicate) return NextResponse.json({ message: `该店铺当前月份已完成${definition.title}，请勿重复提交。` }, { status: 409 });
    const candidates = await db.assessment.findMany({ where: { name: definition.assessmentName, status: "ENABLED", deletedAt: null } });
    const matches = candidates.filter(candidate => brandMatches(candidate.applicableBrands, store.brand));
    if (!matches.length) return NextResponse.json({ message: `当前店铺暂未配置可用的${definition.title}表，请联系系统管理员。` }, { status: 404 });
    if (matches.length > 1) {
      await writeOperationLog({ userId: session.userId, username: session.username, client: "运营移动端", page: definition.title, action: "加载评分表", result: "失败", detail: `店铺：${store.name}；匹配到${matches.length}份启用模板`, request }).catch(() => undefined);
      return NextResponse.json({ message: "当前评分配置存在异常，请联系系统管理员。" }, { status: 409 });
    }
    const assessment = matches[0];
    const config = await loadReviewConfig(assessment.configFileName);
    const draftRows = await db.leadH5ReviewPhoto.findMany({
      where: { uploaderUserId: session.userId, storeId, reviewMonth, reviewType, assessmentId: assessment.id, assessmentVersion: assessment.configVersion, consumedAt: null },
      orderBy: { createdAt: "asc" },
    });
    const draftPhotos = await Promise.all(draftRows.map(async photo => ({
      id: photo.id, itemId: photo.itemKey, name: photo.originalName, size: photo.size, mimeType: photo.mimeType,
      url: await createTaskAttachmentReadUrl({ r2StorageId: photo.r2StorageId, objectKey: photo.objectKey }).catch(() => null),
    })));
    await writeOperationLog({ userId: session.userId, username: session.username, client: "运营移动端", page: definition.title, action: "选择门店", result: "成功", detail: `评分月份：${reviewMonth}；门店：${store.name}`, request }).catch(() => undefined);
    return NextResponse.json({
      store: { id: store.id, name: store.name, brandId: store.brand.id, brandName: store.brand.name },
      reviewer: { realName: session.realName },
      assessment: { id: assessment.id, name: assessment.name, configVersion: assessment.configVersion },
      config,
      draftPhotos,
    });
  } catch (error) {
    const message = error instanceof Error && error.message.includes("评分表") ? error.message : "评分表加载失败，请稍后重试";
    return NextResponse.json({ message }, { status: 500 });
  }
}

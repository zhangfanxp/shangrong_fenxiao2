import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { writeOperationLog, writeOperationLogWithTransaction } from "@/lib/operation-log";
import { canStoreReview, formatReviewDate, storeReviewDataScope } from "@/lib/store-reviews";
import { createTaskAttachmentReadUrl, deleteTaskDraftFiles } from "@/lib/task-r2-upload";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canStoreReview(session, "view")) return NextResponse.json({ message: "暂无门店稽核评分查看权限" }, { status: 403 });
  const { id } = await params;
  try {
    const row = await db.leadH5Review.findFirst({
      where: { AND: [{ id, reviewType: { in: ["FRONT_HALL_AUDIT", "BACK_KITCHEN_AUDIT"] } }, await storeReviewDataScope(session)] },
      include: { items: { orderBy: { sortOrder: "asc" }, include: { photos: { orderBy: { createdAt: "asc" } } } } },
    });
    if (!row) return NextResponse.json({ message: "该评分记录已不存在或无权查看" }, { status: 404 });
    await writeOperationLog({ userId: session.userId, username: session.username, page: "门店稽核评分", action: "查看", result: "成功", detail: `记录编号：${row.recordNo}`, request }).catch(() => undefined);
    return NextResponse.json({
      id: row.id,
      recordNo: row.recordNo,
      reviewMonth: row.reviewMonth,
      brandName: row.brandNameSnapshot,
      storeName: row.storeNameSnapshot,
      assessmentName: row.assessmentName,
      responsiblePersonName: row.responsiblePersonNameSnapshot || "-",
      responsiblePersonType: row.responsiblePersonType,
      reviewerRealName: row.reviewerRealName,
      assessmentDate: formatReviewDate(row.assessmentDate),
      actualScore: Number(row.actualScore),
      maxScore: Number(row.maxScore),
      assessmentVersion: row.assessmentVersion,
      configSnapshot: row.configSnapshot,
      items: await Promise.all(row.items.map(async item => ({
        id: item.id,
        itemKey: item.itemKey,
        sectionName: item.sectionName,
        subsectionName: item.subsectionName,
        itemDescription: item.itemDescription,
        maxScore: Number(item.maxScore),
        result: item.result,
        actualScore: Number(item.actualScore),
        sortOrder: item.sortOrder,
        photos: await Promise.all(item.photos.map(async photo => ({
          id: photo.id, name: photo.originalName, size: photo.size, mimeType: photo.mimeType,
          url: await createTaskAttachmentReadUrl({ r2StorageId: photo.r2StorageId, objectKey: photo.objectKey }).catch(() => null),
        }))),
      }))),
    });
  } catch {
    await writeOperationLog({ userId: session.userId, username: session.username, page: "门店稽核评分", action: "查看", result: "失败", detail: `记录ID：${id}`, request }).catch(() => undefined);
    return NextResponse.json({ message: "评分详情加载失败，请稍后重试" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canStoreReview(session, "delete")) return NextResponse.json({ message: "暂无门店稽核评分删除权限" }, { status: 403 });
  const { id } = await params;
  try {
    const scope = await storeReviewDataScope(session);
    const found = await db.leadH5Review.findFirst({ where: { AND: [{ id, reviewType: { in: ["FRONT_HALL_AUDIT", "BACK_KITCHEN_AUDIT"] } }, scope] }, include: { items: { include: { photos: { select: { r2StorageId: true, objectKey: true } } } } } });
    if (!found) return NextResponse.json({ message: "该评分记录已不存在或已被删除" }, { status: 404 });
    await db.$transaction(async tx => {
      const current = await tx.leadH5Review.findFirst({ where: { AND: [{ id, reviewType: { in: ["FRONT_HALL_AUDIT", "BACK_KITCHEN_AUDIT"] } }, scope] } });
      if (!current) throw new Prisma.PrismaClientKnownRequestError("评分记录不存在", { code: "P2025", clientVersion: Prisma.prismaVersion.client });
      await tx.leadH5ReviewItem.deleteMany({ where: { reviewId: current.id } });
      await tx.leadH5Review.delete({ where: { id: current.id } });
      await writeOperationLogWithTransaction(tx, {
        userId: session.userId,
        username: session.username,
        page: "门店稽核评分",
        action: "删除",
        result: "成功",
        detail: `原评分记录编号：${current.recordNo}；门店ID：${current.storeId}；门店：${current.storeNameSnapshot}；品牌：${current.brandNameSnapshot}；考核月份：${current.reviewMonth}；考核表类型：${current.assessmentName}；原考核得分：${Number(current.actualScore)}；原考核督导：${current.reviewerRealName}`,
        request,
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    await deleteTaskDraftFiles(found.items.flatMap(item => item.photos)).catch(() => undefined);
    return NextResponse.json({ message: "门店稽核评分删除成功" });
  } catch (error) {
    const missing = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
    await writeOperationLog({ userId: session.userId, username: session.username, page: "门店稽核评分", action: "删除", result: "失败", detail: missing ? `评分记录已不存在：${id}` : `评分删除失败：${id}`, request }).catch(() => undefined);
    return NextResponse.json({ message: missing ? "该评分记录已不存在或已被删除" : "评分删除失败，请稍后重试" }, { status: missing ? 404 : 500 });
  }
}

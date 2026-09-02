import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { writeOperationLog, writeOperationLogWithTransaction } from "@/lib/operation-log";
import {
  canStoreCreditScore, formatCreditScoreDate, formatCreditScoreDateTime,
  readCreditScoreSnapshot, storeCreditScoreDataScope,
} from "@/lib/store-credit-scores";
import { STORE_CREDIT_REVIEW_TYPE } from "@/lib/lead-h5-reviews";
import { createTaskAttachmentReadUrl, deleteTaskDraftFiles } from "@/lib/task-r2-upload";

class CreditScoreMissingError extends Error {}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canStoreCreditScore(session, "view")) return NextResponse.json({ message: "暂无门店信用得分查看权限" }, { status: 403 });
  const { id } = await params;
  try {
    const row = await db.leadH5Review.findFirst({
      where: { AND: [{ id, reviewType: STORE_CREDIT_REVIEW_TYPE }, await storeCreditScoreDataScope(session)] },
      include: { items: { orderBy: { sortOrder: "asc" }, include: { photos: { orderBy: { createdAt: "asc" } } } } },
    });
    if (!row) return NextResponse.json({ message: "该信用评分记录已不存在或无权查看" }, { status: 404 });
    const snapshot = readCreditScoreSnapshot(row.configSnapshot);
    await writeOperationLog({ userId: session.userId, username: session.username, page: "门店信用得分", action: "查看", result: "成功", detail: `记录编号：${row.recordNo}`, request }).catch(() => undefined);
    const items = await Promise.all(row.items.map(async item => ({
      id: item.id,
      itemKey: item.itemKey,
      sectionName: item.sectionName,
      subsectionName: item.subsectionName,
      itemDescription: item.itemDescription,
      breachAmount: snapshot.breachAmounts.get(item.itemKey) || "-",
      maxScore: Number(item.maxScore),
      result: item.result,
      actualScore: Number(item.actualScore),
      sortOrder: item.sortOrder,
      photos: await Promise.all(item.photos.map(async photo => ({
        id: photo.id,
        name: photo.originalName,
        size: photo.size,
        mimeType: photo.mimeType,
        url: await createTaskAttachmentReadUrl({ r2StorageId: photo.r2StorageId, objectKey: photo.objectKey }).catch(() => null),
      }))),
    })));
    const systemInfo = {
      recordNo: row.recordNo,
      assessmentMonth: row.reviewMonth,
      brandName: row.brandNameSnapshot || "-",
      storeName: row.storeNameSnapshot || "-",
      assessmentType: row.assessmentName || "门店信用评分",
      managerName: row.responsiblePersonNameSnapshot || "-",
      supervisorName: row.reviewerRealName || "-",
      assessmentDate: formatCreditScoreDate(row.assessmentDate),
      totalScore: Number(row.actualScore),
    };
    return NextResponse.json({
      id: row.id,
      ...systemInfo,
      supervisorUserId: row.reviewerUserId,
      maxScore: Number(row.maxScore),
      assessmentTemplateId: row.assessmentId,
      assessmentTemplateVersion: row.assessmentVersion,
      scoreMode: snapshot.scoreMode,
      scoreModeLabel: snapshot.scoreModeLabel,
      snapshotValid: snapshot.valid,
      createdByName: row.reviewerRealName || row.reviewerUsername || "-",
      createdAt: formatCreditScoreDateTime(row.createdAt),
      systemInfo,
      templateSnapshot: snapshot.valid ? row.configSnapshot : null,
      scoreItems: items,
      items,
    });
  } catch {
    await writeOperationLog({ userId: session.userId, username: session.username, page: "门店信用得分", action: "查看", result: "失败", detail: `记录ID：${id}`, request }).catch(() => undefined);
    return NextResponse.json({ message: "门店信用评分详情加载失败，请稍后重试" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canStoreCreditScore(session, "delete")) return NextResponse.json({ message: "暂无门店信用得分删除权限" }, { status: 403 });
  const { id } = await params;
  const scope = await storeCreditScoreDataScope(session);
  try {
    const found = await db.leadH5Review.findFirst({
      where: { AND: [{ id, reviewType: STORE_CREDIT_REVIEW_TYPE }, scope] },
      include: { items: { include: { photos: { select: { r2StorageId: true, objectKey: true } } } } },
    });
    if (!found) return NextResponse.json({ message: "该评分记录已不存在或已被其他用户删除" }, { status: 404 });
    await db.$transaction(async tx => {
      const current = await tx.leadH5Review.findFirst({ where: { AND: [{ id, reviewType: STORE_CREDIT_REVIEW_TYPE }, scope] } });
      if (!current) throw new CreditScoreMissingError();
      await tx.leadH5ReviewItem.deleteMany({ where: { reviewId: current.id } });
      await tx.leadH5Review.delete({ where: { id: current.id } });
      await writeOperationLogWithTransaction(tx, {
        userId: session.userId,
        username: session.username,
        page: "门店信用得分",
        action: "删除",
        result: "成功",
        detail: `原记录编号：${current.recordNo}；品牌：${current.brandNameSnapshot}；门店ID：${current.storeId}；门店：${current.storeNameSnapshot}；考核月份：${current.reviewMonth}；考核表类型：${current.assessmentName}；原考核得分：${Number(current.actualScore)}；原负责人：${current.responsiblePersonNameSnapshot || "-"}；原考核督导：${current.reviewerRealName}；原考核日期：${formatCreditScoreDateTime(current.assessmentDate)}；删除人：${session.realName}`,
        request,
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    await deleteTaskDraftFiles(found.items.flatMap(item => item.photos)).catch(() => undefined);
    return NextResponse.json({ message: "门店信用评分删除成功，该门店对应考核月份现可重新评分" });
  } catch (error) {
    let missing = error instanceof CreditScoreMissingError || (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025");
    if (!missing) {
      missing = !(await db.leadH5Review.findFirst({ where: { AND: [{ id, reviewType: STORE_CREDIT_REVIEW_TYPE }, scope] }, select: { id: true } }).catch(() => ({ id: "unknown" })));
    }
    await writeOperationLog({ userId: session.userId, username: session.username, page: "门店信用得分", action: "删除", result: "失败", detail: missing ? `评分记录已不存在：${id}` : `信用评分删除失败：${id}`, request }).catch(() => undefined);
    return NextResponse.json({ message: missing ? "该评分记录已不存在或已被其他用户删除" : "门店信用评分删除失败，请稍后重试" }, { status: missing ? 404 : 500 });
  }
}

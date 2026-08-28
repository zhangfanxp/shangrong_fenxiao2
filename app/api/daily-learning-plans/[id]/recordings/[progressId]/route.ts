import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { dailyLearningCan } from "@/lib/daily-learning";
import { createDailyLearningRecordingReadUrl, DailyLearningRecordingError } from "@/lib/daily-learning-r2";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";

export async function GET(request: Request, { params }: { params: Promise<{ id: string; progressId: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!dailyLearningCan(session, "view")) return NextResponse.json({ message: "暂无每日学习查看权限" }, { status: 403 });
  const { id, progressId } = await params;
  const progress = await db.dailyLearningProgress.findFirst({
    where: { id: progressId, planId: id, status: "COMPLETED", plan: { deletedAt: null } },
    select: {
      recordingR2StorageId: true, recordingObjectKey: true, recordingOriginalName: true,
      recordingMimeType: true, learningDate: true, user: { select: { realName: true } },
      plan: { select: { recordNo: true } },
    },
  }).catch(() => null);
  if (!progress) return NextResponse.json({ message: "每日学习完成记录不存在" }, { status: 404 });
  if (!progress.recordingR2StorageId || !progress.recordingObjectKey) return NextResponse.json({ message: "该完成记录没有可用录音" }, { status: 404 });
  const download = new URL(request.url).searchParams.get("download") === "1";
  try {
    const url = await createDailyLearningRecordingReadUrl({
      r2StorageId: progress.recordingR2StorageId,
      objectKey: progress.recordingObjectKey,
      originalName: progress.recordingOriginalName || `${progress.plan.recordNo}-${progress.user.realName}-${progress.learningDate.toISOString().slice(0, 10)}.mp3`,
      mimeType: progress.recordingMimeType || "audio/mpeg",
      download,
    });
    if (download) void writeOperationLog({
      userId: session.userId, username: session.username, page: "每日学习", action: "下载录音", result: "成功",
      detail: `计划：${progress.plan.recordNo}；学员：${progress.user.realName}；学习日期：${progress.learningDate.toISOString().slice(0, 10)}`, request,
    }).catch(() => undefined);
    return NextResponse.redirect(url, 307);
  } catch (error) {
    const message = error instanceof DailyLearningRecordingError ? error.message : "录音访问失败，请稍后重试";
    return NextResponse.json({ message }, { status: 500 });
  }
}

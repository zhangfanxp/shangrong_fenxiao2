import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { completeDailyLearningRecording, safeDailyLearningError } from "@/lib/daily-learning";
import { deleteDailyLearningRecording, DailyLearningRecordingError, verifyDailyLearningDirectUpload } from "@/lib/daily-learning-r2";
import { verifyDailyLearningUploadToken } from "@/lib/daily-learning-upload-token";
import { db } from "@/lib/db";
import { getLeadH5Session } from "@/lib/lead-h5-auth";
import { writeOperationLog } from "@/lib/operation-log";
import { getPlatformConfig } from "@/lib/platform-config";

const inputSchema = z.object({ uploadToken: z.string().min(1), etag: z.string().max(200).nullable().optional() });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getLeadH5Session();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "录音上传确认参数不正确" }, { status: 400 });
  const planId = (await params).id;
  const grant = await verifyDailyLearningUploadToken(parsed.data.uploadToken).catch(() => null);
  if (!grant || grant.userId !== session.userId || grant.planId !== planId || grant.mimeType !== "audio/mpeg") {
    return NextResponse.json({ message: "上传凭证无效或已过期，请重新上传" }, { status: 400 });
  }
  const existing = await db.dailyLearningProgress.findUnique({
    where: { planId_userId_weekDay: { planId, userId: session.userId, weekDay: grant.weekDay } },
    select: { recordingObjectKey: true, completedAt: true },
  });
  if (existing?.recordingObjectKey === grant.objectKey) return NextResponse.json({ success: true, completedAt: existing.completedAt.toISOString() });
  if (existing) {
    await deleteDailyLearningRecording(grant.r2StorageId, grant.objectKey);
    return NextResponse.json({ message: "当天学习任务已经完成" }, { status: 409 });
  }
  try {
    const platform = await getPlatformConfig();
    if (platform.dailyLearningR2StorageId !== grant.r2StorageId) throw new DailyLearningRecordingError("《每日学习》R2存储配置已变化，请重新上传");
    await verifyDailyLearningDirectUpload({
      r2StorageId: grant.r2StorageId,
      objectKey: grant.objectKey,
      expectedSize: grant.size,
      expectedMimeType: grant.mimeType,
      etag: parsed.data.etag,
    });
    let progress;
    try {
      progress = await completeDailyLearningRecording({
        planId,
        userId: session.userId,
        weekDay: grant.weekDay,
        learningDate: grant.learningDate,
        r2StorageId: grant.r2StorageId,
        objectKey: grant.objectKey,
        originalName: grant.originalName,
        mimeType: grant.mimeType,
        size: grant.size,
        durationSeconds: grant.durationSeconds,
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
      const raced = await db.dailyLearningProgress.findUnique({ where: { planId_userId_weekDay: { planId, userId: session.userId, weekDay: grant.weekDay } } });
      if (!raced || raced.recordingObjectKey !== grant.objectKey) throw new Error("当天学习任务已经完成");
      progress = raced;
    }
    await writeOperationLog({
      userId: session.userId,
      username: session.username,
      client: "运营移动端",
      page: "每日学习",
      action: "完成录音学习",
      result: "成功",
      detail: `计划：${planId}，日期：${grant.learningDate}，MP3录音时长：${grant.durationSeconds}秒，文件大小：${grant.size}字节`,
      request,
    }).catch(() => undefined);
    return NextResponse.json({ success: true, completedAt: progress.completedAt.toISOString() });
  } catch (error) {
    await deleteDailyLearningRecording(grant.r2StorageId, grant.objectKey);
    const message = error instanceof DailyLearningRecordingError ? error.message : safeDailyLearningError(error, "确认录音上传失败，请重新上传");
    return NextResponse.json({ message }, { status: message === "当天学习任务已经完成" ? 409 : 400 });
  }
}

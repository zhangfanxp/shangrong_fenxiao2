import { NextResponse } from "next/server";
import { z } from "zod";
import { dailyLearningTodayDetail, safeDailyLearningError } from "@/lib/daily-learning";
import { createDailyLearningDirectUpload, DailyLearningRecordingError } from "@/lib/daily-learning-r2";
import { createDailyLearningUploadToken } from "@/lib/daily-learning-upload-token";
import { getStoreH5Session } from "@/lib/store-h5-auth";

const inputSchema = z.object({
  name: z.string().trim().min(1).max(255),
  type: z.string().trim().min(1).max(100),
  size: z.number().int().positive().max(20 * 1024 * 1024),
  durationSeconds: z.number().int().min(1).max(600),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getStoreH5Session();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0].message || "录音参数不正确" }, { status: 400 });
  const planId = (await params).id;
  try {
    const detail = await dailyLearningTodayDetail(planId, session.userId);
    if (detail.completed) return NextResponse.json({ message: "当天学习任务已经完成" }, { status: 409 });
    const direct = await createDailyLearningDirectUpload({ planId, userId: session.userId, learningDate: detail.date, file: parsed.data });
    const uploadToken = await createDailyLearningUploadToken({
      userId: session.userId,
      planId,
      weekDay: detail.weekDay,
      learningDate: detail.date,
      r2StorageId: direct.r2StorageId,
      objectKey: direct.objectKey,
      originalName: direct.name,
      mimeType: direct.mimeType,
      size: direct.size,
      durationSeconds: parsed.data.durationSeconds,
    }, direct.expiresIn);
    return NextResponse.json({
      uploadUrl: direct.uploadUrl,
      uploadToken,
      expiresIn: direct.expiresIn,
      method: "PUT",
      headers: { "Content-Type": direct.mimeType, "If-None-Match": "*" },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof DailyLearningRecordingError ? error.message : safeDailyLearningError(error, "生成录音上传地址失败，请稍后重试");
    return NextResponse.json({ message }, { status: 400 });
  }
}

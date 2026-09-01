import { NextResponse } from "next/server";
import { z } from "zod";
import { CourseAssetError, createCourseAssetReadUrl } from "@/lib/course-r2";
import {
  dataUrlResponse,
  mobileAssignedCourseDetail,
  mobileAssignedCourses,
  mobileAssignedLessonDetail,
  mobileCourseAsset,
  MobileCourseError,
  saveMobileLessonProgress,
  type MobileCourseChannel,
} from "@/lib/mobile-online-courses";
import { writeOperationLog, type OperationLogClient } from "@/lib/operation-log";
import { LessonVisitError, startLessonVisit, updateLessonVisit } from "@/lib/lesson-learning-visits";

type MobileSession = { userId: string; username: string };
const progressSchema = z.object({ visitId: z.string().uuid(), progressSeconds: z.number().int().min(0).max(24 * 60 * 60), completed: z.boolean().default(false) });
const visitSchema = z.object({ visitId: z.string().uuid(), event: z.enum(["start", "heartbeat", "end"]), reason: z.enum(["BACK", "NAVIGATION", "PAGE_HIDE"]).optional() });

export async function lessonVisitResponse(request: Request, courseId: string, lessonId: string, session: MobileSession, channel: MobileCourseChannel) {
  const parsed = visitSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "课时学习记录参数不正确" }, { status: 400 });
  const input = { visitId: parsed.data.visitId, userId: session.userId, courseId, lessonId, channel };
  try {
    const visit = parsed.data.event === "start" ? await startLessonVisit(input) : await updateLessonVisit(input, parsed.data.event, parsed.data.reason);
    return NextResponse.json(visit, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ message: error instanceof LessonVisitError ? error.message : "课时学习记录保存失败，请稍后重试" }, { status: error instanceof LessonVisitError ? error.status : 500 });
  }
}

export async function courseListResponse(session: MobileSession, channel: MobileCourseChannel) {
  try {
    return NextResponse.json({ courses: await mobileAssignedCourses(session.userId, channel) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ message: "线上课堂课程加载失败，请稍后重试" }, { status: 500 });
  }
}

export async function courseDetailResponse(courseId: string, session: MobileSession, channel: MobileCourseChannel) {
  try {
    return NextResponse.json({ course: await mobileAssignedCourseDetail(courseId, session.userId, channel) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ message: error instanceof MobileCourseError ? error.message : "课程详情加载失败，请稍后重试" }, { status: error instanceof MobileCourseError ? 404 : 500 });
  }
}

export async function lessonDetailResponse(courseId: string, lessonId: string, session: MobileSession, channel: MobileCourseChannel) {
  try {
    return NextResponse.json({ lesson: await mobileAssignedLessonDetail(courseId, lessonId, session.userId, channel) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ message: error instanceof MobileCourseError ? error.message : "课时详情加载失败，请稍后重试" }, { status: error instanceof MobileCourseError ? 404 : 500 });
  }
}

export async function courseFileResponse(request: Request, session: MobileSession) {
  const url = new URL(request.url);
  const courseId = url.searchParams.get("courseId")?.trim();
  const lessonId = url.searchParams.get("lessonId")?.trim() || null;
  const kind = url.searchParams.get("kind");
  const download = url.searchParams.get("download") === "1";
  if (!courseId || (kind !== "cover" && kind !== "file") || kind === "file" && !lessonId) return NextResponse.json({ message: "课程资源参数不正确" }, { status: 400 });
  try {
    const asset = await mobileCourseAsset({ courseId, lessonId, kind, userId: session.userId });
    if (asset.kind === "DATA_URL") return dataUrlResponse(asset.dataUrl);
    const readUrl = await createCourseAssetReadUrl({ ...asset.metadata, download });
    return NextResponse.redirect(readUrl);
  } catch (error) {
    const message = error instanceof MobileCourseError || error instanceof CourseAssetError ? error.message : "课程资源访问失败，请稍后重试";
    return NextResponse.json({ message }, { status: error instanceof MobileCourseError ? 404 : 400 });
  }
}

export async function lessonProgressResponse(request: Request, courseId: string, lessonId: string, session: MobileSession, client: OperationLogClient) {
  const parsed = progressSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "学习进度参数不正确，请刷新后重新进入课时" }, { status: 400 });
  try {
    const result = await saveMobileLessonProgress({ courseId, lessonId, userId: session.userId, channel: client === "运营移动端" ? "lead-h5" : "store-h5", ...parsed.data });
    if (result.newlyCompleted) {
      await writeOperationLog({ userId: session.userId, username: session.username, client, page: "线上课堂", action: "完成课时", result: "成功", detail: `课程：${courseId}；课时：${lessonId}`, request }).catch(() => undefined);
    }
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ message: error instanceof MobileCourseError || error instanceof LessonVisitError ? error.message : "学习进度保存失败，请稍后重试" }, { status: error instanceof LessonVisitError ? error.status : error instanceof MobileCourseError ? 404 : 500 });
  }
}

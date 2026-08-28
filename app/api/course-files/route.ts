import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { courseCan, lessonCan } from "@/lib/course-management";
import { CourseAssetError, createCourseAssetReadUrl } from "@/lib/course-r2";
import { db } from "@/lib/db";

export async function GET(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!courseCan(session, "query") && !courseCan(session, "view") && !lessonCan(session, "view")) return NextResponse.json({ message: "暂无课程资源查看权限" }, { status: 403 });
  const url = new URL(request.url);
  const courseId = url.searchParams.get("courseId");
  const lessonId = url.searchParams.get("lessonId");
  const kind = url.searchParams.get("kind");
  const download = url.searchParams.get("download") === "1";
  try {
    if (courseId && kind === "cover") {
      const course = await db.course.findFirst({ where: { id: courseId, deletedAt: null }, select: { coverR2StorageId: true, coverObjectKey: true, coverOriginalName: true, coverMimeType: true, coverSizeBytes: true } });
      if (!course?.coverR2StorageId || !course.coverObjectKey || !course.coverOriginalName || !course.coverMimeType || !course.coverSizeBytes) throw new CourseAssetError("课程封面不存在");
      return NextResponse.redirect(await createCourseAssetReadUrl({ r2StorageId: course.coverR2StorageId, objectKey: course.coverObjectKey, originalName: course.coverOriginalName, mimeType: course.coverMimeType, size: course.coverSizeBytes, download }));
    }
    if (lessonId && (kind === "cover" || kind === "file")) {
      const lesson = await db.courseLesson.findFirst({ where: { id: lessonId, deletedAt: null, OR: [{ course: { deletedAt: null } }, { courseDraft: { createdByUserId: session.userId, expiresAt: { gt: new Date() } } }] } });
      if (!lesson) throw new CourseAssetError("课时资源不存在");
      const metadata = kind === "cover"
        ? lesson.coverR2StorageId && lesson.coverObjectKey && lesson.coverOriginalName && lesson.coverMimeType && lesson.coverSizeBytes ? { r2StorageId: lesson.coverR2StorageId, objectKey: lesson.coverObjectKey, originalName: lesson.coverOriginalName, mimeType: lesson.coverMimeType, size: lesson.coverSizeBytes } : null
        : { r2StorageId: lesson.fileR2StorageId, objectKey: lesson.fileObjectKey, originalName: lesson.originalFileName, mimeType: lesson.mimeType, size: lesson.fileSizeBytes };
      if (!metadata) throw new CourseAssetError("课时封面不存在");
      return NextResponse.redirect(await createCourseAssetReadUrl({ ...metadata, download: kind === "file" ? download : false }));
    }
    return NextResponse.json({ message: "课程资源参数不正确" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ message: error instanceof CourseAssetError ? error.message : "课程资源访问失败，请稍后重试" }, { status: 404 });
  }
}

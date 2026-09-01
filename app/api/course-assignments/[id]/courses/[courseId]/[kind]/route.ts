import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assignmentApiSession, assignmentAudit, assignmentErrorResponse } from "@/lib/course-assignment-responses";
import { AssignmentError, assignmentLearningRows, visibleAssignment } from "@/lib/course-assignments";
import { createCourseAssetReadUrl } from "@/lib/course-r2";
import { getPlatformConfig } from "@/lib/platform-config";
import { dataUrlResponse } from "@/lib/mobile-online-courses";

export async function GET(request: Request, { params }: { params: Promise<{ id: string; courseId: string; kind: string }> }) {
  const { id, courseId, kind } = await params;
  if (!["cover", "learning-records", "unlearned-users"].includes(kind)) return NextResponse.json({ message: "操作不存在" }, { status: 404 });
  const session = await assignmentApiSession(kind === "cover" ? "view" : "learning");
  if (session instanceof NextResponse) return session;
  try {
    if (kind !== "cover") {
      const result = await assignmentLearningRows(id, courseId, kind === "unlearned-users", new URL(request.url).searchParams, session);
      assignmentAudit(session, request, "查看学习记录", `批次ID：${id}；课程ID：${courseId}；${kind === "unlearned-users" ? "未学习人员" : "学习记录"}`);
      return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
    }
    await visibleAssignment(id, session);
    const course = await db.courseAssignmentCourse.findUnique({ where: { batchId_courseId: { batchId: id, courseId } } });
    if (!course) throw new AssignmentError("当前批次未分配该课程", 404);
    if (new URL(request.url).searchParams.get("fallback") !== "1") {
      if (course.coverR2StorageId && course.coverObjectKey && course.coverOriginalName && course.coverMimeType && course.coverSizeBytes) {
        try { return NextResponse.redirect(await createCourseAssetReadUrl({ r2StorageId: course.coverR2StorageId, objectKey: course.coverObjectKey, originalName: course.coverOriginalName, mimeType: course.coverMimeType, size: course.coverSizeBytes })); }
        catch { /* Fall back when snapshot storage is no longer available. */ }
      }
      if (course.coverDataUrl) return dataUrlResponse(course.coverDataUrl);
    }
    const platform = await getPlatformConfig();
    if (platform.courseCoverDataUrl) return dataUrlResponse(platform.courseCoverDataUrl);
    throw new AssignmentError("默认课程封面暂不可用", 404);
  } catch (error) { return assignmentErrorResponse(error, kind === "unlearned-users" ? "未学习人员加载失败，请稍后重试" : kind === "cover" ? "课程封面加载失败" : "学习记录加载失败，请稍后重试"); }
}

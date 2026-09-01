import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assignmentApiSession, assignmentAudit, assignmentErrorResponse } from "@/lib/course-assignment-responses";
import { serializeAssignment, visibleAssignment } from "@/lib/course-assignments";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await assignmentApiSession("view");
  if (session instanceof NextResponse) return session;
  try {
    const { id } = await params;
    const batch = await visibleAssignment(id, session);
    const courses = await db.courseAssignmentCourse.findMany({ where: { batchId: id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { courseId: true, courseRecordNoSnapshot: true, courseNameSnapshot: true, applicablePositionSnapshot: true } });
    assignmentAudit(session, request, "查看", `批次：${batch.recordNo}`);
    return NextResponse.json({ ...serializeAssignment(batch), courses: courses.map(course => ({ ...course, coverUrl: `/api/course-assignments/${id}/courses/${course.courseId}/cover` })) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return assignmentErrorResponse(error, "课程分配详情加载失败，请稍后重试"); }
}

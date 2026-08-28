import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { courseCan, courseInclude, safeCourseError, serializeCourse } from "@/lib/course-management";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!courseCan(session, "enable")) return NextResponse.json({ message: "暂无课程启用权限" }, { status: 403 });
  const id = (await params).id;
  try {
    const lessonCount = await db.courseLesson.count({ where: { courseId: id, deletedAt: null } });
    if (!lessonCount) throw new Error("当前课程暂无课时，暂不能启用");
    const course = await db.course.update({ where: { id, deletedAt: null }, data: { status: "ENABLED", version: { increment: 1 } }, include: courseInclude });
    await writeOperationLog({ userId: session.userId, username: session.username, page: "课程管理", action: "启用课程", result: "成功", detail: `课程：${course.recordNo}（${course.courseName}）`, request }).catch(() => undefined);
    return NextResponse.json(serializeCourse(course));
  } catch (error) { return NextResponse.json({ message: safeCourseError(error, "课程启用失败，请稍后重试") }, { status: 400 }); }
}

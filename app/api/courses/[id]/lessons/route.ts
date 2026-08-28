import { after, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { createCourseLesson } from "@/lib/course-lesson-actions";
import { lessonCan, lessonInclude, lessonInputSchema, safeCourseError, serializeLesson } from "@/lib/course-management";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!["view", "create", "edit", "order"].some(action => lessonCan(session, action as "view" | "create" | "edit" | "order"))) return NextResponse.json({ message: "暂无课时查看权限" }, { status: 403 });
  const courseId = (await params).id;
  if (!await db.course.count({ where: { id: courseId, deletedAt: null } })) return NextResponse.json({ message: "课程不存在" }, { status: 404 });
  const lessons = await db.courseLesson.findMany({ where: { courseId, deletedAt: null }, include: lessonInclude, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
  return NextResponse.json({ lessons: lessons.map(serializeLesson), total: lessons.length }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!lessonCan(session, "create")) return NextResponse.json({ message: "暂无课时新增权限" }, { status: 403 });
  const parsed = lessonInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0].message }, { status: 400 });
  const courseId = (await params).id;
  try {
    if (!await db.course.count({ where: { id: courseId, deletedAt: null } })) throw new Error("课程不存在");
    const lesson = await createCourseLesson(parsed.data, session, { courseId });
    after(() => writeOperationLog({ userId: session.userId, username: session.username, page: "课程管理", action: "添加课时", result: "成功", detail: `课时：${lesson.recordNo}（${lesson.chapterName}）`, request }).catch(() => undefined));
    return NextResponse.json(lesson, { status: 201 });
  } catch (error) { return NextResponse.json({ message: safeCourseError(error, "课时保存失败，请稍后重试") }, { status: 400 }); }
}

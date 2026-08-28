import { after, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { createCourseLesson } from "@/lib/course-lesson-actions";
import { lessonCan, lessonInclude, lessonInputSchema, ownedDraft, safeCourseError, serializeLesson } from "@/lib/course-management";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!["view", "create", "edit", "order"].some(action => lessonCan(session, action as "view" | "create" | "edit" | "order"))) return NextResponse.json({ message: "暂无课时查看权限" }, { status: 403 });
  const courseDraftId = (await params).id;
  if (!await ownedDraft(courseDraftId, session.userId)) return NextResponse.json({ message: "课程草稿不存在或已失效" }, { status: 404 });
  const lessons = await db.courseLesson.findMany({ where: { courseDraftId, deletedAt: null }, include: lessonInclude, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
  return NextResponse.json({ lessons: lessons.map(serializeLesson), total: lessons.length }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!lessonCan(session, "create")) return NextResponse.json({ message: "暂无课时新增权限" }, { status: 403 });
  const parsed = lessonInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0].message }, { status: 400 });
  const courseDraftId = (await params).id;
  try {
    if (!await ownedDraft(courseDraftId, session.userId)) throw new Error("课程草稿不存在或已失效");
    const lesson = await createCourseLesson(parsed.data, session, { courseDraftId });
    after(() => writeOperationLog({ userId: session.userId, username: session.username, page: "课程管理", action: "添加草稿课时", result: "成功", detail: `课时：${lesson.recordNo}（${lesson.chapterName}）`, request }).catch(() => undefined));
    return NextResponse.json(lesson, { status: 201 });
  } catch (error) { return NextResponse.json({ message: safeCourseError(error, "课时保存失败，请稍后重试") }, { status: 400 }); }
}

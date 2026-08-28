import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { lessonCan, safeCourseError, serializeLesson } from "@/lib/course-management";
import { reorderLessons } from "@/lib/course-order";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";

const schema = z.object({ lessonIds: z.array(z.string().min(1)).min(1), versions: z.record(z.number().int().positive()).optional() });

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!lessonCan(session, "order")) return NextResponse.json({ message: "暂无课时排序权限" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "课时顺序参数不正确" }, { status: 400 });
  const courseId = (await params).id;
  try {
    if (!await db.course.count({ where: { id: courseId, deletedAt: null } })) throw new Error("课程不存在");
    const lessons = await reorderLessons({ courseId }, parsed.data.lessonIds, parsed.data.versions);
    await writeOperationLog({ userId: session.userId, username: session.username, page: "课程管理", action: "调整课时顺序", result: "成功", detail: `课程：${courseId}；课时数：${lessons.length}`, request }).catch(() => undefined);
    return NextResponse.json({ lessons: lessons.map(serializeLesson) });
  } catch (error) { return NextResponse.json({ message: safeCourseError(error, "课时顺序更新失败，请稍后重试") }, { status: 409 }); }
}

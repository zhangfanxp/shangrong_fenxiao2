import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { courseCan, courseInclude, serializeCourse } from "@/lib/course-management";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!courseCan(session, "disable")) return NextResponse.json({ message: "暂无课程禁用权限" }, { status: 403 });
  try {
    const course = await db.course.update({ where: { id: (await params).id, deletedAt: null }, data: { status: "DISABLED", version: { increment: 1 } }, include: courseInclude });
    await writeOperationLog({ userId: session.userId, username: session.username, page: "课程管理", action: "禁用课程", result: "成功", detail: `课程：${course.recordNo}（${course.courseName}）`, request }).catch(() => undefined);
    return NextResponse.json(serializeCourse(course));
  } catch { return NextResponse.json({ message: "课程禁用失败，请稍后重试" }, { status: 400 }); }
}

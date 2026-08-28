import { after, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { courseCan } from "@/lib/course-management";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";

const schema = z.object({
  courseIds: z.array(z.string().min(1)).min(1, "请至少选择一门课程").max(100, "单次最多分配100门课程"),
  userIds: z.array(z.string().min(1)).min(1, "请至少选择一名用户").max(100, "单次最多选择100名用户"),
});

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!courseCan(session, "edit")) return NextResponse.json({ message: "暂无课程分配权限" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0].message }, { status: 400 });
  const courseIds = [...new Set(parsed.data.courseIds)];
  const userIds = [...new Set(parsed.data.userIds)];

  try {
    const [courses, users] = await Promise.all([
      db.course.findMany({ where: { id: { in: courseIds }, deletedAt: null }, select: { id: true, recordNo: true } }),
      db.user.findMany({ where: { id: { in: userIds } }, select: { id: true } }),
    ]);
    if (courses.length !== courseIds.length) return NextResponse.json({ message: "所选课程包含不存在或已删除的记录，请刷新后重试" }, { status: 400 });
    if (users.length !== userIds.length) return NextResponse.json({ message: "所选用户包含不存在的记录，请刷新后重试" }, { status: 400 });

    const expected = courseIds.length * userIds.length;
    const result = await db.courseAssignment.createMany({
      data: courseIds.flatMap(courseId => userIds.map(userId => ({ courseId, userId, assignedByUserId: session.userId, assignedByName: session.realName }))),
      skipDuplicates: true,
    });
    const skipped = expected - result.count;
    after(() => writeOperationLog({
      userId: session.userId, username: session.username, page: "课程管理", action: "课程分配", result: "成功",
      detail: `课程：${courses.map(course => course.recordNo).join("、")}；用户数：${userIds.length}；新增：${result.count}；已存在：${skipped}`,
      request,
    }).catch(() => undefined));
    return NextResponse.json({ success: true, courseCount: courseIds.length, userCount: userIds.length, created: result.count, skipped });
  } catch {
    return NextResponse.json({ message: "课程分配失败，请稍后重试" }, { status: 500 });
  }
}

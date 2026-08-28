import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { courseCan, courseInclude, courseInputSchema, lessonInclude, resolveCoverInput, safeCourseError, serializeCourse, serializeLesson, validatedBrands } from "@/lib/course-management";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!courseCan(session, "view")) return NextResponse.json({ message: "暂无课程查看权限" }, { status: 403 });
  try {
    const course = await db.course.findFirst({ where: { id: (await params).id, deletedAt: null }, include: { ...courseInclude, lessons: { where: { deletedAt: null }, include: lessonInclude, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } } });
    if (!course) return NextResponse.json({ message: "课程不存在" }, { status: 404 });
    return NextResponse.json({ ...serializeCourse(course), lessons: course.lessons.map(serializeLesson) }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ message: "课程详情加载失败，请稍后重试" }, { status: 500 }); }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!courseCan(session, "edit")) return NextResponse.json({ message: "暂无课程编辑权限" }, { status: 403 });
  const parsed = courseInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !parsed.data.version) return NextResponse.json({ message: parsed.success ? "缺少课程版本，请刷新后重试" : parsed.error.issues[0].message }, { status: 400 });
  const id = (await params).id;
  try {
    const existing = await db.course.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new Error("课程不存在");
    const [cover, brands, lessonCount] = await Promise.all([
      resolveCoverInput(parsed.data.cover, "COURSE_COVER", existing, session.userId), validatedBrands(parsed.data.brandCodes),
      db.courseLesson.count({ where: { courseId: id, deletedAt: null } }),
    ]);
    if (parsed.data.status === "ENABLED" && lessonCount < 1) throw new Error("启用课程至少需要添加一个课时");
    const course = await db.$transaction(async tx => {
      const updated = await tx.course.updateMany({ where: { id, deletedAt: null, version: parsed.data.version }, data: {
        courseName: parsed.data.courseName, courseDescription: parsed.data.courseDescription || null, ...cover,
        applicablePosition: parsed.data.applicablePosition, status: parsed.data.status, version: { increment: 1 },
      } });
      if (updated.count !== 1) throw new Error("当前课程已被其他用户修改，请刷新后重新操作");
      await tx.courseBrand.deleteMany({ where: { courseId: id } });
      await tx.courseBrand.createMany({ data: brands.map(item => ({ courseId: id, ...item })) });
      return tx.course.findUniqueOrThrow({ where: { id }, include: courseInclude });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 15000 });
    await writeOperationLog({ userId: session.userId, username: session.username, page: "课程管理", action: "编辑课程", result: "成功", detail: `课程：${course.recordNo}（${course.courseName}）`, request }).catch(() => undefined);
    return NextResponse.json(serializeCourse(course));
  } catch (error) {
    const message = safeCourseError(error, "课程编辑失败，请稍后重试");
    return NextResponse.json({ message }, { status: message.includes("其他用户") ? 409 : message === "课程不存在" ? 404 : 400 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!courseCan(session, "delete")) return NextResponse.json({ message: "暂无课程删除权限" }, { status: 403 });
  const id = (await params).id;
  try {
    const course = await db.course.findFirst({ where: { id, deletedAt: null }, select: { recordNo: true, courseName: true } });
    if (!course) throw new Error("课程不存在");
    const [courseProgress, lessonProgress] = await Promise.all([
      db.courseLearningProgress.count({ where: { courseId: id } }),
      db.courseLessonProgress.count({ where: { lesson: { courseId: id } } }),
    ]);
    if (courseProgress + lessonProgress > 0) throw new Error("该课程已产生学员学习记录，不支持删除，请使用“禁用”操作。");
    const now = new Date();
    await db.$transaction([
      db.course.update({ where: { id }, data: { deletedAt: now, status: "DISABLED", version: { increment: 1 } } }),
      db.courseLesson.updateMany({ where: { courseId: id, deletedAt: null }, data: { deletedAt: now, version: { increment: 1 } } }),
    ]);
    await writeOperationLog({ userId: session.userId, username: session.username, page: "课程管理", action: "删除课程", result: "成功", detail: `逻辑删除课程：${course.recordNo}（${course.courseName}）`, request }).catch(() => undefined);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = safeCourseError(error, "课程删除失败，请稍后重试");
    return NextResponse.json({ message }, { status: message.includes("学习记录") ? 409 : message === "课程不存在" ? 404 : 400 });
  }
}

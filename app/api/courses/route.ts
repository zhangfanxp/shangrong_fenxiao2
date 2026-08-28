import { Prisma, RecordStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { courseCan, courseInclude, courseInputSchema, nextCourseRecordNo, ownedDraft, resolveCoverInput, safeCourseError, serializeCourse, validatedBrands } from "@/lib/course-management";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";

export async function GET(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!courseCan(session, "query")) return NextResponse.json({ message: "暂无课程查询权限" }, { status: 403 });
  const url = new URL(request.url);
  const courseName = (url.searchParams.get("courseName") || "").trim();
  const positionKeyword = (url.searchParams.get("positionKeyword") || "").trim();
  const brand = (url.searchParams.get("brand") || "").trim();
  const statusValue = (url.searchParams.get("status") || "").trim();
  const status = Object.values(RecordStatus).includes(statusValue as RecordStatus) ? statusValue as RecordStatus : undefined;
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(20, Number(url.searchParams.get("pageSize")) || 20));
  const where: Prisma.CourseWhereInput = {
    deletedAt: null,
    ...(courseName ? { courseName: { contains: courseName } } : {}),
    ...(positionKeyword ? { applicablePosition: { contains: positionKeyword } } : {}),
    ...(brand ? { brands: { some: { brandCode: brand } } } : {}),
    ...(status ? { status } : {}),
  };
  try {
    const [total, rows] = await db.$transaction([
      db.course.count({ where }),
      db.course.findMany({ where, include: courseInclude, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    void writeOperationLog({ userId: session.userId, username: session.username, page: "课程管理", action: "筛选课程", result: "成功", detail: `课程名称：${courseName || "全部"}；适用岗位：${positionKeyword || "全部"}；适用品牌：${brand || "全部"}；状态：${status || "全部"}`, request }).catch(() => undefined);
    return NextResponse.json({ rows: rows.map(serializeCourse), total, page, pageSize });
  } catch {
    return NextResponse.json({ message: "课程数据加载失败，请稍后重试" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!courseCan(session, "create")) return NextResponse.json({ message: "暂无课程新增权限" }, { status: 403 });
  const parsed = courseInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0].message }, { status: 400 });
  try {
    if (parsed.data.cover.kind === "EXISTING") throw new Error("封面信息不存在，请重新上传");
    const [cover, brands] = await Promise.all([resolveCoverInput(parsed.data.cover, "COURSE_COVER", null, session.userId), validatedBrands(parsed.data.brandCodes)]);
    const draft = parsed.data.courseDraftId ? await ownedDraft(parsed.data.courseDraftId, session.userId) : null;
    if (parsed.data.courseDraftId && !draft) throw new Error("课程草稿不存在或已失效");
    const lessonCount = draft ? await db.courseLesson.count({ where: { courseDraftId: draft.id, deletedAt: null } }) : 0;
    if (parsed.data.status === "ENABLED" && lessonCount < 1) throw new Error("启用课程至少需要添加一个课时");
    const course = await db.$transaction(async tx => {
      const recordNo = await nextCourseRecordNo(tx);
      const created = await tx.course.create({ data: {
        recordNo, courseName: parsed.data.courseName, courseDescription: parsed.data.courseDescription || null,
        ...cover, applicablePosition: parsed.data.applicablePosition, status: parsed.data.status,
        createdByUserId: session.userId, createdByName: session.realName, brands: { createMany: { data: brands } },
      } });
      if (draft) {
        await tx.courseLesson.updateMany({ where: { courseDraftId: draft.id, deletedAt: null }, data: { courseId: created.id, courseDraftId: null } });
        await tx.courseDraft.delete({ where: { id: draft.id } });
      }
      return tx.course.findUniqueOrThrow({ where: { id: created.id }, include: courseInclude });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 15000 });
    await writeOperationLog({ userId: session.userId, username: session.username, page: "课程管理", action: "新增课程", result: "成功", detail: `课程：${course.recordNo}（${course.courseName}），课时：${lessonCount}个`, request }).catch(() => undefined);
    return NextResponse.json(serializeCourse(course), { status: 201 });
  } catch (error) {
    const message = safeCourseError(error, "课程新增失败，请稍后重试");
    await writeOperationLog({ userId: session.userId, username: session.username, page: "课程管理", action: "新增课程", result: "失败", detail: message, request }).catch(() => undefined);
    return NextResponse.json({ message }, { status: message.includes("其他用户") ? 409 : 400 });
  }
}

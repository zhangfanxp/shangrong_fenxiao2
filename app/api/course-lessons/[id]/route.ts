import { after, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { assetTypeForCourseware, lessonCan, lessonInclude, lessonInputSchema, resolveCoverInput, safeCourseError, serializeLesson } from "@/lib/course-management";
import { verifyConfirmedCourseAsset } from "@/lib/course-r2";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";

async function accessibleLesson(id: string, userId: string) {
  return db.courseLesson.findFirst({ where: { id, deletedAt: null, OR: [{ course: { deletedAt: null } }, { courseDraft: { createdByUserId: userId, expiresAt: { gt: new Date() } } }] }, include: lessonInclude });
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!lessonCan(session, "view")) return NextResponse.json({ message: "暂无课时查看权限" }, { status: 403 });
  const lesson = await accessibleLesson((await params).id, session.userId);
  return lesson ? NextResponse.json(serializeLesson(lesson), { headers: { "Cache-Control": "no-store" } }) : NextResponse.json({ message: "课时不存在" }, { status: 404 });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!lessonCan(session, "edit")) return NextResponse.json({ message: "暂无课时编辑权限" }, { status: 403 });
  const parsed = lessonInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !parsed.data.version) return NextResponse.json({ message: parsed.success ? "缺少课时版本，请刷新后重试" : parsed.error.issues[0].message }, { status: 400 });
  const id = (await params).id;
  try {
    const existing = await accessibleLesson(id, session.userId);
    if (!existing) throw new Error("课时不存在");
    const cover = await resolveCoverInput(parsed.data.cover, "LESSON_COVER", existing, session.userId);
    let fileData = {
      fileR2StorageId: existing.fileR2StorageId, fileObjectKey: existing.fileObjectKey,
      originalFileName: existing.originalFileName, fileSizeBytes: existing.fileSizeBytes, mimeType: existing.mimeType,
    };
    if ("kind" in parsed.data.file) {
      if (parsed.data.coursewareType !== existing.coursewareType) throw new Error("更换课件类型后请重新选择对应格式文件");
    } else {
      const file = await verifyConfirmedCourseAsset(assetTypeForCourseware(parsed.data.coursewareType), parsed.data.file, session.userId, parsed.data.file.uploadProof);
      fileData = { fileR2StorageId: file.r2StorageId, fileObjectKey: file.objectKey, originalFileName: file.originalName, fileSizeBytes: file.size, mimeType: file.mimeType };
    }
    const updated = await db.courseLesson.updateMany({ where: { id, deletedAt: null, version: parsed.data.version }, data: {
      chapterName: parsed.data.chapterName, chapterDescription: parsed.data.chapterDescription || null, ...cover,
      coursewareType: parsed.data.coursewareType, ...fileData, remark: parsed.data.remark || null, version: { increment: 1 },
    } });
    if (updated.count !== 1) throw new Error("当前课时已被其他用户修改，请刷新后重新操作");
    const lesson = await db.courseLesson.findUniqueOrThrow({ where: { id }, include: lessonInclude });
    after(() => writeOperationLog({ userId: session.userId, username: session.username, page: "课程管理", action: "编辑课时", result: "成功", detail: `课时：${lesson.recordNo}（${lesson.chapterName}）`, request }).catch(() => undefined));
    return NextResponse.json(serializeLesson(lesson));
  } catch (error) {
    const message = safeCourseError(error, "课时编辑失败，请稍后重试");
    return NextResponse.json({ message }, { status: message.includes("其他用户") ? 409 : message === "课时不存在" ? 404 : 400 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!lessonCan(session, "delete")) return NextResponse.json({ message: "暂无课时删除权限" }, { status: 403 });
  const id = (await params).id;
  try {
    const lesson = await accessibleLesson(id, session.userId);
    if (!lesson) throw new Error("课时不存在");
    if (await db.courseLessonProgress.count({ where: { lessonId: id } })) throw new Error("该课时已有学员产生学习记录，不支持删除。");
    await db.$transaction(async tx => {
      const parent = lesson.courseId ? { courseId: lesson.courseId } : { courseDraftId: lesson.courseDraftId };
      const minimum = await tx.courseLesson.aggregate({ where: parent, _min: { sortOrder: true } });
      await tx.courseLesson.update({ where: { id }, data: { deletedAt: new Date(), sortOrder: Math.min(-1, (minimum._min.sortOrder || 0) - 1), version: { increment: 1 } } });
    });
    await writeOperationLog({ userId: session.userId, username: session.username, page: "课程管理", action: "删除课时", result: "成功", detail: `课时：${lesson.recordNo}（${lesson.chapterName}）`, request }).catch(() => undefined);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = safeCourseError(error, "课时删除失败，请稍后重试");
    return NextResponse.json({ message }, { status: message.includes("学习记录") ? 409 : message === "课时不存在" ? 404 : 400 });
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { courseCan, lessonCan } from "@/lib/course-management";
import { CourseAssetError, createCourseAssetProof, verifyCourseAsset } from "@/lib/course-r2";

const schema = z.object({
  businessType: z.enum(["COURSE_COVER", "LESSON_COVER", "VIDEO", "AUDIO", "PDF", "PPT"]),
  r2StorageId: z.string().trim().min(1).max(100),
  objectKey: z.string().trim().min(1).max(1024),
  originalName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(100),
  size: z.number().int().positive(),
});

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0].message || "上传确认参数不正确" }, { status: 400 });
  const { businessType, ...asset } = parsed.data;
  const isCourseCover = businessType === "COURSE_COVER";
  if (isCourseCover ? !courseCan(session, "create") && !courseCan(session, "edit") : !lessonCan(session, "create") && !lessonCan(session, "edit")) {
    return NextResponse.json({ message: "暂无课程资源上传权限" }, { status: 403 });
  }
  try {
    const confirmed = await verifyCourseAsset(businessType, asset);
    const uploadProof = await createCourseAssetProof(businessType, confirmed, session.userId);
    return NextResponse.json({ ...confirmed, uploadProof }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ message: error instanceof CourseAssetError ? error.message : "未能确认课程资源上传结果，请重新上传" }, { status: 400 });
  }
}

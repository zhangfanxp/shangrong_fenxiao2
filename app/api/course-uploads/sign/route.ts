import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { courseCan, lessonCan } from "@/lib/course-management";
import { CourseAssetError, createCourseAssetUpload } from "@/lib/course-r2";

const schema = z.object({
  businessType: z.enum(["COURSE_COVER", "LESSON_COVER", "VIDEO", "AUDIO", "PDF", "PPT"]),
  fileName: z.string().trim().min(1).max(255), fileSize: z.number().int().positive(), mimeType: z.string().trim().min(1).max(100),
});

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0].message || "上传参数不正确" }, { status: 400 });
  const isCourseCover = parsed.data.businessType === "COURSE_COVER";
  if (isCourseCover ? !courseCan(session, "create") && !courseCan(session, "edit") : !lessonCan(session, "create") && !lessonCan(session, "edit")) {
    return NextResponse.json({ message: "暂无课程资源上传权限" }, { status: 403 });
  }
  try {
    return NextResponse.json(await createCourseAssetUpload(parsed.data.businessType, { name: parsed.data.fileName, type: parsed.data.mimeType, size: parsed.data.fileSize }), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ message: error instanceof CourseAssetError ? error.message : "生成课件上传地址失败，请稍后重试" }, { status: 400 });
  }
}

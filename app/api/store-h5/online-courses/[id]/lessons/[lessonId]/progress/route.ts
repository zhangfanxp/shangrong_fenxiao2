import { NextResponse } from "next/server";
import { lessonProgressResponse } from "@/lib/mobile-online-course-responses";
import { getStoreH5Session } from "@/lib/store-h5-auth";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; lessonId: string }> }) {
  const session = await getStoreH5Session("store-h5:courses:learn");
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  const { id, lessonId } = await params;
  return lessonProgressResponse(request, id, lessonId, session, "门店员工移动端");
}

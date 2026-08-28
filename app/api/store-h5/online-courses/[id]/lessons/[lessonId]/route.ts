import { NextResponse } from "next/server";
import { lessonDetailResponse } from "@/lib/mobile-online-course-responses";
import { getStoreH5Session } from "@/lib/store-h5-auth";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; lessonId: string }> }) {
  const session = await getStoreH5Session();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  const { id, lessonId } = await params;
  return lessonDetailResponse(id, lessonId, session, "store-h5");
}


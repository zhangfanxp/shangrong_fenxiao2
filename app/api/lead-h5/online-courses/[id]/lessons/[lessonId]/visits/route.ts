import { NextResponse } from "next/server";
import { getLeadH5Session } from "@/lib/lead-h5-auth";
import { lessonVisitResponse } from "@/lib/mobile-online-course-responses";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; lessonId: string }> }) {
  const session = await getLeadH5Session("lead-h5:courses:learn");
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  const { id, lessonId } = await params;
  return lessonVisitResponse(request, id, lessonId, session, "lead-h5");
}

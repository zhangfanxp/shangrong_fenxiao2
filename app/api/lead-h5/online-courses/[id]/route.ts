import { NextResponse } from "next/server";
import { getLeadH5Session } from "@/lib/lead-h5-auth";
import { courseDetailResponse } from "@/lib/mobile-online-course-responses";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getLeadH5Session();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  return courseDetailResponse((await params).id, session, "lead-h5");
}


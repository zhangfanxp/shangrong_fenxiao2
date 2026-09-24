import { NextResponse } from "next/server";
import { getLeadH5Session } from "@/lib/lead-h5-auth";
import { courseListResponse } from "@/lib/mobile-online-course-responses";

export async function GET() {
  const session = await getLeadH5Session("lead-h5:courses:query");
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  return courseListResponse(session, "lead-h5");
}

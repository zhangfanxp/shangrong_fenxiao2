import { NextResponse } from "next/server";
import { getLeadH5Session } from "@/lib/lead-h5-auth";
import { courseFileResponse } from "@/lib/mobile-online-course-responses";

export async function GET(request: Request) {
  const kind = new URL(request.url).searchParams.get("kind");
  const session = await getLeadH5Session(kind === "file" ? "lead-h5:courses:download" : ["lead-h5:courses:query", "lead-h5:courses:view"]);
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  return courseFileResponse(request, session);
}

import { NextResponse } from "next/server";
import { courseListResponse } from "@/lib/mobile-online-course-responses";
import { getStoreH5Session } from "@/lib/store-h5-auth";

export async function GET() {
  const session = await getStoreH5Session("store-h5:courses:query");
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  return courseListResponse(session, "store-h5");
}

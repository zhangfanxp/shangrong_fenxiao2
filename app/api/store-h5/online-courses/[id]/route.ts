import { NextResponse } from "next/server";
import { courseDetailResponse } from "@/lib/mobile-online-course-responses";
import { getStoreH5Session } from "@/lib/store-h5-auth";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getStoreH5Session("store-h5:courses:view");
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  return courseDetailResponse((await params).id, session, "store-h5");
}

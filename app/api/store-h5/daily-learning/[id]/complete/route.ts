import { NextResponse } from "next/server";
import { getStoreH5Session } from "@/lib/store-h5-auth";

export async function POST() {
  const session = await getStoreH5Session();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  return NextResponse.json({ message: "每日学习需完成录音并上传后才能提交" }, { status: 409 });
}

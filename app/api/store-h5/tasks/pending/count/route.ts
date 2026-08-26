import { NextResponse } from "next/server";
import { getStoreH5Session } from "@/lib/store-h5-auth";
import { countPendingStoreTaskInstances } from "@/lib/store-h5-tasks";

export async function GET() {
  const session = await getStoreH5Session();
  if (!session) return NextResponse.json({ message: "当前账号已无门店H5使用权限，请重新登录或联系管理员" }, { status: 401 });
  try {
    const count = await countPendingStoreTaskInstances(session.userId);
    return NextResponse.json({ count }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ message: "待完成任务数量加载失败，请稍后重试" }, { status: 500 });
  }
}

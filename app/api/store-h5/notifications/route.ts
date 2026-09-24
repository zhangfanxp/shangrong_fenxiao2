import { NextResponse } from "next/server";
import { getStoreH5Session } from "@/lib/store-h5-auth";
import { currentUserNotifications } from "@/lib/notifications";

export async function GET(request: Request) {
  const session = await getStoreH5Session("store-h5:notifications:view");
  if (!session) return NextResponse.json({ message: "当前账号已无门店H5使用权限，请重新登录" }, { status: 401 });
  const page = Math.max(1, Number(new URL(request.url).searchParams.get("page")) || 1);
  return NextResponse.json(await currentUserNotifications(session.userId, page, 20), { headers: { "Cache-Control": "no-store" } });
}

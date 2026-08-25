import { NextResponse } from "next/server";
import { getStoreH5Session } from "@/lib/store-h5-auth";
import { pendingLoginNotifications } from "@/lib/notifications";

export async function GET() {
  const session = await getStoreH5Session();
  if (!session) return NextResponse.json({ message: "当前账号已无门店H5使用权限，请重新登录" }, { status: 401 });
  return NextResponse.json({ rows: await pendingLoginNotifications(session.userId) }, { headers: { "Cache-Control": "no-store" } });
}

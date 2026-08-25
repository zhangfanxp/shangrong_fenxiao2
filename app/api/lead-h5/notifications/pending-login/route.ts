import { NextResponse } from "next/server";
import { getLeadH5Session } from "@/lib/lead-h5-auth";
import { pendingLoginNotifications } from "@/lib/notifications";

export async function GET() {
  const session = await getLeadH5Session();
  if (!session) return NextResponse.json({ message: "当前账号已无运营H5使用权限，请重新登录" }, { status: 401 });
  return NextResponse.json({ rows: await pendingLoginNotifications(session.userId) }, { headers: { "Cache-Control": "no-store" } });
}

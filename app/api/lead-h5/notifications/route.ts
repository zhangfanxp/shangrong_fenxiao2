import { NextResponse } from "next/server";
import { getLeadH5Session } from "@/lib/lead-h5-auth";
import { currentUserNotifications } from "@/lib/notifications";

export async function GET(request: Request) {
  const session = await getLeadH5Session();
  if (!session) return NextResponse.json({ message: "当前账号已无运营H5使用权限，请重新登录" }, { status: 401 });
  const page = Math.max(1, Number(new URL(request.url).searchParams.get("page")) || 1);
  return NextResponse.json(await currentUserNotifications(session.userId, page, 20), { headers: { "Cache-Control": "no-store" } });
}

import { NextResponse } from "next/server";
import { getLeadH5Session } from "@/lib/lead-h5-auth";
import { acknowledgeLoginNotification } from "@/lib/notifications";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getLeadH5Session();
  if (!session) return NextResponse.json({ message: "当前账号已无运营H5使用权限，请重新登录" }, { status: 401 });
  const { id } = await params;
  if (!id || !await acknowledgeLoginNotification(session.userId, id)) return NextResponse.json({ message: "通知不存在、尚未发布或已无权操作" }, { status: 404 });
  return NextResponse.json({ acknowledged: true });
}

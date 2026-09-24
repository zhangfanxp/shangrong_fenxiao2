import { NextResponse } from "next/server";
import { getStoreH5Session } from "@/lib/store-h5-auth";
import { acknowledgeLoginNotification } from "@/lib/notifications";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getStoreH5Session("store-h5:notifications:read");
  if (!session) return NextResponse.json({ message: "当前账号已无门店H5使用权限，请重新登录" }, { status: 401 });
  const { id } = await params;
  if (!id || !await acknowledgeLoginNotification(session.userId, id)) return NextResponse.json({ message: "通知不存在、尚未发布或已无权操作" }, { status: 404 });
  return NextResponse.json({ acknowledged: true });
}

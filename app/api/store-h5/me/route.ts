import { NextResponse } from "next/server";
import { getStoreH5Session } from "@/lib/store-h5-auth";

export async function GET() {
  const session = await getStoreH5Session();
  if (!session) return NextResponse.json({ message: "当前账号已无门店H5使用权限，请重新登录或联系管理员" }, { status: 401 });
  return NextResponse.json({
    userId: session.userId, username: session.username, realName: session.realName,
    role: session.roleName, labels: session.labels, storeId: session.storeId,
    storeName: session.storeName, brandId: session.brandId, brand: session.brandName,
    stores: session.stores,
  });
}

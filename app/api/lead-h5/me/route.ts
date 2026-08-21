import { NextResponse } from "next/server";
import { getLeadH5Session } from "@/lib/lead-h5-auth";
import { reviewDataScopeInfo } from "@/lib/lead-h5-reviews";

export async function GET() {
  const session = await getLeadH5Session();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  const scope = reviewDataScopeInfo(session);
  return NextResponse.json({
    userId: session.userId, username: session.username, realName: session.realName, h5Access: true,
    brandPermissionIds: scope.all || !scope.brandIds.length ? null : scope.brandIds,
    storePermissionIds: scope.all || !scope.storeIds.length ? null : scope.storeIds,
  });
}

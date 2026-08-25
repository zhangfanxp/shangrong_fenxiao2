import { NextResponse } from "next/server";
import { getStoreH5Session, storeH5SessionCookie } from "@/lib/store-h5-auth";
import { writeOperationLog } from "@/lib/operation-log";

export async function POST(request: Request) {
  const session = await getStoreH5Session();
  if (session) await writeOperationLog({ userId: session.userId, username: session.username, client: "门店员工移动端", page: "首页", action: "退出", result: "成功", detail: "退出门店H5移动端", request }).catch(() => undefined);
  const response = NextResponse.json({ message: "已退出登录" });
  response.cookies.set(storeH5SessionCookie.name, "", { ...storeH5SessionCookie.options, maxAge: 0 });
  return response;
}

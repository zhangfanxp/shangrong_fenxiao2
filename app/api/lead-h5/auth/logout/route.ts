import { NextResponse } from "next/server";
import { getLeadH5Session, leadH5SessionCookie } from "@/lib/lead-h5-auth";
import { writeOperationLog } from "@/lib/operation-log";

export async function POST(request: Request) {
  const session = await getLeadH5Session();
  if (session) await writeOperationLog({ userId: session.userId, username: session.username, client: "运营移动端", page: "首页", action: "退出登录", result: "成功", detail: "退出运营H5移动端", request }).catch(() => undefined);
  const response = NextResponse.json({ message: "已退出登录" });
  response.cookies.set(leadH5SessionCookie.name, "", { ...leadH5SessionCookie.options, maxAge: 0 });
  return response;
}


import { NextResponse } from "next/server";
import { getSession, sessionCookie } from "@/lib/auth";
import { writeOperationLog } from "@/lib/operation-log";

export async function POST(request: Request) {
  const session = await getSession();
  if (session) await writeOperationLog({ userId: session.userId, username: session.username, page: "登录页面", action: "退出登录", result: "成功", detail: "退出运营管理PC端", request }).catch(() => undefined);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(sessionCookie.name, "", { ...sessionCookie.options, maxAge: 0 });
  return response;
}

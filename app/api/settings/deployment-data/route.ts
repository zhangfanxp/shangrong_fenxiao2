import { NextResponse } from "next/server";
import { requireApiSession, sessionHasPermission } from "@/lib/auth";
import { getDeploymentDataOverview } from "@/lib/deployment-data-package";

export const runtime = "nodejs";

export async function GET() {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!sessionHasPermission(session, "*")) return NextResponse.json({ message: "仅超级管理员可以访问资料迁移功能" }, { status: 403 });
  try {
    return NextResponse.json(await getDeploymentDataOverview(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ message: "读取可迁移资料失败，请检查数据库和本地配置文件" }, { status: 500 });
  }
}

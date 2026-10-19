import { NextResponse } from "next/server";
import { requireApiSession, sessionHasPermission } from "@/lib/auth";
import { createEncryptedDeploymentPackage } from "@/lib/deployment-data-package";
import { writeOperationLog } from "@/lib/operation-log";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!sessionHasPermission(session, "*")) return NextResponse.json({ message: "仅超级管理员可以导出资料包" }, { status: 403 });
  const body = await request.json().catch(() => null) as { password?: unknown } | null;
  if (typeof body?.password !== "string") return NextResponse.json({ message: "请输入资料包加密口令" }, { status: 400 });
  try {
    const file = await createEncryptedDeploymentPackage(body.password);
    await writeOperationLog({ userId: session.userId, username: session.username, page: "数据导入导出", action: "导出资料包", result: "成功", detail: `导出加密基础资料包（${file.byteLength}字节）`, request }).catch(() => undefined);
    return new NextResponse(new Uint8Array(file), { status: 200, headers: { "Content-Type": "application/vnd.canyin.reference-data-package+json", "Content-Disposition": `attachment; filename="canyin-reference-data-${new Date().toISOString().slice(0, 10)}.cspkg"`, "Cache-Control": "no-store", "Content-Length": String(file.byteLength) } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "资料包导出失败，请检查模板配置和R2密钥配置";
    await writeOperationLog({ userId: session.userId, username: session.username, page: "数据导入导出", action: "导出资料包", result: "失败", detail: message, request }).catch(() => undefined);
    return NextResponse.json({ message }, { status: 400 });
  }
}

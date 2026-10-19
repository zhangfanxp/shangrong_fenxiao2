import { NextResponse } from "next/server";
import { requireApiSession, sessionHasPermission } from "@/lib/auth";
import { decryptAndValidateDeploymentPackage, getDeploymentPackagePreview, importDeploymentDataPackage } from "@/lib/deployment-data-package";
import { writeOperationLog } from "@/lib/operation-log";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!sessionHasPermission(session, "*")) return NextResponse.json({ message: "仅超级管理员可以导入资料包" }, { status: 403 });
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 50 * 1024 * 1024) return NextResponse.json({ message: "资料包超过50MB限制" }, { status: 413 });
  try {
    const form = await request.formData();
    const action = String(form.get("action") || "preview");
    const password = form.get("password");
    const file = form.get("file");
    if (!(file instanceof File) || typeof password !== "string") return NextResponse.json({ message: "请上传资料包并输入解密口令" }, { status: 400 });
    const packageObject = decryptAndValidateDeploymentPackage(Buffer.from(await file.arrayBuffer()), password);
    if (action === "preview") return NextResponse.json(getDeploymentPackagePreview(packageObject), { headers: { "Cache-Control": "no-store" } });
    if (action !== "import") return NextResponse.json({ message: "不支持的导入操作" }, { status: 400 });
    const result = await importDeploymentDataPackage(packageObject, { userId: session.userId, username: session.username, realName: session.realName });
    return NextResponse.json({ message: "资料包导入完成", result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "资料包导入失败，请检查文件、口令及目标数据库状态";
    await writeOperationLog({ userId: session.userId, username: session.username, page: "数据导入导出", action: "导入资料包", result: "失败", detail: message, request }).catch(() => undefined);
    return NextResponse.json({ message }, { status: 400 });
  }
}

import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";
import { r2ErrorResponse } from "@/lib/r2-api";
import { canR2Storage } from "@/lib/r2-permissions";
import { R2StorageTestError, testR2Storage } from "@/lib/r2-storage-test";

export const maxDuration = 30;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canR2Storage(session, "test")) return NextResponse.json({ message: "暂无此操作权限" }, { status: 403 });
  const { id } = await params;
  try {
    const result = await testR2Storage(id, session.userId);
    await writeOperationLog({ userId: session.userId, username: session.username, page: "R2存储空间", action: "测试", result: "成功", detail: `R2测试文件写入并读取成功：${result.fileName}`, request }).catch(() => undefined);
    return NextResponse.json({ message: "R2存储桶连接正常，数据已成功写入并读取", fileName: result.fileName });
  } catch (error) {
    const detail = error instanceof R2StorageTestError ? `R2测试失败：${error.code}` : "R2测试失败：系统异常";
    await writeOperationLog({ userId: session.userId, username: session.username, page: "R2存储空间", action: "测试", result: "失败", detail, request }).catch(() => undefined);
    if (error instanceof R2StorageTestError) return NextResponse.json({ message: error.message }, { status: error.code === "disabled" ? 409 : 400 });
    return r2ErrorResponse(error, "R2测试文件上传失败，请检查当前R2配置后重试");
  }
}

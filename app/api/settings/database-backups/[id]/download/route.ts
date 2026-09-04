import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { databaseBackupErrorResponse } from "@/lib/database-backup-api";
import { createDatabaseBackupDownloadUrl } from "@/lib/database-backup";
import { canDatabaseBackup } from "@/lib/database-backup-permissions";
import { writeOperationLog } from "@/lib/operation-log";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canDatabaseBackup(session, "download")) return NextResponse.json({ message: "暂无备份文件下载权限" }, { status: 403 });
  const { id } = await params;
  try {
    const url = await createDatabaseBackupDownloadUrl(id);
    await writeOperationLog({ userId: session.userId, username: session.username, page: "数据库备份", action: "下载", result: "成功", detail: `下载备份文件：${id}`, request }).catch(() => undefined);
    return NextResponse.redirect(url, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    await writeOperationLog({ userId: session.userId, username: session.username, page: "数据库备份", action: "下载", result: "失败", detail: `备份文件下载失败：${id}`, request }).catch(() => undefined);
    return databaseBackupErrorResponse(error, "备份文件下载失败，请稍后重试");
  }
}

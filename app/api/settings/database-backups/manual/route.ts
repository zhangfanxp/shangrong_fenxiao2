import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { databaseBackupErrorResponse } from "@/lib/database-backup-api";
import { executeDatabaseBackup } from "@/lib/database-backup";
import { canDatabaseBackup } from "@/lib/database-backup-permissions";
import { manualDatabaseBackupSchema } from "@/lib/database-backup-validation";
import { writeOperationLog } from "@/lib/operation-log";

export const maxDuration = 3600;

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canDatabaseBackup(session, "manual")) return NextResponse.json({ message: "暂无手动备份权限" }, { status: 403 });
  const parsed = manualDatabaseBackupSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0].message }, { status: 400 });
  try {
    const backup = await executeDatabaseBackup({
      r2StorageId: parsed.data.r2StorageId, backupType: "MANUAL",
      createdByUserId: session.userId, createdByName: session.realName,
    });
    await writeOperationLog({
      userId: session.userId, username: session.username, page: "数据库备份", action: "手动备份", result: "成功", request,
      detail: `全量备份：${backup.fileName}；大小：${backup.sizeBytes}字节；SHA-256：${backup.checksumSha256}`,
    }).catch(() => undefined);
    return NextResponse.json({ message: "数据库全量备份完成并已上传至R2", backup }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    await writeOperationLog({
      userId: session.userId, username: session.username, page: "数据库备份", action: "手动备份", result: "失败", request,
      detail: error instanceof Error ? error.message : "数据库备份失败",
    }).catch(() => undefined);
    return databaseBackupErrorResponse(error);
  }
}

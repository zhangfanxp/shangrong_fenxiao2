import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { canDatabaseBackup } from "@/lib/database-backup-permissions";
import { databaseBackupErrorResponse } from "@/lib/database-backup-api";
import { deleteDatabaseBackups, getDatabaseBackupSetting, saveDatabaseBackupSetting, serializeDatabaseBackupFile, serializeDatabaseBackupSetting } from "@/lib/database-backup";
import { databaseBackupSettingSchema, deleteDatabaseBackupsSchema } from "@/lib/database-backup-validation";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";

const noStoreHeaders = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canDatabaseBackup(session, "query")) return NextResponse.json({ message: "暂无数据库备份查询权限" }, { status: 403 });
  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(10, Number(url.searchParams.get("pageSize")) || 10));
  try {
    const [setting, r2Storages, total, rows] = await Promise.all([
      getDatabaseBackupSetting(),
      db.r2StorageConfig.findMany({
        where: { status: "ENABLED", deletedAt: null }, select: { id: true, name: true, bucketName: true },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      }),
      db.databaseBackupFile.count(),
      db.databaseBackupFile.findMany({
        select: {
          id: true, fileName: true, r2StorageId: true, r2StorageNameSnapshot: true, bucketNameSnapshot: true,
          backupType: true, status: true, sizeBytes: true, checksumSha256: true, durationSeconds: true,
          errorMessage: true, createdByName: true, startedAt: true, completedAt: true,
        },
        orderBy: [{ startedAt: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize,
      }),
    ]);
    const serializedSetting = serializeDatabaseBackupSetting(setting);
    const selectedR2Unavailable = Boolean(serializedSetting.r2StorageId && !r2Storages.some(item => item.id === serializedSetting.r2StorageId));
    return NextResponse.json({
      setting: { ...serializedSetting, ...(selectedR2Unavailable ? { r2StorageId: null } : {}) },
      selectedR2Unavailable,
      r2Storages: r2Storages.map(item => ({ value: item.id, label: `${item.name}（${item.bucketName}）` })),
      rows: rows.map(serializeDatabaseBackupFile), total, page, pageSize,
    }, { headers: noStoreHeaders });
  } catch (error) {
    return databaseBackupErrorResponse(error, "数据库备份数据加载失败，请稍后重试");
  }
}

export async function PUT(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canDatabaseBackup(session, "configure")) return NextResponse.json({ message: "暂无定时备份设置权限" }, { status: 403 });
  const parsed = databaseBackupSettingSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0].message }, { status: 400 });
  try {
    const setting = await saveDatabaseBackupSetting({ ...parsed.data, userId: session.userId, userName: session.realName });
    await writeOperationLog({
      userId: session.userId, username: session.username, page: "数据库备份", action: "保存定时备份设置", result: "成功", request,
      detail: `${parsed.data.enabled ? "开启" : "关闭"}定时备份；频率：${parsed.data.frequency === "DAILY" ? "每日" : "每周"}；执行时间：${parsed.data.executionTimes.join("、")}`,
    }).catch(() => undefined);
    return NextResponse.json({ message: "定时备份设置保存成功", setting: serializeDatabaseBackupSetting(setting) }, { headers: noStoreHeaders });
  } catch (error) {
    await writeOperationLog({ userId: session.userId, username: session.username, page: "数据库备份", action: "保存定时备份设置", result: "失败", detail: "定时备份设置保存失败", request }).catch(() => undefined);
    return databaseBackupErrorResponse(error, "定时备份设置保存失败，请稍后重试");
  }
}

export async function DELETE(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canDatabaseBackup(session, "delete")) return NextResponse.json({ message: "暂无备份文件删除权限" }, { status: 403 });
  const parsed = deleteDatabaseBackupsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0].message }, { status: 400 });
  try {
    const result = await deleteDatabaseBackups(parsed.data.ids);
    await writeOperationLog({
      userId: session.userId, username: session.username, page: "数据库备份", action: result.deleted > 1 ? "批量删除" : "删除", result: "成功", request,
      detail: `已从R2永久删除${result.deleted}个数据库备份文件`,
    }).catch(() => undefined);
    return NextResponse.json({ message: `已删除${result.deleted}个备份文件`, ...result }, { headers: noStoreHeaders });
  } catch (error) {
    await writeOperationLog({ userId: session.userId, username: session.username, page: "数据库备份", action: parsed.data.ids.length > 1 ? "批量删除" : "删除", result: "失败", detail: "备份文件删除失败", request }).catch(() => undefined);
    return databaseBackupErrorResponse(error, "备份文件删除失败，请稍后重试");
  }
}

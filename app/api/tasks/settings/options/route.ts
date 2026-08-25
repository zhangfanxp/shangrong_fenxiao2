import { RecordStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiSession, sessionHasPermission } from "@/lib/auth";
import { getPlatformConfig } from "@/lib/platform-config";

export async function GET() {
  const session = await requireApiSession(); if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!sessionHasPermission(session, "tasks:settings:view")) return NextResponse.json({ message: "暂无任务设置权限" }, { status: 403 });
  const [roles, brands, r2Storages, platform] = await Promise.all([
    db.role.findMany({ where: { status: RecordStatus.ENABLED }, select: { id: true, name: true }, orderBy: { createdAt: "asc" } }),
    db.brand.findMany({ where: { status: RecordStatus.ENABLED }, select: { id: true, name: true }, orderBy: { code: "asc" } }),
    db.r2StorageConfig.findMany({ where: { status: RecordStatus.ENABLED, deletedAt: null }, select: { id: true, name: true }, orderBy: { createdAt: "desc" } }),
    getPlatformConfig(),
  ]);
  return NextResponse.json({ roles, brands, r2Storages, taskDefaults: { deadlineDayOffset: platform.defaultTaskDeadlineDayOffset, deadlineTime: platform.defaultTaskDeadlineTime } });
}

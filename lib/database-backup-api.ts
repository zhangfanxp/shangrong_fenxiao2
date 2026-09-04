import { NextResponse } from "next/server";
import { DatabaseBackupError } from "@/lib/database-backup";
import { R2ConfigError } from "@/lib/r2-config-service";

export function databaseBackupErrorResponse(error: unknown, fallback = "数据库备份操作失败，请稍后重试") {
  if (error instanceof DatabaseBackupError) {
    const status = error.code === "not-found" ? 404 : error.code === "busy" || error.code === "duplicate" || error.code === "running" ? 409 : error.code === "invalid" ? 400 : 500;
    return NextResponse.json({ message: error.message }, { status });
  }
  if (error instanceof R2ConfigError) {
    const status = error.code === "not-found" || error.code === "incomplete" ? 400 : error.code === "file" ? 500 : 409;
    return NextResponse.json({ message: error.message }, { status });
  }
  return NextResponse.json({ message: fallback }, { status: 500 });
}

import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getPlatformConfig } from "@/lib/platform-config";

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = performance.now();
  try {
    const [database, platform, packageDocument] = await Promise.all([
      db.$queryRaw<Array<{ ok: number | bigint }>>`SELECT 1 AS ok`,
      getPlatformConfig(),
      readFile(path.join(process.cwd(), "package.json"), "utf8").then(value => JSON.parse(value) as { version?: string }),
    ]);
    const databaseAvailable = Number(database[0]?.ok) === 1;
    return NextResponse.json({
      status: databaseAvailable ? "ok" : "degraded",
      database: databaseAvailable,
      platformName: platform.platformName,
      version: packageDocument.version || "unknown",
      uptimeSeconds: Math.floor(process.uptime()),
      responseTimeMs: Number((performance.now() - startedAt).toFixed(1)),
    }, { status: databaseAvailable ? 200 : 503, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ status: "unavailable", database: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { canDatabaseBackup } from "@/lib/database-backup-permissions";
import { readDatabaseDictionary } from "@/lib/database-dictionary";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canDatabaseBackup(session, "query")) return NextResponse.json({ message: "暂无数据库数据字典查看权限" }, { status: 403 });
  try {
    return NextResponse.json(await readDatabaseDictionary(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "未知错误";
    return NextResponse.json({ message: `数据库数据字典读取失败：${detail}` }, { status: 500 });
  }
}

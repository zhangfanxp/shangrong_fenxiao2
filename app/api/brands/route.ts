import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiSession, sessionHasPermission } from "@/lib/auth";
import { getBusinessDictionaryOptions } from "@/lib/business-dictionaries";

export async function GET() {
  const session = await requireApiSession(); if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!sessionHasPermission(session, ["stores:contracts:view", "stores:list:view", "tasks:settings:view"])) return NextResponse.json({ message: "暂无品牌数据访问权限" }, { status: 403 });
  try {
    const configured = await getBusinessDictionaryOptions("BRAND");
    const names = configured.map(option => option.label);
    const rows = await db.brand.findMany({ where: { status: "ENABLED", name: { in: names } }, orderBy: { code: "asc" } });
    const byName = new Map(rows.map(row => [row.name, row]));
    return NextResponse.json(configured.flatMap(option => byName.get(option.label) ? [byName.get(option.label)] : []));
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "品牌数据字典加载失败" }, { status: 500 });
  }
}

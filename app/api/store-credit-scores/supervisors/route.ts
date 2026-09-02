import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { canStoreCreditScore } from "@/lib/store-credit-scores";

export async function GET() {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canStoreCreditScore(session, "query")) return NextResponse.json({ message: "暂无门店信用得分查询权限" }, { status: 403 });
  try {
    const users = await db.user.findMany({
      where: { status: "ENABLED", tags: { contains: "督导" } },
      select: { id: true, realName: true, tags: true },
      orderBy: [{ realName: "asc" }, { id: "asc" }],
      take: 1000,
    });
    return NextResponse.json(users
      .filter(user => user.tags?.split(/[|｜]/).map(tag => tag.trim()).includes("督导"))
      .map(user => ({ userId: user.id, realName: user.realName })));
  } catch {
    return NextResponse.json({ message: "考核督导数据加载失败，请稍后重试" }, { status: 500 });
  }
}

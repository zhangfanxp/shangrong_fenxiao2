import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { resolveStoreRegionManager } from "@/lib/store-supervisor";
import { canStoreListAction } from "@/lib/store-permissions";

export async function GET(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!["query", "create", "edit", "view"].some(action => canStoreListAction(session.permissions, action as "query" | "create" | "edit" | "view"))) return NextResponse.json({ message: "暂无门店区域查看权限" }, { status: 403 });

  const region = new URL(request.url).searchParams.get("region")?.trim();
  if (!region) return NextResponse.json({ userId: null, realName: null });
  const manager = await resolveStoreRegionManager(region);
  return NextResponse.json(
    { userId: manager?.id || null, realName: manager?.realName || null },
    { headers: { "Cache-Control": "no-store" } },
  );
}

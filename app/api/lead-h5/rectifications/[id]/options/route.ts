import { NextResponse } from "next/server";
import { getLeadH5Session } from "@/lib/lead-h5-auth";
import { ownedRectification, rectificationOptions, RectificationError } from "@/lib/inspection-rectifications";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getLeadH5Session("lead-h5:rectifications:view");
  if (!session) return NextResponse.json({ message: "登录状态已失效或暂无巡检整改查看权限" }, { status: 401 });
  try {
    const row = await ownedRectification((await params).id, session.userId);
    return NextResponse.json(await rectificationOptions(row, (new URL(request.url).searchParams.get("q") || "").slice(0, 100)), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return NextResponse.json({ message: error instanceof RectificationError ? error.message : "人员选项加载失败，请稍后重试" }, { status: error instanceof RectificationError ? error.status : 500 }); }
}

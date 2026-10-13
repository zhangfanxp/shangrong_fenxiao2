import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { canLaborRecord, laborRecordBrandOptions } from "@/lib/labor-records";

export async function GET() {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canLaborRecord(session, "query")) return NextResponse.json({ message: "暂无用工记录查询权限" }, { status: 403 });
  try {
    return NextResponse.json({ brands: await laborRecordBrandOptions(session) }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "品牌数据加载失败，请稍后重试" }, { status: 500 });
  }
}

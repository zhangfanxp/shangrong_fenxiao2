import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { dailySalesReportDataScope, loadDailySalesReportSource } from "@/lib/daily-sales-report";
import { canOnlineGroupBuy, onlineGroupBuyFilterWhere, onlineGroupBuySourceWhere } from "@/lib/online-group-buy";
import { db } from "@/lib/db";

const querySchema = z.object({
  keyword: z.string().trim().min(1, "请输入门店关键词").max(100, "门店名称不能超过100个字符"),
  brand: z.string().trim().max(100).default(""),
});

export async function GET(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canOnlineGroupBuy(session, "query")) return NextResponse.json({ message: "暂无线上团购数据查询权限" }, { status: 403 });
  const search = new URL(request.url).searchParams;
  const parsed = querySchema.safeParse({ keyword: search.get("keyword") || "", brand: search.get("brand") || "" });
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message || "门店关键词不正确" }, { status: 400 });
  try {
    const source = await loadDailySalesReportSource();
    const filters = { brand: parsed.data.brand, storeName: "", storeNameKeyword: parsed.data.keyword, startDate: "", endDate: "" };
    const where = { AND: [onlineGroupBuySourceWhere(source), await dailySalesReportDataScope(session), onlineGroupBuyFilterWhere(filters)] };
    const rows = await db.taskSubmission.groupBy({
      by: ["storeNameSnapshot"],
      where,
      orderBy: { storeNameSnapshot: "asc" },
      take: 20,
    });
    return NextResponse.json({ stores: rows.map(row => row.storeNameSnapshot) }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "门店名称加载失败，请稍后重试" }, { status: 500 });
  }
}

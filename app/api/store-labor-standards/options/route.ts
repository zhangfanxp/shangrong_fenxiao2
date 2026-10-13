import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { getBusinessDictionaryOptions } from "@/lib/business-dictionaries";
import { db } from "@/lib/db";
import { STORE_LABOR_METRIC_LABELS, canUseStoreLaborStandards } from "@/lib/store-labor-standards";

export async function GET(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!["query", "create", "edit"].some(action => canUseStoreLaborStandards(session, action as "query" | "create" | "edit"))) {
    return NextResponse.json({ message: "暂无门店用工标准访问权限" }, { status: 403 });
  }
  try {
    const excludeId = new URL(request.url).searchParams.get("excludeId")?.trim();
    const [brands, configuredMetrics] = await Promise.all([
      getBusinessDictionaryOptions("BRAND"),
      db.storeLaborStandard.findMany({
        where: excludeId ? { id: { not: excludeId } } : undefined,
        distinct: ["brandValue"],
        select: { brandValue: true, assessmentMetric: true },
      }),
    ]);
    return NextResponse.json({
      brands,
      metrics: Object.entries(STORE_LABOR_METRIC_LABELS).map(([value, label]) => ({ value, label })),
      configuredMetrics: Object.fromEntries(configuredMetrics.map(row => [row.brandValue, row.assessmentMetric])),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "品牌数据加载失败，请稍后重试" }, { status: 500 });
  }
}

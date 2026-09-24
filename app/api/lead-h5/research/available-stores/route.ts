import { NextResponse } from "next/server";
import { getLeadH5Session } from "@/lib/lead-h5-auth";
import { STORE_RESEARCH_TYPE, validResearchMonth } from "@/lib/lead-h5-research";
import { leadH5StoreDataScope } from "@/lib/lead-h5-store-scope";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";

export async function GET(request: Request) {
  const session = await getLeadH5Session("lead-h5:store-research:view");
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  const researchMonth = new URL(request.url).searchParams.get("researchMonth") || "";
  if (!validResearchMonth(researchMonth)) return NextResponse.json({ message: "调研月份无效" }, { status: 400 });
  try {
    const stores = await db.store.findMany({
      where: {
        ...leadH5StoreDataScope(session),
        operationStatus: { not: "CLOSED" },
        brand: { status: "ENABLED" },
        leadH5ResearchRecords: { none: { researchMonth, templateType: STORE_RESEARCH_TYPE, status: "SUBMITTED" } },
      },
      select: { id: true, name: true, recordNo: true, brand: { select: { id: true, name: true } } },
      orderBy: [{ brand: { name: "asc" } }, { name: "asc" }],
    });
    await writeOperationLog({
      userId: session.userId,
      username: session.username,
      client: "运营移动端",
      page: "门店调研表",
      action: "筛选调研月份",
      result: "成功",
      detail: `调研月份：${researchMonth}；待调研门店：${stores.length}家`,
      request,
    }).catch(() => undefined);
    return NextResponse.json({ stores });
  } catch {
    return NextResponse.json({ message: "店铺数据加载失败，请稍后重试" }, { status: 500 });
  }
}

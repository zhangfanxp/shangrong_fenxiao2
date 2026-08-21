import { NextResponse } from "next/server";
import { getLeadH5Session } from "@/lib/lead-h5-auth";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";
import { getReviewDefinition, reviewDataScope, validReviewMonth } from "@/lib/lead-h5-reviews";

export async function GET(request: Request) {
  const session = await getLeadH5Session();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  const url = new URL(request.url);
  const reviewMonth = url.searchParams.get("scoreMonth") || "";
  const reviewType = url.searchParams.get("scoreType") || "";
  const definition = getReviewDefinition(reviewType);
  if (!validReviewMonth(reviewMonth) || !definition) return NextResponse.json({ message: "评分月份或评分类型无效" }, { status: 400 });
  try {
    const stores = await db.store.findMany({
      where: {
        ...reviewDataScope(session),
        operationStatus: { not: "CLOSED" },
        brand: { status: "ENABLED" },
        leadH5Reviews: { none: { reviewMonth, reviewType } },
      },
      select: { id: true, name: true, recordNo: true, brand: { select: { id: true, name: true } } },
      orderBy: [{ brand: { name: "asc" } }, { name: "asc" }],
    });
    await writeOperationLog({ userId: session.userId, username: session.username, client: "运营移动端", page: definition.title, action: "筛选评分月份", result: "成功", detail: `评分月份：${reviewMonth}；待评分门店：${stores.length}家`, request }).catch(() => undefined);
    return NextResponse.json({ stores });
  } catch {
    return NextResponse.json({ message: "店铺数据加载失败，请稍后重试" }, { status: 500 });
  }
}

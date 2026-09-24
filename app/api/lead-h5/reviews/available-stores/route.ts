import { NextResponse } from "next/server";
import { getLeadH5Session, leadH5ReviewPermission } from "@/lib/lead-h5-auth";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";
import { brandMatches, getReviewDefinition, reviewDataScope, validReviewMonth } from "@/lib/lead-h5-reviews";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const reviewMonth = url.searchParams.get("scoreMonth") || "";
  const reviewType = url.searchParams.get("scoreType") || "";
  const definition = getReviewDefinition(reviewType);
  if (!validReviewMonth(reviewMonth) || !definition) return NextResponse.json({ message: "评分月份或评分类型无效" }, { status: 400 });
  const session = await getLeadH5Session(leadH5ReviewPermission(reviewType, "view")!);
  if (!session) return NextResponse.json({ message: "登录状态已失效或暂无该评分页面权限" }, { status: 401 });
  try {
    const [candidateStores, assessments] = await Promise.all([
      db.store.findMany({
        where: {
          ...reviewDataScope(session),
          operationStatus: { not: "CLOSED" },
          brand: { status: "ENABLED" },
          leadH5Reviews: { none: { reviewMonth, reviewType } },
        },
        select: { id: true, name: true, recordNo: true, brand: { select: { id: true, code: true, name: true } } },
        orderBy: [{ brand: { name: "asc" } }, { name: "asc" }],
      }),
      db.assessment.findMany({
        where: { name: definition.assessmentName, status: "ENABLED", deletedAt: null },
        select: { applicableBrands: true },
      }),
    ]);
    const stores = candidateStores.filter(store => assessments.filter(assessment => brandMatches(assessment.applicableBrands, store.brand)).length === 1);
    await writeOperationLog({ userId: session.userId, username: session.username, client: "运营移动端", page: definition.title, action: "筛选评分月份", result: "成功", detail: `评分月份：${reviewMonth}；待评分门店：${stores.length}家`, request }).catch(() => undefined);
    return NextResponse.json({ stores });
  } catch {
    return NextResponse.json({ message: "店铺数据加载失败，请稍后重试" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getLeadH5Session } from "@/lib/lead-h5-auth";
import { RECTIFICATION_STATUSES, type RectificationStatus } from "@/lib/inspection-rectification-shared";

export async function GET(request: Request) {
  const session = await getLeadH5Session("lead-h5:rectifications:view");
  if (!session) return NextResponse.json({ message: "登录状态已失效或暂无巡检整改查看权限" }, { status: 401 });
  const search = new URL(request.url).searchParams;
  const status = search.get("status") || "PENDING";
  if (!RECTIFICATION_STATUSES.includes(status as RectificationStatus)) return NextResponse.json({ message: "整改状态无效" }, { status: 400 });
  const page = Math.min(100000, Math.max(1, Math.floor(Number(search.get("page")) || 1)));
  const pageSize = 20;
  const scope = { reviewItem: { review: { reviewerUserId: session.userId } } };
  try {
    const [counts, rows] = await Promise.all([
      db.inspectionRectification.groupBy({ by: ["status"], orderBy: { status: "asc" }, where: scope, _count: { _all: true } }),
      db.inspectionRectification.findMany({ where: { ...scope, status }, orderBy: [{ createdAt: "desc" }, { recordNo: "asc" }], skip: (page - 1) * pageSize, take: pageSize,
        include: { reviewItem: { include: { review: { select: { assessmentDate: true, reviewerRealName: true, storeNameSnapshot: true, brandNameSnapshot: true, assessmentName: true } } } }, rounds: { orderBy: { roundNumber: "desc" }, take: 1 } },
      }),
    ]);
    return NextResponse.json({ page, pageSize, total: counts.find(item => item.status === status)?._count._all || 0,
      counts: Object.fromEntries(RECTIFICATION_STATUSES.map(key => [key, counts.find(item => item.status === key)?._count._all || 0])),
      rows: rows.map(row => ({ id: row.id, recordNo: row.recordNo, status: row.status,
        assessmentDate: row.reviewItem.review.assessmentDate, reviewerName: row.reviewItem.review.reviewerRealName,
        storeName: row.reviewItem.review.storeNameSnapshot, brandName: row.reviewItem.review.brandNameSnapshot,
        assessmentName: row.reviewItem.review.assessmentName, sectionName: row.reviewItem.sectionName,
        subsectionName: row.reviewItem.subsectionName, itemDescription: row.reviewItem.itemDescription,
        problemDescription: row.reviewItem.problemDescription, result: row.reviewItem.result,
        dueAt: row.rounds[0]?.dueAt || null, submittedAt: row.rounds[0]?.submittedAt || null,
      })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ message: "巡检整改列表加载失败，请稍后重试" }, { status: 500 }); }
}

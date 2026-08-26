import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";
import {
  canStoreResearch, readStoreResearchFilters, serializeStoreResearch, storeResearchDataScope,
  storeResearchFilterWhere, storeResearchSelect, validResearchRange,
} from "@/lib/store-research-records";

export async function GET(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canStoreResearch(session, "query")) return NextResponse.json({ message: "暂无巡店调研表查询权限" }, { status: 403 });
  const search = new URL(request.url).searchParams;
  const background = search.get("_background") === "1";
  const filters = readStoreResearchFilters(search);
  const page = Math.max(1, Number(search.get("page")) || 1);
  const requestedPageSize = Number(search.get("pageSize")) || 20;
  const pageSize = [20, 50, 100].includes(requestedPageSize) ? requestedPageSize : 20;
  if (!validResearchRange(filters)) return NextResponse.json({ message: "调研月份范围不正确" }, { status: 400 });
  try {
    const where = { AND: [await storeResearchDataScope(session), storeResearchFilterWhere(filters)] };
    const [rows, total] = await db.$transaction([
      db.researchTemplateRecord.findMany({ where, select: storeResearchSelect, orderBy: [{ submittedAt: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
      db.researchTemplateRecord.count({ where }),
    ]);
    if (!background) await writeOperationLog({ userId: session.userId, username: session.username, page: "巡店调研表", action: "筛选", result: "成功", detail: `筛选结果：${total} 条`, request }).catch(() => undefined);
    return NextResponse.json({ rows: rows.map(serializeStoreResearch), total, page, pageSize }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch {
    if (!background) await writeOperationLog({ userId: session.userId, username: session.username, page: "巡店调研表", action: "筛选", result: "失败", detail: "调研记录列表加载失败", request }).catch(() => undefined);
    return NextResponse.json({ message: "巡店调研表数据加载失败，请稍后重试" }, { status: 500 });
  }
}

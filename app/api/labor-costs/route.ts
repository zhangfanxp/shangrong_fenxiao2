import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  canLaborCost,
  laborCostDataScope,
  laborCostFilterWhere,
  laborCostRecordSelect,
  readLaborCostFilters,
  serializeLaborCostRecord,
  validateLaborCostFilters,
} from "@/lib/labor-costs";
import { writeOperationLog } from "@/lib/operation-log";

export async function GET(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canLaborCost(session, "query")) return NextResponse.json({ message: "暂无人力成本查询权限" }, { status: 403 });
  const search = new URL(request.url).searchParams;
  const filters = readLaborCostFilters(search);
  const filterError = validateLaborCostFilters(filters);
  if (filterError) return NextResponse.json({ message: filterError }, { status: 400 });
  const page = Math.max(1, Number(search.get("page")) || 1);
  const requestedPageSize = Number(search.get("pageSize")) || 20;
  const pageSize = [20, 50, 100].includes(requestedPageSize) ? requestedPageSize : 20;
  const background = search.get("_background") === "1";
  try {
    const where = { AND: [await laborCostDataScope(session), laborCostFilterWhere(filters)] };
    const [rows, total] = await db.$transaction([
      db.dailyAttendanceRecord.findMany({ where, select: laborCostRecordSelect, orderBy: [{ attendanceDate: "desc" }, { createdAt: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
      db.dailyAttendanceRecord.count({ where }),
    ]);
    if (!background) await writeOperationLog({ userId: session.userId, username: session.username, client: "运营PC端", page: "人力成本", action: "筛选", result: "成功", detail: `筛选结果：${total} 条`, request }).catch(() => undefined);
    return NextResponse.json({ rows: rows.map(serializeLaborCostRecord), total, page, pageSize }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch {
    if (!background) await writeOperationLog({ userId: session.userId, username: session.username, client: "运营PC端", page: "人力成本", action: "筛选", result: "失败", detail: "人力成本列表加载失败", request }).catch(() => undefined);
    return NextResponse.json({ message: "人力成本数据加载失败，请稍后重试" }, { status: 500 });
  }
}

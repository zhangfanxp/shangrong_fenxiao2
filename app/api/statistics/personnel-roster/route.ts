import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";
import {
  canPersonnelRoster,
  personnelRosterDataScope,
  personnelRosterFilterWhere,
  personnelRosterSelect,
  readPersonnelRosterFilters,
  serializePersonnelRoster,
  validatePersonnelRosterFilters,
} from "@/lib/personnel-roster";

export async function GET(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canPersonnelRoster(session, "query")) return NextResponse.json({ message: "暂无花名册查询权限" }, { status: 403 });
  const search = new URL(request.url).searchParams;
  const filters = readPersonnelRosterFilters(search);
  const filterError = validatePersonnelRosterFilters(filters, search);
  if (filterError) return NextResponse.json({ message: filterError }, { status: 400 });
  const page = Math.max(1, Number(search.get("page")) || 1);
  const requestedPageSize = Number(search.get("pageSize")) || 20;
  const pageSize = [20, 50, 100].includes(requestedPageSize) ? requestedPageSize : 20;
  const background = search.get("_background") === "1";
  try {
    const where = { AND: [await personnelRosterDataScope(session), await personnelRosterFilterWhere(filters)] };
    const [rows, total] = await db.$transaction([
      db.personnel.findMany({ where, select: personnelRosterSelect, orderBy: [{ status: "asc" }, { hireDate: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
      db.personnel.count({ where }),
    ]);
    if (!background) await writeOperationLog({ userId: session.userId, username: session.username, client: "运营PC端", page: "花名册一览表", action: "查询", result: "成功", detail: `筛选结果：${total} 条`, request }).catch(() => undefined);
    const exposeSensitive = canPersonnelRoster(session, "sensitive");
    return NextResponse.json({ rows: rows.map(row => serializePersonnelRoster(row, exposeSensitive)), total, page, pageSize }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch {
    if (!background) await writeOperationLog({ userId: session.userId, username: session.username, client: "运营PC端", page: "花名册一览表", action: "查询", result: "失败", detail: "花名册列表加载失败", request }).catch(() => undefined);
    return NextResponse.json({ message: "花名册数据加载失败，请稍后重试" }, { status: 500 });
  }
}


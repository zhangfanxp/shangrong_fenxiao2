import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { writeOperationLog } from "@/lib/operation-log";
import {
  queryEmployeeAttendanceMonthlyRows,
  readEmployeeAttendanceMonthlyFilters,
  validateEmployeeAttendanceMonthlyFilters,
} from "@/lib/employee-attendance-monthly";

function canQuery(session: Awaited<ReturnType<typeof requireApiSession>>) {
  return Boolean(session && (session.permissions.includes("*") || session.permissions.includes("statistics:attendance-monthly:query") || session.permissions.includes("statistics:attendance-monthly:view") || session.permissions.includes("staff:view")));
}

export async function GET(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canQuery(session)) return NextResponse.json({ message: "暂无员工出勤月度汇总查询权限" }, { status: 403 });
  const search = new URL(request.url).searchParams;
  const filters = readEmployeeAttendanceMonthlyFilters(search);
  const filterError = validateEmployeeAttendanceMonthlyFilters(filters);
  if (filterError) return NextResponse.json({ message: filterError }, { status: 400 });
  const page = Math.max(1, Number(search.get("page")) || 1);
  const requestedPageSize = Number(search.get("pageSize")) || 20;
  const pageSize = [20, 50, 100].includes(requestedPageSize) ? requestedPageSize : 20;
  const background = search.get("_background") === "1";
  try {
    const result = await queryEmployeeAttendanceMonthlyRows(session, filters, page, pageSize);
    if (!background) await writeOperationLog({ userId: session.userId, username: session.username, client: "运营PC端", page: "员工出勤月度汇总表", action: "查询", result: "成功", detail: `筛选结果：${result.total} 条`, request }).catch(() => undefined);
    return NextResponse.json({ ...result, page, pageSize }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch {
    if (!background) await writeOperationLog({ userId: session.userId, username: session.username, client: "运营PC端", page: "员工出勤月度汇总表", action: "查询", result: "失败", detail: "员工出勤月度汇总加载失败", request }).catch(() => undefined);
    return NextResponse.json({ message: "员工出勤月度汇总加载失败，请稍后重试" }, { status: 500 });
  }
}

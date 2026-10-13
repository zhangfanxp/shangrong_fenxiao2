import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { attendanceRecordDataScope, businessDateText, calculateActualLaborCost, canAttendanceRecord } from "@/lib/attendance-records";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";
import { cooperationTypeLabel, formatShanghaiDateTime } from "@/lib/store-h5-daily-attendance";

function attendanceStatus(type: string, leaveHours: { toString(): string } | null) {
  if (type === "FULL_ATTENDANCE") return "全勤";
  if (type === "REST") return "休息";
  if (type === "LEAVE_FULL_DAY") return "请假全天";
  if (type === "LEAVE_HOURS") return `请假${leaveHours === null ? "-" : Number(leaveHours)}小时`;
  return "-";
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canAttendanceRecord(session, "view")) return NextResponse.json({ message: "暂无考勤记录查看权限" }, { status: 403 });
  const { id } = await context.params;
  try {
    const row = await db.dailyAttendanceRecord.findFirst({
      where: { AND: [{ id }, await attendanceRecordDataScope(session)] },
      include: { items: { orderBy: [{ sortOrder: "asc" }, { personnelNameSnapshot: "asc" }] } },
    });
    if (!row) return NextResponse.json({ message: "考勤记录不存在或无权查看" }, { status: 404 });
    await writeOperationLog({ userId: session.userId, username: session.username, client: "运营PC端", page: "考勤记录", action: "查看", result: "成功", detail: `记录编号：${row.recordNo}`, request }).catch(() => undefined);
    return NextResponse.json({
      overview: {
        recordNo: row.recordNo,
        brandName: row.brandNameSnapshot,
        storeName: row.storeNameSnapshot,
        cooperationType: cooperationTypeLabel(row.cooperationTypeSnapshot),
        attendanceDate: businessDateText(row.attendanceDate),
        partTimeWorkerCount: row.partTimeHeadcount,
        partTimeWorkHours: row.partTimeHours === null ? null : row.partTimeHours.toString(),
        partTimeLaborCost: row.partTimeLaborCostSnapshot === null ? null : row.partTimeLaborCostSnapshot.toFixed(2),
        partTimeActualLaborCost: row.partTimeActualLaborCost === null ? null : row.partTimeActualLaborCost.toFixed(2),
        createdByName: row.createdByNameSnapshot,
        createdAt: formatShanghaiDateTime(row.createdAt),
      },
      details: row.items.map(item => {
        const actualLaborCost = calculateActualLaborCost({
          attendanceType: item.attendanceType,
          leaveHours: item.leaveHours,
          overtimeHours: item.overtimeHours,
          dailyLaborCost: item.laborCostSnapshot,
          hourlyLaborCost: item.hourlyLaborCostSnapshot,
        });
        return {
          personnelId: item.personnelId,
          personnelName: item.personnelNameSnapshot,
          positionStar: item.positionLevelSnapshot,
          attendanceStatus: attendanceStatus(item.attendanceType, item.leaveHours),
          attendanceType: item.attendanceType,
          leaveHours: item.leaveHours === null ? null : item.leaveHours.toString(),
          overtimeHours: item.overtimeHours === null ? "0" : item.overtimeHours.toString(),
          dailyLaborCost: item.laborCostSnapshot === null ? null : item.laborCostSnapshot.toFixed(2),
          hourlyLaborCost: item.hourlyLaborCostSnapshot === null ? null : item.hourlyLaborCostSnapshot.toFixed(2),
          actualLaborCost: actualLaborCost?.toFixed(2) ?? null,
        };
      }),
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch {
    await writeOperationLog({ userId: session.userId, username: session.username, client: "运营PC端", page: "考勤记录", action: "查看", result: "失败", detail: `记录ID：${id}；考勤详情加载失败`, request }).catch(() => undefined);
    return NextResponse.json({ message: "考勤详情加载失败，请稍后重试" }, { status: 500 });
  }
}

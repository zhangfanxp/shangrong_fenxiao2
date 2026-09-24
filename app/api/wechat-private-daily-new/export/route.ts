import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";
import {
  WechatPrivateDailyNewError,
  canWechatPrivateDailyNew,
  loadWechatPrivateDailyNewSource,
  serializeWechatPrivateDailyNew,
  wechatPrivateDailyNewDataScope,
  wechatPrivateDailyNewFiltersSchema,
  wechatPrivateDailyNewFilterWhere,
  wechatPrivateDailyNewSelect,
  wechatPrivateDailyNewSourceWhere,
} from "@/lib/wechat-private-daily-new";

const bodySchema = z.object({
  recordIds: z.array(z.string().trim().min(1)).max(50000).optional(),
  filters: wechatPrivateDailyNewFiltersSchema.default({}),
});

function timestamp() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value || "";
  return `${value("year")}${value("month")}${value("day")}_${value("hour")}${value("minute")}${value("second")}`;
}

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canWechatPrivateDailyNew(session, "export")) return NextResponse.json({ message: "暂无微信私域每日新增导出权限" }, { status: 403 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message || "导出参数不正确" }, { status: 400 });
  const recordIds = parsed.data.recordIds?.length ? [...new Set(parsed.data.recordIds)] : undefined;
  try {
    const source = await loadWechatPrivateDailyNewSource();
    const where = { AND: [
      wechatPrivateDailyNewSourceWhere(source),
      await wechatPrivateDailyNewDataScope(session),
      recordIds ? { id: { in: recordIds } } : wechatPrivateDailyNewFilterWhere(parsed.data.filters),
    ] };
    const total = await db.taskSubmission.count({ where });
    if (total > 50000) return NextResponse.json({ message: "当前筛选结果超过50000条，请缩小筛选范围后导出" }, { status: 413 });
    const sourceRows = await db.taskSubmission.findMany({
      where,
      select: wechatPrivateDailyNewSelect(source),
      orderBy: [{ executionDate: "desc" }, { storeNameSnapshot: "asc" }, { id: "desc" }],
    });
    const rows = sourceRows.map(serializeWechatPrivateDailyNew);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "餐饮管理系统";
    const sheet = workbook.addWorksheet("微信私域每日新增");
    sheet.columns = [
      { header: "任务记录编号", key: "recordNo", width: 20 },
      { header: "品牌", key: "brandName", width: 18 },
      { header: "门店", key: "storeName", width: 28 },
      { header: "业务日期", key: "businessDate", width: 16 },
      { header: "今日新增微信好友", key: "todayNewWechatFriends", width: 22, style: { numFmt: "0" } },
      { header: "上报人", key: "submitterName", width: 16 },
      { header: "上报时间", key: "submittedAt", width: 22 },
    ];
    rows.forEach(row => sheet.addRow(row));
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1677FF" } };
    sheet.getRow(1).alignment = { horizontal: "center", vertical: "middle" };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = { from: "A1", to: "G1" };
    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = `微信私域每日新增_${timestamp()}.xlsx`;
    await writeOperationLog({
      userId: session.userId,
      username: session.username,
      client: "运营PC端",
      page: "微信私域每日新增",
      action: "批量导出",
      result: "成功",
      detail: `业务数据源：${source.sourceRecordNo}；${recordIds ? `已选择 ${recordIds.length} 条` : "当前筛选结果全部"}；实际导出 ${rows.length} 条`,
      request,
    }).catch(() => undefined);
    return new NextResponse(Buffer.from(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      },
    });
  } catch (error) {
    const message = error instanceof WechatPrivateDailyNewError ? error.message : "微信私域每日新增导出失败，请稍后重试";
    const status = error instanceof WechatPrivateDailyNewError ? error.status : 500;
    await writeOperationLog({ userId: session.userId, username: session.username, client: "运营PC端", page: "微信私域每日新增", action: "批量导出", result: "失败", detail: message, request }).catch(() => undefined);
    return NextResponse.json({ message }, { status });
  }
}

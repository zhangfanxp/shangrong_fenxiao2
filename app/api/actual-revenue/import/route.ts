import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import Busboy from "busboy";
import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { SaxesParser } from "saxes";
import * as unzipper from "unzipper";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";
import { actualRevenueStoreScope, canActualRevenue, nextActualRevenueRecordNo } from "@/lib/actual-revenue";
import {
  dateKey, isBlankDataRow, MAX_ACTUAL_REVENUE_FILE_SIZE, parseDataRow,
  type ParsedActualRevenueRow, resolveHeaderColumns,
} from "@/lib/actual-revenue-import";

export const runtime = "nodejs";
export const maxDuration = 300;

type StoreSnapshot = {
  id: string;
  name: string;
  brandId: string;
  brand: { name: string };
  region: string | null;
  managerName: string | null;
  supervisorName: string | null;
  cooperationType: string;
};

type ResolvedRow = ParsedActualRevenueRow & { store: StoreSnapshot };
type Failure = { excelRow: number; storeName: string; businessDate: string; reason: string };

function dailyData(row: ResolvedRow) {
  return {
    revenueAmount: row.revenueAmount,
    discountAmount: row.discountAmount,
    operatingIncome: row.operatingIncome,
    orderCount: row.orderCount,
    dinerCount: row.dinerCount,
    tableCount: row.tableCount,
    preDiscountPerCapita: row.preDiscountPerCapita,
    postDiscountPerCapita: row.postDiscountPerCapita,
    preDiscountAvgOrder: row.preDiscountAvgOrder,
    postDiscountAvgOrder: row.postDiscountAvgOrder,
    tableOpenRate: row.tableOpenRate,
    tableTurnoverRate: row.tableTurnoverRate,
    seatOccupancyRate: row.seatOccupancyRate,
    avgDiningDurationMinutes: row.avgDiningDurationMinutes,
  };
}

async function receiveUpload(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) throw new Error("请选择.xlsx文件");
  if (!request.body) throw new Error("请选择.xlsx文件");
  const tempDirectory = await mkdtemp(join(tmpdir(), "canyin-actual-revenue-"));
  const tempPath = join(tempDirectory, "upload.xlsx");
  try {
    const uploaded = await new Promise<{ fileName: string; fileSize: number }>((resolve, reject) => {
      let fileFound = false;
      let fileName = "";
      let fileSize = 0;
      let tooLarge = false;
      let writeFinished: Promise<void> = Promise.resolve();
      let parser: ReturnType<typeof Busboy>;
      try {
        parser = Busboy({ headers: { "content-type": contentType }, limits: { files: 1, fileSize: MAX_ACTUAL_REVENUE_FILE_SIZE + 1 } });
      } catch (error) { reject(error); return; }
      parser.on("file", (fieldName, stream, info) => {
        if (fieldName !== "file" || fileFound) { stream.resume(); return; }
        fileFound = true;
        fileName = info.filename || "";
        const output = createWriteStream(tempPath, { flags: "wx" });
        writeFinished = new Promise<void>((finish, fail) => {
          output.once("finish", finish);
          output.once("error", fail);
          stream.once("error", fail);
        });
        stream.on("data", (chunk: Buffer) => { fileSize += chunk.length; });
        stream.once("limit", () => { tooLarge = true; });
        stream.pipe(output);
      });
      parser.once("error", reject);
      parser.once("finish", () => {
        void writeFinished.then(() => {
          if (!fileFound) reject(new Error("请选择.xlsx文件"));
          else if (tooLarge || fileSize > MAX_ACTUAL_REVENUE_FILE_SIZE) reject(new Error("导入文件不能超过200MB"));
          else resolve({ fileName, fileSize });
        }).catch(reject);
      });
      Readable.fromWeb(request.body as unknown as import("node:stream/web").ReadableStream).pipe(parser);
    });
    return { ...uploaded, tempPath, cleanup: () => rm(tempDirectory, { recursive: true, force: true }) };
  } catch (error) {
    await rm(tempDirectory, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

async function parseWorkbook(tempPath: string) {
    const directory = await unzipper.Open.file(tempPath);
    const sharedStringEntry = directory.files.find(entry => entry.path === "xl/sharedStrings.xml");
    const worksheetEntry = directory.files
      .filter(entry => /^xl\/worksheets\/sheet\d+\.xml$/i.test(entry.path))
      .sort((left, right) => Number(left.path.match(/sheet(\d+)/i)?.[1] || 0) - Number(right.path.match(/sheet(\d+)/i)?.[1] || 0))[0];
    if (!worksheetEntry) throw new Error("导入文件没有工作表");

    const sharedStrings: string[] = [];
    if (sharedStringEntry) {
      const parser = new SaxesParser();
      let current = "";
      let inText = false;
      parser.on("opentag", tag => {
        const name = tag.name.split(":").pop();
        if (name === "si") current = "";
        if (name === "t") inText = true;
      });
      parser.on("text", value => { if (inText) current += value; });
      parser.on("cdata", value => { if (inText) current += value; });
      parser.on("closetag", tag => {
        const name = tag.name.split(":").pop();
        if (name === "t") inText = false;
        if (name === "si") sharedStrings.push(current);
      });
      for await (const chunk of sharedStringEntry.stream()) parser.write(chunk.toString("utf8"));
      parser.close();
    }

    const parsed: ParsedActualRevenueRow[] = [];
    const failures: Failure[] = [];
    const scratchWorkbook = new ExcelJS.Workbook();
    const scratch = scratchWorkbook.addWorksheet("解析");
    let columns: ReturnType<typeof resolveHeaderColumns> | undefined;
    let rowNumber = 0;
    let fallbackRowNumber = 0;
    let rowCells = new Map<number, ExcelJS.CellValue>();
    let cellColumn = 0;
    let cellType = "";
    let cellValue = "";
    let inlineText = "";
    let inValue = false;
    let inInlineText = false;

    const columnNumber = (reference: string) => {
      const letters = reference.match(/[A-Za-z]+/)?.[0]?.toUpperCase() || "";
      let result = 0;
      for (const letter of letters) result = result * 26 + letter.charCodeAt(0) - 64;
      return result;
    };
    const resolvedCellValue = (): ExcelJS.CellValue => {
      const text = cellValue.trim();
      if (cellType === "s") return sharedStrings[Number(text)] ?? "";
      if (cellType === "inlineStr" || cellType === "str") return inlineText || cellValue;
      if (cellType === "b") return text === "1";
      if (cellType === "e") return { error: text as "#N/A" };
      if (!text) return null;
      return /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text) ? Number(text) : text;
    };
    const consumeRow = () => {
      const targetNumber = rowNumber <= 5 ? rowNumber : 6;
      const target = scratch.getRow(targetNumber);
      target.values = [];
      for (const [column, value] of rowCells) target.getCell(column).value = value;
      if (rowNumber <= 5) return;
      if (/^(?:合计|总计)$/.test(target.getCell(1).text.trim())) return;
      if (!columns) columns = resolveHeaderColumns([1, 2, 3, 4, 5].map(number => scratch.getRow(number)));
      if (isBlankDataRow(target, columns)) return;
      try {
        const item = parseDataRow(target, columns);
        item.excelRow = rowNumber;
        parsed.push(item);
      } catch (error) {
        failures.push({ excelRow: rowNumber, storeName: target.getCell(columns.get("storeName") || 0).text.trim(), businessDate: target.getCell(columns.get("businessDate") || 0).text.trim(), reason: error instanceof Error ? error.message : "数据校验失败" });
      }
    };

    const sheetParser = new SaxesParser();
    sheetParser.on("opentag", tag => {
      const name = tag.name.split(":").pop();
      if (name === "row") {
        fallbackRowNumber++;
        rowNumber = Number(tag.attributes.r || fallbackRowNumber);
        rowCells = new Map();
      } else if (name === "c") {
        cellColumn = columnNumber(String(tag.attributes.r || ""));
        cellType = String(tag.attributes.t || "");
        cellValue = "";
        inlineText = "";
      } else if (name === "v") inValue = true;
      else if (name === "t") inInlineText = true;
    });
    sheetParser.on("text", value => {
      if (inValue) cellValue += value;
      if (inInlineText) inlineText += value;
    });
    sheetParser.on("cdata", value => {
      if (inValue) cellValue += value;
      if (inInlineText) inlineText += value;
    });
    sheetParser.on("closetag", tag => {
      const name = tag.name.split(":").pop();
      if (name === "v") inValue = false;
      else if (name === "t") inInlineText = false;
      else if (name === "c" && cellColumn) rowCells.set(cellColumn, resolvedCellValue());
      else if (name === "row") consumeRow();
    });
    for await (const chunk of worksheetEntry.stream()) sheetParser.write(chunk.toString("utf8"));
    sheetParser.close();

    if (!parsed.length && !failures.length) throw new Error("第六行开始没有可读取的数据");
    return { parsed, failures };
}

async function importGroup(rows: ResolvedRow[], user: { id: string; name: string }) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await db.$transaction(async tx => {
        const first = rows[0];
        let monthly = await tx.actualRevenueMonthly.findUnique({
          where: { storeId_statMonth: { storeId: first.store.id, statMonth: first.statMonth } },
          include: { monthlyTarget: true },
        });
        if (monthly?.monthlyTarget || monthly?.dailyTargetStatus === "GENERATED") return { added: 0, overwritten: 0, skipped: rows.length };
        if (!monthly) {
          const recordNo = await nextActualRevenueRecordNo(tx);
          monthly = await tx.actualRevenueMonthly.create({
            data: {
              recordNo,
              statMonth: first.statMonth,
              brandId: first.store.brandId,
              brandNameSnapshot: first.store.brand.name,
              storeId: first.store.id,
              storeNameSnapshot: first.store.name,
              regionNameSnapshot: first.store.region,
              storeManagerNameSnapshot: first.store.managerName,
              supervisorNameSnapshot: first.store.supervisorName,
              cooperationTypeSnapshot: first.store.cooperationType,
              createdByUserId: user.id,
              createdByName: user.name,
            },
            include: { monthlyTarget: true },
          });
        }
        let added = 0;
        let overwritten = 0;
        for (const row of rows) {
          const existing = await tx.actualRevenueDaily.findUnique({ where: { storeId_businessDate: { storeId: row.store.id, businessDate: row.businessDate } }, select: { id: true } });
          if (existing) {
            await tx.actualRevenueDaily.update({ where: { id: existing.id }, data: { monthlyRecordId: monthly.id, ...dailyData(row) } });
            overwritten++;
          } else {
            await tx.actualRevenueDaily.create({ data: { monthlyRecordId: monthly.id, storeId: row.store.id, businessDate: row.businessDate, ...dailyData(row) } });
            added++;
          }
        }
        const total = await tx.actualRevenueDaily.aggregate({ where: { monthlyRecordId: monthly.id }, _sum: { revenueAmount: true } });
        await tx.actualRevenueMonthly.update({ where: { id: monthly.id }, data: { monthlyRevenue: total._sum.revenueAmount ?? new Prisma.Decimal(0) } });
        return { added, overwritten, skipped: 0 };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 120_000 });
    } catch (error) {
      const retryable = error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code);
      if (!retryable || attempt === 2) throw error;
    }
  }
  throw new Error("导入事务未完成");
}

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canActualRevenue(session, "import")) return NextResponse.json({ message: "暂无实际营业额导入权限" }, { status: 403 });
  let upload: Awaited<ReturnType<typeof receiveUpload>>;
  try {
    upload = await receiveUpload(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "上传文件读取失败";
    await writeOperationLog({ userId: session.userId, username: session.username, page: "实际营业额", action: "批量导入", result: "失败", detail: message, request }).catch(() => undefined);
    return NextResponse.json({ message }, { status: 400 });
  }
  if (!upload.fileName.toLowerCase().endsWith(".xlsx")) {
    await upload.cleanup().catch(() => undefined);
    return NextResponse.json({ message: "仅支持.xlsx格式文件" }, { status: 400 });
  }
  try {
    const { parsed, failures } = await parseWorkbook(upload.tempPath);
    const stores = await db.store.findMany({
      where: await actualRevenueStoreScope(session),
      select: { id: true, name: true, brandId: true, region: true, managerName: true, supervisorName: true, cooperationType: true, brand: { select: { name: true } } },
    });
    const storesByName = new Map<string, StoreSnapshot[]>();
    for (const store of stores) storesByName.set(store.name.trim(), [...(storesByName.get(store.name.trim()) || []), store]);

    const deduplicated = new Map<string, ResolvedRow>();
    const warnings: string[] = [];
    let skipped = 0;
    for (const row of parsed) {
      const matches = storesByName.get(row.storeName.trim()) || [];
      if (!matches.length) {
        failures.push({ excelRow: row.excelRow, storeName: row.storeName, businessDate: dateKey(row.businessDate), reason: "未找到对应门店或无权访问该门店" });
        continue;
      }
      if (matches.length > 1) {
        failures.push({ excelRow: row.excelRow, storeName: row.storeName, businessDate: dateKey(row.businessDate), reason: "门店名称存在多个匹配结果，请先完善门店数据后重新导入" });
        continue;
      }
      const resolved = { ...row, store: matches[0] };
      const key = `${resolved.store.id}:${dateKey(resolved.businessDate)}`;
      const previous = deduplicated.get(key);
      if (previous) {
        skipped++;
        warnings.push(`第${previous.excelRow}行与第${resolved.excelRow}行门店及营业日重复，已按最后一条合法数据处理`);
      }
      deduplicated.set(key, resolved);
    }

    const groups = new Map<string, ResolvedRow[]>();
    for (const row of deduplicated.values()) {
      const key = `${row.store.id}:${row.statMonth}`;
      groups.set(key, [...(groups.get(key) || []), row]);
    }
    let added = 0;
    let overwritten = 0;
    for (const rows of groups.values()) {
      try {
        const result = await importGroup(rows, { id: session.userId, name: session.realName });
        added += result.added;
        overwritten += result.overwritten;
        skipped += result.skipped;
        if (result.skipped) warnings.push(`${rows[0].store.name} ${rows[0].statMonth} 已生成目标，${result.skipped}条日明细已跳过`);
      } catch (error) {
        const reason = error instanceof Error ? error.message : "分组导入失败";
        for (const row of rows) failures.push({ excelRow: row.excelRow, storeName: row.storeName, businessDate: dateKey(row.businessDate), reason });
      }
    }
    const result = { added, overwritten, skipped, failed: failures.length, failures, warnings };
    await writeOperationLog({ userId: session.userId, username: session.username, page: "实际营业额", action: "批量导入", result: "成功", detail: `文件名：${upload.fileName}；文件大小：${upload.fileSize}字节；新增：${added}；覆盖：${overwritten}；跳过：${skipped}；失败：${failures.length}`, request }).catch(() => undefined);
    return NextResponse.json(result);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Excel文件解析失败";
    await writeOperationLog({ userId: session.userId, username: session.username, page: "实际营业额", action: "批量导入", result: "失败", detail: `文件名：${upload.fileName}；${detail}`, request }).catch(() => undefined);
    return NextResponse.json({ message: detail.includes("字段") ? detail : `导入文件格式不正确，请按照导入模版规则检查后重新上传：${detail}` }, { status: 400 });
  } finally {
    await upload.cleanup().catch(() => undefined);
  }
}

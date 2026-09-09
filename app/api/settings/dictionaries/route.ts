import { RecordStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { canDictionary } from "@/lib/dictionary-permissions";
import { createDictionaryFile, deleteDictionaryFile, dictionaryFileExists, DictionaryConfigError, normalizeDictionaryFileName, readDictionaryValues } from "@/lib/dictionary-config";
import { db } from "@/lib/db";
import { writeOperationLog, type OperationLogResult } from "@/lib/operation-log";

const inputSchema = z.object({
  name: z.string().trim().min(1, "请输入字典中文名称").refine(value => Array.from(value).length <= 10, "字典中文名称不能超过10个汉字"),
  code: z.string().trim().regex(/^[A-Za-z0-9_]{1,30}$/, "字典英文名称只能包含英文字母、数字和下划线，且不能超过30个字符"),
  fileBase: z.string().trim().min(1, "请输入本地JSON文件名称"),
  remark: z.string().trim().refine(value => Array.from(value).length <= 200, "备注不能超过200个字符").optional().default(""),
  status: z.nativeEnum(RecordStatus, { message: "请选择状态" }).default(RecordStatus.ENABLED),
});

function forbidden() { return NextResponse.json({ message: "暂无此操作权限" }, { status: 403 }); }
function shanghaiDatePrefix() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (type: string) => parts.find(item => item.type === type)?.value || "";
  return `${part("year")}${part("month")}${part("day")}`;
}
async function nextRecordNo() {
  const prefix = shanghaiDatePrefix();
  const last = await db.dataDictionary.findFirst({ where: { recordNo: { startsWith: prefix } }, select: { recordNo: true }, orderBy: { recordNo: "desc" } });
  const sequence = last ? Number(last.recordNo.slice(8)) + 1 : 1;
  return `${prefix}${String(sequence).padStart(4, "0")}`;
}
async function log(userId: string, action: string, result: OperationLogResult, detail: string) {
  await writeOperationLog({ userId, page: "数据字典", action, result, detail }).catch(() => undefined);
}

export async function GET(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canDictionary(session, "query")) return forbidden();
  const url = new URL(request.url);
  const name = (url.searchParams.get("name") || "").trim();
  const code = (url.searchParams.get("code") || "").trim();
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(10, Number(url.searchParams.get("pageSize")) || 10));
  const where = { ...(name ? { name: { contains: name } } : {}), ...(code ? { code: { contains: code } } : {}) };
  try {
    const [total, rows] = await db.$transaction([
      db.dataDictionary.count({ where }),
      db.dataDictionary.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    const rowsWithValueCounts = await Promise.all(rows.map(async row => {
      try {
        const values = await readDictionaryValues(row.fileName);
        return { ...row, valueCount: values.length };
      } catch {
        // 单个文件异常不应导致整个列表不可用；对应行明确展示读取失败。
        return { ...row, valueCount: null };
      }
    }));
    await log(session.userId, "筛选", "成功", name || code ? `中文名称：${name || "-"}；英文名称：${code || "-"}` : "加载全部数据字典");
    return NextResponse.json({ rows: rowsWithValueCounts, total, page, pageSize });
  } catch {
    return NextResponse.json({ message: "数据字典加载失败，请稍后重试" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canDictionary(session, "create")) return forbidden();
  const parsed = inputSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0].message }, { status: 400 });
  const input = parsed.data;
  let fileName = "";
  let fileCreated = false;
  try {
    fileName = normalizeDictionaryFileName(input.fileBase);
    const duplicate = await db.dataDictionary.findFirst({ where: { OR: [{ name: input.name }, { code: input.code }, { fileName }] } });
    if (duplicate?.name === input.name) throw new DictionaryConfigError("字典中文名称已存在，请重新输入");
    if (duplicate?.code.toLowerCase() === input.code.toLowerCase()) throw new DictionaryConfigError("字典英文名称已存在，请重新输入");
    if (duplicate?.fileName.toLowerCase() === fileName.toLowerCase() || await dictionaryFileExists(fileName)) throw new DictionaryConfigError("本地JSON文件已存在，请重新输入文件名称");
    await createDictionaryFile(fileName); fileCreated = true;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const recordNo = await nextRecordNo();
      try {
        const dictionary = await db.dataDictionary.create({ data: { recordNo, name: input.name, code: input.code, fileName, remark: input.remark || null, status: input.status } });
        await log(session.userId, "新增", "成功", `新增数据字典：${recordNo}（${input.name}）`);
        return NextResponse.json(dictionary, { status: 201 });
      } catch (error) {
        const conflict = error as { code?: string; meta?: { target?: string | string[] } };
        const target = Array.isArray(conflict.meta?.target) ? conflict.meta.target.join(",") : String(conflict.meta?.target || "");
        if (conflict.code === "P2002" && target.toLowerCase().includes("recordno")) continue;
        throw error;
      }
    }
    throw new DictionaryConfigError("记录编号生成失败，请稍后重试");
  } catch (error) {
    if (fileCreated && fileName) await deleteDictionaryFile(fileName).catch(() => undefined);
    const isUnique = (error as { code?: string }).code === "P2002";
    const message = error instanceof DictionaryConfigError ? error.message : isUnique ? "字典名称或本地JSON文件已存在，请重新输入" : "数据字典保存失败，请稍后重试";
    await log(session.userId, "新增", "失败", message);
    return NextResponse.json({ message }, { status: 400 });
  }
}

import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { canDictionary } from "@/lib/dictionary-permissions";
import { DictionaryConfigError, parseDictionaryValues, readDictionaryValues, writeDictionaryValues } from "@/lib/dictionary-config";
import { db } from "@/lib/db";
import { writeOperationLog, type OperationLogResult } from "@/lib/operation-log";

const inputSchema = z.object({ valuesText: z.string(), updatedAt: z.string().datetime({ offset: true }) });
function forbidden() { return NextResponse.json({ message: "暂无此操作权限" }, { status: 403 }); }
function sameTimestamp(date: Date, value: string) { return date.getTime() === new Date(value).getTime(); }
async function log(userId: string, action: string, result: OperationLogResult, detail: string) { await writeOperationLog({ userId, page: "数据字典", action, result, detail }).catch(() => undefined); }

async function referencedRemovedValues(code: string, fileName: string, removed: string[]) {
  if (!removed.length) return [];
  const key = `${code}|${fileName.replace(/\.json$/i, "")}`.toLowerCase();
  if (key.includes("band") || key.includes("brand")) {
    const rows = await db.brand.findMany({ where: { name: { in: removed } }, select: { name: true } }); return rows.map(row => row.name);
  }
  if (key.includes("area")) {
    const [storeRows, userRows] = await Promise.all([
      db.store.findMany({ where: { region: { in: removed } }, distinct: ["region"], select: { region: true } }),
      db.userManagedRegion.findMany({ where: { region: { in: removed } }, distinct: ["region"], select: { region: true } }),
    ]);
    return [...new Set([...storeRows, ...userRows].flatMap(row => row.region ? [row.region] : []))];
  }
  if (key.includes("location_type")) {
    const rows = await db.store.findMany({ where: { locationType: { in: removed } }, distinct: ["locationType"], select: { locationType: true } }); return rows.flatMap(row => row.locationType ? [row.locationType] : []);
  }
  return [];
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canDictionary(session, "values:view")) return forbidden();
  const dictionary = await db.dataDictionary.findUnique({ where: { id: (await params).id } });
  if (!dictionary) return NextResponse.json({ message: "数据字典不存在" }, { status: 404 });
  try {
    const values = await readDictionaryValues(dictionary.fileName);
    await log(session.userId, "枚举值查看", "成功", `查看枚举值：${dictionary.recordNo}（${dictionary.name}）`);
    return NextResponse.json({ dictionary, values, valuesText: values.join("|") });
  } catch (error) {
    const message = error instanceof DictionaryConfigError ? error.message : "数据字典文件读取失败，请稍后重试";
    await log(session.userId, "枚举值查看", "失败", `数据字典：${dictionary.recordNo}；${message}`);
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canDictionary(session, "values:edit")) return forbidden();
  const dictionary = await db.dataDictionary.findUnique({ where: { id: (await params).id } });
  if (!dictionary) return NextResponse.json({ message: "数据字典不存在" }, { status: 404 });
  const parsed = inputSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0].message }, { status: 400 });
  if (!sameTimestamp(dictionary.updatedAt, parsed.data.updatedAt)) return NextResponse.json({ message: "当前数据字典已被其他用户修改，请刷新后重新操作" }, { status: 409 });
  try {
    const oldValues = await readDictionaryValues(dictionary.fileName);
    const nextValues = parseDictionaryValues(parsed.data.valuesText);
    const removed = oldValues.filter(value => !nextValues.includes(value));
    const referenced = await referencedRemovedValues(dictionary.code, dictionary.fileName, removed);
    if (referenced.length) throw new DictionaryConfigError(`枚举值“${referenced[0]}”已被业务数据使用，暂不能删除`);
    const claimed = await db.dataDictionary.updateMany({ where: { id: dictionary.id, updatedAt: dictionary.updatedAt }, data: { version: { increment: 1 } } });
    if (!claimed.count) throw new DictionaryConfigError("当前数据字典已被其他用户修改，请刷新后重新操作");
    try { await writeDictionaryValues(dictionary.fileName, nextValues); }
    catch (error) {
      await db.dataDictionary.update({ where: { id: dictionary.id }, data: { version: dictionary.version } }).catch(() => undefined);
      throw error;
    }
    await log(session.userId, "枚举值编辑", "成功", `数据字典：${dictionary.recordNo}；修改前：${oldValues.join("|") || "（空）"}；修改后：${nextValues.join("|") || "（空）"}`);
    if ([dictionary.code, dictionary.fileName.replace(/\.json$/i, "")].some(value => value.toLowerCase() === "ai_service")) revalidatePath("/lead_pc/settings/parameters");
    return NextResponse.json({ message: "枚举值保存成功", values: nextValues });
  } catch (error) {
    const message = error instanceof DictionaryConfigError ? error.message : "枚举值保存失败，请稍后重试";
    await log(session.userId, "枚举值编辑", "失败", `数据字典：${dictionary.recordNo}；${message}`);
    return NextResponse.json({ message }, { status: message.includes("其他用户") ? 409 : 400 });
  }
}

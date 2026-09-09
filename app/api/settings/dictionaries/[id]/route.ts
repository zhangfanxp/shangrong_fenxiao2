import { RecordStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { canDictionary, type DictionaryPermission } from "@/lib/dictionary-permissions";
import { dictionaryFileExists, DictionaryConfigError, normalizeDictionaryFileName, readDictionaryValues, renameDictionaryFile } from "@/lib/dictionary-config";
import { db } from "@/lib/db";
import { writeOperationLog, type OperationLogResult } from "@/lib/operation-log";

const editSchema = z.object({
  name: z.string().trim().min(1, "请输入字典中文名称").refine(value => Array.from(value).length <= 10, "字典中文名称不能超过10个汉字"),
  code: z.string().trim().regex(/^[A-Za-z0-9_]{1,30}$/, "字典英文名称只能包含英文字母、数字和下划线，且不能超过30个字符"),
  fileBase: z.string().trim().min(1, "请输入本地JSON文件名称"),
  remark: z.string().trim().refine(value => Array.from(value).length <= 200, "备注不能超过200个字符").optional().default(""),
  status: z.nativeEnum(RecordStatus, { message: "请选择状态" }),
  updatedAt: z.string().datetime({ offset: true }),
});
const statusSchema = z.object({ action: z.literal("status"), status: z.nativeEnum(RecordStatus), updatedAt: z.string().datetime({ offset: true }) });
function forbidden() { return NextResponse.json({ message: "暂无此操作权限" }, { status: 403 }); }
function sameTimestamp(date: Date, value: string) { return date.getTime() === new Date(value).getTime(); }
async function log(userId: string, action: string, result: OperationLogResult, detail: string) { await writeOperationLog({ userId, page: "数据字典", action, result, detail }).catch(() => undefined); }

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  const intent = new URL(request.url).searchParams.get("intent") === "edit" ? "edit" : "view";
  if (!canDictionary(session, intent as DictionaryPermission)) return forbidden();
  const dictionary = await db.dataDictionary.findUnique({ where: { id: (await params).id } });
  if (!dictionary) return NextResponse.json({ message: "数据字典不存在" }, { status: 404 });
  try {
    const values = await readDictionaryValues(dictionary.fileName);
    await log(session.userId, intent === "edit" ? "编辑" : "查看", "成功", `${intent === "edit" ? "编辑" : "查看"}数据字典：${dictionary.recordNo}`);
    return NextResponse.json({ dictionary, hasValues: values.length > 0 });
  } catch (error) {
    const message = error instanceof DictionaryConfigError ? error.message : "数据字典文件读取失败，请稍后重试";
    await log(session.userId, intent === "edit" ? "编辑" : "查看", "失败", `数据字典：${dictionary.recordNo}；${message}`);
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  const { id } = await params;
  const dictionary = await db.dataDictionary.findUnique({ where: { id } });
  if (!dictionary) return NextResponse.json({ message: "数据字典不存在" }, { status: 404 });
  const body = await request.json();
  if (body.action === "status") {
    const parsed = statusSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0].message }, { status: 400 });
    const enabling = parsed.data.status === RecordStatus.ENABLED;
    if (!canDictionary(session, enabling ? "enable" : "disable")) return forbidden();
    if (!sameTimestamp(dictionary.updatedAt, parsed.data.updatedAt)) return NextResponse.json({ message: "当前数据字典已被其他用户修改，请刷新后重新操作" }, { status: 409 });
    const result = await db.dataDictionary.updateMany({ where: { id, updatedAt: dictionary.updatedAt }, data: { status: parsed.data.status, version: { increment: 1 } } });
    if (!result.count) return NextResponse.json({ message: "当前数据字典已被其他用户修改，请刷新后重新操作" }, { status: 409 });
    const action = enabling ? "启用" : "禁用";
    await log(session.userId, action, "成功", `${action}数据字典：${dictionary.recordNo}（${dictionary.name}）`);
    if ([dictionary.code, dictionary.fileName.replace(/\.json$/i, "")].some(value => value.toLowerCase() === "ai_service")) revalidatePath("/lead_pc/settings/parameters");
    return NextResponse.json({ message: `数据字典${action}成功` });
  }
  if (!canDictionary(session, "edit")) return forbidden();
  const parsed = editSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0].message }, { status: 400 });
  if (!sameTimestamp(dictionary.updatedAt, parsed.data.updatedAt)) return NextResponse.json({ message: "当前数据字典已被其他用户修改，请刷新后重新操作" }, { status: 409 });
  const input = parsed.data;
  let nextFileName = dictionary.fileName;
  let renamed = false;
  try {
    nextFileName = normalizeDictionaryFileName(input.fileBase);
    const duplicate = await db.dataDictionary.findFirst({ where: { id: { not: id }, OR: [{ name: input.name }, { code: input.code }, { fileName: nextFileName }] } });
    if (duplicate?.name === input.name) throw new DictionaryConfigError("字典中文名称已存在，请重新输入");
    if (duplicate?.code.toLowerCase() === input.code.toLowerCase()) throw new DictionaryConfigError("字典英文名称已存在，请重新输入");
    if (duplicate?.fileName.toLowerCase() === nextFileName.toLowerCase()) throw new DictionaryConfigError("本地JSON文件已存在，请重新输入文件名称");
    const values = await readDictionaryValues(dictionary.fileName);
    if (nextFileName !== dictionary.fileName) {
      if (values.length) throw new DictionaryConfigError("当前数据字典已存在枚举值，本地JSON文件名称不可修改");
      if (await dictionaryFileExists(nextFileName)) throw new DictionaryConfigError("本地JSON文件已存在，请重新输入文件名称");
      await renameDictionaryFile(dictionary.fileName, nextFileName); renamed = true;
    }
    if (input.status !== dictionary.status && !canDictionary(session, input.status === RecordStatus.ENABLED ? "enable" : "disable")) throw new DictionaryConfigError("暂无此状态变更权限");
    const result = await db.dataDictionary.updateMany({ where: { id, updatedAt: dictionary.updatedAt }, data: { name: input.name, code: input.code, fileName: nextFileName, remark: input.remark || null, status: input.status, version: { increment: 1 } } });
    if (!result.count) throw new DictionaryConfigError("当前数据字典已被其他用户修改，请刷新后重新操作");
    const fileDetail = nextFileName !== dictionary.fileName ? `；本地JSON文件：${dictionary.fileName} → ${nextFileName}` : "";
    await log(session.userId, "编辑", "成功", `编辑数据字典：${dictionary.recordNo}${fileDetail}`);
    if ([dictionary.code, input.code, dictionary.fileName.replace(/\.json$/i, ""), nextFileName.replace(/\.json$/i, "")].some(value => value.toLowerCase() === "ai_service")) revalidatePath("/lead_pc/settings/parameters");
    return NextResponse.json({ message: "数据字典保存成功" });
  } catch (error) {
    if (renamed) await renameDictionaryFile(nextFileName, dictionary.fileName).catch(() => undefined);
    const isUnique = (error as { code?: string }).code === "P2002";
    const message = error instanceof DictionaryConfigError ? error.message : isUnique ? "字典名称或本地JSON文件已存在，请重新输入" : "数据字典保存失败，请稍后重试";
    await log(session.userId, "编辑", "失败", `数据字典：${dictionary.recordNo}；${message}`);
    return NextResponse.json({ message }, { status: message.includes("其他用户") ? 409 : 400 });
  }
}

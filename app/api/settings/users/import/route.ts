import bcrypt from "bcryptjs";
import { Prisma, RecordStatus, UserType } from "@prisma/client";
import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { requireApiSession, sessionHasPermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";
import { normalizeUserTags } from "@/lib/user-tags";
import { parseUserImportSheet, userImportFields, type UserImportRow } from "@/lib/user-import";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_ROWS = 500;
const accountPattern = /^[A-Za-z][A-Za-z0-9_]{1,29}$/;
type ImportIssue = { row: number; excelRow: number; messages: string[] };
type ValidUser = { username: string; realName: string; password: string; roleId: string; phone: string | null; tags: string | null; status: RecordStatus; row: number; excelRow: number };

function normalized(value: string) { return value.trim(); }
function statusValue(value: string) {
  const status = value.normalize("NFKC").trim().toUpperCase();
  if (!status || status === "启用" || status === "已启用" || status === "ENABLED") return RecordStatus.ENABLED;
  if (status === "禁用" || status === "已禁用" || status === "DISABLED") return RecordStatus.DISABLED;
  return undefined;
}
function isUniqueConstraintError(error: unknown) { return (error as { code?: string })?.code === "P2002"; }

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!sessionHasPermission(session, "settings:users")) return NextResponse.json({ message: "暂无用户管理权限" }, { status: 403 });

  let fileName = "";
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ message: "请选择 .xlsx 格式的用户导入文件" }, { status: 400 });
    fileName = file.name;
    if (!file.name.toLowerCase().endsWith(".xlsx")) return NextResponse.json({ message: "仅支持 .xlsx 格式文件" }, { status: 400 });
    if (file.size > MAX_FILE_SIZE) return NextResponse.json({ message: "导入文件不能超过 10MB" }, { status: 400 });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(await file.arrayBuffer()) as never);
    const sheet = workbook.worksheets[0];
    if (!sheet) return NextResponse.json({ message: "导入文件没有用户数据工作表" }, { status: 400 });
    const rows = parseUserImportSheet(sheet);
    if (rows.length > MAX_ROWS) return NextResponse.json({ message: `单次最多导入 ${MAX_ROWS} 名用户` }, { status: 400 });

    const roles = await db.role.findMany({ where: { status: RecordStatus.ENABLED }, select: { id: true, name: true, code: true } });
    const rolesByNameOrCode = new Map<string, typeof roles>();
    for (const role of roles) {
      for (const key of new Set([role.name, role.code])) rolesByNameOrCode.set(key, [...(rolesByNameOrCode.get(key) || []), role]);
    }

    const validRows: ValidUser[] = [];
    const issues: ImportIssue[] = [];
    const accountRows = new Map<string, number[]>();
    const accountValues = new Map<string, string>();
    for (const row of rows) {
      const data = Object.fromEntries(Object.entries(row.data).map(([key, value]) => [key, key === "password" ? value : normalized(value)])) as UserImportRow;
      const messages: string[] = [];
      for (const field of userImportFields.filter(item => item.required)) {
        if (!data[field.key]) messages.push(`${field.header}为必填项`);
      }

      if (data.username && !accountPattern.test(data.username)) messages.push("账号须为2-30位字母、数字或下划线，且以英文字母开头");
      if (data.realName.length > 30) messages.push("真实姓名不能超过30个字符");
      if (data.password && data.password.length < 8) messages.push("初始密码至少需要8位");
      if (data.phone && !/^1\d{10}$/.test(data.phone)) messages.push("手机号须为11位中国大陆手机号");
      if (data.tags.length > 200) messages.push("用户标签不能超过200个字符");

      const matchedRoles = rolesByNameOrCode.get(data.role) || [];
      if (data.role && !matchedRoles.length) messages.push(`角色“${data.role}”不存在或已禁用`);
      else if (matchedRoles.length > 1) messages.push(`角色“${data.role}”对应多个已启用角色，请改填唯一的角色名称或编码`);
      const status = statusValue(data.status);
      if (data.status && !status) messages.push("账号状态仅支持启用、禁用、ENABLED 或 DISABLED");

      if (data.username && accountPattern.test(data.username)) {
        const normalizedAccount = data.username.toLocaleLowerCase("en-US");
        accountRows.set(normalizedAccount, [...(accountRows.get(normalizedAccount) || []), row.excelRow]);
        accountValues.set(normalizedAccount, data.username);
      }
      if (!messages.length && matchedRoles.length === 1 && status) {
        validRows.push({
          username: data.username,
          realName: data.realName,
          password: data.password,
          roleId: matchedRoles[0].id,
          phone: data.phone || null,
          tags: normalizeUserTags(data.tags),
          status,
          row: row.row,
          excelRow: row.excelRow,
        });
      } else if (messages.length) {
        issues.push({ row: row.row, excelRow: row.excelRow, messages: [...new Set(messages)] });
      }
    }

    for (const [username, excelRows] of accountRows) {
      if (excelRows.length < 2) continue;
      for (const excelRow of excelRows) {
        const row = rows.find(item => item.excelRow === excelRow)!;
        const existingIssue = issues.find(issue => issue.excelRow === excelRow);
        const message = "账号与本文件中的其他账号重复";
        if (existingIssue) existingIssue.messages.push(message);
        else issues.push({ row: row.row, excelRow, messages: [message] });
      }
      accountRows.delete(username);
    }

    const usernames = [...accountValues.entries()].filter(([normalizedAccount]) => accountRows.has(normalizedAccount)).map(([, username]) => username);
    if (usernames.length) {
      const existingUsers = await db.user.findMany({ where: { username: { in: usernames } }, select: { username: true } });
      const existingAccounts = new Set(existingUsers.map(user => user.username.toLocaleLowerCase("en-US")));
      if (existingAccounts.size) {
        for (const username of existingAccounts) {
          for (const excelRow of accountRows.get(username) || []) {
            const row = rows.find(item => item.excelRow === excelRow)!;
            const message = "账号已存在，请使用其他账号";
            const existingIssue = issues.find(issue => issue.excelRow === excelRow);
            if (existingIssue) existingIssue.messages.push(message);
            else issues.push({ row: row.row, excelRow, messages: [message] });
          }
        }
      }
    }

    if (issues.length) {
      issues.sort((left, right) => left.excelRow - right.excelRow);
      await writeOperationLog({ userId: session.userId, username: session.username, page: "用户列表", action: "批量导入", result: "失败", detail: `源文件：${fileName}；共 ${rows.length} 条；校验不通过 ${issues.length} 条；未导入任何用户`, request }).catch(() => undefined);
      return NextResponse.json({ message: "导入数据校验未通过，未导入任何用户", total: rows.length, issues }, { status: 400 });
    }

    const passwordHashes: string[] = new Array(validRows.length);
    let nextIndex = 0;
    const workerCount = Math.min(8, validRows.length);
    await Promise.all(Array.from({ length: workerCount }, async () => {
      while (nextIndex < validRows.length) {
        const index = nextIndex++;
        passwordHashes[index] = await bcrypt.hash(validRows[index].password, 12);
      }
    }));

    await db.$transaction(async transaction => transaction.user.createMany({
      data: validRows.map((row, index) => ({
        username: row.username,
        realName: row.realName,
        phone: row.phone,
        tags: row.tags,
        roleId: row.roleId,
        status: row.status,
        type: UserType.CUSTOM,
        passwordHash: passwordHashes[index],
        createdByUserId: session.userId,
      })),
    }));

    await writeOperationLog({ userId: session.userId, username: session.username, page: "用户列表", action: "批量导入", result: "成功", detail: `源文件：${fileName}；导入 ${validRows.length} 名用户`, request }).catch(() => undefined);
    return NextResponse.json({ total: validRows.length, success: validRows.length });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "用户批量导入失败，请稍后重试";
    const duplicate = isUniqueConstraintError(error);
    const message = duplicate ? "账号已存在或与本次导入中的其他账号重复，未导入任何用户" : error instanceof Prisma.PrismaClientKnownRequestError ? "用户数据写入失败，本次未导入任何用户，请稍后重试" : detail;
    await writeOperationLog({ userId: session.userId, username: session.username, page: "用户列表", action: "批量导入", result: "失败", detail: `${fileName ? `源文件：${fileName}；` : ""}${duplicate ? "账号唯一性校验失败" : detail}`, request }).catch(() => undefined);
    return NextResponse.json({ message }, { status: duplicate ? 400 : error instanceof Prisma.PrismaClientKnownRequestError ? 500 : 400 });
  }
}

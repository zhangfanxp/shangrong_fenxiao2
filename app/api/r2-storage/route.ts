import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { r2ErrorResponse } from "@/lib/r2-api";
import { assertR2ConfigFileHealthy, createR2Config, publicR2Detail } from "@/lib/r2-config-service";
import { canR2Storage } from "@/lib/r2-permissions";
import { createR2Schema } from "@/lib/r2-validation";

const listSelect = {
  id: true, recordNo: true, name: true, accountId: true, bucketName: true, endpoint: true,
  signedUrlExpireSeconds: true, status: true, version: true, createdAt: true, updatedAt: true,
  createdBy: { select: { realName: true } }, _count: { select: { references: true } },
} as const;

function forbidden() { return NextResponse.json({ message: "暂无此操作权限" }, { status: 403 }); }
async function log(userId: string, action: string, result: string, detail: string) { await db.operationLog.create({ data: { userId, page: "R2存储空间", action, result, detail } }).catch(() => undefined); }

export async function GET(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canR2Storage(session, "query")) return forbidden();
  const url = new URL(request.url);
  const accountId = (url.searchParams.get("accountId") || "").trim();
  const bucketName = (url.searchParams.get("bucketName") || "").trim();
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(10, Number(url.searchParams.get("pageSize")) || 10));
  const where: Prisma.R2StorageConfigWhereInput = { deletedAt: null, ...(accountId ? { accountId: { contains: accountId } } : {}), ...(bucketName ? { bucketName: { contains: bucketName } } : {}) };
  try {
    await assertR2ConfigFileHealthy();
    const [total, rows] = await db.$transaction([
      db.r2StorageConfig.count({ where }),
      db.r2StorageConfig.findMany({ where, select: listSelect, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    await log(session.userId, "筛选", "成功", accountId || bucketName ? `accountID：${accountId || "-"}；存储桶名称：${bucketName || "-"}` : "加载全部R2存储空间");
    return NextResponse.json({ rows, total, page, pageSize });
  } catch (error) {
    await log(session.userId, "筛选", "失败", "R2存储空间数据加载失败");
    return r2ErrorResponse(error, "R2存储空间数据加载失败，请稍后重试");
  }
}

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canR2Storage(session, "create")) return forbidden();
  const parsed = createR2Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0].message }, { status: 400 });
  try {
    const row = await createR2Config(parsed.data, session.userId);
    await log(session.userId, "新增", "成功", `新增R2存储空间：${row.recordNo}`);
    return NextResponse.json(publicR2Detail(row), { status: 201 });
  } catch (error) {
    await log(session.userId, "新增", "失败", error instanceof Error && !error.message.includes("Key") ? error.message : "R2存储空间保存失败");
    return r2ErrorResponse(error, "R2存储空间保存失败，请稍后重试");
  }
}

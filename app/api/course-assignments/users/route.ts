import { Prisma, RecordStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { getBusinessDictionaryOptions } from "@/lib/business-dictionaries";
import { courseCan } from "@/lib/course-management";
import { db } from "@/lib/db";

const userSelect = {
  id: true, realName: true, username: true, phone: true, tags: true, status: true,
  role: { select: { id: true, name: true, status: true } },
} as const;

function exactTagFilter(tag: string): Prisma.UserWhereInput {
  return { OR: [
    { tags: tag }, { tags: { startsWith: `${tag}|` } },
    { tags: { endsWith: `|${tag}` } }, { tags: { contains: `|${tag}|` } },
  ] };
}

export async function GET(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!courseCan(session, "query")) return NextResponse.json({ message: "暂无课程分配权限" }, { status: 403 });

  const url = new URL(request.url);
  const brand = (url.searchParams.get("brand") || "").trim();
  const roleId = (url.searchParams.get("roleId") || "").trim();
  const tag = (url.searchParams.get("tag") || "").trim();
  const username = (url.searchParams.get("username") || "").trim();
  const statusValue = (url.searchParams.get("status") || "").trim();
  const status = Object.values(RecordStatus).includes(statusValue as RecordStatus) ? statusValue as RecordStatus : undefined;
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(10, Number(url.searchParams.get("pageSize")) || 10));

  try {
    const [brandOptions, roles, tagRows] = await Promise.all([
      getBusinessDictionaryOptions("BRAND"),
      db.role.findMany({ orderBy: [{ type: "asc" }, { name: "asc" }], select: { id: true, name: true, status: true } }),
      db.user.findMany({ where: { tags: { not: null } }, select: { tags: true } }),
    ]);
    const tags = [...new Set(tagRows.flatMap(row => row.tags?.split("|").map(item => item.trim()).filter(Boolean) || []))]
      .sort((left, right) => left.localeCompare(right, "zh-CN"));

    const filters: Prisma.UserWhereInput[] = [];
    if (roleId) filters.push({ roleId });
    if (tag) filters.push(exactTagFilter(tag));
    if (username) filters.push({ OR: [{ realName: { contains: username } }, { username: { contains: username } }] });
    if (status) filters.push({ status });
    if (brand) {
      const option = brandOptions.find(item => item.value === brand);
      if (!option) return NextResponse.json({ message: "所选品牌不存在或已失效，请重新选择" }, { status: 400 });
      const brandRecord = await db.brand.findFirst({ where: { name: option.label }, select: { id: true } });
      if (!brandRecord) filters.push({ id: "__missing_brand__" });
      else filters.push({ OR: [
        { leadH5BrandIds: { equals: Prisma.DbNull } }, { leadH5BrandIds: { equals: Prisma.JsonNull } },
        { leadH5BrandIds: { equals: [] } }, { leadH5BrandIds: { array_contains: brandRecord.id } },
      ] });
    }
    const where: Prisma.UserWhereInput = filters.length ? { AND: filters } : {};
    const [total, rows] = await db.$transaction([
      db.user.count({ where }),
      db.user.findMany({ where, select: userSelect, orderBy: [{ realName: "asc" }, { username: "asc" }], skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    return NextResponse.json({ rows, total, page, pageSize, options: { brands: brandOptions, roles, tags } }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ message: "待分配用户加载失败，请稍后重试" }, { status: 500 });
  }
}

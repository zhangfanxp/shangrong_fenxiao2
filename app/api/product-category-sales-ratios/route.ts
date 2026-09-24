import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";
import {
  PRODUCT_CATEGORY_SALES_PAGE_SIZES,
  canProductCategorySales,
  productCategorySalesDataScope,
  productCategorySalesFilterWhere,
  productCategorySalesFiltersSchema,
  productCategorySalesListSelect,
  serializeProductCategorySales,
} from "@/lib/product-category-sales-ratios";

const pageName = "产品类别销售占比";

export async function GET(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canProductCategorySales(session, "query")) return NextResponse.json({ message: "暂无产品类别销售占比查询权限" }, { status: 403 });
  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const requestedPageSize = Number(url.searchParams.get("pageSize")) || 20;
  const pageSize = PRODUCT_CATEGORY_SALES_PAGE_SIZES.includes(requestedPageSize as 20 | 50 | 100) ? requestedPageSize : 20;
  const parsed = productCategorySalesFiltersSchema.safeParse({
    brandCode: url.searchParams.get("brandCode") || "",
    storeNameKeyword: url.searchParams.get("storeNameKeyword") || "",
    month: url.searchParams.get("month") || "",
  });
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message || "筛选条件不正确" }, { status: 400 });
  try {
    const where = { AND: [await productCategorySalesDataScope(session), productCategorySalesFilterWhere(parsed.data)] };
    const [rows, total] = await db.$transaction([
      db.productCategorySalesMonthly.findMany({ where, select: productCategorySalesListSelect, orderBy: [{ year: "desc" }, { month: "desc" }, { storeNameSnapshot: "asc" }], skip: (page - 1) * pageSize, take: pageSize }),
      db.productCategorySalesMonthly.count({ where }),
    ]);
    await writeOperationLog({ userId: session.userId, username: session.username, client: "运营PC端", page: pageName, action: "筛选", result: "成功", detail: `筛选结果：${total} 条`, request }).catch(() => undefined);
    return NextResponse.json({ rows: rows.map(serializeProductCategorySales), total, page, pageSize }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    await writeOperationLog({ userId: session.userId, username: session.username, client: "运营PC端", page: pageName, action: "筛选", result: "失败", detail: "产品类别销售占比列表加载失败", request }).catch(() => undefined);
    return NextResponse.json({ message: "产品类别销售占比数据加载失败，请稍后重试" }, { status: 500 });
  }
}

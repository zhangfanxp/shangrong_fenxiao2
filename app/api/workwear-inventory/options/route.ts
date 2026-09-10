import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { getBusinessDictionaryOptions } from "@/lib/business-dictionaries";
import { canWorkwearInventory } from "@/lib/workwear-inventory";

export async function GET() {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canWorkwearInventory(session, "query")) return NextResponse.json({ message: "无物品管理查询权限" }, { status: 403 });
  try {
    const itemTypes = await getBusinessDictionaryOptions("ITEM_REQUISITION_TYPE");
    return NextResponse.json({ itemTypes });
  } catch {
    return NextResponse.json({ message: "物品类型加载失败，请稍后重试" }, { status: 500 });
  }
}

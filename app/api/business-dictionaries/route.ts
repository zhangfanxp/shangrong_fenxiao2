import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { getBusinessDictionaries, type BusinessDictionaryCode } from "@/lib/business-dictionaries";

const allowed = new Set<BusinessDictionaryCode>(["BRAND", "ASSESSMENT_TYPE", "CONTRACT_STATUS", "COOPERATION_TYPE", "REBATE_TYPE", "STORE_OPERATION_STATUS", "STORE_AREA", "LOCATION_TYPE", "POSITION_LEVEL", "PERSONNEL_STATUS", "SOCIAL_SECURITY_STATUS"]);

export async function GET(request: Request) {
  if (!(await requireApiSession())) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  const requested = new URL(request.url).searchParams.get("codes")?.split(",").map(value => value.trim()).filter(Boolean) ?? [];
  const codes = Array.from(new Set(requested.filter((value): value is BusinessDictionaryCode => allowed.has(value as BusinessDictionaryCode))));
  if (!codes.length) return NextResponse.json({ message: "请指定需要读取的数据字典" }, { status: 400 });
  try {
    return NextResponse.json(await getBusinessDictionaries(codes));
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "数据字典加载失败，请联系系统管理员" }, { status: 500 });
  }
}

import { RecordStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { getBusinessDictionaries } from "@/lib/business-dictionaries";
import { db } from "@/lib/db";
import { getStoreH5Session } from "@/lib/store-h5-auth";

export async function GET() {
  const session = await getStoreH5Session("store-h5:my-store:employees:create");
  if (!session) return NextResponse.json({ message: "登录状态已失效或暂无新增员工权限" }, { status: 401 });
  if (!session.storeId) return NextResponse.json({ message: "当前账号尚未关联门店" }, { status: 409 });
  try {
    const [store, dictionaries, users] = await Promise.all([
      db.store.findFirst({
        where: { id: session.storeId, operationStatus: { not: "CLOSED" } },
        select: { id: true, name: true, workdayHours: true, brand: { select: { id: true, name: true } } },
      }),
      getBusinessDictionaries(["POSITION_LEVEL", "SOCIAL_SECURITY_STATUS"]),
      db.user.findMany({
        where: { status: RecordStatus.ENABLED, personnelProfile: null },
        select: { id: true, username: true, realName: true, role: { select: { name: true } } },
        orderBy: [{ realName: "asc" }, { username: "asc" }],
      }),
    ]);
    if (!store) return NextResponse.json({ message: "当前关联门店不存在或已关闭" }, { status: 409 });
    return NextResponse.json({
      store: {
        id: store.id,
        name: store.name,
        brand: store.brand,
        workdayHours: store.workdayHours === null ? null : Number(store.workdayHours),
      },
      positions: (dictionaries.POSITION_LEVEL || []).map(option => ({ value: option.label, label: option.label })),
      socialSecurityStatuses: dictionaries.SOCIAL_SECURITY_STATUS || [],
      users,
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch {
    return NextResponse.json({ message: "新增员工选项加载失败，请稍后重试" }, { status: 500 });
  }
}

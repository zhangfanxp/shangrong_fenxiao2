import { db } from "@/lib/db";
import { getLeadH5Session } from "@/lib/lead-h5-auth";
import { leadH5StoreDataScope } from "@/lib/lead-h5-store-scope";
import { getStoreH5Session } from "@/lib/store-h5-auth";

export type MobileH5TaskChannel = "store-h5" | "lead-h5";
export type MobileH5TaskAction = "query" | "view" | "attachment" | "submit";

export function mobileH5TaskChannel(request: Request): MobileH5TaskChannel {
  return new URL(request.url).pathname.startsWith("/api/lead-h5/") ? "lead-h5" : "store-h5";
}

export async function getMobileH5TaskSession(request: Request, action: MobileH5TaskAction) {
  const channel = mobileH5TaskChannel(request);
  if (channel === "store-h5") {
    const session = await getStoreH5Session(`store-h5:tasks:${action}`);
    if (!session) return null;
    return {
      ...session,
      channel,
      clientName: "门店员工移动端" as const,
      stores: session.stores,
    };
  }

  // 兼容已经配置过门店任务权限的运营角色；新角色可直接配置运营H5任务权限。
  const session = await getLeadH5Session([`lead-h5:tasks:${action}`, `store-h5:tasks:${action}`]);
  if (!session) return null;
  const stores = action === "query" ? await db.store.findMany({
    where: {
      ...leadH5StoreDataScope(session),
      taskRecords: { some: { assignedUserId: session.userId } },
    },
    select: { id: true, name: true, brandId: true, brand: { select: { name: true } } },
    orderBy: [{ brand: { name: "asc" } }, { name: "asc" }],
  }) : [];
  return {
    ...session,
    channel,
    clientName: "运营移动端" as const,
    stores: stores.map(store => ({ id: store.id, name: store.name, brandId: store.brandId, brandName: store.brand.name })),
  };
}

export function mobileH5UnauthorizedMessage(channel: MobileH5TaskChannel) {
  return channel === "lead-h5" ? "当前账号已无运营H5任务权限，请重新登录或联系管理员" : "当前账号已无门店H5使用权限，请重新登录或联系管理员";
}

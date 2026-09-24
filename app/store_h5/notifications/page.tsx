import { NotificationH5List } from "@/components/notification-h5-list";
import { requireStoreH5PageSession } from "@/lib/store-h5-auth";
import { hasRolePermission } from "@/lib/role-permissions";

export default async function StoreH5NotificationsPage() {
  const session = await requireStoreH5PageSession("store-h5:notifications:view");
  return <NotificationH5List apiPath="/api/store-h5/notifications" backPath="/store_h5" title="门店通知" canMarkRead={hasRolePermission(session.permissions, "store-h5:notifications:read")} />;
}

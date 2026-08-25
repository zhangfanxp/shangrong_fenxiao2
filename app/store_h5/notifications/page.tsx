import { NotificationH5List } from "@/components/notification-h5-list";
import { requireStoreH5PageSession } from "@/lib/store-h5-auth";

export default async function StoreH5NotificationsPage() {
  await requireStoreH5PageSession();
  return <NotificationH5List apiPath="/api/store-h5/notifications" backPath="/store_h5" title="门店通知" />;
}

import { NotificationH5List } from "@/components/notification-h5-list";
import { requireLeadH5PageSession } from "@/lib/lead-h5-auth";

export default async function LeadH5NotificationsPage() {
  await requireLeadH5PageSession();
  return <NotificationH5List apiPath="/api/lead-h5/notifications" backPath="/lead_h5" title="运营通知" />;
}

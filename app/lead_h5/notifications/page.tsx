import { NotificationH5List } from "@/components/notification-h5-list";
import { requireLeadH5PageSession } from "@/lib/lead-h5-auth";
import { hasRolePermission } from "@/lib/role-permissions";

export default async function LeadH5NotificationsPage() {
  const session = await requireLeadH5PageSession("lead-h5:notifications:view");
  return <NotificationH5List apiPath="/api/lead-h5/notifications" backPath="/lead_h5" title="运营通知" canMarkRead={hasRolePermission(session.permissions, "lead-h5:notifications:read")} />;
}

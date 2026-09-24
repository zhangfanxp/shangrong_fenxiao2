import { StoreH5DailyAttendance } from "@/components/store-h5-daily-attendance";
import { requireStoreH5PageSession } from "@/lib/store-h5-auth";
import { hasRolePermission } from "@/lib/role-permissions";

export default async function StoreH5DailyAttendancePage() {
  const session = await requireStoreH5PageSession("store-h5:daily-attendance:view");
  return <StoreH5DailyAttendance canSubmit={hasRolePermission(session.permissions, "store-h5:daily-attendance:submit")} />;
}

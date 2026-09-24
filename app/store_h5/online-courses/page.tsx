import { MobileOnlineCourseList } from "@/components/mobile-online-courses";
import { requireStoreH5PageSession } from "@/lib/store-h5-auth";
import { hasRolePermission } from "@/lib/role-permissions";

export default async function StoreH5OnlineCoursesPage() {
  const session = await requireStoreH5PageSession("store-h5:courses:query");
  return <MobileOnlineCourseList channel="store-h5" clientName="门店H5移动端" canView={hasRolePermission(session.permissions, "store-h5:courses:view")} />;
}

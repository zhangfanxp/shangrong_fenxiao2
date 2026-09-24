import { MobileOnlineCourseList } from "@/components/mobile-online-courses";
import { requireLeadH5PageSession } from "@/lib/lead-h5-auth";
import { hasRolePermission } from "@/lib/role-permissions";

export default async function LeadH5OnlineCoursesPage() {
  const session = await requireLeadH5PageSession("lead-h5:courses:query");
  return <MobileOnlineCourseList channel="lead-h5" clientName="运营H5移动端" canView={hasRolePermission(session.permissions, "lead-h5:courses:view")} />;
}

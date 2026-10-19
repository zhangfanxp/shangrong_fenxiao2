import { LeadH5RectificationList } from "@/components/lead-h5-rectifications";
import { requireLeadH5PageSession } from "@/lib/lead-h5-auth";

export default async function RectificationsPage() {
  const session = await requireLeadH5PageSession("lead-h5:rectifications:view");
  return <LeadH5RectificationList permissions={session.permissions} />;
}

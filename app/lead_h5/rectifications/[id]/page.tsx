import { LeadH5RectificationDetail } from "@/components/lead-h5-rectifications";
import { requireLeadH5PageSession } from "@/lib/lead-h5-auth";

export default async function RectificationPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireLeadH5PageSession("lead-h5:rectifications:view");
  return <LeadH5RectificationDetail id={(await params).id} permissions={session.permissions} />;
}

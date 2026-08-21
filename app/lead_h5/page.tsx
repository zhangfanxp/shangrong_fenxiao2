import { LeadH5Home } from "@/components/lead-h5-home";
import { requireLeadH5PageSession } from "@/lib/lead-h5-auth";

export default async function LeadH5HomePage() {
  const session = await requireLeadH5PageSession();
  return <LeadH5Home realName={session.realName || session.username} />;
}


import { Suspense } from "react";
import { LeadH5ResearchForm } from "@/components/lead-h5-research-form";
import { requireLeadH5PageSession } from "@/lib/lead-h5-auth";
import { hasRolePermission } from "@/lib/role-permissions";

export default async function StoreResearchPage() {
  const session = await requireLeadH5PageSession("lead-h5:store-research:view");
  return <Suspense><LeadH5ResearchForm canSubmit={hasRolePermission(session.permissions, "lead-h5:store-research:submit")} /></Suspense>;
}

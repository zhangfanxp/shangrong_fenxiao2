import { Suspense } from "react";
import { LeadH5ResearchForm } from "@/components/lead-h5-research-form";
import { requireLeadH5PageSession } from "@/lib/lead-h5-auth";

export default async function StoreResearchPage() {
  await requireLeadH5PageSession();
  return <Suspense><LeadH5ResearchForm /></Suspense>;
}

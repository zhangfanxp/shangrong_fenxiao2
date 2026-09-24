import { Suspense } from "react";
import { LeadH5ReviewForm } from "@/components/lead-h5-review-form";
import { requireLeadH5PageSession } from "@/lib/lead-h5-auth";
import { hasRolePermission } from "@/lib/role-permissions";

export default async function StoreCreditReviewPage() {
  const session = await requireLeadH5PageSession("lead-h5:store-credit:view");
  return <Suspense><LeadH5ReviewForm reviewType="STORE_CREDIT_SCORE" reviewTitle="门店信用评分" canSubmit={hasRolePermission(session.permissions, "lead-h5:store-credit:submit")} /></Suspense>;
}

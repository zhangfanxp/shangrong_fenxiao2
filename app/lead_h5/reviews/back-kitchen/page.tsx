import { Suspense } from "react";
import { LeadH5ReviewForm } from "@/components/lead-h5-review-form";
import { requireLeadH5PageSession } from "@/lib/lead-h5-auth";
import { hasRolePermission } from "@/lib/role-permissions";

export default async function BackKitchenReviewPage() {
  const session = await requireLeadH5PageSession("lead-h5:back-kitchen:view");
  return <Suspense><LeadH5ReviewForm reviewType="BACK_KITCHEN_AUDIT" reviewTitle="后厨稽核评分" canSubmit={hasRolePermission(session.permissions, "lead-h5:back-kitchen:submit")} /></Suspense>;
}

import { redirect } from "next/navigation";
import { canAccessPath } from "@/lib/access-control";
import { requireSession } from "@/lib/auth";

const taskLandingPaths = [
  "/lead_pc/tasks/records",
  "/lead_pc/tasks/analysis",
  "/lead_pc/tasks/settings",
] as const;

export default async function TasksPage() {
  const session = await requireSession();
  redirect(taskLandingPaths.find(path => canAccessPath(path, session.permissions)) || "/lead_pc/forbidden");
}

import { redirect } from "next/navigation";
import { FirstLoginPasswordChange } from "@/components/first-login-password-change";
import { getSession } from "@/lib/auth";

export default async function FirstLoginPasswordChangePage() {
  const session = await getSession();
  if (!session) redirect("/lead_pc/login");
  if (!session.mustChangePassword) redirect("/lead_pc/dashboard");
  return <FirstLoginPasswordChange realName={session.realName} />;
}

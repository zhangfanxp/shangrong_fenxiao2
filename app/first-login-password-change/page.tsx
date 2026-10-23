import Link from "next/link";
import { UniversalFirstLoginPasswordChange } from "@/components/universal-first-login-password-change";
import { db } from "@/lib/db";
import { getFirstLoginChangePayload } from "@/lib/first-login-change";

export default async function FirstLoginPasswordChangePage() {
  const pending = await getFirstLoginChangePayload();
  if (pending) {
    const user = await db.user.findUnique({ where: { id: pending.userId }, select: { realName: true, status: true, mustChangePassword: true, role: { select: { status: true } } } });
    if (user?.status === "ENABLED" && user.role.status === "ENABLED" && user.mustChangePassword) {
      return <UniversalFirstLoginPasswordChange realName={user.realName} />;
    }
  }
  return <main className="login-page"><section className="login-panel"><div className="login-card">
    <h2>首次登录状态已失效</h2>
    <p>请回到对应的登录入口重新登录后修改密码。</p>
    <div style={{ display: "grid", gap: 8 }}>
      <Link href="/lead_pc/login">运营PC端登录</Link>
      <Link href="/lead_h5/login">运营移动端登录</Link>
      <Link href="/store_h5/login">门店移动端登录</Link>
    </div>
  </div></section></main>;
}

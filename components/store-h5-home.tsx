"use client";

import { BellOutlined, BookOutlined, CalendarOutlined, CheckCircleOutlined, ClockCircleOutlined, LogoutOutlined, ReadOutlined, ShopOutlined } from "@ant-design/icons";
import { Alert, Button, message, Modal } from "antd";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { LoginNotificationModal } from "@/components/login-notification-modal";
import { hasRolePermission } from "@/lib/role-permissions";

const entries = [
  { key: "pending", name: "待完成任务", icon: <ClockCircleOutlined />, href: "/store_h5/tasks?status=pending", permission: "store-h5:tasks:query" },
  { name: "已完成任务", icon: <CheckCircleOutlined />, href: "/store_h5/tasks?status=completed", permission: "store-h5:tasks:query" },
  { key: "daily-learning", name: "每日学习", icon: <BookOutlined />, href: "/store_h5/daily-learning", permission: "store-h5:daily-learning:query" },
  { name: "通知", icon: <BellOutlined />, href: "/store_h5/notifications", permission: "store-h5:notifications:view" },
  { name: "线上课堂", icon: <ReadOutlined />, href: "/store_h5/online-courses", permission: "store-h5:courses:query" },
  { name: "每日考勤", icon: <CalendarOutlined />, href: "/store_h5/daily-attendance", permission: "store-h5:daily-attendance:view", attendance: true },
  { name: "我的门店", icon: <ShopOutlined />, href: "/store_h5/my-store", permission: "store-h5:my-store:view", myStore: true },
];

export function StoreH5Home({ realName, storeName, permissions, initialPendingCount, initialDailyLearningPending, canAccessDailyAttendance }: { realName: string; storeName: string | null; permissions: string[]; initialPendingCount: number; initialDailyLearningPending: boolean; canAccessDailyAttendance: boolean }) {
  const router = useRouter();
  const [pendingCount, setPendingCount] = useState(initialPendingCount);
  const [dailyLearningPending, setDailyLearningPending] = useState(initialDailyLearningPending);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const canQueryTasks = hasRolePermission(permissions, "store-h5:tasks:query");
  const canQueryDailyLearning = hasRolePermission(permissions, "store-h5:daily-learning:query");
  const canViewNotifications = hasRolePermission(permissions, "store-h5:notifications:view");
  const canReadNotifications = hasRolePermission(permissions, "store-h5:notifications:read");
  const visibleEntries = entries.filter(entry => hasRolePermission(permissions, entry.permission) && (!entry.attendance || canAccessDailyAttendance) && (!entry.myStore || Boolean(storeName)));
  const refreshPendingCount = useCallback(async () => {
    if (!canQueryTasks) return;
    try {
      const response = await fetch("/api/store-h5/tasks/pending/count", { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (response.status === 401) { router.replace("/store_h5/login"); return; }
      if (response.ok && typeof data?.count === "number") setPendingCount(data.count);
    } catch {
      // 保留服务端首屏数量，避免短暂网络异常让角标闪烁或消失。
    }
  }, [canQueryTasks, router]);
  const refreshDailyLearningPending = useCallback(async () => {
    if (!canQueryDailyLearning) return;
    try {
      const response = await fetch("/api/store-h5/daily-learning/pending", { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (response.status === 401) { router.replace("/store_h5/login"); return; }
      if (response.ok && typeof data?.pending === "boolean") setDailyLearningPending(data.pending);
    } catch {
      // 保留服务端首屏状态，避免短暂网络异常造成提醒红点闪烁。
    }
  }, [canQueryDailyLearning, router]);
  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshPendingCount();
        void refreshDailyLearningPending();
      }
    };
    void refreshPendingCount();
    void refreshDailyLearningPending();
    const timer = window.setInterval(refreshWhenVisible, 60_000);
    window.addEventListener("pageshow", refreshWhenVisible);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pageshow", refreshWhenVisible);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refreshDailyLearningPending, refreshPendingCount]);
  const logout = async () => {
    if (loggingOut) return;
    setLoggingOut(true); setLogoutError("");
    try {
      const response = await fetch("/api/store-h5/auth/logout", { method: "POST" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || "退出失败，请稍后重试");
      router.replace("/store_h5/login"); router.refresh();
    } catch (error) { setLogoutError(error instanceof Error ? error.message : "退出失败，请稍后重试"); }
    finally { setLoggingOut(false); }
  };
  return <main className="store-h5-page">
    <header className="store-h5-header"><div><small>{storeName || "门店工作台"}</small><strong>你好：{realName}</strong></div><Button type="text" icon={<LogoutOutlined />} onClick={() => setLogoutOpen(true)}>退出</Button></header>
    <section className="store-h5-hero"><span><ClockCircleOutlined /></span><div><h1>今日工作任务</h1><p>按要求完成任务并及时提交</p></div></section>
    <section className="store-h5-section"><h2>常用功能</h2><div className="store-h5-entry-grid">
      {visibleEntries.map(entry => <button key={entry.name} className="store-h5-entry active" onClick={() => router.push(entry.href)}><span>{entry.icon}{entry.key === "daily-learning" && dailyLearningPending && <i className="mobile-h5-entry-dot" role="status" aria-label="有未完成的每日学习" />}</span><strong>{entry.name}</strong>{entry.key === "pending" && pendingCount > 0 && <b className="store-h5-entry-badge" aria-label={`${pendingCount}项待完成任务`}>{pendingCount > 10 ? "10+" : pendingCount}</b>}</button>)}
    </div></section>
    <Modal title="确认退出当前账号？" open={logoutOpen} centered maskClosable={false} closable={!loggingOut} okText="退出" cancelText="取消" confirmLoading={loggingOut} okButtonProps={{ danger: true }} onCancel={() => !loggingOut && setLogoutOpen(false)} onOk={() => void logout()}>
      <p>退出后需要重新输入账号和密码登录。</p>{logoutError && <Alert type="error" showIcon message={logoutError} />}
    </Modal>
    {canViewNotifications && canReadNotifications && <LoginNotificationModal apiPath="/api/store-h5/notifications/pending-login" />}
  </main>;
}

"use client";

import {
  AuditOutlined, BellOutlined, BookOutlined, CalendarOutlined, CheckSquareOutlined,
  CheckCircleOutlined, ClockCircleOutlined, FileSearchOutlined, LogoutOutlined, ReadOutlined, SafetyCertificateOutlined, ShopOutlined,
} from "@ant-design/icons";
import { Alert, Button, DatePicker, Empty, message, Modal, Radio, Skeleton } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { LoginNotificationModal } from "@/components/login-notification-modal";
import { hasRolePermission } from "@/lib/role-permissions";

const FRONT_HALL_REVIEW_TYPE = "FRONT_HALL_AUDIT";
const BACK_KITCHEN_REVIEW_TYPE = "BACK_KITCHEN_AUDIT";
const STORE_CREDIT_REVIEW_TYPE = "STORE_CREDIT_SCORE";
type Store = { id: string; name: string; recordNo: string; brand: { id: string; name: string } };
type HomeEntry = { key?: string; name: string; icon: React.ReactNode; permission: string | readonly string[]; scoreType?: string; route: string; research?: boolean; direct?: boolean };

const entries: HomeEntry[] = [
  { name: "巡检整改", icon: <CheckSquareOutlined />, permission: "lead-h5:rectifications:view", route: "rectifications", direct: true },
  { key: "pending", name: "待完成任务", icon: <ClockCircleOutlined />, permission: ["lead-h5:tasks:query", "store-h5:tasks:query"], route: "tasks?status=pending", direct: true },
  { name: "已完成任务", icon: <CheckCircleOutlined />, permission: ["lead-h5:tasks:query", "store-h5:tasks:query"], route: "tasks?status=completed", direct: true },
  { name: "前厅稽核评分", icon: <AuditOutlined />, permission: "lead-h5:front-hall:view", scoreType: FRONT_HALL_REVIEW_TYPE, route: "front-hall" },
  { name: "后厨稽核评分", icon: <SafetyCertificateOutlined />, permission: "lead-h5:back-kitchen:view", scoreType: BACK_KITCHEN_REVIEW_TYPE, route: "back-kitchen" },
  { name: "门店信用评分", icon: <CheckSquareOutlined />, permission: "lead-h5:store-credit:view", scoreType: STORE_CREDIT_REVIEW_TYPE, route: "store-credit" },
  { name: "门店调研表", icon: <FileSearchOutlined />, permission: "lead-h5:store-research:view", route: "research/store", research: true },
  { name: "每日学习", icon: <BookOutlined />, permission: "lead-h5:daily-learning:view", route: "daily-learning" },
  { name: "通知", icon: <BellOutlined />, permission: "lead-h5:notifications:view", route: "notifications" },
  { name: "线上课堂", icon: <ReadOutlined />, permission: "lead-h5:courses:query", route: "online-courses" },
];

export function LeadH5Home({ realName, permissions, initialDailyLearningPending, initialPendingCount }: { realName: string; permissions: string[]; initialDailyLearningPending: boolean; initialPendingCount: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState<Dayjs>(dayjs());
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [selectedReview, setSelectedReview] = useState<HomeEntry>();
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string>();
  const [learningLoading, setLearningLoading] = useState(false);
  const [dailyLearningPending, setDailyLearningPending] = useState(initialDailyLearningPending);
  const [pendingCount, setPendingCount] = useState(initialPendingCount);
  const [noLearningOpen, setNoLearningOpen] = useState(false);
  const monthValue = month.format("YYYY-MM");
  const visibleEntries = entries.filter(entry => hasRolePermission(permissions, entry.permission));
  const canViewDailyLearning = hasRolePermission(permissions, "lead-h5:daily-learning:view");
  const canQueryTasks = hasRolePermission(permissions, ["lead-h5:tasks:query", "store-h5:tasks:query"]);
  const canViewNotifications = hasRolePermission(permissions, "lead-h5:notifications:view");
  const canReadNotifications = hasRolePermission(permissions, "lead-h5:notifications:read");

  const loadStores = async (selectedMonth = monthValue) => {
    if (!selectedReview?.scoreType && !selectedReview?.research) return;
    setLoading(true); setError(false); setStoreId(undefined);
    try {
      const query = selectedReview.research
        ? new URLSearchParams({ researchMonth: selectedMonth })
        : new URLSearchParams({ scoreMonth: selectedMonth, scoreType: selectedReview.scoreType! });
      const endpoint = selectedReview.research ? "/api/lead-h5/research/available-stores" : "/api/lead-h5/reviews/available-stores";
      const response = await fetch(`${endpoint}?${query}`, { cache: "no-store" });
      const data = await response.json();
      if (response.status === 401) { router.replace("/lead_h5/login"); return; }
      if (!response.ok) throw new Error(data.message);
      setStores(data.stores);
    } catch { setError(true); setStores([]); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (open && (selectedReview?.scoreType || selectedReview?.research)) void loadStores(); }, [open, selectedReview?.scoreType, selectedReview?.research]);
  const refreshDailyLearningPending = useCallback(async () => {
    if (!canViewDailyLearning) return;
    try {
      const response = await fetch("/api/lead-h5/daily-learning/pending", { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (response.status === 401) { router.replace("/lead_h5/login"); return; }
      if (response.ok && typeof data?.pending === "boolean") setDailyLearningPending(data.pending);
    } catch {
      // 保留服务端首屏状态，避免短暂网络异常造成提醒红点闪烁。
    }
  }, [canViewDailyLearning, router]);
  const refreshPendingCount = useCallback(async () => {
    if (!canQueryTasks) return;
    try {
      const response = await fetch("/api/lead-h5/tasks/pending/count", { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (response.status === 401) { router.replace("/lead_h5/login"); return; }
      if (response.ok && typeof data?.count === "number") setPendingCount(data.count);
    } catch {
      // 保留服务端首屏数量，避免短暂网络异常让角标闪烁或消失。
    }
  }, [canQueryTasks, router]);
  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") { void refreshDailyLearningPending(); void refreshPendingCount(); }
    };
    void refreshDailyLearningPending();
    void refreshPendingCount();
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
  const changeMonth = (value: Dayjs | null) => { if (!value) return; setMonth(value); void loadStores(value.format("YYYY-MM")); };
  const logout = () => { setLogoutError(undefined); setLogoutOpen(true); };
  const confirmLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true); setLogoutError(undefined);
    try {
      const response = await fetch("/api/lead-h5/auth/logout", { method: "POST" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || "退出失败，请稍后重试");
      setLogoutOpen(false); router.replace("/lead_h5/login"); router.refresh();
    } catch (reason) {
      setLogoutError(reason instanceof Error ? reason.message : "退出失败，请稍后重试");
    } finally { setLoggingOut(false); }
  };
  const enterReview = () => {
    if (!storeId || !selectedReview?.route) return;
    const query = new URLSearchParams(selectedReview.research ? { researchMonth: monthValue, storeId } : { scoreMonth: monthValue, storeId });
    const pathname = selectedReview.research ? `/lead_h5/${selectedReview.route}` : `/lead_h5/reviews/${selectedReview.route}`;
    setOpen(false); router.push(`${pathname}?${query}`);
  };
  const openDailyLearning = async () => {
    if (learningLoading) return;
    setLearningLoading(true);
    try {
      const response = await fetch("/api/lead-h5/daily-learning/today", { cache: "no-store" });
      const data = await response.json();
      if (response.status === 401) { router.replace("/lead_h5/login"); return; }
      if (!response.ok) throw new Error(data.message || "每日学习计划加载失败，请稍后重试");
      if (typeof data.pending === "boolean") setDailyLearningPending(data.pending);
      if (!data.task?.id) { setNoLearningOpen(true); return; }
      router.push(`/lead_h5/daily-learning/${data.task.id}`);
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : "每日学习计划加载失败，请稍后重试");
    } finally { setLearningLoading(false); }
  };
  return <main className="lead-h5-page">
    <header className="lead-h5-home-header"><div><small>运营工作台</small><strong>你好：{realName}</strong></div><Button type="text" icon={<LogoutOutlined />} onClick={logout}>退出</Button></header>
    <section className="lead-h5-home-intro"><span><BookOutlined /></span><div><h1>今天也要认真巡店</h1><p>选择运营功能，快速完成门店日常工作</p></div></section>
    <section className="lead-h5-section"><h2>运营功能</h2><div className="lead-h5-entry-grid">
      {visibleEntries.map(entry => <button key={entry.name} disabled={entry.route === "daily-learning" && learningLoading} className="lead-h5-entry active" onClick={() => { if (entry.route === "daily-learning") { void openDailyLearning(); } else if (entry.direct || entry.route === "notifications" || entry.route === "online-courses") { router.push(`/lead_h5/${entry.route}`); } else { setSelectedReview(entry); setOpen(true); } }}><span>{entry.icon}{entry.route === "daily-learning" && dailyLearningPending && <i className="mobile-h5-entry-dot" role="status" aria-label="有未完成的每日学习" />}</span><strong>{entry.name}</strong>{entry.route === "daily-learning" && learningLoading && <small>正在查询</small>}{entry.key === "pending" && pendingCount > 0 && <b className="store-h5-entry-badge" aria-label={`${pendingCount}项待完成任务`}>{pendingCount > 10 ? "10+" : pendingCount}</b>}</button>)}
    </div></section>
    <Modal className="lead-h5-select-modal" title={selectedReview?.research ? "请选择调研门店" : selectedReview ? `请选择${selectedReview.name}信息` : "请选择"} open={open} onCancel={() => setOpen(false)} okText="确定" cancelText="取消" onOk={enterReview} okButtonProps={{ disabled: !storeId || loading || !stores.length }} destroyOnHidden>
      <label className="lead-h5-field-label">{selectedReview?.research ? "调研月份" : "评分月份"}</label><DatePicker picker="month" allowClear={false} value={month} onChange={changeMonth} format="YYYY年MM月" suffixIcon={<CalendarOutlined />} />
      <label className="lead-h5-field-label store-label">店铺列表</label>
      {loading ? <div className="lead-h5-store-loading"><Skeleton active paragraph={{ rows: 3 }} title={false} /></div> : error ? <Alert type="error" showIcon message="店铺数据加载失败，请稍后重试" action={<Button size="small" onClick={() => void loadStores()}>重试</Button>} /> : !stores.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={selectedReview?.research ? "当前月份暂无待调研店铺" : "当前月份暂无待评分店铺"} /> : <Radio.Group className="lead-h5-store-list" value={storeId} onChange={event => setStoreId(event.target.value)}>
        {stores.map(store => <Radio key={store.id} value={store.id}><span className="lead-h5-store-radio"><span className="lead-h5-store-icon"><ShopOutlined /></span><span><strong>{store.name}</strong><small>{store.brand.name} · {store.recordNo}</small></span></span></Radio>)}
      </Radio.Group>}
    </Modal>
    <Modal className="lead-h5-logout-modal" title="确认退出当前账号？" open={logoutOpen} centered maskClosable={false} closable={!loggingOut} okText="退出" cancelText="取消" confirmLoading={loggingOut} okButtonProps={{ danger: true }} onCancel={() => { if (!loggingOut) setLogoutOpen(false); }} onOk={() => void confirmLogout()}>
      <p>退出后需要重新输入账号和密码登录。</p>
      {logoutError && <Alert type="error" showIcon message={logoutError} />}
    </Modal>
    <Modal className="lead-h5-feedback-modal" title="温馨提示" open={noLearningOpen} centered closable={false} maskClosable={false} footer={<Button type="primary" onClick={() => setNoLearningOpen(false)}>我知道了</Button>}>
      <p>您当日暂无每日学习计划。</p>
    </Modal>
    {canViewNotifications && canReadNotifications && <LoginNotificationModal apiPath="/api/lead-h5/notifications/pending-login" />}
  </main>;
}

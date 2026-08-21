"use client";

import {
  AuditOutlined, BellOutlined, BookOutlined, CalendarOutlined, CheckSquareOutlined,
  FileSearchOutlined, LogoutOutlined, ReadOutlined, SafetyCertificateOutlined, ShopOutlined,
} from "@ant-design/icons";
import { Alert, Button, DatePicker, Empty, message, Modal, Radio, Skeleton } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const FRONT_HALL_REVIEW_TYPE = "FRONT_HALL_AUDIT";
type Store = { id: string; name: string; recordNo: string; brand: { id: string; name: string } };

const entries = [
  { name: "前厅稽核评分", icon: <AuditOutlined />, active: true },
  { name: "后厨稽核评分", icon: <SafetyCertificateOutlined /> },
  { name: "门店信用评分", icon: <CheckSquareOutlined /> },
  { name: "门店调研表", icon: <FileSearchOutlined /> },
  { name: "通知", icon: <BellOutlined /> },
  { name: "任务", icon: <CalendarOutlined /> },
  { name: "线上课堂", icon: <ReadOutlined /> },
];

export function LeadH5Home({ realName }: { realName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState<Dayjs>(dayjs());
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string>();
  const monthValue = month.format("YYYY-MM");

  const loadStores = async (selectedMonth = monthValue) => {
    setLoading(true); setError(false); setStoreId(undefined);
    try {
      const query = new URLSearchParams({ scoreMonth: selectedMonth, scoreType: FRONT_HALL_REVIEW_TYPE });
      const response = await fetch(`/api/lead-h5/reviews/available-stores?${query}`, { cache: "no-store" });
      const data = await response.json();
      if (response.status === 401) { router.replace("/lead_h5/login"); return; }
      if (!response.ok) throw new Error(data.message);
      setStores(data.stores);
    } catch { setError(true); setStores([]); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (open) void loadStores(); }, [open]);
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
    if (!storeId) return;
    const query = new URLSearchParams({ scoreMonth: monthValue, storeId });
    setOpen(false); router.push(`/lead_h5/reviews/front-hall?${query}`);
  };
  return <main className="lead-h5-page">
    <header className="lead-h5-home-header"><div><small>运营工作台</small><strong>你好：{realName}</strong></div><Button type="text" icon={<LogoutOutlined />} onClick={logout}>退出</Button></header>
    <section className="lead-h5-home-intro"><span><BookOutlined /></span><div><h1>今天也要认真巡店</h1><p>选择运营功能，快速完成门店日常工作</p></div></section>
    <section className="lead-h5-section"><h2>运营功能</h2><div className="lead-h5-entry-grid">
      {entries.map(entry => <button key={entry.name} className={`lead-h5-entry ${entry.active ? "active" : ""}`} onClick={() => entry.active ? setOpen(true) : message.info(`${entry.name}功能将在后续开放`)}><span>{entry.icon}</span><strong>{entry.name}</strong>{!entry.active && <small>即将开放</small>}</button>)}
    </div></section>
    <Modal className="lead-h5-select-modal" title="请选择" open={open} onCancel={() => setOpen(false)} okText="确定" cancelText="取消" onOk={enterReview} okButtonProps={{ disabled: !storeId || loading || !stores.length }} destroyOnHidden>
      <label className="lead-h5-field-label">评分月份</label><DatePicker picker="month" allowClear={false} value={month} onChange={changeMonth} format="YYYY年MM月" suffixIcon={<CalendarOutlined />} />
      <label className="lead-h5-field-label store-label">店铺选择</label>
      {loading ? <div className="lead-h5-store-loading"><Skeleton active paragraph={{ rows: 3 }} title={false} /></div> : error ? <Alert type="error" showIcon message="店铺数据加载失败，请稍后重试" action={<Button size="small" onClick={() => void loadStores()}>重试</Button>} /> : !stores.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前月份暂无待评分店铺" /> : <Radio.Group className="lead-h5-store-list" value={storeId} onChange={event => setStoreId(event.target.value)}>
        {stores.map(store => <Radio key={store.id} value={store.id}><span className="lead-h5-store-radio"><span className="lead-h5-store-icon"><ShopOutlined /></span><span><strong>{store.name}</strong><small>{store.brand.name} · {store.recordNo}</small></span></span></Radio>)}
      </Radio.Group>}
    </Modal>
    <Modal className="lead-h5-logout-modal" title="确认退出当前账号？" open={logoutOpen} centered maskClosable={false} closable={!loggingOut} okText="退出" cancelText="取消" confirmLoading={loggingOut} okButtonProps={{ danger: true }} onCancel={() => { if (!loggingOut) setLogoutOpen(false); }} onOk={() => void confirmLogout()}>
      <p>退出后需要重新输入账号和密码登录。</p>
      {logoutError && <Alert type="error" showIcon message={logoutError} />}
    </Modal>
  </main>;
}

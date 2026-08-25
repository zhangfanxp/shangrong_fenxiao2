"use client";

import { ArrowLeftOutlined, BellOutlined, CalendarOutlined, UserOutlined } from "@ant-design/icons";
import { Alert, Button, Empty, Modal, Skeleton, message } from "antd";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type NotificationItem = { id: string; recordNo: string; title: string; content: string; publisherName: string; releaseAt: string; releaseAtText: string; publishedAt: string | null };

export function NotificationH5List({ apiPath, backPath, title }: { apiPath: string; backPath: string; title: string }) {
  const router = useRouter();
  const [rows, setRows] = useState<NotificationItem[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [current, setCurrent] = useState<NotificationItem | null>(null);
  const [acknowledging, setAcknowledging] = useState(false);

  const load = async (nextPage = 1, append = false) => {
    setLoading(true); setError(false);
    try {
      const response = await fetch(`${apiPath}?page=${nextPage}`, { cache: "no-store" });
      const data = await response.json();
      if (response.status === 401) { router.replace(backPath.includes("lead_h5") ? "/lead_h5/login" : "/store_h5/login"); return; }
      if (!response.ok) throw new Error(data.message);
      setRows(previous => append ? [...previous, ...(data.rows || [])] : (data.rows || []));
      setTotal(data.total || 0); setPage(nextPage);
    } catch { setError(true); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const acknowledgeNotification = async () => {
    if (!current || acknowledging) return;
    setAcknowledging(true);
    try {
      const response = await fetch(`${apiPath}/${current.id}/read`, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "通知确认失败，请稍后重试");
      setCurrent(null);
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : "通知确认失败，请稍后重试");
      setCurrent(null);
      void load(1);
    } finally { setAcknowledging(false); }
  };

  return <main className="notification-h5-page">
    <header className="notification-h5-header"><Button type="text" icon={<ArrowLeftOutlined />} onClick={() => router.push(backPath)}>返回</Button><strong>{title}</strong><span /></header>
    <section className="notification-h5-hero"><span><BellOutlined /></span><div><h1>我的通知</h1><p>仅展示已正式发布且属于当前账号的通知</p></div></section>
    {error ? <Alert type="error" showIcon message="通知加载失败，请稍后重试" action={<Button size="small" onClick={() => void load()}>重试</Button>} /> : loading && !rows.length ? <div className="notification-h5-loading"><Skeleton active paragraph={{ rows: 5 }} /></div> : !rows.length ? <Empty className="notification-h5-empty" image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无已发布通知" /> : <section className="notification-h5-list">
      {rows.map(item => <button key={item.id} className="notification-h5-item" onClick={() => setCurrent(item)}>
        <span className="notification-h5-item-icon"><BellOutlined /></span><span className="notification-h5-item-copy"><strong>{item.title}</strong><small>{item.publisherName} · {item.releaseAtText}</small><p>{item.content}</p></span>
      </button>)}
      {rows.length < total && <Button block loading={loading} onClick={() => void load(page + 1, true)}>加载更多</Button>}
    </section>}
    <Modal title={current?.title} open={!!current} onCancel={() => !acknowledging && setCurrent(null)} closable={!acknowledging} maskClosable={!acknowledging} footer={<Button type="primary" loading={acknowledging} onClick={() => void acknowledgeNotification()}>{acknowledging ? "确认中..." : "我已知晓"}</Button>} centered>
      {current && <div className="notification-h5-detail"><div><UserOutlined /> 发布人：{current.publisherName}</div><div><CalendarOutlined /> 发布时间：{current.releaseAtText}</div><p>{current.content}</p><small>记录编号：{current.recordNo}</small></div>}
    </Modal>
  </main>;
}

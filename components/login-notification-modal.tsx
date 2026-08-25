"use client";

import { BellOutlined, CalendarOutlined, LeftOutlined, RightOutlined, UserOutlined } from "@ant-design/icons";
import { Alert, Button, Modal, Skeleton, Space } from "antd";
import { useEffect, useState } from "react";

type LoginNotification = {
  id: string;
  recordNo: string;
  title: string;
  content: string;
  publisherName: string;
  releaseAt: string;
  releaseAtText: string;
};

export function LoginNotificationModal({ apiPath }: { apiPath: string }) {
  const [rows, setRows] = useState<LoginNotification[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [acknowledging, setAcknowledging] = useState(false);
  const [acknowledgeError, setAcknowledgeError] = useState(false);

  const load = async () => {
    setLoading(true); setLoadError(false); setAcknowledgeError(false);
    try {
      const response = await fetch(apiPath, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      setRows(data.rows || []); setIndex(0);
    } catch { setLoadError(true); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [apiPath]);
  const current = rows[index] || null;

  const acknowledge = async () => {
    if (!current || acknowledging) return;
    setAcknowledging(true); setAcknowledgeError(false);
    try {
      const response = await fetch(`${apiPath}/${current.id}/acknowledge`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      const remaining = rows.filter(item => item.id !== current.id);
      setRows(remaining);
      setIndex(previous => remaining.length ? Math.min(previous, remaining.length - 1) : 0);
    } catch { setAcknowledgeError(true); }
    finally { setAcknowledging(false); }
  };

  const open = loadError || rows.length > 0;
  return <Modal
    rootClassName="login-notification-modal"
    title={<div className="login-notification-modal-title"><span><BellOutlined /></span><div><strong>重要通知</strong><small>请阅读通知正文并确认知晓</small></div></div>}
    open={open}
    closable={false}
    maskClosable={false}
    keyboard={false}
    centered
    width={620}
    onCancel={() => undefined}
    footer={loadError ? <Button type="primary" loading={loading} onClick={() => void load()}>重新加载通知</Button> : current ? <div className="login-notification-footer">
      <Space>
        <Button icon={<LeftOutlined />} disabled={index === 0 || acknowledging} onClick={() => { setAcknowledgeError(false); setIndex(value => Math.max(0, value - 1)); }}>上一个</Button>
        <span className="login-notification-progress">第 <strong>{index + 1}</strong> / {rows.length} 条</span>
        <Button disabled={index >= rows.length - 1 || acknowledging} onClick={() => { setAcknowledgeError(false); setIndex(value => Math.min(rows.length - 1, value + 1)); }}>下一个 <RightOutlined /></Button>
      </Space>
      <Button className="login-notification-ack-button" type="primary" loading={acknowledging} onClick={() => void acknowledge()}>我已知晓</Button>
    </div> : null}
  >
    {loadError ? <Alert type="error" showIcon message="登录通知加载失败" description="为避免遗漏重要通知，请重新加载后继续使用系统。" /> : loading ? <Skeleton active paragraph={{ rows: 5 }} /> : current ? <article className="login-notification-content">
      <h2>{current.title}</h2>
      <div className="login-notification-meta"><span><UserOutlined /> 发布人：{current.publisherName}</span><span><CalendarOutlined /> 发布时间：{current.releaseAtText}</span></div>
      <div className="login-notification-body">{current.content}</div>
      <small>通知编号：{current.recordNo}</small>
      {acknowledgeError && <Alert type="error" showIcon message="确认失败，请稍后重试" style={{ marginTop: 16 }} />}
    </article> : null}
  </Modal>;
}

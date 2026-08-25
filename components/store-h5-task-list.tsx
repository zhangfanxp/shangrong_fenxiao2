"use client";

import { ArrowLeftOutlined, CalendarOutlined, CheckCircleOutlined, ClockCircleOutlined, RightOutlined } from "@ant-design/icons";
import { Alert, Button, Empty, Segmented, Select, Skeleton, Tag } from "antd";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type ListStatus = "pending" | "completed";
type StoreOption = { id: string; name: string; brandName: string };
type TaskRow = { id: string; taskName: string; taskTypeLabel: string; triggeredAt: string; dueDate: string; completedAt?: string | null; executionDate: string; storeNameSnapshot?: string | null };

function formatDateTime(value?: string | null) {
  return value ? new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false }) : "-";
}

export function StoreH5TaskList({ initialStatus }: { initialStatus: ListStatus }) {
  const router = useRouter();
  const [status, setStatus] = useState<ListStatus>(initialStatus);
  const [rows, setRows] = useState<TaskRow[]>([]);
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [storeId, setStoreId] = useState("");
  const [date, setDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (nextStatus = status, nextStoreId = storeId) => {
    setLoading(true); setError("");
    try {
      const query = new URLSearchParams({ status: nextStatus });
      if (nextStoreId) query.set("storeId", nextStoreId);
      const response = await fetch(`/api/store-h5/tasks?${query}`, { cache: "no-store" });
      const data = await response.json();
      if (response.status === 401) { router.replace("/store_h5/login"); return; }
      if (!response.ok) throw new Error(data.message || "任务数据加载失败，请稍后重试");
      setRows(data.rows); setStores(data.stores); setDate(data.date);
      if (data.selectedStoreId) {
        setStoreId(data.selectedStoreId);
        window.localStorage.setItem("store_h5_task_store", data.selectedStoreId);
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "任务数据加载失败，请稍后重试"); }
    finally { setLoading(false); }
  }, [router, status, storeId]);

  useEffect(() => { const savedStoreId = window.localStorage.getItem("store_h5_task_store") || ""; void load(initialStatus, savedStoreId); }, []);

  const changeStatus = (value: string | number) => {
    const next = value === "completed" ? "completed" : "pending";
    setStatus(next); router.replace(`/store_h5/tasks?status=${next}`, { scroll: false }); void load(next, storeId);
  };
  const changeStore = (nextStoreId: string) => { setStoreId(nextStoreId); void load(status, nextStoreId); };
  const title = status === "completed" ? "已完成任务" : "待完成任务";

  return <main className="store-h5-page store-h5-task-page">
    <header className="store-h5-subheader"><Button type="text" aria-label="返回首页" icon={<ArrowLeftOutlined />} onClick={() => router.push("/store_h5")} /><div><strong>{title}</strong><small>{date ? `${date} · 共 ${rows.length} 项` : "任务列表"}</small></div><span /></header>
    <section className="store-h5-task-toolbar">
      <Segmented block value={status} options={[{ label: "待完成", value: "pending" }, { label: "已完成", value: "completed" }]} onChange={changeStatus} />
      <Select value={storeId || undefined} placeholder="请选择门店" optionFilterProp="label" onChange={changeStore} options={stores.map(store => ({ value: store.id, label: `${store.name}（${store.brandName}）` }))} />
    </section>
    <section className="store-h5-task-content">
      {loading ? <div className="store-h5-task-skeleton"><Skeleton active /><Skeleton active /></div> : error ? <Alert type="error" showIcon message={error} action={<Button size="small" onClick={() => void load()}>重新加载</Button>} /> : !rows.length ? <div className="store-h5-empty"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<><strong>当前门店暂无{title}</strong><small>可以切换其他门店查看</small></>} /></div> : <div className="store-h5-task-list">
        {rows.map(row => <article className="store-h5-task-card" key={row.id}><div className="store-h5-task-card-title"><span>{status === "completed" ? <CheckCircleOutlined /> : <ClockCircleOutlined />}</span><div><h2>{row.taskName}</h2><Tag color={status === "completed" ? "success" : "blue"}>{row.taskTypeLabel}</Tag></div></div><div className="store-h5-task-meta"><CalendarOutlined />执行日期：{String(row.executionDate).slice(0, 10)}<br />{status === "completed" ? `完成时间：${formatDateTime(row.completedAt)}` : `截止时间：${formatDateTime(row.dueDate)}`}</div>{status === "pending" ? <Button block type="primary" onClick={() => router.push(`/store_h5/tasks/${row.id}`)}>执行 <RightOutlined /></Button> : <Button block disabled>已完成</Button>}</article>)}
      </div>}
    </section>
  </main>;
}

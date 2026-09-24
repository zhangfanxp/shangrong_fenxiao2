"use client";

import { ArrowLeftOutlined, CalendarOutlined, CheckCircleOutlined, ClockCircleOutlined, ExclamationCircleOutlined, RightOutlined } from "@ant-design/icons";
import { Alert, Button, Empty, Segmented, Select, Skeleton, Tag } from "antd";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type ListStatus = "pending" | "completed" | "overdue";
type StoreOption = { id: string; name: string; brandName: string };
type TaskRow = { id: string; taskName: string; taskTypeLabel: string; targetPersonnelName?: string | null; targetPersonnelPosition?: string | null; triggeredAt: string; dueDate: string; completedAt?: string | null; executionDate: string; storeNameSnapshot?: string | null; draftSavedAt?: string | null };

function formatDateTime(value?: string | null) {
  return value ? new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false }) : "-";
}

export function StoreH5TaskList({ initialStatus, canView, channel = "store-h5" }: { initialStatus: ListStatus; canView: boolean; channel?: "store-h5" | "lead-h5" }) {
  const router = useRouter();
  const webBase = channel === "lead-h5" ? "/lead_h5" : "/store_h5";
  const apiBase = channel === "lead-h5" ? "/api/lead-h5" : "/api/store-h5";
  const storeMemoryKey = channel === "lead-h5" ? "lead_h5_task_store" : "store_h5_task_store";
  const [status, setStatus] = useState<ListStatus>(initialStatus);
  const [rows, setRows] = useState<TaskRow[]>([]);
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [storeId, setStoreId] = useState("");
  const [date, setDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (nextStatus = status, nextStoreId = storeId, background = false) => {
    if (!background) { setLoading(true); setError(""); }
    try {
      const query = new URLSearchParams({ status: nextStatus });
      if (nextStoreId) query.set("storeId", nextStoreId);
      const response = await fetch(`${apiBase}/tasks?${query}`, { cache: "no-store" });
      const data = await response.json();
      if (response.status === 401) { router.replace(`${webBase}/login`); return; }
      if (!response.ok) throw new Error(data.message || "任务数据加载失败，请稍后重试");
      setRows(data.rows); setStores(data.stores); setDate(data.date);
      if (data.selectedStoreId) {
        setStoreId(data.selectedStoreId);
        window.localStorage.setItem(storeMemoryKey, data.selectedStoreId);
      }
    } catch (reason) { if (!background) setError(reason instanceof Error ? reason.message : "任务数据加载失败，请稍后重试"); }
    finally { if (!background) setLoading(false); }
  }, [apiBase, router, status, storeId, storeMemoryKey, webBase]);

  useEffect(() => { const savedStoreId = window.localStorage.getItem(storeMemoryKey) || ""; void load(initialStatus, savedStoreId); }, []);
  useEffect(() => {
    const refreshWhenVisible = () => { if (document.visibilityState === "visible") void load(status, storeId, true); };
    const timer = window.setInterval(refreshWhenVisible, 30_000);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refreshWhenVisible); document.removeEventListener("visibilitychange", refreshWhenVisible); };
  }, [load, status, storeId]);

  const changeStatus = (value: string | number) => {
    const next: ListStatus = value === "completed" ? "completed" : value === "overdue" ? "overdue" : "pending";
    setStatus(next); router.replace(`${webBase}/tasks?status=${next}`, { scroll: false }); void load(next, storeId);
  };
  const changeStore = (nextStoreId: string) => { setStoreId(nextStoreId); void load(status, nextStoreId); };
  const title = status === "completed" ? "已完成任务" : status === "overdue" ? "已逾期任务" : "待完成任务";

  return <main className="store-h5-page store-h5-task-page">
    <header className="store-h5-subheader"><Button type="text" aria-label="返回首页" icon={<ArrowLeftOutlined />} onClick={() => router.push(webBase)} /><div><strong>{title}</strong><small>{date ? `${date} · 共 ${rows.length} 项` : "任务列表"}</small></div><span /></header>
    <section className="store-h5-task-toolbar">
      <Segmented block value={status} options={[{ label: "待完成", value: "pending" }, { label: "已完成", value: "completed" }, { label: "已逾期", value: "overdue" }]} onChange={changeStatus} />
      <Select value={storeId || undefined} placeholder="请选择门店" optionFilterProp="label" onChange={changeStore} options={stores.map(store => ({ value: store.id, label: `${store.name}（${store.brandName}）` }))} />
    </section>
    <section className="store-h5-task-content">
      {loading ? <div className="store-h5-task-skeleton"><Skeleton active /><Skeleton active /></div> : error ? <Alert type="error" showIcon message={error} action={<Button size="small" onClick={() => void load()}>重新加载</Button>} /> : !rows.length ? <div className="store-h5-empty"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<><strong>当前门店暂无{title}</strong><small>可以切换其他门店查看</small></>} /></div> : <div className="store-h5-task-list">
        {rows.map(row => <article className={`store-h5-task-card ${status}`} key={row.id}><div className="store-h5-task-card-title"><span>{status === "completed" ? <CheckCircleOutlined /> : status === "overdue" ? <ExclamationCircleOutlined /> : <ClockCircleOutlined />}</span><div><h2>{row.taskName}</h2><Tag color={status === "completed" ? "success" : status === "overdue" ? "error" : "blue"}>{row.taskTypeLabel}</Tag>{status === "pending" && row.draftSavedAt && <Tag color="gold">已暂存</Tag>}</div></div><div className="store-h5-task-meta">{row.targetPersonnelName && <>评选员工：{row.targetPersonnelName}{row.targetPersonnelPosition ? `（${row.targetPersonnelPosition}）` : ""}<br /></>}<CalendarOutlined />执行日期：{String(row.executionDate).slice(0, 10)}<br />{status === "completed" ? `完成时间：${formatDateTime(row.completedAt)}` : `截止时间：${formatDateTime(row.dueDate)}`}{status === "pending" && row.draftSavedAt && <><br />暂存时间：{formatDateTime(row.draftSavedAt)}</>}</div>{status === "pending" ? <Button block type="primary" disabled={!canView} onClick={() => router.push(`${webBase}/tasks/${row.id}`)}>{canView ? <>{row.draftSavedAt ? "继续执行" : "执行"} <RightOutlined /></> : "无任务详情权限"}</Button> : <Button block disabled>{status === "overdue" ? "已逾期" : "已完成"}</Button>}</article>)}
      </div>}
    </section>
  </main>;
}

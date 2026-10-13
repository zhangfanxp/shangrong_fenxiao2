"use client";

import { ArrowLeftOutlined, PhoneOutlined, PlusOutlined, RightOutlined, StarOutlined, TeamOutlined, WalletOutlined } from "@ant-design/icons";
import { Alert, Button, Empty, Skeleton, Tag } from "antd";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type Employee = { id: string; recordNo: string; name: string; phone: string; positionLevel: string; baseSalary: string; status: "ACTIVE" | "RESIGNED" };

const money = (value: string | number) => `¥${Number(value).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function StoreH5EmployeeList({ canView, canCreate }: { canView: boolean; canCreate: boolean }) {
  const router = useRouter();
  const [storeName, setStoreName] = useState("");
  const [rows, setRows] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/store-h5/my-store/employees", { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (response.status === 401) { router.replace("/store_h5/login"); return; }
      if (!response.ok) throw new Error(data?.message || "员工记录加载失败，请稍后重试");
      setStoreName(data.storeName || ""); setRows(data.rows || []);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "员工记录加载失败，请稍后重试"); }
    finally { setLoading(false); }
  }, [router]);
  useEffect(() => { void load(); }, [load]);
  return <main className="store-h5-page store-h5-task-page store-h5-my-store-page">
    <header className="store-h5-subheader"><Button type="text" aria-label="返回我的门店" icon={<ArrowLeftOutlined />} onClick={() => router.push("/store_h5/my-store")} /><div><strong>员工</strong><small>{storeName || "员工记录列表"}</small></div><span /></header>
    <section className="store-h5-my-store-summary"><span><TeamOutlined /></span><div><small>员工记录</small><strong>{loading ? "加载中" : `${rows.length} 人`}</strong></div>{canCreate && <Button className="store-h5-summary-action" type="primary" icon={<PlusOutlined />} onClick={() => router.push("/store_h5/my-store/employees/new")}>新增</Button>}</section>
    <section className="store-h5-task-content">{loading ? <div className="store-h5-task-skeleton"><Skeleton active /><Skeleton active /></div> : error ? <Alert type="error" showIcon message={error} action={<Button size="small" onClick={() => void load()}>重新加载</Button>} /> : !rows.length ? <div className="store-h5-empty"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前门店暂无员工记录" /></div> : <div className="store-h5-employee-list">{rows.map(row => <button key={row.id} className="store-h5-employee-card" disabled={!canView} onClick={() => canView && router.push(`/store_h5/my-store/employees/${row.id}`)}><div className="store-h5-employee-title"><span>{row.name.slice(0, 1)}</span><div><strong>{row.name}</strong><small>{row.recordNo}</small></div><Tag color={row.status === "ACTIVE" ? "success" : "default"}>{row.status === "ACTIVE" ? "在职" : "离职"}</Tag></div><dl><div><dt><PhoneOutlined /> 手机号</dt><dd>{row.phone}</dd></div><div><dt><StarOutlined /> 岗位星级</dt><dd>{row.positionLevel || "-"}</dd></div><div><dt><WalletOutlined /> 基本工资</dt><dd>{money(row.baseSalary)}</dd></div></dl><span className="store-h5-card-link">{canView ? <>查看详情 <RightOutlined /></> : "无详情查看权限"}</span></button>)}</div>}</section>
  </main>;
}

"use client";

import { ArrowLeftOutlined, DollarOutlined } from "@ant-design/icons";
import { Alert, Button, InputNumber, Skeleton, message } from "antd";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type CostData = {
  id: string; recordNo: string; name: string;
  storeRent: string; employeeWages: string; dormitoryRent: string; propertyFee: string; utilitiesFee: string; otherCost: string;
  ratioCoefficient: string; monthlyBreakEvenRevenue: string | null;
};
type EditableKey = "storeRent" | "employeeWages" | "dormitoryRent" | "propertyFee" | "utilitiesFee" | "otherCost";
type Draft = Record<EditableKey, number>;
const fields: Array<{ key: EditableKey; label: string }> = [
  { key: "storeRent", label: "门店房租" }, { key: "employeeWages", label: "员工工资" }, { key: "dormitoryRent", label: "宿舍房租" },
  { key: "propertyFee", label: "物业费" }, { key: "utilitiesFee", label: "水电费" }, { key: "otherCost", label: "其他" },
];
const money = (value: string | number | null) => value === null ? "-" : `¥${Number(value).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const createDraft = (data: CostData): Draft => Object.fromEntries(fields.map(field => [field.key, Number(data[field.key])])) as Draft;

export function StoreH5StoreCost({ canEdit }: { canEdit: boolean }) {
  const router = useRouter();
  const [data, setData] = useState<CostData>();
  const [draft, setDraft] = useState<Draft>();
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/store-h5/my-store/cost", { cache: "no-store" });
      const result = await response.json().catch(() => null);
      if (response.status === 401) { router.replace("/store_h5/login"); return; }
      if (!response.ok) throw new Error(result?.message || "门店成本加载失败，请稍后重试");
      setData(result); setDraft(createDraft(result));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "门店成本加载失败，请稍后重试"); }
    finally { setLoading(false); }
  }, [router]);
  useEffect(() => { void load(); }, [load]);
  const ratioCoefficient = Number(data?.ratioCoefficient);
  const monthlyBreakEven = data && draft && ratioCoefficient > 0 ? Object.values(draft).reduce((sum, value) => sum + (Number(value) || 0), 0) / ratioCoefficient : null;
  const save = async () => {
    if (!draft || saving) return;
    if (Object.values(draft).some(value => !Number.isFinite(value) || value < 0)) { message.error("请完整填写大于等于0的成本金额"); return; }
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/store-h5/my-store/cost", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
      const result = await response.json().catch(() => null);
      if (response.status === 401) { router.replace("/store_h5/login"); return; }
      if (!response.ok) throw new Error(result?.message || "门店成本保存失败，请稍后重试");
      setData(result); setDraft(createDraft(result)); setEditing(false); message.success("门店成本已保存");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "门店成本保存失败，请稍后重试"); }
    finally { setSaving(false); }
  };
  return <main className="store-h5-page store-h5-task-page store-h5-my-store-page">
    <header className="store-h5-subheader"><Button type="text" aria-label="返回我的门店" icon={<ArrowLeftOutlined />} onClick={() => router.push("/store_h5/my-store")} /><div><strong>成本</strong><small>{data?.name || "成本查看"}</small></div><span /></header>
    {loading ? <section className="store-h5-task-content"><Skeleton active paragraph={{ rows: 9 }} /></section> : error && !data ? <section className="store-h5-task-content"><Alert type="error" showIcon message={error} action={<Button size="small" onClick={() => void load()}>重新加载</Button>} /></section> : data && draft ? <>
      <section className="store-h5-my-store-summary"><span><DollarOutlined /></span><div><small>月保本营业额</small><strong>{money(editing ? monthlyBreakEven : data.monthlyBreakEvenRevenue)}</strong></div></section>
      {error && <Alert className="store-h5-inline-alert" type="error" showIcon message={error} closable onClose={() => setError("")} />}
      <section className="store-h5-detail-section store-h5-edit-section"><h2>门店成本</h2><div className="store-h5-readonly-row"><span>门店名称</span><strong>{data.name}</strong></div><div className="store-h5-readonly-row"><span>门店编号</span><strong>{data.recordNo}</strong></div>{fields.map(field => editing ? <label className="store-h5-mobile-field" key={field.key}><span>{field.label}</span><InputNumber value={draft[field.key]} min={0} max={999999999999.99} precision={2} controls={false} prefix="¥" inputMode="decimal" onChange={value => setDraft(current => current ? { ...current, [field.key]: value === null ? 0 : Number(value) } : current)} /></label> : <div className="store-h5-readonly-row" key={field.key}><span>{field.label}</span><strong>{money(data[field.key])}</strong></div>)}<div className="store-h5-readonly-row emphasis"><span>比例系数</span><strong>{Number(data.ratioCoefficient)}</strong></div><div className="store-h5-readonly-row emphasis"><span>月保本营业额</span><strong>{money(editing ? monthlyBreakEven : data.monthlyBreakEvenRevenue)}</strong></div></section>
      <div className="store-h5-my-store-bottom">{editing ? <><Button block size="large" disabled={saving} onClick={() => { setDraft(createDraft(data)); setEditing(false); setError(""); }}>取消</Button><Button block type="primary" size="large" loading={saving} onClick={() => void save()}>保存</Button></> : <>{canEdit && <Button block type="primary" size="large" onClick={() => setEditing(true)}>编辑</Button>}<Button block size="large" onClick={() => router.push("/store_h5/my-store")}>关闭</Button></>}</div>
    </> : null}
  </main>;
}

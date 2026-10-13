"use client";

import { ArrowLeftOutlined, TagsOutlined } from "@ant-design/icons";
import { Alert, Button, Input, Skeleton, message } from "antd";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type AliasKey = "douyinLaikeName" | "kuaishouName" | "meituanManagerName" | "meituanBusinessName";
type AliasData = { id: string; recordNo: string; name: string } & Record<AliasKey, string | null>;
const fields: Array<{ key: AliasKey; label: string; placeholder: string }> = [
  { key: "douyinLaikeName", label: "抖音来客", placeholder: "请输入抖音来客店名" },
  { key: "kuaishouName", label: "快手", placeholder: "请输入快手店名" },
  { key: "meituanManagerName", label: "美团管家", placeholder: "请输入美团管家店名" },
  { key: "meituanBusinessName", label: "美团经营宝", placeholder: "请输入美团经营宝店名" },
];
const createDraft = (data: AliasData) => Object.fromEntries(fields.map(field => [field.key, data[field.key] || ""])) as Record<AliasKey, string>;

export function StoreH5StoreAliases({ canEdit }: { canEdit: boolean }) {
  const router = useRouter();
  const [data, setData] = useState<AliasData>();
  const [draft, setDraft] = useState<Record<AliasKey, string>>();
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/store-h5/my-store/aliases", { cache: "no-store" });
      const result = await response.json().catch(() => null);
      if (response.status === 401) { router.replace("/store_h5/login"); return; }
      if (!response.ok) throw new Error(result?.message || "门店别名加载失败，请稍后重试");
      setData(result); setDraft(createDraft(result));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "门店别名加载失败，请稍后重试"); }
    finally { setLoading(false); }
  }, [router]);
  useEffect(() => { void load(); }, [load]);
  const save = async () => {
    if (!draft || saving) return;
    if (Object.values(draft).some(value => Array.from(value.trim()).length > 50)) { message.error("平台别名不能超过50个字符"); return; }
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/store-h5/my-store/aliases", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
      const result = await response.json().catch(() => null);
      if (response.status === 401) { router.replace("/store_h5/login"); return; }
      if (!response.ok) throw new Error(result?.message || "门店别名保存失败，请稍后重试");
      setData(result); setDraft(createDraft(result)); setEditing(false); message.success("门店别名已保存");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "门店别名保存失败，请稍后重试"); }
    finally { setSaving(false); }
  };
  return <main className="store-h5-page store-h5-task-page store-h5-my-store-page">
    <header className="store-h5-subheader"><Button type="text" aria-label="返回我的门店" icon={<ArrowLeftOutlined />} onClick={() => router.push("/store_h5/my-store")} /><div><strong>别名</strong><small>{data?.name || "别名查看"}</small></div><span /></header>
    {loading ? <section className="store-h5-task-content"><Skeleton active paragraph={{ rows: 7 }} /></section> : error && !data ? <section className="store-h5-task-content"><Alert type="error" showIcon message={error} action={<Button size="small" onClick={() => void load()}>重新加载</Button>} /></section> : data && draft ? <>
      <section className="store-h5-my-store-summary"><span><TagsOutlined /></span><div><small>平台别名</small><strong>{fields.filter(field => data[field.key]).length} 项已配置</strong></div></section>
      {error && <Alert className="store-h5-inline-alert" type="error" showIcon message={error} closable onClose={() => setError("")} />}
      <section className="store-h5-detail-section store-h5-edit-section"><h2>门店别名</h2><div className="store-h5-readonly-row"><span>门店名称</span><strong>{data.name}</strong></div><div className="store-h5-readonly-row"><span>门店编号</span><strong>{data.recordNo}</strong></div>{fields.map(field => editing ? <label className="store-h5-mobile-field" key={field.key}><span>{field.label}</span><Input value={draft[field.key]} maxLength={50} showCount placeholder={field.placeholder} onChange={event => setDraft(current => current ? { ...current, [field.key]: event.target.value } : current)} /></label> : <div className="store-h5-readonly-row" key={field.key}><span>{field.label}</span><strong>{data[field.key] || "-"}</strong></div>)}</section>
      <div className="store-h5-my-store-bottom">{editing ? <><Button block size="large" disabled={saving} onClick={() => { setDraft(createDraft(data)); setEditing(false); setError(""); }}>取消</Button><Button block type="primary" size="large" loading={saving} onClick={() => void save()}>保存</Button></> : <>{canEdit && <Button block type="primary" size="large" onClick={() => setEditing(true)}>编辑</Button>}<Button block size="large" onClick={() => router.push("/store_h5/my-store")}>关闭</Button></>}</div>
    </> : null}
  </main>;
}

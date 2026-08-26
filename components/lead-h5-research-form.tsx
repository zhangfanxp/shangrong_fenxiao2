"use client";

import {
  ArrowLeftOutlined,
  CheckCircleFilled,
  FileSearchOutlined,
  ReloadOutlined,
  ShopOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Alert, Button, Card, Form, Input, Modal, Skeleton, Tag } from "antd";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

type Item = { id: string; section: string; subSection: string; label: string; component: "input"; required: boolean };
type Config = { recordNo: string; templateType: string; configVersion: number; items: Item[] };
type TemplateData = {
  store: { id: string; name: string; brandName: string };
  supervisor: { realName: string };
  template: { id: string; recordNo: string; templateType: string; configVersion: number };
  config: Config;
};

export function LeadH5ResearchForm() {
  const router = useRouter();
  const search = useSearchParams();
  const researchMonth = search.get("researchMonth") || "";
  const storeId = search.get("storeId") || "";
  const [form] = Form.useForm<Record<string, string>>();
  const [data, setData] = useState<TemplateData>();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [dirty, setDirty] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string>();
  const submitted = useRef(false);
  const dirtyRef = useRef(false);

  const load = async () => {
    setLoading(true); setError(undefined);
    try {
      const query = new URLSearchParams({ researchMonth, storeId });
      const response = await fetch(`/api/lead-h5/research/template?${query}`, { cache: "no-store" });
      const result = await response.json();
      if (response.status === 401) { router.replace("/lead_h5/login"); return; }
      if (!response.ok) throw new Error(result.message || "调研表加载失败，请稍后重试");
      setAnswers({}); setDirty(false); setData(result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "调研表加载失败，请稍后重试");
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [researchMonth, storeId]);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current && !submitted.current) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, []);
  useEffect(() => {
    window.history.pushState({ leadH5ResearchGuard: true }, "", window.location.href);
    const onPopState = () => {
      if (submitted.current || !dirtyRef.current) { submitted.current = true; router.replace("/lead_h5"); return; }
      window.history.pushState({ leadH5ResearchGuard: true }, "", window.location.href);
      setLeaveConfirmOpen(true);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [router]);

  const groups = useMemo(() => {
    const sections = new Map<string, Map<string, Item[]>>();
    for (const item of data?.config.items || []) {
      if (!sections.has(item.section)) sections.set(item.section, new Map());
      const subsections = sections.get(item.section)!;
      if (!subsections.has(item.subSection)) subsections.set(item.subSection, []);
      subsections.get(item.subSection)!.push(item);
    }
    return Array.from(sections, ([name, subsections]) => ({
      name,
      subsections: Array.from(subsections, ([name, items]) => ({ name, items })),
    }));
  }, [data]);
  const completedCount = data?.config.items.filter(item => (answers[item.id] || "").trim()).length || 0;

  const leave = () => {
    if (dirty && !submitted.current) { setLeaveConfirmOpen(true); return; }
    submitted.current = true; router.replace("/lead_h5");
  };
  const confirmLeave = () => {
    submitted.current = true; setLeaveConfirmOpen(false); router.replace("/lead_h5");
  };
  const submit = async () => {
    if (!data) return;
    try {
      await form.validateFields();
      setSubmitConfirmOpen(true);
    } catch (reason) {
      const errorFields = (reason as { errorFields?: Array<{ name: Array<string | number> }> }).errorFields;
      if (errorFields?.[0]) form.scrollToField(errorFields[0].name, { behavior: "smooth", block: "center" });
    }
  };
  const confirmSubmit = async () => {
    if (!data || submitting) return;
    setSubmitting(true); setSubmitError(undefined);
    try {
      const response = await fetch("/api/lead-h5/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          researchMonth,
          storeId,
          researchTemplateId: data.template.id,
          researchTemplateVersion: data.template.configVersion,
          items: data.config.items.map(item => ({ itemId: item.id, value: answers[item.id] || "" })),
        }),
      });
      const result = await response.json();
      if (response.status === 401) { submitted.current = true; router.replace("/lead_h5/login"); return; }
      if (!response.ok) throw new Error(result.message || "调研表提交失败，请检查网络后重试。");
      submitted.current = true; setDirty(false); setSubmitConfirmOpen(false); setSuccessOpen(true);
    } catch (reason) {
      setSubmitConfirmOpen(false);
      setSubmitError(reason instanceof Error ? reason.message : "调研表提交失败，请检查网络后重试。");
    } finally { setSubmitting(false); }
  };

  if (loading) return <main className="lead-h5-review-page"><div className="lead-h5-review-loading"><Skeleton active paragraph={{ rows: 14 }} /></div></main>;
  if (error || !data) return <main className="lead-h5-review-page"><header className="lead-h5-review-header"><Button type="text" icon={<ArrowLeftOutlined />} onClick={leave}>返回</Button><strong>门店调研</strong><span /></header><div className="lead-h5-review-error"><Alert type="error" showIcon message={error || "调研表加载失败，请稍后重试"} action={<Button icon={<ReloadOutlined />} onClick={() => void load()}>重试</Button>} /><Button block onClick={() => router.replace("/lead_h5")}>返回首页</Button></div></main>;

  return <main className="lead-h5-review-page lead-h5-research-page">
    <header className="lead-h5-review-header"><Button type="text" icon={<ArrowLeftOutlined />} onClick={leave}>返回</Button><strong>门店调研</strong><span /></header>
    <section className="lead-h5-review-summary"><div className="lead-h5-review-title"><span><ShopOutlined /></span><div><h1>{data.store.name}</h1><p>{data.store.brandName} · {researchMonth.replace("-", "年")}月</p></div></div><div className="lead-h5-review-meta"><span><UserOutlined /> 考核督导：{data.supervisor.realName}</span><Tag color="blue"><FileSearchOutlined /> {data.template.templateType}</Tag></div></section>
    <Form form={form} layout="vertical" className="lead-h5-research-content" onValuesChange={(_, values) => { setAnswers(values); setDirty(true); }}>
      {groups.map((section, sectionIndex) => <section key={section.name} className="lead-h5-research-section"><div className="lead-h5-score-section-title"><span>{String(sectionIndex + 1).padStart(2, "0")}</span><h2>{section.name}</h2></div>
        {section.subsections.map(subsection => <Card key={`${section.name}-${subsection.name}`} className="lead-h5-research-card" title={subsection.name}>
          {subsection.items.map((item, itemIndex) => <Form.Item key={item.id} name={item.id} label={<span><b>{itemIndex + 1}</b>{item.label}</span>} required={item.required} rules={item.required ? [{ required: true, whitespace: true, message: `请输入${item.label}` }] : undefined}>
            <Input size="large" maxLength={2000} placeholder={item.required ? "请输入（必填）" : "请输入（选填）"} />
          </Form.Item>)}
        </Card>)}
      </section>)}
    </Form>
    <footer className="lead-h5-review-footer lead-h5-research-footer"><div><span>已填写</span><strong>{completedCount}</strong><small>/ {data.config.items.length} 项</small></div><Button type="primary" size="large" loading={submitting} disabled={submitting} onClick={() => void submit()}>{submitting ? "提交中..." : "提交"}</Button></footer>
    <Modal className="lead-h5-submit-modal" title="确认提交本次门店调研？" open={submitConfirmOpen} centered maskClosable={false} closable={!submitting} okText="确认提交" cancelText="取消" confirmLoading={submitting} onCancel={() => { if (!submitting) setSubmitConfirmOpen(false); }} onOk={() => void confirmSubmit()}>
      <p>提交后本次调研将正式保存，一个店铺同一调研月份仅允许提交一次，请确认填写内容无误。</p><div className="lead-h5-submit-summary"><span>{data.store.name}</span><strong>{researchMonth.replace("-", "年")}月</strong></div>
    </Modal>
    <Modal className="lead-h5-submit-modal" title="当前调研尚未提交" open={leaveConfirmOpen} centered okText="确认离开" cancelText="继续填写" onCancel={() => setLeaveConfirmOpen(false)} onOk={confirmLeave}><p>离开后已填写内容将丢失，是否继续？</p></Modal>
    <Modal className="lead-h5-feedback-modal" title="提交失败" open={!!submitError} centered footer={<Button type="primary" onClick={() => setSubmitError(undefined)}>我知道了</Button>} onCancel={() => setSubmitError(undefined)}><Alert type="error" showIcon message={submitError} /></Modal>
    <Modal className="lead-h5-feedback-modal lead-h5-success-modal" title="温馨提示" open={successOpen} centered maskClosable={false} closable={false} footer={<Button type="primary" onClick={() => { setSuccessOpen(false); router.replace("/lead_h5"); }}>我知道了</Button>}><div className="lead-h5-success-content"><CheckCircleFilled /><p>当前门店调研表已提交服务器。</p></div></Modal>
  </main>;
}

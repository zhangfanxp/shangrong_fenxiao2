"use client";

import { ArrowLeftOutlined, CheckCircleFilled, CheckOutlined, CloseOutlined, MinusOutlined, ReloadOutlined, ShopOutlined, UserOutlined } from "@ant-design/icons";
import { Alert, Button, Card, InputNumber, Modal, Radio, Skeleton, Tag } from "antd";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

const REVIEW_TYPE = "FRONT_HALL_AUDIT";
type Result = "PASS" | "PARTIAL" | "FAIL";
type Item = { id: string; description: string; maxScore: number };
type Config = { reviewName: string; scoreMode: "BINARY" | "CUSTOM_SCORE"; configVersion: number; totalScore: number; sections: { name: string; children: { name: string; items: Item[] }[] }[] };
type TemplateData = { store: { id: string; name: string; brandName: string }; reviewer: { realName: string }; assessment: { id: string; name: string; configVersion: number }; config: Config };
type ScoreState = Record<string, { result?: Result; score: number | null }>;

export function LeadH5ReviewForm() {
  const router = useRouter(); const search = useSearchParams();
  const scoreMonth = search.get("scoreMonth") || ""; const storeId = search.get("storeId") || "";
  const [data, setData] = useState<TemplateData>(); const [scores, setScores] = useState<ScoreState>({});
  const [loading, setLoading] = useState(true); const [error, setError] = useState<string>(); const [submitting, setSubmitting] = useState(false);
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false); const [successOpen, setSuccessOpen] = useState(false);
  const [validationIssue, setValidationIssue] = useState<string>(); const [submitError, setSubmitError] = useState<string>();
  const submitted = useRef(false); const leavingPrompt = useRef(false); const dirty = Object.keys(scores).length > 0;
  const dirtyRef = useRef(false);
  const load = async () => {
    setLoading(true); setError(undefined);
    try {
      const query = new URLSearchParams({ scoreMonth, scoreType: REVIEW_TYPE, storeId });
      const response = await fetch(`/api/lead-h5/reviews/template?${query}`, { cache: "no-store" }); const result = await response.json();
      if (response.status === 401) { router.replace("/lead_h5/login"); return; }
      if (!response.ok) throw new Error(result.message || "评分表加载失败，请稍后重试");
      setData(result);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "评分表加载失败，请稍后重试"); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [scoreMonth, storeId]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty && !submitted.current) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", beforeUnload); return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);
  useEffect(() => {
    window.history.pushState({ leadH5ReviewGuard: true }, "", window.location.href);
    const onPopState = () => {
      if (submitted.current || !dirtyRef.current) { submitted.current = true; router.replace("/lead_h5"); return; }
      window.history.pushState({ leadH5ReviewGuard: true }, "", window.location.href);
      if (leavingPrompt.current) return;
      leavingPrompt.current = true;
      Modal.confirm({ title: "当前评分尚未提交", content: "离开后已填写内容将丢失，是否继续？", okText: "确认离开", cancelText: "继续评分", onOk: () => { submitted.current = true; router.replace("/lead_h5"); }, afterClose: () => { leavingPrompt.current = false; } });
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [router]);
  const currentScore = useMemo(() => Math.round(Object.values(scores).reduce((sum, value) => sum + (value.score || 0), 0) * 10) / 10, [scores]);
  const choose = (item: Item, result: Result) => setScores(previous => ({ ...previous, [item.id]: { result, score: result === "PASS" ? item.maxScore : result === "FAIL" ? 0 : null } }));
  const partialScore = (item: Item, score: number | null) => setScores(previous => ({ ...previous, [item.id]: { result: "PARTIAL", score } }));
  const leave = () => {
    if (!dirty || submitted.current) return router.replace("/lead_h5");
    if (leavingPrompt.current) return; leavingPrompt.current = true;
    Modal.confirm({ title: "当前评分尚未提交", content: "离开后已填写内容将丢失，是否继续？", okText: "确认离开", cancelText: "继续评分", onOk: () => { submitted.current = true; router.replace("/lead_h5"); }, afterClose: () => { leavingPrompt.current = false; } });
  };
  const validate = () => {
    if (!data) return false;
    for (const section of data.config.sections) for (const subsection of section.children) for (const item of subsection.items) {
      const value = scores[item.id];
      const invalidPartial = value?.result === "PARTIAL" && (value.score == null || value.score <= 0 || value.score >= item.maxScore || Math.round(value.score * 10) !== value.score * 10);
      if (!value?.result || invalidPartial) {
        document.getElementById(`review-${item.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
        setValidationIssue(invalidPartial ? `“${item.description}”的部分合格得分须大于0且小于${item.maxScore}，最多1位小数。` : "还有未完成的评分项目，请完成后再提交。");
        return false;
      }
    }
    return true;
  };
  const submit = () => {
    if (!data || !validate()) return;
    setSubmitConfirmOpen(true);
  };
  const confirmSubmit = async () => {
    if (!data || submitting) return;
    setSubmitting(true); setSubmitError(undefined);
    try {
      const response = await fetch("/api/lead-h5/reviews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scoreMonth, scoreType: REVIEW_TYPE, storeId, reviewTemplateId: data.assessment.id, reviewTemplateVersion: data.assessment.configVersion, items: Object.entries(scores).map(([itemId, value]) => ({ itemId, result: value.result, score: value.score })) }) });
      const result = await response.json();
      if (response.status === 401) { submitted.current = true; router.replace("/lead_h5/login"); return; }
      if (!response.ok) throw new Error(result.message || "评分提交失败，请检查网络后重试。");
      submitted.current = true; setScores({}); setSubmitConfirmOpen(false); setSuccessOpen(true);
    } catch (reason) {
      setSubmitConfirmOpen(false); setSubmitError(reason instanceof Error ? reason.message : "评分提交失败，请检查网络后重试。");
    } finally { setSubmitting(false); }
  };
  if (loading) return <main className="lead-h5-review-page"><div className="lead-h5-review-loading"><Skeleton active paragraph={{ rows: 14 }} /></div></main>;
  if (error || !data) return <main className="lead-h5-review-page"><header className="lead-h5-review-header"><Button type="text" icon={<ArrowLeftOutlined />} onClick={leave}>返回</Button><strong>前厅稽核评分</strong><span /></header><div className="lead-h5-review-error"><Alert type="error" showIcon message={error || "评分表加载失败，请稍后重试"} action={<Button icon={<ReloadOutlined />} onClick={() => void load()}>重试</Button>} /><Button block onClick={() => router.replace("/lead_h5")}>返回首页</Button></div></main>;
  return <main className="lead-h5-review-page">
    <header className="lead-h5-review-header"><Button type="text" icon={<ArrowLeftOutlined />} onClick={leave}>返回</Button><strong>前厅稽核评分</strong><span /></header>
    <section className="lead-h5-review-summary"><div className="lead-h5-review-title"><span><ShopOutlined /></span><div><h1>{data.store.name}</h1><p>{data.store.brandName} · {scoreMonth.replace("-", "年")}月</p></div></div><div className="lead-h5-review-meta"><span><UserOutlined /> 评分人：{data.reviewer.realName}</span><Tag color="blue">满分 {data.config.totalScore}</Tag></div></section>
    <section className="lead-h5-review-content">
      {data.config.sections.map((section, sectionIndex) => <section key={`${section.name}-${sectionIndex}`} className="lead-h5-score-section"><div className="lead-h5-score-section-title"><span>{String(sectionIndex + 1).padStart(2, "0")}</span><h2>{section.name}</h2></div>
        {section.children.map((subsection, subsectionIndex) => <div key={`${subsection.name}-${subsectionIndex}`} className="lead-h5-score-subsection"><h3>{subsection.name}</h3>
          {subsection.items.map((item, itemIndex) => { const value = scores[item.id]; const partial = value?.result === "PARTIAL"; const invalid = partial && (value.score == null || value.score <= 0 || value.score >= item.maxScore || Math.round(value.score * 10) !== value.score * 10); return <Card id={`review-${item.id}`} key={item.id} className={`lead-h5-score-card ${value?.result ? "completed" : ""}`}>
            <div className="lead-h5-score-card-head"><span className="lead-h5-item-no">{itemIndex + 1}</span><p>{item.description}</p><strong>{item.maxScore}分</strong></div>
            <Radio.Group className={`lead-h5-score-options ${data.config.scoreMode === "BINARY" ? "two-options" : "three-options"}`} value={value?.result} onChange={event => choose(item, event.target.value)}>
              <Radio.Button className="lead-h5-score-option pass" value="PASS"><CheckOutlined />合格</Radio.Button>{data.config.scoreMode === "CUSTOM_SCORE" && <Radio.Button className="lead-h5-score-option partial" value="PARTIAL" disabled={item.maxScore <= 0.1}><MinusOutlined />部分合格</Radio.Button>}<Radio.Button className="lead-h5-score-option fail" value="FAIL"><CloseOutlined />不合格</Radio.Button>
            </Radio.Group>
            <div className="lead-h5-item-score"><span>实际得分</span><InputNumber value={value?.score} disabled={!partial} min={0.1} max={Math.max(0.1, item.maxScore - 0.1)} precision={1} step={0.1} status={invalid ? "error" : undefined} onChange={next => partialScore(item, next)} /><span>分</span></div>
            {invalid && <div className="lead-h5-item-error">得分须大于0且小于{item.maxScore}，最多1位小数</div>}
          </Card>; })}
        </div>)}
      </section>)}
    </section>
    <footer className="lead-h5-review-footer"><div><span>当前得分</span><strong>{currentScore}</strong><small>/ {data.config.totalScore}</small></div><Button type="primary" size="large" loading={submitting} disabled={submitting} onClick={submit}>{submitting ? "提交中..." : "提交"}</Button></footer>
    <Modal className="lead-h5-submit-modal" title="确认提交本次前厅稽核评分？" open={submitConfirmOpen} centered maskClosable={false} closable={!submitting} okText="确认提交" cancelText="取消" confirmLoading={submitting} onCancel={() => { if (!submitting) setSubmitConfirmOpen(false); }} onOk={() => void confirmSubmit()}>
      <p>提交后本次评分将正式保存，一个店铺同一评分月份仅允许提交一次，请确认评分内容无误。</p>
      <div className="lead-h5-submit-summary"><span>{data.store.name}</span><strong>{currentScore} / {data.config.totalScore} 分</strong></div>
    </Modal>
    <Modal className="lead-h5-feedback-modal" title="评分尚未完成" open={!!validationIssue} centered footer={<Button type="primary" onClick={() => setValidationIssue(undefined)}>我知道了</Button>} onCancel={() => setValidationIssue(undefined)}><p>{validationIssue}</p></Modal>
    <Modal className="lead-h5-feedback-modal" title="提交失败" open={!!submitError} centered footer={<Button type="primary" onClick={() => setSubmitError(undefined)}>我知道了</Button>} onCancel={() => setSubmitError(undefined)}><Alert type="error" showIcon message={submitError} /></Modal>
    <Modal className="lead-h5-feedback-modal lead-h5-success-modal" title="温馨提示" open={successOpen} centered maskClosable={false} closable={false} footer={<Button type="primary" onClick={() => { setSuccessOpen(false); router.replace("/lead_h5"); }}>我知道了</Button>}><div className="lead-h5-success-content"><CheckCircleFilled /><p>当前评分已提交服务器。</p></div></Modal>
  </main>;
}

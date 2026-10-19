"use client";

import { ArrowLeftOutlined, CameraOutlined, CheckCircleFilled, CheckOutlined, CloseOutlined, DeleteOutlined, MinusOutlined, ReloadOutlined, ShopOutlined, UserOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Input, InputNumber, message, Modal, Radio, Skeleton, Tag } from "antd";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

type Result = "PASS" | "PARTIAL" | "FAIL";
type Item = { id: string; description: string; breachAmount?: string; maxScore: number; supportsPhoto?: boolean };
type Config = { reviewName: string; detailFormat?: "AUDIT" | "CREDIT"; scoreMode: "BINARY" | "CUSTOM_SCORE"; configVersion: number; totalScore: number; photoAttachmentLimit: number; nonFullScoreRequiresPhoto: boolean; failRequiresProblemDescription: boolean; partialRequiresProblemDescription: boolean; sections: { name: string; children: { name: string; items: Item[] }[] }[] };
type ReviewPhoto = { id: string; itemId: string; name: string; size: number; mimeType: string; url?: string | null };
type TemplateData = { store: { id: string; name: string; brandName: string }; reviewer: { realName: string }; assessment: { id: string; name: string; configVersion: number }; config: Config; draftPhotos?: ReviewPhoto[] };
type ScoreState = Record<string, { result?: Result; score: number | null }>;

export function LeadH5ReviewForm({ reviewType, reviewTitle, canSubmit }: { reviewType: "FRONT_HALL_AUDIT" | "BACK_KITCHEN_AUDIT" | "STORE_CREDIT_SCORE"; reviewTitle: string; canSubmit: boolean }) {
  const router = useRouter(); const search = useSearchParams();
  const scoreMonth = search.get("scoreMonth") || ""; const storeId = search.get("storeId") || "";
  const [data, setData] = useState<TemplateData>(); const [scores, setScores] = useState<ScoreState>({});
  const [problemDescriptions, setProblemDescriptions] = useState<Record<string, string>>({});
  const [photos, setPhotos] = useState<Record<string, ReviewPhoto[]>>({}); const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true); const [error, setError] = useState<string>(); const [submitting, setSubmitting] = useState(false);
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false); const [successOpen, setSuccessOpen] = useState(false);
  const [validationIssue, setValidationIssue] = useState<string>(); const [submitError, setSubmitError] = useState<string>();
  const submitted = useRef(false); const leavingPrompt = useRef(false); const dirty = Object.keys(scores).length > 0 || Object.values(photos).some(items => items.length > 0);
  const dirtyRef = useRef(false);
  const load = async () => {
    setLoading(true); setError(undefined);
    try {
      const query = new URLSearchParams({ scoreMonth, scoreType: reviewType, storeId });
      const response = await fetch(`/api/lead-h5/reviews/template?${query}`, { cache: "no-store" }); const result = await response.json();
      if (response.status === 401) { router.replace("/lead_h5/login"); return; }
      if (!response.ok) throw new Error(result.message || "评分表加载失败，请稍后重试");
      setData(result);
      const grouped: Record<string, ReviewPhoto[]> = {};
      for (const photo of (result.draftPhotos || []) as ReviewPhoto[]) grouped[photo.itemId] = [...(grouped[photo.itemId] || []), photo];
      setPhotos(grouped);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "评分表加载失败，请稍后重试"); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [scoreMonth, storeId, reviewType]);
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
      Modal.confirm({ title: "当前评分尚未提交", content: "离开后评分选择将丢失，已上传照片会保留为草稿，是否继续？", okText: "确认离开", cancelText: "继续评分", onOk: () => { submitted.current = true; router.replace("/lead_h5"); }, afterClose: () => { leavingPrompt.current = false; } });
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [router]);
  const currentScore = useMemo(() => Math.round(Object.values(scores).reduce((sum, value) => sum + (value.score || 0), 0) * 10) / 10, [scores]);
  const choose = (item: Item, result: Result) => setScores(previous => ({ ...previous, [item.id]: { result, score: result === "PASS" ? item.maxScore : result === "FAIL" ? 0 : null } }));
  const partialScore = (item: Item, score: number | null) => setScores(previous => ({ ...previous, [item.id]: { result: "PARTIAL", score } }));
  const uploadPhotos = async (item: Item, selected: FileList | null) => {
    if (!data || !selected?.length || uploading[item.id]) return;
    const current = photos[item.id] || []; const remaining = data.config.photoAttachmentLimit - current.length;
    if (remaining <= 0) return void message.warning(`该考评项最多上传${data.config.photoAttachmentLimit}张照片`);
    const files = Array.from(selected);
    if (files.length > remaining) message.warning(`本次仅上传前${remaining}张，该考评项最多${data.config.photoAttachmentLimit}张`);
    setUploading(previous => ({ ...previous, [item.id]: true }));
    try {
      for (const file of files.slice(0, remaining)) {
        if (!file.type.startsWith("image/")) throw new Error(`“${file.name}”不是图片文件`);
        if (file.size < 1 || file.size > 10 * 1024 * 1024) throw new Error(`“${file.name}”不能超过10MB`);
        const signResponse = await fetch("/api/lead-h5/reviews/photos/sign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ storeId, scoreMonth, scoreType: reviewType, reviewTemplateId: data.assessment.id, reviewTemplateVersion: data.assessment.configVersion, itemId: item.id, name: file.name, type: file.type, size: file.size }) });
        const sign = await signResponse.json(); if (!signResponse.ok) throw new Error(sign.message || "照片上传准备失败");
        const putResponse = await fetch(sign.uploadUrl, { method: "PUT", headers: sign.headers, body: file });
        if (!putResponse.ok) throw new Error("照片上传失败，请检查网络后重试");
        const confirmResponse = await fetch("/api/lead-h5/reviews/photos/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ uploadToken: sign.uploadToken, etag: putResponse.headers.get("etag") }) });
        const confirmed = await confirmResponse.json(); if (!confirmResponse.ok) throw new Error(confirmed.message || "照片上传确认失败");
        setPhotos(previous => ({ ...previous, [item.id]: [...(previous[item.id] || []), confirmed] }));
      }
    } catch (reason) { message.error(reason instanceof Error ? reason.message : "照片上传失败，请稍后重试"); }
    finally { setUploading(previous => ({ ...previous, [item.id]: false })); }
  };
  const removePhoto = async (itemId: string, photo: ReviewPhoto) => {
    try {
      const response = await fetch(`/api/lead-h5/reviews/photos/${photo.id}`, { method: "DELETE" }); const result = await response.json();
      if (!response.ok) throw new Error(result.message || "照片删除失败");
      setPhotos(previous => ({ ...previous, [itemId]: (previous[itemId] || []).filter(row => row.id !== photo.id) }));
    } catch (reason) { message.error(reason instanceof Error ? reason.message : "照片删除失败，请稍后重试"); }
  };
  const leave = () => {
    if (!dirty || submitted.current) return router.replace("/lead_h5");
    if (leavingPrompt.current) return; leavingPrompt.current = true;
    Modal.confirm({ title: "当前评分尚未提交", content: "离开后评分选择将丢失，已上传照片会保留为草稿，是否继续？", okText: "确认离开", cancelText: "继续评分", onOk: () => { submitted.current = true; router.replace("/lead_h5"); }, afterClose: () => { leavingPrompt.current = false; } });
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
      const requiresProblemDescription = (value.result === "FAIL" && data.config.failRequiresProblemDescription)
        || (value.result === "PARTIAL" && data.config.partialRequiresProblemDescription);
      const problemDescription = problemDescriptions[item.id]?.trim() || "";
      if (requiresProblemDescription && !problemDescription) {
        document.getElementById(`review-${item.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
        setValidationIssue(`“${item.description}”的问题描述为必填项，请填写后再提交。`);
        return false;
      }
      if (Array.from(problemDescription).length > 100) {
        document.getElementById(`review-${item.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
        setValidationIssue(`“${item.description}”的问题描述不能超过100个字符。`);
        return false;
      }
      const isNonFull = typeof value?.score === "number" && value.score < item.maxScore;
      if (data.config.nonFullScoreRequiresPhoto && item.supportsPhoto && isNonFull && !(photos[item.id] || []).length) {
        document.getElementById(`review-${item.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
        setValidationIssue(`“${item.description}”未得满分，必须至少上传一张照片。`);
        return false;
      }
    }
    return true;
  };
  const submit = () => {
    if (!canSubmit || !data || !validate()) return;
    setSubmitConfirmOpen(true);
  };
  const confirmSubmit = async () => {
    if (!data || submitting) return;
    setSubmitting(true); setSubmitError(undefined);
    try {
      const response = await fetch("/api/lead-h5/reviews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scoreMonth, scoreType: reviewType, storeId, reviewTemplateId: data.assessment.id, reviewTemplateVersion: data.assessment.configVersion, items: Object.entries(scores).map(([itemId, value]) => ({ itemId, result: value.result, score: value.score, problemDescription: problemDescriptions[itemId] || "", photoIds: (photos[itemId] || []).map(photo => photo.id) })) }) });
      const result = await response.json();
      if (response.status === 401) { submitted.current = true; router.replace("/lead_h5/login"); return; }
      if (!response.ok) throw new Error(result.message || "评分提交失败，请检查网络后重试。");
      submitted.current = true; setScores({}); setProblemDescriptions({}); setPhotos({}); setSubmitConfirmOpen(false); setSuccessOpen(true);
    } catch (reason) {
      setSubmitConfirmOpen(false); setSubmitError(reason instanceof Error ? reason.message : "评分提交失败，请检查网络后重试。");
    } finally { setSubmitting(false); }
  };
  if (loading) return <main className="lead-h5-review-page"><div className="lead-h5-review-loading"><Skeleton active paragraph={{ rows: 14 }} /></div></main>;
  if (error || !data) return <main className="lead-h5-review-page"><header className="lead-h5-review-header"><Button type="text" icon={<ArrowLeftOutlined />} onClick={leave}>返回</Button><strong>{reviewTitle}</strong><span /></header><div className="lead-h5-review-error"><Alert type="error" showIcon message={error || "评分表加载失败，请稍后重试"} action={<Button icon={<ReloadOutlined />} onClick={() => void load()}>重试</Button>} /><Button block onClick={() => router.replace("/lead_h5")}>返回首页</Button></div></main>;
  const isCredit = data.config.detailFormat === "CREDIT";
  return <main className="lead-h5-review-page">
    <header className="lead-h5-review-header"><Button type="text" icon={<ArrowLeftOutlined />} onClick={leave}>返回</Button><strong>{reviewTitle}</strong><span /></header>
    <section className="lead-h5-review-summary"><div className="lead-h5-review-title"><span><ShopOutlined /></span><div><h1>{data.store.name}</h1><p>{data.store.brandName} · {scoreMonth.replace("-", "年")}月</p></div></div><div className="lead-h5-review-meta"><span><UserOutlined /> 评分人：{data.reviewer.realName}</span><Tag color="blue">满分 {data.config.totalScore}</Tag></div></section>
    {!canSubmit && <Alert type="info" showIcon message="当前角色仅可查看评分表，不能填写、上传照片或提交评分" />}
    <section className="lead-h5-review-content">
      {data.config.sections.map((section, sectionIndex) => <section key={`${section.name}-${sectionIndex}`} className="lead-h5-score-section"><div className="lead-h5-score-section-title"><span>{String(sectionIndex + 1).padStart(2, "0")}</span><h2>{section.name}</h2></div>
        {section.children.map((subsection, subsectionIndex) => <div key={`${subsection.name}-${subsectionIndex}`} className={`lead-h5-score-subsection ${isCredit ? "credit" : ""}`}>{!isCredit && <h3>{subsection.name}</h3>}
          {subsection.items.map((item, itemIndex) => { const value = scores[item.id]; const partial = value?.result === "PARTIAL"; const invalid = partial && (value.score == null || value.score <= 0 || value.score >= item.maxScore || Math.round(value.score * 10) !== value.score * 10); return <Card id={`review-${item.id}`} key={item.id} className={`lead-h5-score-card ${value?.result ? "completed" : ""}`}>
            <div className="lead-h5-score-card-head"><span className="lead-h5-item-no">{itemIndex + 1}</span><div className="lead-h5-score-card-copy"><p>{item.description}</p>{isCredit && <div className="lead-h5-credit-meta"><span>违约金额</span><b>{item.breachAmount || "-"}</b><em>分值 {item.maxScore}</em></div>}</div>{!isCredit && <strong>{item.maxScore}分</strong>}</div>
            <Radio.Group disabled={!canSubmit} className={`lead-h5-score-options ${data.config.scoreMode === "BINARY" ? "two-options" : "three-options"}`} value={value?.result} onChange={event => choose(item, event.target.value)}>
              <Radio.Button className="lead-h5-score-option pass" value="PASS"><CheckOutlined />合格</Radio.Button>{data.config.scoreMode === "CUSTOM_SCORE" && <Radio.Button className="lead-h5-score-option partial" value="PARTIAL" disabled={item.maxScore <= 0.1}><MinusOutlined />部分合格</Radio.Button>}<Radio.Button className="lead-h5-score-option fail" value="FAIL"><CloseOutlined />不合格</Radio.Button>
            </Radio.Group>
            <div className="lead-h5-item-score"><span>实际得分</span><InputNumber value={value?.score} disabled={!canSubmit || !partial} min={0.1} max={Math.max(0.1, item.maxScore - 0.1)} precision={1} step={0.1} status={invalid ? "error" : undefined} onChange={next => partialScore(item, next)} /><span>分</span></div>
            {invalid && <div className="lead-h5-item-error">得分须大于0且小于{item.maxScore}，最多1位小数</div>}
            {((value?.result === "FAIL" && data.config.failRequiresProblemDescription) || (value?.result === "PARTIAL" && data.config.partialRequiresProblemDescription)) && <div className="lead-h5-problem-description"><Input.TextArea value={problemDescriptions[item.id] || ""} maxLength={100} showCount rows={3} placeholder="请填写问题描述" onChange={event => setProblemDescriptions(previous => ({ ...previous, [item.id]: event.target.value }))} /></div>}
            {canSubmit && item.supportsPhoto && <div className="lead-h5-review-photos">
              <div className="lead-h5-review-photos-head"><span><CameraOutlined /> 拍照附件{data.config.nonFullScoreRequiresPhoto && value?.score != null && value.score < item.maxScore ? <em className="lead-h5-photo-required">未满分必传</em> : null}</span><small>{(photos[item.id] || []).length}/{data.config.photoAttachmentLimit}张</small></div>
              {!!(photos[item.id] || []).length && <div className="lead-h5-review-photo-grid">{(photos[item.id] || []).map(photo => <div className="lead-h5-review-photo" key={photo.id}>{photo.url ? <img src={photo.url} alt={photo.name} /> : <span><CameraOutlined /></span>}<Button type="text" danger icon={<DeleteOutlined />} aria-label={`删除${photo.name}`} onClick={() => void removePhoto(item.id, photo)} /></div>)}</div>}
              <input id={`review-photo-${item.id}`} hidden type="file" accept="image/*" capture="environment" multiple onChange={event => { void uploadPhotos(item, event.target.files); event.target.value = ""; }} />
              <Button block icon={<CameraOutlined />} loading={uploading[item.id]} disabled={(photos[item.id] || []).length >= data.config.photoAttachmentLimit} onClick={() => document.getElementById(`review-photo-${item.id}`)?.click()}>{uploading[item.id] ? "上传中..." : (photos[item.id] || []).length ? "继续拍照/上传" : "拍照/上传"}</Button>
            </div>}
          </Card>; })}
        </div>)}
      </section>)}
    </section>
    <footer className="lead-h5-review-footer"><div><span>当前得分</span><strong>{currentScore}</strong><small>/ {data.config.totalScore}</small></div><Button type="primary" size="large" loading={submitting} disabled={!canSubmit || submitting} onClick={submit}>{canSubmit ? submitting ? "提交中..." : "提交" : "仅可查看"}</Button></footer>
    <Modal className="lead-h5-submit-modal" title={`确认提交本次${reviewTitle}？`} open={submitConfirmOpen} centered maskClosable={false} closable={!submitting} okText="确认提交" cancelText="取消" confirmLoading={submitting} onCancel={() => { if (!submitting) setSubmitConfirmOpen(false); }} onOk={() => void confirmSubmit()}>
      <p>提交后本次评分将正式保存，一个店铺同一评分月份仅允许提交一次，请确认评分内容无误。</p>
      <div className="lead-h5-submit-summary"><span>{data.store.name}</span><strong>{currentScore} / {data.config.totalScore} 分</strong></div>
    </Modal>
    <Modal className="lead-h5-feedback-modal" title="评分尚未完成" open={!!validationIssue} centered footer={<Button type="primary" onClick={() => setValidationIssue(undefined)}>我知道了</Button>} onCancel={() => setValidationIssue(undefined)}><p>{validationIssue}</p></Modal>
    <Modal className="lead-h5-feedback-modal" title="提交失败" open={!!submitError} centered footer={<Button type="primary" onClick={() => setSubmitError(undefined)}>我知道了</Button>} onCancel={() => setSubmitError(undefined)}><Alert type="error" showIcon message={submitError} /></Modal>
    <Modal className="lead-h5-feedback-modal lead-h5-success-modal" title="温馨提示" open={successOpen} centered maskClosable={false} closable={false} footer={<Button type="primary" onClick={() => { setSuccessOpen(false); router.replace("/lead_h5"); }}>我知道了</Button>}><div className="lead-h5-success-content"><CheckCircleFilled /><p>当前评分已提交服务器。</p></div></Modal>
  </main>;
}

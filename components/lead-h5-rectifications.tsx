"use client";

import { ArrowLeftOutlined, ReloadOutlined } from "@ant-design/icons";
import { Alert, Button, Collapse, Empty, Form, Input, message, Modal, Pagination, Select, Skeleton, Tabs, Tag } from "antd";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { hasRolePermission } from "@/lib/role-permissions";
import {
  RECTIFICATION_DEFAULT_REQUIREMENT, RECTIFICATION_DEADLINES, RECTIFICATION_LABELS, RECTIFICATION_STATUSES,
  rectificationDateTime, rectificationIsOverdue, type RectificationDetail, type RectificationPerson,
  type RectificationRoundDetail, type RectificationStatus,
} from "@/lib/inspection-rectification-shared";
import { RectificationInspectionSection, RectificationRequirementSection, RectificationSubmissionSection } from "@/components/rectification-sections";

const api = "/api/lead-h5/rectifications";
const base = "/lead_h5/rectifications";
type IssueRow = {
  id: string; recordNo: string; status: RectificationStatus; assessmentDate: string; reviewerName: string;
  storeName: string; brandName: string; assessmentName: string; sectionName: string; subsectionName: string;
  itemDescription: string; problemDescription: string | null; result: string; dueAt: string | null; submittedAt: string | null;
};
type RoundValues = { deadlineHours: number; responsibleUserId: string; requirement: string; ccUserIds: string[]; reason?: string };
type PersonOptions = {
  responsibleOptions: RectificationPerson[]; fixedResponsibleId: string | null; defaultResponsibleId: string | null;
  defaultCcRecipients: RectificationPerson[]; users: (RectificationPerson & { roleName: string })[];
};

async function sendAction(id: string, body: object) {
  const response = await fetch(`${api}/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "操作失败，请稍后重试");
  return data;
}

function PageHeader({ title, back }: { title: string; back: () => void }) {
  return <header className="store-h5-subheader"><Button type="text" aria-label="返回" icon={<ArrowLeftOutlined />} onClick={back} /><div><strong>{title}</strong><small>巡检问题闭环处理</small></div><span /></header>;
}

export function LeadH5RectificationList({ permissions }: { permissions: string[] }) {
  const router = useRouter();
  const [status, setStatus] = useState<RectificationStatus>("PENDING");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<IssueRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [skipRow, setSkipRow] = useState<IssueRow>();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const sequence = useRef(0);
  const canStart = hasRolePermission(permissions, "lead-h5:rectifications:start");
  const canSkip = hasRolePermission(permissions, "lead-h5:rectifications:no-action");
  const load = useCallback(async (background = false) => {
    const requestId = ++sequence.current;
    if (!background) { setLoading(true); setError(""); }
    try {
      const response = await fetch(`${api}?${new URLSearchParams({ status, page: String(page) })}`, { cache: "no-store" });
      const data = await response.json();
      if (response.status === 401) { router.replace("/lead_h5/login"); return; }
      if (!response.ok) throw new Error(data.message);
      if (requestId !== sequence.current) return;
      setRows(data.rows); setCounts(data.counts); setTotal(data.total);
      if (page > 1 && !data.rows.length && data.total < (page - 1) * 20 + 1) setPage(Math.max(1, Math.ceil(data.total / 20)));
    } catch (reason) { if (requestId === sequence.current && !background) setError(reason instanceof Error ? reason.message : "列表加载失败"); }
    finally { if (requestId === sequence.current) setLoading(false); }
  }, [status, page, router]);
  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("status");
    if (RECTIFICATION_STATUSES.includes(value as RectificationStatus)) setStatus(value as RectificationStatus);
    setReady(true);
  }, []);
  useEffect(() => { if (ready) void load(); }, [ready, load]);
  useEffect(() => {
    if (!ready) return;
    const refresh = () => { if (document.visibilityState === "visible") void load(true); };
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [ready, load]);
  const changeTab = (next: string) => {
    setStatus(next as RectificationStatus); setPage(1);
    router.replace(`${base}?status=${next}`, { scroll: false });
  };
  const skip = async () => {
    if (!skipRow || busy) return;
    setBusy(true);
    try { await sendAction(skipRow.id, { action: "no-action", reason }); message.success("已标记为无需整改"); setSkipRow(undefined); await load(); }
    catch (error) { message.error(error instanceof Error ? error.message : "操作失败"); }
    finally { setBusy(false); }
  };
  return <main className="store-h5-page rectification-page">
    <PageHeader title="巡检整改" back={() => router.push("/lead_h5")} />
    <Tabs className="rectification-tabs" activeKey={status} onChange={changeTab} items={RECTIFICATION_STATUSES.map(value => ({ key: value, label: <span>{RECTIFICATION_LABELS[value]}<small>{counts[value] || 0}</small></span> }))} />
    <div className="rectification-toolbar"><span>仅展示本人巡检产生的问题</span><Button size="small" icon={<ReloadOutlined />} onClick={() => void load()}>刷新</Button></div>
    {loading ? <section className="rectification-section"><Skeleton active /><Skeleton active /></section> : error ? <Alert type="error" showIcon message={error} action={<Button onClick={() => void load()}>重试</Button>} /> : !rows.length ? <section className="rectification-section"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={`暂无${RECTIFICATION_LABELS[status]}记录`} /></section> : <div className="rectification-list">
      {rows.map(row => <article key={row.id} className="rectification-card">
        <button className="rectification-card-main" onClick={() => router.push(`${base}/${row.id}`)}>
          <div className="rectification-card-heading"><strong>{row.brandName}|{row.storeName}</strong><Tag color={row.status === "QUALIFIED" ? "success" : row.status === "NO_ACTION" ? "default" : "processing"}>{RECTIFICATION_LABELS[row.status]}</Tag></div>
          <small className="rectification-muted">{row.recordNo} · {row.assessmentName}</small>
          <dl><div><dt>巡检日期</dt><dd>{rectificationDateTime(row.assessmentDate)}</dd></div><div><dt>巡检人</dt><dd>{row.reviewerName}</dd></div><div><dt>总项&amp;子项</dt><dd>{row.sectionName} / {row.subsectionName || "-"}</dd></div><div><dt>检查明细项</dt><dd>{row.itemDescription}</dd></div><div><dt>问题描述</dt><dd>{row.problemDescription || "-"}</dd></div></dl>
          <div className="rectification-card-tags"><Tag color={row.result === "FAIL" ? "error" : "warning"}>{row.result === "FAIL" ? "不合格" : "部分合格"}</Tag>{row.dueAt && <Tag color={rectificationIsOverdue(row.dueAt, row.submittedAt) ? "error" : "success"}>{rectificationIsOverdue(row.dueAt, row.submittedAt) ? "已超时" : row.submittedAt ? "未超时" : "暂未超时"}</Tag>}<span>查看详情 ›</span></div>
        </button>
        {row.status === "PENDING" && (canStart || canSkip) && <div className="rectification-card-actions">{canSkip && <Button onClick={() => { setSkipRow(row); setReason(""); }}>无需整改</Button>}{canStart && <Button type="primary" onClick={() => router.push(`${base}/${row.id}`)}>立即整改</Button>}</div>}
      </article>)}
    </div>}
    {total > 20 && <Pagination className="rectification-pagination" simple current={page} pageSize={20} total={total} onChange={setPage} />}
    <Modal title="标记为无需整改" open={!!skipRow} onCancel={() => !busy && setSkipRow(undefined)} onOk={() => void skip()} confirmLoading={busy} okText="确认无需整改" cancelText="取消" maskClosable={!busy} closable={!busy}>
      <p>确认后该记录将移入“无需整改”，不支持恢复。</p><Input.TextArea value={reason} onChange={event => setReason(event.target.value)} autoSize={{ minRows: 3, maxRows: 6 }} maxLength={1000} showCount placeholder="填写无需整改原因（选填）" />
    </Modal>
  </main>;
}

function RoundForm({ id, previous, busy, onSubmit, onCancel }: { id: string; previous?: RectificationRoundDetail; busy: boolean; onSubmit: (values: RoundValues) => void; onCancel: () => void }) {
  const [form] = Form.useForm<RoundValues>();
  const [options, setOptions] = useState<PersonOptions>();
  const [people, setPeople] = useState<{ value: string; label: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [searchError, setSearchError] = useState("");
  const searchSequence = useRef(0);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`${api}/${id}/options`, { cache: "no-store" });
      const data: PersonOptions & { message?: string } = await response.json();
      if (!response.ok) throw new Error(data.message || "人员选项加载失败");
      setOptions(data);
      const cc = previous?.ccRecipients || data.defaultCcRecipients;
      setPeople([...new Map([...data.users.map(user => ({ value: user.id, label: `${user.name}（${user.roleName}）` })), ...cc.map(user => ({ value: user.id, label: user.name }))].map(user => [user.value, user])).values()]);
    } catch (error) { setError(error instanceof Error ? error.message : "人员选项加载失败"); }
    finally { setLoading(false); }
  }, [id, previous]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!options) return;
    const cc = previous?.ccRecipients || options.defaultCcRecipients;
    form.setFieldsValue({ deadlineHours: previous?.deadlineHours, responsibleUserId: previous?.responsibleUserId || options.defaultResponsibleId || undefined,
      requirement: previous?.requirement ?? RECTIFICATION_DEFAULT_REQUIREMENT, ccUserIds: cc.map(user => user.id), reason: "" });
  }, [options, previous, form]);
  useEffect(() => {
    if (!options) return;
    const sequence = ++searchSequence.current;
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`${api}/${id}/options?q=${encodeURIComponent(query)}`, { cache: "no-store" });
        const data: PersonOptions & { message?: string } = await response.json();
        if (!response.ok) throw new Error(data.message || "搜索人员失败");
        if (sequence !== searchSequence.current) return;
        const selected = new Set(form.getFieldValue("ccUserIds") || []);
        setPeople(current => [...new Map([...current.filter(person => selected.has(person.value)), ...data.users.map(user => ({ value: user.id, label: `${user.name}（${user.roleName}）` }))].map(user => [user.value, user])).values()]);
        setSearchError("");
      } catch (error) { if (sequence === searchSequence.current) setSearchError(error instanceof Error ? error.message : "搜索人员失败"); }
    }, 300);
    return () => { window.clearTimeout(timer); searchSequence.current++; };
  }, [query, options, id, form]);
  if (loading) return <Skeleton active paragraph={{ rows: 5 }} />;
  if (error || !options) return <Alert type="error" showIcon message={error || "人员选项加载失败"} action={<Button onClick={() => void load()}>重试</Button>} />;
  return <Form form={form} layout="vertical" onFinish={onSubmit} disabled={busy} className="rectification-form">
    {!options.fixedResponsibleId && !previous && <Alert type="info" showIcon message="默认责任人缺失或无法使用门店任务，请选择本店其他人员" />}
    {!options.responsibleOptions.length && <Alert type="warning" showIcon message="本店暂无可接收整改任务的人员" description="请先配置有效账号及门店H5任务的查询、查看、上传、提交权限。" />}
    <Form.Item label="时间节点" name="deadlineHours" rules={[{ required: true, message: "请选择时间节点" }]}><Select placeholder="请选择" options={RECTIFICATION_DEADLINES} /></Form.Item>
    <Form.Item label="责任人" name="responsibleUserId" rules={[{ required: true, message: "请选择责任人" }]} extra={!previous && options.fixedResponsibleId ? "按巡检类型自动匹配，首次发起不可修改" : "选择当前门店可接收任务的人员"}>
      <Select disabled={busy || (!previous && !!options.fixedResponsibleId)} placeholder="请选择责任人" options={options.responsibleOptions.map(person => ({ value: person.id, label: person.name }))} />
    </Form.Item>
    <Form.Item label="整改要求" name="requirement" rules={[{ validator: (_, value) => Array.from(value || "").length <= 100 ? Promise.resolve() : Promise.reject(new Error("整改要求不能超过100个字符")) }]}><Input.TextArea autoSize={{ minRows: 3, maxRows: 6 }} maxLength={100} showCount placeholder="填写整改要求（选填）" /></Form.Item>
    <Form.Item label="抄送人" name="ccUserIds" rules={[{ type: "array", max: 10, message: "抄送人最多10人，请调整后提交" }]} extra="默认人员与手动选择合计最多10人，可搜索平台用户">
      <Select mode="multiple" maxCount={10} showSearch filterOption={false} onSearch={setQuery} options={people} placeholder="请选择抄送人" notFoundContent={query ? "没有找到相关用户" : "输入姓名或账号搜索"} />
    </Form.Item>
    {searchError && <Alert type="error" showIcon message={searchError} />}
    {previous && <Form.Item label="不合格原因" name="reason"><Input.TextArea autoSize={{ minRows: 3, maxRows: 6 }} maxLength={1000} showCount placeholder="填写本轮验收不合格原因（选填）" /></Form.Item>}
    <div className="rectification-form-actions"><Button onClick={onCancel} disabled={busy}>取消</Button><Button type="primary" danger={!!previous} htmlType="submit" loading={busy} disabled={!options.responsibleOptions.length}>{previous ? "确认不合格并重新整改" : "立即整改"}</Button></div>
  </Form>;
}

function AcceptanceRecord({ round }: { round: RectificationRoundDetail }) {
  return <dl><div><dt>整改提交时间</dt><dd>{rectificationDateTime(round.submittedAt)}</dd></div><div><dt>验收时间</dt><dd>{rectificationDateTime(round.acceptedAt)}</dd></div><div><dt>验收结果</dt><dd><Tag color={round.acceptanceResult === "QUALIFIED" ? "success" : "error"}>{round.acceptanceResult === "QUALIFIED" ? "合格" : "不合格"}</Tag></dd></div><div><dt>验收人</dt><dd>{round.acceptedByName}</dd></div>{round.rejectionReason && <div><dt>不合格原因</dt><dd>{round.rejectionReason}</dd></div>}</dl>;
}

export function LeadH5RectificationDetail({ id, permissions }: { id: string; permissions: string[] }) {
  const router = useRouter();
  const [detail, setDetail] = useState<RectificationDetail>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [, setTick] = useState(0);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`${api}/${id}`, { cache: "no-store" });
      const data = await response.json();
      if (response.status === 401) { router.replace("/lead_h5/login"); return; }
      if (!response.ok) throw new Error(data.message);
      setDetail(data);
    } catch (error) { setError(error instanceof Error ? error.message : "详情加载失败"); }
    finally { setLoading(false); }
  }, [id, router]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const timer = window.setInterval(() => setTick(value => value + 1), 30_000); return () => window.clearInterval(timer); }, []);
  const current = detail?.rounds[0];
  const back = () => router.push(`${base}?status=${detail?.status || "PENDING"}`);
  const act = async (body: object, destination: RectificationStatus) => {
    if (busy) return;
    setBusy(true);
    try { const result = await sendAction(id, body); message.success(result.message); router.replace(`${base}?status=${destination}`); }
    catch (error) { message.error(error instanceof Error ? error.message : "操作失败"); }
    finally { setBusy(false); }
  };
  const roundInput = (values: RoundValues) => ({ deadlineHours: values.deadlineHours, responsibleUserId: values.responsibleUserId, requirement: values.requirement || "", ccUserIds: values.ccUserIds || [] });
  return <main className="store-h5-page rectification-page">
    <PageHeader title={detail?.status === "PENDING" ? "立即整改" : "整改详情"} back={back} />
    {loading ? <section className="rectification-section"><Skeleton active paragraph={{ rows: 10 }} /></section> : error || !detail ? <Alert type="error" showIcon message={error || "记录不存在"} action={<Button onClick={() => void load()}>重试</Button>} /> : <>
      <div className="rectification-detail-heading"><strong>{detail.recordNo}</strong><Tag color={detail.status === "QUALIFIED" ? "success" : "processing"}>{RECTIFICATION_LABELS[detail.status]}</Tag></div>
      <RectificationInspectionSection inspection={detail.inspection} />
      {detail.status === "PENDING" && (hasRolePermission(permissions, "lead-h5:rectifications:start") ? <section className="rectification-section"><h2>整改要求</h2><div className="rectification-readonly">记录编号：{detail.recordNo}（只读）</div><RoundForm id={id} busy={busy} onCancel={back} onSubmit={values => void act({ action: "start", round: roundInput(values) }, "IN_PROGRESS")} /></section> : <Alert type="info" message="当前角色没有发起整改权限" />)}
      {current && <><RectificationRequirementSection round={current} />{current.submittedAt && <RectificationSubmissionSection round={current} />}</>}
      {detail.status === "NO_ACTION" && <section className="rectification-section"><h2>无需整改</h2><dl><div><dt>原因</dt><dd>{detail.noActionReason || "-"}</dd></div><div><dt>操作人</dt><dd>{detail.noActionByName}</dd></div><div><dt>操作时间</dt><dd>{rectificationDateTime(detail.noActionAt)}</dd></div></dl></section>}
      {detail.rounds.some(round => round.acceptedAt) && <section className="rectification-section"><h2>验收详情</h2>{[...detail.rounds].reverse().filter(round => round.acceptedAt).map(round => <div className="rectification-acceptance" key={round.id}><h3>第{round.roundNumber}次验收</h3><AcceptanceRecord round={round} /></div>)}</section>}
      {detail.rounds.length > 1 && <section className="rectification-section"><h2>历史整改记录</h2><Collapse items={detail.rounds.slice(1).map(round => ({ key: round.id, label: `第${round.roundNumber}轮整改 · ${round.acceptanceResult === "QUALIFIED" ? "验收合格" : round.acceptanceResult === "REJECTED" ? "验收不合格" : "已提交"}`, children: <><RectificationRequirementSection round={round} /><RectificationSubmissionSection round={round} />{round.acceptedAt && <AcceptanceRecord round={round} />}</> }))} /></section>}
      {detail.status === "PENDING_ACCEPTANCE" && current && hasRolePermission(permissions, "lead-h5:rectifications:accept") && <div className="rectification-acceptance-actions"><Button danger size="large" onClick={() => setRejectOpen(true)} disabled={busy}>不合格</Button><Button className="rectification-accept-button" type="primary" size="large" onClick={() => setAcceptOpen(true)} disabled={busy}>验收合格</Button></div>}
      <Modal title="验收合格" open={acceptOpen} okText="确认验收合格" cancelText="取消" confirmLoading={busy} closable={!busy} maskClosable={!busy} onCancel={() => !busy && setAcceptOpen(false)} onOk={() => current && void act({ action: "accept", roundNumber: current.roundNumber }, "QUALIFIED")}><p>确认本轮整改合格？确认后该记录将移入“整改合格”。</p></Modal>
      <Modal title="验收不合格，重新发起整改" open={rejectOpen} footer={null} onCancel={() => !busy && setRejectOpen(false)} closable={!busy} maskClosable={!busy} destroyOnHidden>
        {current && <RoundForm id={id} previous={current} busy={busy} onCancel={() => setRejectOpen(false)} onSubmit={values => void act({ action: "reject", roundNumber: current.roundNumber, reason: values.reason || "", round: roundInput(values) }, "IN_PROGRESS")} />}
      </Modal>
    </>}
  </main>;
}

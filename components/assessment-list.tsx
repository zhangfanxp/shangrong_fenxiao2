"use client";

import { DeleteOutlined, EyeOutlined, PlusOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Checkbox, Empty, Form, Input, InputNumber, message, Modal, Select, Space, Statistic, Tag, Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import { AssessmentPreviewModal, type AssessmentPreviewConfig } from "@/components/assessment-preview-modal";
import { DataTable } from "@/components/data-table";
import { StatusTag } from "@/components/status-tag";
import { UnsavedChangesModal } from "@/components/unsaved-changes-modal";

type Permission = "query" | "create" | "preview" | "edit" | "view" | "enable" | "disable" | "delete";
type AssessmentRow = {
  id: string; recordNo: string; name: string; scoreMode: "BINARY" | "CUSTOM_SCORE"; configFileName: string;
  applicableBrands?: string[] | null;
  r2StorageId: string;
  r2Storage?: { id: string; name: string; status: "ENABLED" | "DISABLED" } | null;
  photoAttachmentLimit: number; nonFullScoreRequiresPhoto: boolean; failRequiresProblemDescription: boolean; partialRequiresProblemDescription: boolean;
  detailText: string; sectionCount: number; subsectionCount: number; itemCount: number; totalScore: number;
  remark?: string | null; status: "ENABLED" | "DISABLED"; configVersion: number; createdAt: string; updatedAt: string;
  createdBy?: { realName: string } | null; _count: { records: number };
};
type FormValues = { name: string; scoreMode: "BINARY" | "CUSTOM_SCORE"; configFileBase: string; applicableBrands: string[]; r2StorageId: string; photoAttachmentLimit: number; nonFullScoreRequiresPhoto: boolean; failRequiresProblemDescription: boolean; partialRequiresProblemDescription: boolean; detailText: string; remark: string };
type BrandOption = { label: string; value: string; disabled?: boolean };
type LiveStats = { sectionCount: number; subsectionCount: number; itemCount: number; totalScore: number; error?: string };
const scoreModeOptions = [{ value: "BINARY", label: "0或满分" }, { value: "CUSTOM_SCORE", label: "允许自定义得分" }];
const auditExample = "纪律与规范｜仪容仪表｜服装：着工装、符合门店着装要求｜1｜支持拍照\n纪律与规范｜仪容仪表｜卫生：保持服装整洁｜1.5｜不支持拍照\n服务品质｜服务流程｜顾客进店后主动问候｜2｜支持拍照";
const creditExample = "食品安全｜售卖不符合售卖条件的产品（变质菜品等）｜500元｜2｜支持拍照\n经营规范｜未按要求公示证照｜200元｜1｜不支持拍照";

function formatTime(value: string) { return dayjs(value).format("YYYY-MM-DD HH:mm:ss"); }
function calculateStats(text = "", isCredit = false): LiveStats {
  const sections = new Set<string>(); const subsections = new Set<string>(); let itemCount = 0; let tenths = 0;
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim(); if (!line) continue;
    const fields = line.split(/[｜|]/).map(field => field.trim());
    if ((isCredit ? fields.length !== 5 : fields.length !== 4 && fields.length !== 5) || fields.some(field => !field)) return { sectionCount: 0, subsectionCount: 0, itemCount: 0, totalScore: 0, error: `第${index + 1}行格式错误` };
    if (!/^\d+(?:\.\d)?$/.test(fields[3]) || Number(fields[3]) <= 0) return { sectionCount: 0, subsectionCount: 0, itemCount: 0, totalScore: 0, error: `第${index + 1}行分值无效` };
    if (fields[4] && fields[4] !== "支持拍照" && fields[4] !== "不支持拍照") return { sectionCount: 0, subsectionCount: 0, itemCount: 0, totalScore: 0, error: `第${index + 1}行拍照设置无效` };
    sections.add(fields[0]); subsections.add(isCredit ? `${fields[0]}\u0000违约项目` : `${fields[0]}\u0000${fields[1]}`); itemCount += 1; tenths += Math.round(Number(fields[3]) * 10);
  }
  return { sectionCount: sections.size, subsectionCount: subsections.size, itemCount, totalScore: tenths / 10 };
}

export function AssessmentList({ permissions }: { permissions: string[] }) {
  const hasAll = permissions.includes("*"); const can = (action: Permission) => hasAll || permissions.includes(`assessments:${action}`);
  const [rows, setRows] = useState<AssessmentRow[]>([]); const [total, setTotal] = useState(0); const [loading, setLoading] = useState(true); const [error, setError] = useState(false);
  const [keyword, setKeyword] = useState(""); const [appliedKeyword, setAppliedKeyword] = useState(""); const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(10);
  const [mode, setMode] = useState<"create" | "edit" | "view" | null>(null); const [current, setCurrent] = useState<AssessmentRow | null>(null); const [saving, setSaving] = useState(false); const [dirty, setDirty] = useState(false); const [form] = Form.useForm<FormValues>();
  const [discardOpen, setDiscardOpen] = useState(false);
  const [brandOptions, setBrandOptions] = useState<BrandOption[]>([]); const [assessmentTypeOptions, setAssessmentTypeOptions] = useState<BrandOption[]>([]); const [dictionaryOptionsError, setDictionaryOptionsError] = useState(false);
  const [r2StorageOptions, setR2StorageOptions] = useState<BrandOption[]>([]); const [r2StorageOptionsError, setR2StorageOptionsError] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false); const [previewLoading, setPreviewLoading] = useState(false); const [previewConfig, setPreviewConfig] = useState<AssessmentPreviewConfig | null>(null);
  const detailText = Form.useWatch("detailText", form) || ""; const assessmentType = Form.useWatch("name", form) || ""; const isCredit = assessmentType === "门店信用评分"; const liveStats = useMemo(() => calculateStats(detailText, isCredit), [detailText, isCredit]);

  const load = async (nextPage = page, nextPageSize = pageSize, nextKeyword = appliedKeyword) => {
    setLoading(true); setError(false);
    try {
      const query = new URLSearchParams({ keyword: nextKeyword.trim(), page: String(nextPage), pageSize: String(nextPageSize) });
      const response = await fetch(`/api/settings/assessments?${query}`); const data = await response.json();
      if (!response.ok) throw new Error(data.message); setRows(data.rows); setTotal(data.total);
    } catch { setError(true); } finally { setLoading(false); }
  };
  const loadBrandOptions = async () => {
    setDictionaryOptionsError(false);
    try {
      const response = await fetch("/api/business-dictionaries?codes=BRAND,ASSESSMENT_TYPE"); const data = await response.json();
      if (!response.ok) throw new Error(data.message); setBrandOptions(data.BRAND || []); setAssessmentTypeOptions(data.ASSESSMENT_TYPE || []);
    } catch { setDictionaryOptionsError(true); }
  };
  const loadR2StorageOptions = async () => {
    setR2StorageOptionsError(false);
    try {
      const response = await fetch("/api/settings/assessments/options"); const data = await response.json();
      if (!response.ok) throw new Error(data.message); setR2StorageOptions((data.r2Storages || []).map((storage: { id: string; name: string }) => ({ value: storage.id, label: storage.name })));
    } catch { setR2StorageOptionsError(true); }
  };
  useEffect(() => { if (can("query")) { void load(1, 10, ""); void loadBrandOptions(); void loadR2StorageOptions(); } else setLoading(false); }, []);
  const applyFilter = () => { const next = keyword.trim(); setAppliedKeyword(next); setPage(1); void load(1, pageSize, next); };
  const resetFilter = () => { setKeyword(""); setAppliedKeyword(""); setPage(1); void load(1, pageSize, ""); };
  const openCreate = () => { form.resetFields(); form.setFieldsValue({ scoreMode: "BINARY", applicableBrands: [], photoAttachmentLimit: 3, nonFullScoreRequiresPhoto: false, failRequiresProblemDescription: false, partialRequiresProblemDescription: false, detailText: "", remark: "" }); setCurrent(null); setDirty(false); setMode("create"); };
  const loadExisting = async (row: AssessmentRow, nextMode: "edit" | "view") => {
    setSaving(true);
    try {
      const response = await fetch(`/api/settings/assessments/${row.id}?intent=${nextMode}`); const data = await response.json();
      if (!response.ok) return void message.error(data.message || "考核表格加载失败，请稍后重试");
      const next = data.assessment as AssessmentRow; setCurrent(next); form.setFieldsValue({ name: next.name, scoreMode: next.scoreMode, configFileBase: next.configFileName.replace(/\.json$/i, ""), applicableBrands: Array.isArray(next.applicableBrands) ? next.applicableBrands : [], r2StorageId: next.r2StorageId, photoAttachmentLimit: next.photoAttachmentLimit || 3, nonFullScoreRequiresPhoto: next.nonFullScoreRequiresPhoto ?? false, failRequiresProblemDescription: next.failRequiresProblemDescription ?? false, partialRequiresProblemDescription: next.partialRequiresProblemDescription ?? false, detailText: next.detailText, remark: next.remark || "" }); setDirty(false); setMode(nextMode);
    } catch { message.error("考核表格加载失败，请稍后重试"); } finally { setSaving(false); }
  };
  const openPreview = async (row: AssessmentRow) => {
    setPreviewConfig(null); setPreviewOpen(true); setPreviewLoading(true);
    try {
      const response = await fetch(`/api/settings/assessments/${row.id}?intent=preview`); const data = await response.json();
      if (!response.ok) { message.error(data.message || "考核明细配置加载失败"); setPreviewOpen(false); return; }
      setPreviewConfig(data.config as AssessmentPreviewConfig);
    } catch { message.error("考核明细配置加载失败，请稍后重试"); setPreviewOpen(false); } finally { setPreviewLoading(false); }
  };
  const closeForm = () => {
    if (saving) return;
    if (dirty && mode !== "view") { setDiscardOpen(true); return; }
    setMode(null); setDirty(false);
  };
  const submit = async () => {
    try {
      const values = await form.validateFields(); setSaving(true);
      const url = mode === "create" ? "/api/settings/assessments" : `/api/settings/assessments/${current?.id}`;
      const response = await fetch(url, { method: mode === "create" ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(mode === "create" ? values : { ...values, updatedAt: current?.updatedAt }) });
      const data = await response.json(); if (!response.ok) return void message.error(data.message || "保存失败，请稍后重试");
      message.success(mode === "create" ? "考核表新增成功" : "考核表保存成功"); setMode(null); setDirty(false); setPage(1); await load(1, pageSize, appliedKeyword);
    } catch (reason) { if (reason instanceof Error) message.error(reason.message); } finally { setSaving(false); }
  };
  const changeStatus = (row: AssessmentRow) => {
    const enabling = row.status === "DISABLED"; const action = enabling ? "启用" : "禁用";
    Modal.confirm({ title: `确认${action}考核表？`, content: enabling ? "启用后，该考核表可以重新用于新建考核。" : "禁用后，该考核表将不能用于新建考核，但不会影响已经产生的历史考核记录。", okText: `确认${action}`, cancelText: "取消", onOk: async () => {
      const response = await fetch(`/api/settings/assessments/${row.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "status", status: enabling ? "ENABLED" : "DISABLED", updatedAt: row.updatedAt }) }); const data = await response.json();
      if (!response.ok) { message.error(data.message || "操作失败，请稍后重试"); throw new Error(); } message.success(data.message); await load();
    } });
  };
  const remove = (row: AssessmentRow) => Modal.confirm({ title: "确认删除考核表？", content: "删除后该考核表配置将不能继续使用，请确认是否继续。", okText: "确认删除", cancelText: "取消", okButtonProps: { danger: true }, onOk: async () => {
    const response = await fetch(`/api/settings/assessments/${row.id}`, { method: "DELETE" }); const data = await response.json();
    if (!response.ok) { message.error(data.message || "删除失败，请稍后重试"); throw new Error(); } message.success(data.message); const nextPage = rows.length === 1 && page > 1 ? page - 1 : page; setPage(nextPage); await load(nextPage);
  } });

  if (!can("query")) return <Alert type="warning" showIcon message="暂无考核表格查询权限" description="请联系管理员为当前角色配置相应权限。" />;
  const columns: ColumnsType<AssessmentRow> = [
    { title: "记录编号", dataIndex: "recordNo", width: 145 }, { title: "考核表类型", dataIndex: "name", width: 190, ellipsis: true },
    { title: "检查明细项数", dataIndex: "itemCount", width: 115, align: "center" }, { title: "总分", dataIndex: "totalScore", width: 85, align: "center" },
    { title: "适用品牌", dataIndex: "applicableBrands", width: 210, render: value => Array.isArray(value) && value.length ? <Space size={[4, 4]} wrap>{value.map(brand => <Tag key={brand} color="blue">{brand}</Tag>)}</Space> : <span style={{ color: "rgba(0,0,0,.45)" }}>未配置</span> },
    { title: "状态", dataIndex: "status", width: 90, render: value => <StatusTag value={value} /> }, { title: "创建人", dataIndex: ["createdBy", "realName"], width: 105, render: value => value || "系统" },
    { title: "创建时间", dataIndex: "createdAt", width: 175, render: formatTime },
    { title: "操作", fixed: "right", width: 300, render: (_, row) => <Space className="table-actions" size={0}>{can("preview") && <Button type="link" size="small" onClick={() => void openPreview(row)}>预览</Button>}{can("edit") && <Button type="link" size="small" onClick={() => void loadExisting(row, "edit")}>编辑</Button>}{can("view") && <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => void loadExisting(row, "view")}>查看</Button>}{((row.status === "ENABLED" && can("disable")) || (row.status === "DISABLED" && can("enable"))) && <Button type="link" size="small" onClick={() => changeStatus(row)}>{row.status === "ENABLED" ? "禁用" : "启用"}</Button>}{can("delete") && <Tooltip title={row._count.records ? "该考核表已有历史考核记录，请使用禁用操作" : undefined}><Button type="link" danger size="small" icon={<DeleteOutlined />} disabled={row._count.records > 0} onClick={() => remove(row)}>删除</Button></Tooltip>}</Space> },
  ];
  const filteredEmpty = Boolean(appliedKeyword);
  const currentBrands = Array.isArray(current?.applicableBrands) ? current.applicableBrands : [];
  const visibleBrandOptions: BrandOption[] = [...brandOptions, ...currentBrands.filter(value => !brandOptions.some(option => option.value === value)).map(value => ({ label: `${value}（已停用）`, value, disabled: true }))];
  const visibleAssessmentTypeOptions: BrandOption[] = [...assessmentTypeOptions, ...(current?.name && !assessmentTypeOptions.some(option => option.value === current.name) ? [{ label: `${current.name}（已停用）`, value: current.name, disabled: true }] : [])];
  const visibleR2StorageOptions: BrandOption[] = [...r2StorageOptions, ...(current?.r2Storage && !r2StorageOptions.some(option => option.value === current.r2Storage!.id) ? [{ label: `${current.r2Storage.name}（已停用）`, value: current.r2Storage.id, disabled: true }] : [])];
  return <>
    <Card style={{ marginBottom: 16 }}><Space wrap><Input allowClear placeholder="请输入考核表类型" style={{ width: 280 }} value={keyword} onChange={event => setKeyword(event.target.value)} onPressEnter={applyFilter} /><Button onClick={resetFilter}>重置</Button><Button type="primary" onClick={applyFilter}>筛选</Button></Space></Card>
    <Card extra={can("create") ? <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增</Button> : null}>
      {error ? <Alert type="error" showIcon message="考核表格加载失败，请稍后重试" action={<Button size="small" onClick={() => void load()}>重新加载</Button>} /> : <DataTable<AssessmentRow> rowKey="id" columns={columns} dataSource={rows} loading={loading} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<><div>{filteredEmpty ? "没有找到符合当前条件的考核表格" : "暂无考核表格"}</div><small>{filteredEmpty ? "请调整筛选条件后重试" : "当前还没有创建考核模板"}</small></>}>{filteredEmpty ? <Button onClick={resetFilter}>重置筛选</Button> : can("create") ? <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增</Button> : null}</Empty> }} pagination={{ current: page, pageSize, total, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100], showTotal: count => `共 ${count} 条`, onChange: (nextPage, nextSize) => { setPage(nextPage); setPageSize(nextSize); void load(nextPage, nextSize); } }} />}
    </Card>
    <Modal title={mode === "create" ? "新增考核表格" : mode === "edit" ? "编辑考核表格" : "查看考核表格"} open={Boolean(mode)} width={1100} onCancel={closeForm} destroyOnHidden maskClosable={false} styles={{ body: { maxHeight: "72vh", overflowY: "auto" } }} footer={mode === "view" ? <Button onClick={closeForm}>关闭</Button> : <Space><Button onClick={closeForm}>取消</Button><Button type="primary" loading={saving} onClick={() => void submit()}>保存</Button></Space>}>
      <Form form={form} layout="vertical" disabled={mode === "view"} initialValues={{ scoreMode: "BINARY", applicableBrands: [], photoAttachmentLimit: 3, nonFullScoreRequiresPhoto: false, failRequiresProblemDescription: false, partialRequiresProblemDescription: false, detailText: "", remark: "" }} onValuesChange={() => { if (mode !== "view") setDirty(true); }}>
        <h3 className="assessment-form-heading">基础信息</h3><div className="assessment-form-grid">
          <Form.Item label="记录编号"><Input disabled value={current?.recordNo} placeholder="保存后自动生成" /></Form.Item>
          <Form.Item label="考核表类型" name="name" rules={[{ required: true, message: "请选择考核表类型" }]} extra={dictionaryOptionsError ? "考核表类型加载失败，请检查数据字典中的 Assessment_Type 配置。" : assessmentTypeOptions.length ? "选项来源于数据字典 Assessment_Type。" : "数据字典 Assessment_Type 暂无可选枚举值。"}><Select allowClear showSearch optionFilterProp="label" placeholder="请选择考核表类型" options={visibleAssessmentTypeOptions} /></Form.Item>
          <Form.Item label="评分模式" name="scoreMode" rules={[{ required: true, message: "请选择评分模式" }]}><Select options={scoreModeOptions} /></Form.Item>
          <Form.Item label="拍照附件数量" name="photoAttachmentLimit" rules={[{ required: true, message: "请输入拍照附件数量" }]} extra="每个支持拍照的考评项最多可上传的照片数，默认为3张。"><InputNumber min={1} max={20} precision={0} addonAfter="张" style={{ width: "100%" }} /></Form.Item>
          <Form.Item label="考核明细配置文件名" name="configFileBase" rules={[{ required: true, message: "请输入考核明细配置文件名" }, { pattern: /^[A-Za-z0-9_]{1,20}$/, message: "配置文件名称只能包含英文字母、数字和下划线，且不能超过20个字符" }]} extra={mode === "edit" && current?._count.records ? "该考核表已产生历史考核记录，配置文件名称不可修改。" : undefined}><Input addonAfter=".json" maxLength={20} placeholder="例如：dudao_review" disabled={mode === "view" || (mode === "edit" && Boolean(current?._count.records))} /></Form.Item>
          <Form.Item className="assessment-brand-field" label="适用品牌" name="applicableBrands" extra={dictionaryOptionsError ? "品牌选项加载失败，请检查数据字典中的 BRAND 配置。" : brandOptions.length ? "可多选；选项来源于数据字典 BRAND。" : "数据字典 BRAND 暂无可选枚举值。"}><Checkbox.Group options={visibleBrandOptions} /></Form.Item>
          <Form.Item label="存储空间" name="r2StorageId" rules={[{ required: true, message: "请选择存储空间" }]} extra={r2StorageOptionsError ? "存储空间加载失败，请检查《设置》/《R2存储空间》配置。" : r2StorageOptions.length ? "巡店拍摄的照片将存储至所选R2空间。" : "暂无已启用的R2存储空间，请先前往《设置》/《R2存储空间》完成配置。"}><Select allowClear showSearch optionFilterProp="label" placeholder="请选择" options={visibleR2StorageOptions} notFoundContent="暂无已启用的R2存储空间" /></Form.Item>
        </div>
        <h3 className="assessment-form-heading">考核明细</h3>
        <Form.Item label="考核明细项" name="detailText" rules={[{ required: true, message: "请输入考核明细项" }]} extra={isCredit ? "每行格式：类目｜违约项目｜违约金额｜分值｜拍照；拍照请填写“支持拍照”或“不支持拍照”。兼容全角和半角竖线，空行将自动忽略。" : "每行格式：总项｜子项｜检查明细项｜分值｜拍照；拍照请填写“支持拍照”或“不支持拍照”。兼容原四段格式（按不支持拍照处理）、全角和半角竖线，空行将自动忽略。"}><Input.TextArea rows={11} placeholder={isCredit ? creditExample : auditExample} className="assessment-detail-input" /></Form.Item>
        <div className={`assessment-live-stats ${liveStats.error ? "has-error" : ""}`}>{liveStats.error ? <span>存在配置错误，暂无法计算完整统计（{liveStats.error}）</span> : isCredit ? <><Statistic title="类目" value={liveStats.sectionCount} /><Statistic title="违约项目" value={liveStats.itemCount} /><Statistic title="总分" value={liveStats.totalScore} precision={liveStats.totalScore % 1 ? 1 : 0} /></> : <><Statistic title="总项" value={liveStats.sectionCount} /><Statistic title="子项" value={liveStats.subsectionCount} /><Statistic title="检查明细" value={liveStats.itemCount} /><Statistic title="总分" value={liveStats.totalScore} precision={liveStats.totalScore % 1 ? 1 : 0} /></>}</div>
        <Form.Item name="nonFullScoreRequiresPhoto" valuePropName="checked" extra="勾选后，支持拍照的检查项目未得满分时，至少上传一张照片。" style={{ marginBottom: 16 }}><Checkbox>非满分项必须拍照</Checkbox></Form.Item>
        <Form.Item name="failRequiresProblemDescription" valuePropName="checked" style={{ marginBottom: 8 }}><Checkbox>“不合格项目”必须填写问题描述</Checkbox></Form.Item>
        <Form.Item name="partialRequiresProblemDescription" valuePropName="checked" extra="勾选后，对应评分结果的项目须填写问题描述，最多100个字符。" style={{ marginBottom: 16 }}><Checkbox>“部分合格项目”必须填写问题描述</Checkbox></Form.Item>
        <Form.Item label="备注" name="remark" rules={[{ validator: (_, value) => !value || Array.from(value).length <= 50 ? Promise.resolve() : Promise.reject(new Error("备注不能超过50个汉字")) }]}><Input.TextArea rows={3} showCount maxLength={50} placeholder="请输入备注（选填）" /></Form.Item>
        <h3 className="assessment-form-heading">系统信息</h3><div className="assessment-form-grid two-columns"><Form.Item label="创建人"><Input disabled value={current?.createdBy?.realName} placeholder="保存后自动生成" /></Form.Item><Form.Item label="创建时间"><Input disabled value={current?.createdAt ? formatTime(current.createdAt) : undefined} placeholder="保存后自动生成" /></Form.Item></div>
      </Form>
    </Modal>
    <UnsavedChangesModal open={discardOpen} title="当前考核表内容尚未保存" onKeep={() => setDiscardOpen(false)} onDiscard={() => { setDiscardOpen(false); setMode(null); setDirty(false); }} />
    <AssessmentPreviewModal open={previewOpen} loading={previewLoading} config={previewConfig} onClose={() => { setPreviewOpen(false); setPreviewConfig(null); }} />
  </>;
}

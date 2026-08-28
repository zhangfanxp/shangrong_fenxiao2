"use client";

import { DeleteOutlined, EyeOutlined, PlusOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Checkbox, Empty, Form, Input, message, Modal, Select, Space, Tag, Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import { DataTable } from "@/components/data-table";
import { ResearchTemplatePreviewModal, type ResearchTemplatePreviewConfig } from "@/components/research-template-preview-modal";
import { StatusTag } from "@/components/status-tag";
import { UnsavedChangesModal } from "@/components/unsaved-changes-modal";

type Permission = "query" | "create" | "preview" | "edit" | "view" | "enable" | "disable" | "delete";
type Option = { label: string; value: string; disabled?: boolean };
type ResearchTemplateRow = {
  id: string; recordNo: string; templateType: string; configFileName: string; applicableBrands: string[];
  detailText: string; itemCount: number; remark?: string | null; status: "ENABLED" | "DISABLED"; configVersion: number;
  createdByName: string; createdAt: string; updatedAt: string; _count: { records: number };
};
type FormValues = { templateType: string; configFileBase: string; applicableBrands: string[]; detailText: string; remark: string };
type Filters = { templateType: string; brand: string; status: string };
type DetailStats = { valid: number; errors: number; firstError?: string };
const emptyFilters: Filters = { templateType: "", brand: "", status: "" };
const example = "周边竞调｜竞品1【同城火锅鸡】｜竞品名称距离｜【输入框】必填\n周边竞调｜竞品1【同城火锅鸡】｜门店地址｜【输入框】选填";

function formatTime(value: string) { return dayjs(value).format("YYYY-MM-DD HH:mm:ss"); }
function detailStats(text = ""): DetailStats {
  let valid = 0; let errors = 0; let firstError: string | undefined;
  text.replace(/\r\n/g, "\n").split("\n").forEach((original, index) => {
    const line = original.trim(); if (!line) return;
    const fields = line.split(/[｜|]/).map(field => field.trim());
    const structureInvalid = fields.length !== 4 || fields.slice(0, 3).some(field => !field);
    const controlInvalid = !structureInvalid && fields[3] !== "【输入框】必填" && fields[3] !== "【输入框】选填";
    if (structureInvalid || controlInvalid) {
      errors += 1;
      firstError ||= structureInvalid ? `第${index + 1}行调研明细格式错误，应为：总项｜子项｜检查明细项｜【输入框】必填/选填` : `第${index + 1}行调研控件格式错误，目前支持：【输入框】必填、【输入框】选填`;
    } else valid += 1;
  });
  return { valid, errors, firstError };
}

export function ResearchTemplateList({ permissions }: { permissions: string[] }) {
  const hasAll = permissions.includes("*"); const can = (action: Permission) => hasAll || permissions.includes(`research-templates:${action}`);
  const [rows, setRows] = useState<ResearchTemplateRow[]>([]); const [total, setTotal] = useState(0); const [loading, setLoading] = useState(true); const [error, setError] = useState(false);
  const [filters, setFilters] = useState<Filters>(emptyFilters); const [appliedFilters, setAppliedFilters] = useState<Filters>(emptyFilters); const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(10);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]); const [mode, setMode] = useState<"create" | "edit" | "view" | null>(null); const [current, setCurrent] = useState<ResearchTemplateRow | null>(null);
  const [saving, setSaving] = useState(false); const [dirty, setDirty] = useState(false); const [form] = Form.useForm<FormValues>();
  const [discardOpen, setDiscardOpen] = useState(false);
  const [brandOptions, setBrandOptions] = useState<Option[]>([]); const [typeOptions, setTypeOptions] = useState<Option[]>([]); const [dictionaryError, setDictionaryError] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false); const [previewLoading, setPreviewLoading] = useState(false); const [previewConfig, setPreviewConfig] = useState<ResearchTemplatePreviewConfig | null>(null);
  const detailText = Form.useWatch("detailText", form) || ""; const stats = useMemo(() => detailStats(detailText), [detailText]);

  const load = async (nextPage = page, nextPageSize = pageSize, nextFilters = appliedFilters) => {
    setLoading(true); setError(false);
    try {
      const query = new URLSearchParams({ ...nextFilters, page: String(nextPage), pageSize: String(nextPageSize) });
      const response = await fetch(`/api/research-templates?${query}`); const data = await response.json();
      if (!response.ok) throw new Error(data.message); setRows(data.rows); setTotal(data.total);
    } catch { setError(true); } finally { setLoading(false); }
  };
  const loadDictionaries = async () => {
    setDictionaryError(false);
    try {
      const response = await fetch("/api/business-dictionaries?codes=BRAND,RESEARCH_TEMPLATE_TYPE"); const data = await response.json();
      if (!response.ok) throw new Error(data.message); setBrandOptions(data.BRAND || []); setTypeOptions(data.RESEARCH_TEMPLATE_TYPE || []);
    } catch { setDictionaryError(true); }
  };
  useEffect(() => { if (can("query")) { void load(1, 10, emptyFilters); void loadDictionaries(); } else setLoading(false); }, []);
  const applyFilter = () => { setAppliedFilters(filters); setPage(1); void load(1, pageSize, filters); };
  const resetFilter = () => { setFilters(emptyFilters); setAppliedFilters(emptyFilters); setPage(1); void load(1, pageSize, emptyFilters); };
  const openCreate = () => { form.resetFields(); form.setFieldsValue({ applicableBrands: [], detailText: "", remark: "" }); setCurrent(null); setDirty(false); setMode("create"); };
  const loadExisting = async (row: ResearchTemplateRow, nextMode: "edit" | "view") => {
    setSaving(true);
    try {
      const response = await fetch(`/api/research-templates/${row.id}?intent=${nextMode}`); const data = await response.json();
      if (!response.ok) return void message.error(data.message || "调研模版加载失败，请稍后重试");
      const next = data.template as ResearchTemplateRow; setCurrent(next); form.setFieldsValue({ templateType: next.templateType, configFileBase: next.configFileName.replace(/\.json$/i, ""), applicableBrands: next.applicableBrands, detailText: next.detailText, remark: next.remark || "" }); setDirty(false); setMode(nextMode);
    } catch { message.error("调研模版加载失败，请稍后重试"); } finally { setSaving(false); }
  };
  const openPreview = async (row: ResearchTemplateRow) => {
    setPreviewConfig(null); setPreviewOpen(true); setPreviewLoading(true);
    try {
      const response = await fetch(`/api/research-templates/${row.id}/preview`); const data = await response.json();
      if (!response.ok) { message.error(data.message || "调研配置文件加载失败，请联系系统管理员"); setPreviewOpen(false); return; }
      setPreviewConfig(data.config);
    } catch { message.error("调研配置文件加载失败，请联系系统管理员"); setPreviewOpen(false); } finally { setPreviewLoading(false); }
  };
  const closeForm = () => {
    if (saving) return;
    if (dirty && mode !== "view") { setDiscardOpen(true); return; }
    setMode(null); setDirty(false);
  };
  const submit = async () => {
    try {
      const values = await form.validateFields(); setSaving(true);
      const response = await fetch(mode === "create" ? "/api/research-templates" : `/api/research-templates/${current?.id}`, { method: mode === "create" ? "POST" : "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(mode === "create" ? values : { ...values, updatedAt: current?.updatedAt }) });
      const data = await response.json(); if (!response.ok) return void message.error(data.message || "保存失败，请稍后重试");
      message.success(mode === "create" ? "调研模版新增成功" : "调研模版保存成功"); setMode(null); setDirty(false); setPage(1); await load(1, pageSize);
    } catch (reason) { if (reason instanceof Error) message.error(reason.message); } finally { setSaving(false); }
  };
  const changeStatus = (row: ResearchTemplateRow) => {
    const enabling = row.status === "DISABLED"; const action = enabling ? "启用" : "禁用";
    Modal.confirm({ title: `确认${action}调研模版？`, content: enabling ? "启用后，该模版可以重新用于后续调研。" : "禁用后，该调研模版将不能用于新建调研，但不会影响已经产生的历史调研记录。", okText: `确认${action}`, cancelText: "取消", onOk: async () => {
      const response = await fetch(`/api/research-templates/${row.id}/${enabling ? "enable" : "disable"}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ updatedAt: row.updatedAt }) }); const data = await response.json();
      if (!response.ok) { message.error(data.message || "操作失败，请稍后重试"); throw new Error(); } message.success(data.message); await load();
    } });
  };
  const remove = (row: ResearchTemplateRow) => Modal.confirm({ title: "确认删除调研模版？", content: "删除后该调研模版配置将不能继续使用，请确认是否继续。", okText: "确认删除", cancelText: "取消", okButtonProps: { danger: true }, onOk: async () => {
    const response = await fetch(`/api/research-templates/${row.id}`, { method: "DELETE" }); const data = await response.json();
    if (!response.ok) { message.error(data.message || "删除失败，请稍后重试"); throw new Error(); } message.success(data.message); setSelectedRowKeys(keys => keys.filter(key => key !== row.id)); const nextPage = rows.length === 1 && page > 1 ? page - 1 : page; setPage(nextPage); await load(nextPage);
  } });

  if (!can("query")) return <Alert type="warning" showIcon message="暂无调研模版查询权限" description="请联系管理员为当前角色配置相应权限。" />;
  const columns: ColumnsType<ResearchTemplateRow> = [
    { title: "记录编号", dataIndex: "recordNo", width: 145 }, { title: "调研模版类型", dataIndex: "templateType", width: 180, ellipsis: true },
    { title: "调研明细项数", dataIndex: "itemCount", width: 125, align: "right" },
    { title: "适用品牌", dataIndex: "applicableBrands", width: 220, render: (brands: string[]) => brands?.length ? <Tooltip title={brands.join("、")}><Space size={[4, 4]} wrap>{brands.slice(0, 2).map(brand => <Tag color="blue" key={brand}>{brand}</Tag>)}{brands.length > 2 && <Tag>+{brands.length - 2}</Tag>}</Space></Tooltip> : "-" },
    { title: "状态", dataIndex: "status", width: 90, render: value => <StatusTag value={value} /> }, { title: "创建人", dataIndex: "createdByName", width: 110 },
    { title: "创建时间", dataIndex: "createdAt", width: 175, render: formatTime },
    { title: "操作", fixed: "right", width: 300, render: (_, row) => <Space className="table-actions" size={0}>{can("preview") && <Button type="link" size="small" onClick={() => void openPreview(row)}>预览</Button>}{can("edit") && <Button type="link" size="small" onClick={() => void loadExisting(row, "edit")}>编辑</Button>}{can("view") && <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => void loadExisting(row, "view")}>查看</Button>}{((row.status === "ENABLED" && can("disable")) || (row.status === "DISABLED" && can("enable"))) && <Button type="link" size="small" onClick={() => changeStatus(row)}>{row.status === "ENABLED" ? "禁用" : "启用"}</Button>}{can("delete") && <Tooltip title={row._count.records ? "该模版已有历史调研记录，请使用禁用操作" : undefined}><Button type="link" danger size="small" icon={<DeleteOutlined />} disabled={row._count.records > 0} onClick={() => remove(row)}>删除</Button></Tooltip>}</Space> },
  ];
  const filteredEmpty = Object.values(appliedFilters).some(Boolean);
  const currentBrands = current?.applicableBrands || [];
  const visibleBrands: Option[] = [...brandOptions, ...currentBrands.filter(value => !brandOptions.some(option => option.value === value)).map(value => ({ label: `${value}（已停用）`, value, disabled: true }))];
  const visibleTypes: Option[] = [...typeOptions, ...(current?.templateType && !typeOptions.some(option => option.value === current.templateType) ? [{ label: `${current.templateType}（已停用）`, value: current.templateType, disabled: true }] : [])];
  return <>
    <Card style={{ marginBottom: 16 }}><div className="research-template-filter-grid"><Select allowClear value={filters.templateType || undefined} placeholder="调研模版类型：全部" options={typeOptions} onChange={value => setFilters(previous => ({ ...previous, templateType: value || "" }))} /><Select allowClear value={filters.brand || undefined} placeholder="适用品牌：全部" options={brandOptions} onChange={value => setFilters(previous => ({ ...previous, brand: value || "" }))} /><Select allowClear value={filters.status || undefined} placeholder="状态：全部" options={[{ label: "已启用", value: "ENABLED" }, { label: "已禁用", value: "DISABLED" }]} onChange={value => setFilters(previous => ({ ...previous, status: value || "" }))} /><Space><Button onClick={resetFilter}>重置</Button><Button type="primary" onClick={applyFilter}>筛选</Button></Space></div>{dictionaryError && <Alert style={{ marginTop: 16 }} type="error" showIcon message="调研模版类型或品牌数据加载失败，请稍后重试" action={<Button size="small" onClick={() => void loadDictionaries()}>重新加载</Button>} />}</Card>
    <Card extra={can("create") ? <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增</Button> : null}>
      {error ? <Alert type="error" showIcon message="调研模版加载失败，请稍后重试" action={<Button size="small" onClick={() => void load()}>重新加载</Button>} /> : <DataTable<ResearchTemplateRow> rowKey="id" columns={columns} dataSource={rows} loading={loading} rowSelection={{ selectedRowKeys, preserveSelectedRowKeys: true, onChange: setSelectedRowKeys }} scroll={{ x: 1350 }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<><div>{filteredEmpty ? "没有找到符合当前条件的调研模版" : "暂无调研模版"}</div><small>{filteredEmpty ? "请调整筛选条件后重试" : "当前还没有创建调研模版"}</small></>}>{filteredEmpty ? <Button onClick={resetFilter}>重置筛选</Button> : can("create") ? <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增</Button> : null}</Empty> }} pagination={{ current: page, pageSize, total, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100], showTotal: count => `共 ${count} 条`, onChange: (nextPage, nextSize) => { setPage(nextPage); setPageSize(nextSize); void load(nextPage, nextSize); } }} />}
    </Card>
    <Modal title={mode === "create" ? "新增-调研模版" : mode === "edit" ? "编辑-调研模版" : "查看调研模版"} open={Boolean(mode)} width={1100} onCancel={closeForm} destroyOnHidden maskClosable={false} styles={{ body: { maxHeight: "72vh", overflowY: "auto" } }} footer={mode === "view" ? <Button onClick={closeForm}>关闭</Button> : <Space><Button onClick={closeForm}>取消</Button><Button type="primary" loading={saving} disabled={saving} onClick={() => void submit()}>保存</Button></Space>}>
      <Form form={form} layout="vertical" disabled={mode === "view"} initialValues={{ applicableBrands: [], detailText: "", remark: "" }} onValuesChange={() => { if (mode !== "view") setDirty(true); }}>
        <h3 className="assessment-form-heading">基础信息</h3><div className="assessment-form-grid">
          <Form.Item label="记录编号"><Input disabled value={current?.recordNo} placeholder="保存后自动生成" /></Form.Item>
          <Form.Item label="调研模版类型" name="templateType" rules={[{ required: true, message: "请选择调研模版类型" }]} extra={dictionaryError ? "调研模版类型加载失败，请检查 Research_Template_Type 数据字典。" : "选项来源于数据字典 Research_Template_Type。"}><Select allowClear showSearch optionFilterProp="label" placeholder="请选择" options={visibleTypes} /></Form.Item>
          <Form.Item label="调研明细配置文件名" name="configFileBase" rules={[{ required: true, message: "请输入调研明细配置文件名" }, { pattern: /^[A-Za-z0-9_]{1,20}$/, message: "配置文件名称只能包含英文字母、数字和下划线，且不能超过20个字符" }]} extra={mode === "edit" && current?._count.records ? "该调研模版已产生历史调研记录，配置文件名称不可修改。" : undefined}><Input addonAfter=".json" maxLength={20} placeholder="例如：store_research" disabled={mode === "view" || (mode === "edit" && Boolean(current?._count.records))} /></Form.Item>
          <Form.Item className="assessment-brand-field" label="适用品牌" name="applicableBrands" rules={[{ required: true, type: "array", min: 1, message: "请至少选择一个适用品牌" }]} extra={dictionaryError ? "品牌数据加载失败，请检查 BRAND 数据字典。" : "可多选；选项来源于数据字典 BRAND。"}><Checkbox.Group options={visibleBrands} /></Form.Item>
        </div>
        <h3 className="assessment-form-heading">调研明细</h3><Form.Item label="调研明细" name="detailText" rules={[{ required: true, message: "请输入调研明细" }, { validator: (_, value) => { const result = detailStats(value); return result.firstError ? Promise.reject(new Error(result.firstError)) : result.valid ? Promise.resolve() : Promise.reject(new Error("请输入调研明细")); } }]} extra="每行格式：总项｜子项｜检查明细项｜【输入框】必填/选填；兼容全角和半角竖线，空行将自动忽略。"><Input.TextArea rows={12} placeholder={example} className="assessment-detail-input" /></Form.Item>
        <div className={`research-detail-stats ${stats.errors ? "has-error" : ""}`}><span>有效明细项：<b>{stats.valid}</b></span><span>格式错误：<b>{stats.errors}</b></span>{stats.firstError && <span>{stats.firstError}</span>}</div>
        <Form.Item label="备注" name="remark" rules={[{ validator: (_, value) => !value || Array.from(value).length <= 50 ? Promise.resolve() : Promise.reject(new Error("备注不能超过50个汉字")) }]}><Input.TextArea rows={3} showCount maxLength={50} placeholder="请输入备注（选填）" /></Form.Item>
        <h3 className="assessment-form-heading">系统信息</h3><div className="assessment-form-grid two-columns"><Form.Item label="创建人"><Input disabled value={current?.createdByName} placeholder="保存后自动生成" /></Form.Item><Form.Item label="创建时间"><Input disabled value={current?.createdAt ? formatTime(current.createdAt) : undefined} placeholder="保存后自动生成" /></Form.Item></div>
      </Form>
    </Modal>
    <UnsavedChangesModal open={discardOpen} title="当前调研模版尚未保存" onKeep={() => setDiscardOpen(false)} onDiscard={() => { setDiscardOpen(false); setMode(null); setDirty(false); }} />
    <ResearchTemplatePreviewModal open={previewOpen} loading={previewLoading} config={previewConfig} onClose={() => { setPreviewOpen(false); setPreviewConfig(null); }} />
  </>;
}

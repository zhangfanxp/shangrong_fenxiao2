"use client";

import { DeleteOutlined, DownloadOutlined, EyeOutlined, PlusOutlined } from "@ant-design/icons";
import {
  Alert, Button, Card, Descriptions, Empty, Form, Input, message, Modal, Select, Space, Table, Tag, Tooltip, Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import { DataTable } from "@/components/data-table";
import { UnsavedChangesModal } from "@/components/unsaved-changes-modal";

type SourceType = "TASK_TEMPLATE" | "ASSESSMENT_TEMPLATE" | "RESEARCH_TEMPLATE";
type FieldType = "INTEGER" | "DECIMAL" | "MONEY" | "PERCENTAGE" | "TEXT" | "DATE" | "DATETIME";
type FieldRole = "DIMENSION" | "METRIC";
type Permission = "query" | "create" | "view" | "edit" | "delete" | "export";
type Filters = { businessNameKeyword: string; sourceType: "" | SourceType; templateRecordNo: string };
type SourceRow = {
  id: string; recordNo: string; businessName: string; sourceType: SourceType; sourceTypeLabel: string;
  templateId: string; templateRecordNoSnapshot: string; templateNameSnapshot: string; createdByNameSnapshot: string;
  createdAt: string; updatedAt: string; version: number; _count: { fields: number };
};
type TemplateOption = { templateId: string; templateRecordNo: string; templateName: string; status: "ENABLED" | "DISABLED" };
type TemplateField = {
  sourceFieldKey: string; sourceFieldId: string | null; sourceFieldCode: string | null; fieldName: string;
  sourceFieldType: string; fieldRole: FieldRole; recommendedFieldType: FieldType | null; recommendedUnit: string | null;
  originalTableField: string;
};
type FieldRow = {
  id?: string; sourceFieldKey: string; fieldNameSnapshot: string; sourceFieldType?: string | null;
  fieldRole: FieldRole; fieldType: FieldType; fieldTypeLabel?: string; originalTableField?: string;
  unit?: string | null; remark?: string | null; sortOrder: number;
};
type SourceDetail = SourceRow & {
  remark?: string | null; createdByUsername: string; templateStatus: "ENABLED" | "DISABLED" | null; templateMissing: boolean; fields: FieldRow[];
};
type MainFormValues = { businessName: string; sourceType: SourceType; templateId: string; remark: string };
type FieldFormValues = { sourceFieldKey: string; fieldType: FieldType; unit: string; remark: string };

const sourceTypeOptions = [
  { label: "任务模版", value: "TASK_TEMPLATE" },
  { label: "考核表格", value: "ASSESSMENT_TEMPLATE" },
  { label: "调研模版", value: "RESEARCH_TEMPLATE" },
] satisfies Array<{ label: string; value: SourceType }>;
const fieldTypeOptions = [
  { label: "整数", value: "INTEGER" }, { label: "数值", value: "DECIMAL" },
  { label: "金额", value: "MONEY" }, { label: "百分比", value: "PERCENTAGE" },
  { label: "文本", value: "TEXT" }, { label: "日期", value: "DATE" }, { label: "日期时间", value: "DATETIME" },
] satisfies Array<{ label: string; value: FieldType }>;
const metricFieldTypeOptions = fieldTypeOptions.filter(option => ["INTEGER", "DECIMAL", "MONEY", "PERCENTAGE"].includes(option.value));
const fieldTypeLabel = Object.fromEntries(fieldTypeOptions.map(option => [option.value, option.label])) as Record<FieldType, string>;
const emptyFilters: Filters = { businessNameKeyword: "", sourceType: "", templateRecordNo: "" };
const formatTime = (value?: string | null) => value ? dayjs(value).format("YYYY-MM-DD HH:mm:ss") : "";

export function BusinessDataSourceList({ permissions, currentUserName }: { permissions: string[]; currentUserName: string }) {
  const hasAll = permissions.includes("*");
  const can = (action: Permission) => hasAll || permissions.includes(`business-data-sources:${action}`);
  const [rows, setRows] = useState<SourceRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(emptyFilters);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [mode, setMode] = useState<"create" | "view" | "edit" | null>(null);
  const [current, setCurrent] = useState<SourceDetail | null>(null);
  const [fields, setFields] = useState<FieldRow[]>([]);
  const [templateOptions, setTemplateOptions] = useState<TemplateOption[]>([]);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [templateError, setTemplateError] = useState(false);
  const [availableFields, setAvailableFields] = useState<TemplateField[]>([]);
  const [fieldsLoading, setFieldsLoading] = useState(false);
  const [fieldsError, setFieldsError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [mainForm] = Form.useForm<MainFormValues>();
  const [fieldForm] = Form.useForm<FieldFormValues>();
  const [fieldMode, setFieldMode] = useState<"create" | "view" | "edit" | null>(null);
  const [currentField, setCurrentField] = useState<FieldRow | null>(null);
  const selectedSourceFieldKey = Form.useWatch("sourceFieldKey", fieldForm);
  const selectedAvailableField = availableFields.find(field => field.sourceFieldKey === selectedSourceFieldKey);
  const systemDimensionSelected = selectedAvailableField?.fieldRole === "DIMENSION" || currentField?.fieldRole === "DIMENSION";

  const load = async (nextPage = page, nextPageSize = pageSize, nextFilters = appliedFilters) => {
    setLoading(true); setLoadError(false);
    try {
      const query = new URLSearchParams({ page: String(nextPage), pageSize: String(nextPageSize) });
      if (nextFilters.businessNameKeyword.trim()) query.set("businessNameKeyword", nextFilters.businessNameKeyword.trim());
      if (nextFilters.sourceType) query.set("sourceType", nextFilters.sourceType);
      if (nextFilters.templateRecordNo.trim()) query.set("templateRecordNo", nextFilters.templateRecordNo.trim());
      const response = await fetch(`/api/business-data-sources?${query}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      setRows(data.rows); setTotal(data.total);
    } catch { setLoadError(true); } finally { setLoading(false); }
  };

  useEffect(() => { if (can("query")) void load(1, 20, emptyFilters); else setLoading(false); }, []);

  const loadTemplateOptions = async (sourceType: SourceType, currentOption?: TemplateOption) => {
    setTemplateLoading(true); setTemplateError(false);
    try {
      const response = await fetch(`/api/business-data-sources/template-options?sourceType=${sourceType}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      const next = data.rows as TemplateOption[];
      if (currentOption && !next.some(option => option.templateId === currentOption.templateId)) next.push(currentOption);
      setTemplateOptions(next);
    } catch { setTemplateOptions(currentOption ? [currentOption] : []); setTemplateError(true); }
    finally { setTemplateLoading(false); }
  };

  const loadAvailableFields = async (sourceType: SourceType, templateId: string) => {
    setFieldsLoading(true); setFieldsError(false);
    try {
      const response = await fetch(`/api/business-data-sources/template-options/${templateId}/fields?sourceType=${sourceType}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      setAvailableFields(data.fields || []);
    } catch { setAvailableFields([]); setFieldsError(true); }
    finally { setFieldsLoading(false); }
  };

  const applyFilters = () => {
    const next = { ...filters, businessNameKeyword: filters.businessNameKeyword.trim(), templateRecordNo: filters.templateRecordNo.trim() };
    setAppliedFilters(next); setPage(1); void load(1, pageSize, next);
  };
  const resetFilters = () => { setFilters(emptyFilters); setAppliedFilters(emptyFilters); setPage(1); void load(1, pageSize, emptyFilters); };

  const openCreate = () => {
    mainForm.resetFields(); mainForm.setFieldsValue({ businessName: "", remark: "" });
    setCurrent(null); setFields([]); setTemplateOptions([]); setAvailableFields([]); setTemplateError(false); setFieldsError(false); setDirty(false); setMode("create");
  };

  const openExisting = async (row: SourceRow, nextMode: "view" | "edit") => {
    setSaving(true);
    try {
      const response = await fetch(`/api/business-data-sources/${row.id}?intent=${nextMode}`);
      const data = await response.json();
      if (!response.ok) return void message.error(data.message || "业务数据源加载失败，请稍后重试");
      const detail = data.source as SourceDetail;
      setCurrent(detail); setFields(detail.fields); setDirty(false); setMode(nextMode);
      mainForm.setFieldsValue({ businessName: detail.businessName, sourceType: detail.sourceType, templateId: detail.templateId, remark: detail.remark || "" });
      const currentOption: TemplateOption = { templateId: detail.templateId, templateRecordNo: detail.templateRecordNoSnapshot, templateName: detail.templateNameSnapshot, status: detail.templateStatus || "DISABLED" };
      await Promise.all([loadTemplateOptions(detail.sourceType, currentOption), loadAvailableFields(detail.sourceType, detail.templateId)]);
    } catch { message.error("业务数据源加载失败，请稍后重试"); }
    finally { setSaving(false); }
  };

  const closeMain = () => {
    if (saving) return;
    if (dirty && mode !== "view") { setDiscardOpen(true); return; }
    setMode(null); setCurrent(null); setFields([]);
  };

  const applySourceType = (value: SourceType) => {
    mainForm.setFieldsValue({ sourceType: value, templateId: undefined as unknown as string });
    setFields([]); setTemplateOptions([]); setAvailableFields([]); setFieldsError(false); setDirty(true);
    void loadTemplateOptions(value);
  };
  const changeSourceType = (value: SourceType) => {
    const previous = mainForm.getFieldValue("sourceType");
    const hasDependentData = Boolean(mainForm.getFieldValue("templateId")) || fields.length > 0;
    if (!hasDependentData) return applySourceType(value);
    Modal.confirm({
      title: "确认修改来源类型？",
      content: "修改来源类型后，当前模版记录和数据字典字段将被清空，需要重新配置。",
      okText: "确认修改", cancelText: "取消",
      onOk: () => applySourceType(value),
      onCancel: () => mainForm.setFieldValue("sourceType", previous),
    });
  };

  const applyTemplate = (templateId: string) => {
    mainForm.setFieldValue("templateId", templateId); setFields([]); setAvailableFields([]); setDirty(true);
    const sourceType = mainForm.getFieldValue("sourceType");
    if (sourceType && templateId) void loadAvailableFields(sourceType, templateId);
  };
  const changeTemplate = (templateId: string) => {
    const previous = mainForm.getFieldValue("templateId");
    if (!fields.length) return applyTemplate(templateId);
    Modal.confirm({
      title: "确认更换模版记录？",
      content: "更换模版记录后，原数据字典字段配置将失效，需要基于新模版重新配置。",
      okText: "确认更换", cancelText: "取消",
      onOk: () => applyTemplate(templateId),
      onCancel: () => mainForm.setFieldValue("templateId", previous),
    });
  };

  const openFieldCreate = () => {
    if (!mainForm.getFieldValue("templateId")) return void message.warning("请先选择模版记录");
    if (fieldsError) return void message.error("模版字段数据加载失败，请重新加载后再试");
    fieldForm.resetFields(); fieldForm.setFieldsValue({ unit: "", remark: "" } as FieldFormValues);
    setCurrentField(null); setFieldMode("create");
  };
  const openField = (row: FieldRow, nextMode: "view" | "edit") => {
    setCurrentField(row); fieldForm.setFieldsValue({ sourceFieldKey: row.sourceFieldKey, fieldType: row.fieldType, unit: row.unit || "", remark: row.remark || "" }); setFieldMode(nextMode);
  };
  const saveField = async () => {
    try {
      const values = await fieldForm.validateFields();
      if (fieldMode === "edit" && currentField) {
        setFields(previous => previous.map(field => field === currentField ? { ...field, remark: values.remark || null } : field));
      } else {
        const sourceField = availableFields.find(field => field.sourceFieldKey === values.sourceFieldKey);
        if (!sourceField) return void message.error("所选业务字段已不存在，请重新选择");
        if (fields.some(field => field.sourceFieldKey === values.sourceFieldKey || field.fieldNameSnapshot === sourceField.fieldName)) return void message.error("当前数据源已存在相同业务字段");
        setFields(previous => [...previous, { sourceFieldKey: sourceField.sourceFieldKey, fieldNameSnapshot: sourceField.fieldName, sourceFieldType: sourceField.sourceFieldType, fieldRole: sourceField.fieldRole, fieldType: values.fieldType, originalTableField: sourceField.originalTableField, unit: values.unit || null, remark: values.remark || null, sortOrder: previous.length }]);
      }
      setDirty(true); setFieldMode(null); setCurrentField(null);
    } catch { /* Form displays validation errors. */ }
  };
  const selectField = (key: string) => {
    const selected = availableFields.find(field => field.sourceFieldKey === key);
    if (!selected) return;
    fieldForm.setFieldsValue({
      sourceFieldKey: key,
      fieldType: selected.recommendedFieldType || undefined as unknown as FieldType,
      unit: selected.recommendedUnit || "",
    });
  };
  const removeField = (row: FieldRow) => Modal.confirm({
    title: "确认删除数据字典字段？", content: "删除后当前业务数据源将不再包含该业务字段，是否继续？", okText: "确认删除", cancelText: "取消", okButtonProps: { danger: true },
    onOk: () => { setFields(previous => previous.filter(field => field !== row).map((field, index) => ({ ...field, sortOrder: index }))); setDirty(true); },
  });

  const submit = async () => {
    try {
      const values = await mainForm.validateFields();
      if (!fields.length) return void message.error("请至少新增一个数据字典字段");
      setSaving(true);
      const payload = { ...values, fields: fields.map(field => ({ id: field.id, sourceFieldKey: field.sourceFieldKey, fieldType: field.fieldType, unit: field.unit || "", remark: field.remark || "" })), ...(mode === "edit" ? { version: current?.version } : {}) };
      const response = await fetch(mode === "create" ? "/api/business-data-sources" : `/api/business-data-sources/${current?.id}`, { method: mode === "create" ? "POST" : "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) return void message.error(data.message || "业务数据源保存失败，请稍后重试");
      message.success(mode === "create" ? "业务数据源新增成功" : "业务数据源保存成功");
      setMode(null); setCurrent(null); setFields([]); setDirty(false); setPage(1); await load(1, pageSize, appliedFilters);
    } catch { /* Form displays validation errors. */ } finally { setSaving(false); }
  };

  const remove = (row: SourceRow) => Modal.confirm({
    title: "温馨提示",
    content: "删除操作不可逆，删除成功后当前业务数据源及其数据字典字段配置将无法恢复，请谨慎操作。",
    okText: "我知道了，继续删除", cancelText: "我再想想", okButtonProps: { danger: true },
    onOk: async () => {
      const response = await fetch(`/api/business-data-sources/${row.id}`, { method: "DELETE" }); const data = await response.json();
      if (!response.ok) { message.error(data.message || "业务数据源删除失败，请稍后重试"); throw new Error(); }
      message.success(data.message); setSelectedRowKeys(keys => keys.filter(key => key !== row.id));
      const nextPage = rows.length === 1 && page > 1 ? page - 1 : page; setPage(nextPage); await load(nextPage);
    },
  });

  const exportRows = async () => {
    try {
      const response = await fetch("/api/business-data-sources/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(selectedRowKeys.length ? { recordIds: selectedRowKeys } : { filters: appliedFilters }) });
      if (!response.ok) { const data = await response.json(); throw new Error(data.message || "业务数据源导出失败，请稍后重试"); }
      const blob = await response.blob(); const disposition = response.headers.get("Content-Disposition") || ""; const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/)?.[1];
      const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = encoded ? decodeURIComponent(encoded) : `业务数据源_${dayjs().format("YYYYMMDD_HHmmss")}.xlsx`; link.click(); URL.revokeObjectURL(link.href);
    } catch (error) { message.error(error instanceof Error ? error.message : "业务数据源导出失败，请稍后重试"); }
  };

  const templateSelectOptions = templateOptions.map(option => ({
    value: option.templateId,
    label: `[${option.templateRecordNo}] ${option.templateName}${option.status === "DISABLED" ? "（已禁用）" : ""}`,
    disabled: option.status === "DISABLED" && option.templateId !== current?.templateId,
  }));
  const selectableFields = useMemo(() => ([
    {
      label: "系统维度（自动取自上报记录）",
      options: availableFields.filter(field => field.fieldRole === "DIMENSION").map(field => ({ label: field.fieldName, value: field.sourceFieldKey, disabled: fields.some(existing => existing.sourceFieldKey === field.sourceFieldKey) })),
    },
    {
      label: "业务指标（取自模版填写项）",
      options: availableFields.filter(field => field.fieldRole === "METRIC").map(field => ({ label: field.fieldName, value: field.sourceFieldKey, disabled: fields.some(existing => existing.sourceFieldKey === field.sourceFieldKey) })),
    },
  ].filter(group => group.options.length)), [availableFields, fields]);
  const filteredEmpty = Object.values(appliedFilters).some(Boolean);

  const columns: ColumnsType<SourceRow> = [
    { title: "记录编号", dataIndex: "recordNo", width: 145 },
    { title: "业务名称", dataIndex: "businessName", width: 210, ellipsis: true },
    { title: "来源类型", dataIndex: "sourceTypeLabel", width: 130 },
    { title: "模版记录编号", dataIndex: "templateRecordNoSnapshot", width: 160 },
    { title: "创建人", dataIndex: "createdByNameSnapshot", width: 120 },
    { title: "创建时间", dataIndex: "createdAt", width: 175, render: formatTime },
    { title: "操作", fixed: "right", width: 190, render: (_, row) => <Space className="table-actions" size={0}>{can("view") && <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => void openExisting(row, "view")}>查看</Button>}{can("edit") && <Button type="link" size="small" onClick={() => void openExisting(row, "edit")}>编辑</Button>}{can("delete") && <Button type="link" danger size="small" icon={<DeleteOutlined />} onClick={() => remove(row)}>删除</Button>}</Space> },
  ];
  const fieldColumns: ColumnsType<FieldRow> = [
    { title: "序号", width: 70, render: (_, __, index) => index + 1 },
    { title: "业务字段", dataIndex: "fieldNameSnapshot", ellipsis: true, width: 300 },
    { title: "原始表字段", dataIndex: "originalTableField", width: 270, ellipsis: { showTitle: false }, render: value => <Tooltip title={value || "-"}><Typography.Text code>{value || "-"}</Typography.Text></Tooltip> },
    { title: "字段角色", dataIndex: "fieldRole", width: 100, render: value => value === "DIMENSION" ? <Tag color="blue">系统维度</Tag> : <Tag color="green">业务指标</Tag> },
    { title: "字段类型", dataIndex: "fieldType", width: 110, render: value => fieldTypeLabel[value as FieldType] },
    { title: "单位", dataIndex: "unit", width: 90, render: value => value || "-" },
    { title: "备注", dataIndex: "remark", ellipsis: true, render: value => value || "-" },
    { title: "操作", fixed: "right", width: mode === "view" ? 80 : 165, render: (_, row) => <Space className="table-actions" size={0}><Button type="link" size="small" onClick={() => openField(row, "view")}>查看</Button>{mode !== "view" && <Button type="link" size="small" onClick={() => openField(row, "edit")}>编辑</Button>}{mode !== "view" && <Button type="link" danger size="small" onClick={() => removeField(row)}>删除</Button>}</Space> },
  ];

  if (!can("query")) return <Alert type="warning" showIcon message="暂无业务数据源查询权限" description="请联系管理员为当前角色配置相应权限。" />;

  return <>
    <Card style={{ marginBottom: 16 }}>
      <div className="business-source-filter-grid">
        <Form.Item label="业务名称"><Input allowClear value={filters.businessNameKeyword} maxLength={20} placeholder="请输入业务名称" onChange={event => setFilters(previous => ({ ...previous, businessNameKeyword: event.target.value }))} onPressEnter={applyFilters} /></Form.Item>
        <Form.Item label="来源类型"><Select allowClear value={filters.sourceType || undefined} placeholder="全部来源类型" options={sourceTypeOptions} onChange={value => setFilters(previous => ({ ...previous, sourceType: value || "" }))} /></Form.Item>
        <Form.Item label="模版记录编号"><Input allowClear value={filters.templateRecordNo} maxLength={24} placeholder="请输入完整模版记录编号" onChange={event => setFilters(previous => ({ ...previous, templateRecordNo: event.target.value }))} onPressEnter={applyFilters} /></Form.Item>
        <Space className="business-source-filter-actions"><Button onClick={resetFilters}>重置</Button><Button type="primary" onClick={applyFilters}>筛选</Button></Space>
      </div>
    </Card>
    <Card>
      <div className="business-source-toolbar"><Space>{can("create") && <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增</Button>}<Typography.Text type="secondary">已选择 {selectedRowKeys.length} 条</Typography.Text></Space>{can("export") && <Button icon={<DownloadOutlined />} onClick={() => void exportRows()}>批量导出</Button>}</div>
      {loadError ? <Alert type="error" showIcon message="业务数据源加载失败，请稍后重试" action={<Button size="small" onClick={() => void load()}>重新加载</Button>} /> : <DataTable<SourceRow>
        rowKey="id" columns={columns} dataSource={rows} loading={loading} rowSelection={{ selectedRowKeys, preserveSelectedRowKeys: true, onChange: setSelectedRowKeys }} scroll={{ x: 1150 }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<><div>{filteredEmpty ? "没有找到符合当前条件的业务数据源" : "暂无业务数据源记录"}</div><small>{filteredEmpty ? "请调整筛选条件后重试" : "当前还没有配置业务数据源"}</small></>}>{filteredEmpty ? <Button onClick={resetFilters}>重置筛选</Button> : can("create") ? <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增</Button> : null}</Empty> }}
        pagination={{ current: page, pageSize, total, showSizeChanger: true, pageSizeOptions: [20, 50, 100], showTotal: count => `共 ${count} 条`, onChange: (nextPage, nextSize) => { setPage(nextPage); setPageSize(nextSize); void load(nextPage, nextSize); } }}
      />}
    </Card>

    <Modal className="business-source-modal" title={mode === "create" ? "新增业务数据" : mode === "edit" ? "编辑业务数据" : "查看业务数据"} open={Boolean(mode)} width={1120} maskClosable={false} destroyOnHidden onCancel={closeMain} styles={{ body: { maxHeight: "74vh", overflowY: "auto" } }} footer={mode === "view" ? <Button onClick={closeMain}>关闭</Button> : <Space><Button onClick={closeMain}>取消</Button><Button type="primary" loading={saving} onClick={() => void submit()}>保存</Button></Space>}>
      <Form form={mainForm} layout="vertical" disabled={mode === "view"} onValuesChange={() => { if (mode !== "view") setDirty(true); }}>
        <div className="business-source-form-grid">
          <Form.Item label="记录编号"><Input disabled value={current?.recordNo} placeholder="保存后自动生成" /></Form.Item>
          <Form.Item label="业务名称" name="businessName" rules={[{ required: true, whitespace: true, message: "请输入业务名称" }, { max: 20, message: "业务名称不能超过20个字符" }]}><Input maxLength={20} placeholder="请输入业务名称" /></Form.Item>
          <Form.Item label="来源类型" name="sourceType" rules={[{ required: true, message: "请选择来源类型" }]}><Select placeholder="请选择" options={sourceTypeOptions} onChange={changeSourceType} /></Form.Item>
          <Form.Item label="模版记录" name="templateId" rules={[{ required: true, message: "请选择模版记录" }]} extra={templateError ? "模版记录数据加载失败，请稍后重试。" : undefined}><Select showSearch optionFilterProp="label" placeholder={mainForm.getFieldValue("sourceType") ? "请选择" : "请先选择来源类型"} disabled={mode === "view" || !mainForm.getFieldValue("sourceType")} loading={templateLoading} options={templateSelectOptions} onChange={changeTemplate} notFoundContent={templateLoading ? "加载中..." : "暂无已启用模版"} /></Form.Item>
          <Form.Item className="business-source-form-span" label="备注" name="remark" rules={[{ max: 200, message: "备注不能超过200个字符" }]}><Input.TextArea rows={3} showCount maxLength={200} placeholder="请输入备注（选填）" /></Form.Item>
        </div>
      </Form>

      <Card size="small" title="数据字典列表" extra={mode !== "view" ? <Button type="primary" size="small" icon={<PlusOutlined />} loading={fieldsLoading} onClick={openFieldCreate}>新增</Button> : null}>
        <Alert style={{ marginBottom: 12 }} type="info" showIcon message="系统维度会自动从正式上报记录中读取；品牌、门店、日期等信息无需用户重复填写。" />
        {fieldsError && <Alert style={{ marginBottom: 12 }} type="error" showIcon message="模版字段数据加载失败，请稍后重试" action={<Button size="small" onClick={() => { const type = mainForm.getFieldValue("sourceType"); const id = mainForm.getFieldValue("templateId"); if (type && id) void loadAvailableFields(type, id); }}>重新加载</Button>} />}
        <Table<FieldRow> rowKey={row => row.id || row.sourceFieldKey} size="small" columns={fieldColumns} dataSource={fields} pagination={false} scroll={{ x: 1270 }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<><div>暂无数据字典字段</div><small>请点击“新增”配置系统维度和业务指标</small></>} /> }} />
      </Card>

      <Descriptions style={{ marginTop: 18 }} title="系统信息" bordered size="small" column={2}>
        <Descriptions.Item label="创建人">{current?.createdByNameSnapshot || currentUserName}</Descriptions.Item>
        <Descriptions.Item label="创建时间">{formatTime(current?.createdAt) || "保存后自动生成"}</Descriptions.Item>
        {current?.templateMissing && <Descriptions.Item label="模版状态" span={2}><Tag color="error">原模版记录已不存在</Tag></Descriptions.Item>}
        {!current?.templateMissing && current?.templateStatus === "DISABLED" && <Descriptions.Item label="模版状态" span={2}><Tag>已禁用</Tag></Descriptions.Item>}
      </Descriptions>
    </Modal>

    <Modal title={fieldMode === "create" ? "新增数据字典" : fieldMode === "edit" ? "编辑数据字典" : "查看数据字典"} open={Boolean(fieldMode)} width={620} zIndex={2050} maskClosable={false} destroyOnHidden onCancel={() => setFieldMode(null)} footer={fieldMode === "view" ? <Button onClick={() => setFieldMode(null)}>关闭</Button> : <Space><Button onClick={() => setFieldMode(null)}>取消</Button><Button type="primary" onClick={() => void saveField()}>保存</Button></Space>}>
      <Form form={fieldForm} layout="vertical">
        <Form.Item label="业务字段" name="sourceFieldKey" rules={[{ required: true, message: "请选择业务字段" }]}><Select showSearch optionFilterProp="label" placeholder="请选择系统维度或模版业务指标" options={selectableFields} disabled={fieldMode !== "create"} onChange={selectField} /></Form.Item>
        <Form.Item label="字段类型" name="fieldType" rules={[{ required: true, message: "请选择字段类型" }]} extra={systemDimensionSelected ? "系统维度的字段类型由系统固定。" : undefined}><Select placeholder="请选择" options={systemDimensionSelected ? fieldTypeOptions : metricFieldTypeOptions} disabled={fieldMode !== "create" || systemDimensionSelected} /></Form.Item>
        <Form.Item label="单位" name="unit" rules={[{ max: 10, message: "单位不能超过10个字符" }]}><Input maxLength={10} placeholder={systemDimensionSelected ? "系统维度无需单位" : "例如：人、元、%、分（选填）"} disabled={fieldMode !== "create" || systemDimensionSelected} /></Form.Item>
        <Form.Item label="备注" name="remark" rules={[{ max: 200, message: "备注不能超过200个字符" }]}><Input.TextArea rows={4} showCount maxLength={200} placeholder="请输入字段统计口径（选填）" disabled={fieldMode === "view"} /></Form.Item>
      </Form>
      {fieldMode === "edit" && <Alert type="info" showIcon message="字段定义创建后不可修改，本次仅支持修订备注。" />}
    </Modal>

    <UnsavedChangesModal open={discardOpen} title="当前业务数据尚未保存" content="关闭后填写内容和数据字典字段将丢失，是否继续？" onKeep={() => setDiscardOpen(false)} onDiscard={() => { setDiscardOpen(false); setMode(null); setCurrent(null); setFields([]); setDirty(false); }} />
  </>;
}

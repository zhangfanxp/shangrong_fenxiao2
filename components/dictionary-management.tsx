"use client";

import { EyeOutlined, PlusOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Descriptions, Empty, Form, Input, message, Modal, Select, Space, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { useEffect, useState } from "react";
import { DataTable } from "@/components/data-table";
import { StatusTag } from "@/components/status-tag";

type Permission = "query" | "create" | "edit" | "view" | "enable" | "disable" | "values:view" | "values:edit";
type Status = "ENABLED" | "DISABLED";
type DictionaryRow = {
  id: string; recordNo: string; name: string; code: string; fileName: string; remark: string | null;
  status: Status; version: number; createdAt: string; updatedAt: string;
};
type DictionaryFormValues = { name: string; code: string; fileBase: string; remark: string; status: Status };

const statusOptions = [{ value: "ENABLED", label: "启用" }, { value: "DISABLED", label: "禁用" }];
const formatTime = (value: string) => dayjs(value).format("YYYY-MM-DD HH:mm:ss");

export function DictionaryManagement({ permissions }: { permissions: string[] }) {
  const hasAll = permissions.includes("*") || permissions.includes("settings:dictionaries");
  const can = (action: Permission) => hasAll || permissions.includes(`dictionaries:${action}`) || (action === "values:view" && permissions.includes("dictionaries:values:edit"));
  const [rows, setRows] = useState<DictionaryRow[]>([]); const [total, setTotal] = useState(0); const [loading, setLoading] = useState(true); const [error, setError] = useState(false);
  const [filters, setFilters] = useState({ name: "", code: "" }); const [appliedFilters, setAppliedFilters] = useState({ name: "", code: "" });
  const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(10);
  const [mode, setMode] = useState<"create" | "edit" | "view" | null>(null); const [current, setCurrent] = useState<DictionaryRow | null>(null); const [hasValues, setHasValues] = useState(false);
  const [saving, setSaving] = useState(false); const [dirty, setDirty] = useState(false); const [form] = Form.useForm<DictionaryFormValues>();
  const [valuesTarget, setValuesTarget] = useState<DictionaryRow | null>(null); const [valuesText, setValuesText] = useState(""); const [initialValuesText, setInitialValuesText] = useState(""); const [valuesLoading, setValuesLoading] = useState(false); const [valuesSaving, setValuesSaving] = useState(false);

  const load = async (nextPage = page, nextPageSize = pageSize, nextFilters = appliedFilters) => {
    setLoading(true); setError(false);
    try {
      const query = new URLSearchParams({ name: nextFilters.name.trim(), code: nextFilters.code.trim(), page: String(nextPage), pageSize: String(nextPageSize) });
      const response = await fetch(`/api/settings/dictionaries?${query}`); const data = await response.json();
      if (!response.ok) throw new Error(data.message); setRows(data.rows); setTotal(data.total);
    } catch { setError(true); } finally { setLoading(false); }
  };
  useEffect(() => { if (can("query")) void load(1, 10, { name: "", code: "" }); else setLoading(false); }, []);

  const applyFilter = () => { const next = { name: filters.name.trim(), code: filters.code.trim() }; setAppliedFilters(next); setPage(1); void load(1, pageSize, next); };
  const resetFilter = () => { const next = { name: "", code: "" }; setFilters(next); setAppliedFilters(next); setPage(1); void load(1, pageSize, next); };
  const openCreate = () => { form.resetFields(); form.setFieldsValue({ name: "", code: "", fileBase: "", remark: "", status: "ENABLED" }); setCurrent(null); setHasValues(false); setDirty(false); setMode("create"); };
  const openExisting = async (row: DictionaryRow, nextMode: "edit" | "view") => {
    setSaving(true);
    try {
      const response = await fetch(`/api/settings/dictionaries/${row.id}?intent=${nextMode}`); const data = await response.json();
      if (!response.ok) return void message.error(data.message || "数据字典加载失败，请稍后重试");
      const next = data.dictionary as DictionaryRow; setCurrent(next); setHasValues(Boolean(data.hasValues));
      form.setFieldsValue({ name: next.name, code: next.code, fileBase: next.fileName.replace(/\.json$/i, ""), remark: next.remark || "", status: next.status }); setDirty(false); setMode(nextMode);
    } catch { message.error("数据字典加载失败，请稍后重试"); } finally { setSaving(false); }
  };
  const finishCloseForm = () => { setMode(null); setCurrent(null); setDirty(false); form.resetFields(); };
  const closeForm = () => {
    if (saving) return;
    if (dirty && mode !== "view") { Modal.confirm({ title: "当前内容尚未保存", content: "关闭后修改内容将丢失，是否继续？", okText: "确认关闭", cancelText: "继续编辑", onOk: finishCloseForm }); return; }
    finishCloseForm();
  };
  const submit = async () => {
    try {
      const values = await form.validateFields(); setSaving(true);
      const response = await fetch(mode === "create" ? "/api/settings/dictionaries" : `/api/settings/dictionaries/${current?.id}`, { method: mode === "create" ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(mode === "create" ? values : { ...values, updatedAt: current?.updatedAt }) });
      const data = await response.json(); if (!response.ok) return void message.error(data.message || "保存失败，请稍后重试");
      message.success(mode === "create" ? "数据字典新增成功" : "数据字典保存成功"); finishCloseForm(); setPage(1); await load(1, pageSize, appliedFilters);
    } catch (reason) { if (reason instanceof Error) message.error(reason.message); } finally { setSaving(false); }
  };
  const changeStatus = (row: DictionaryRow) => {
    const enabling = row.status === "DISABLED"; const action = enabling ? "启用" : "停用";
    Modal.confirm({ title: `确认${action}数据字典？`, content: enabling ? "启用后，该数据字典可重新供相关业务功能使用。" : "停用后，该数据字典将不再作为新的业务选项提供，但不会删除已有枚举值或影响历史数据展示。", okText: `确认${action}`, cancelText: "取消", onOk: async () => {
      const response = await fetch(`/api/settings/dictionaries/${row.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "status", status: enabling ? "ENABLED" : "DISABLED", updatedAt: row.updatedAt }) }); const data = await response.json();
      if (!response.ok) { message.error(data.message || "操作失败，请稍后重试"); throw new Error(); } message.success(data.message); await load();
    } });
  };
  const openValues = async (row: DictionaryRow) => {
    setValuesTarget(row); setValuesText(""); setInitialValuesText(""); setValuesLoading(true);
    try {
      const response = await fetch(`/api/settings/dictionaries/${row.id}/values`); const data = await response.json();
      if (!response.ok) { message.error(data.message || "枚举值加载失败，请稍后重试"); setValuesTarget(null); return; }
      setValuesTarget(data.dictionary); setValuesText(data.valuesText); setInitialValuesText(data.valuesText);
    } catch { message.error("枚举值加载失败，请稍后重试"); setValuesTarget(null); } finally { setValuesLoading(false); }
  };
  const finishCloseValues = () => { setValuesTarget(null); setValuesText(""); setInitialValuesText(""); };
  const closeValues = () => {
    if (valuesSaving) return;
    if (valuesText !== initialValuesText && can("values:edit")) { Modal.confirm({ title: "当前枚举值尚未保存", content: "关闭后修改内容将丢失，是否继续？", okText: "确认关闭", cancelText: "继续编辑", onOk: finishCloseValues }); return; }
    finishCloseValues();
  };
  const saveValues = async () => {
    if (!valuesTarget) return; setValuesSaving(true);
    try {
      const response = await fetch(`/api/settings/dictionaries/${valuesTarget.id}/values`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ valuesText, updatedAt: valuesTarget.updatedAt }) }); const data = await response.json();
      if (!response.ok) return void message.error(data.message || "枚举值保存失败，请稍后重试");
      message.success("枚举值保存成功"); finishCloseValues(); await load();
    } catch { message.error("枚举值保存失败，请稍后重试"); } finally { setValuesSaving(false); }
  };

  if (!can("query")) return <Alert type="warning" showIcon message="暂无数据字典查询权限" description="请联系管理员为当前角色配置相应权限。" />;
  const columns: ColumnsType<DictionaryRow> = [
    { title: "字典中文名称", dataIndex: "name", width: 150 }, { title: "字典英文名称", dataIndex: "code", width: 190 },
    { title: "备注", dataIndex: "remark", width: 240, ellipsis: true, render: value => value || "-" }, { title: "状态", dataIndex: "status", width: 90, render: value => <StatusTag value={value} /> },
    { title: "创建日期", dataIndex: "createdAt", width: 175, render: formatTime },
    { title: "操作", fixed: "right", width: 300, render: (_, row) => <Space className="table-actions" size={0}>{can("values:view") && <Button type="link" size="small" onClick={() => void openValues(row)}>枚举值</Button>}{can("edit") && <Button type="link" size="small" onClick={() => void openExisting(row, "edit")}>编辑</Button>}{can("view") && <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => void openExisting(row, "view")}>查看</Button>}{row.status === "ENABLED" && can("disable") && <Button type="link" size="small" onClick={() => changeStatus(row)}>停用</Button>}{row.status === "DISABLED" && can("enable") && <Button type="link" size="small" onClick={() => changeStatus(row)}>启用</Button>}</Space> },
  ];
  const filteredEmpty = Boolean(appliedFilters.name || appliedFilters.code);
  const statusEditable = mode === "create" || (current?.status === "ENABLED" ? can("disable") : can("enable"));
  return <>
    <Card style={{ marginBottom: 16 }}><div className="dictionary-filter-grid"><Form.Item label="字典中文名称" style={{ marginBottom: 0 }}><Input allowClear placeholder="请输入字典中文名称" value={filters.name} onChange={event => setFilters({ ...filters, name: event.target.value })} onPressEnter={applyFilter} /></Form.Item><Form.Item label="字典英文名称" style={{ marginBottom: 0 }}><Input allowClear placeholder="请输入字典英文名称" value={filters.code} onChange={event => setFilters({ ...filters, code: event.target.value })} onPressEnter={applyFilter} /></Form.Item><Space className="dictionary-filter-actions"><Button onClick={resetFilter}>重置</Button><Button type="primary" onClick={applyFilter}>筛选</Button></Space></div></Card>
    <Card extra={can("create") ? <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增</Button> : null}>
      {error ? <Alert type="error" showIcon message="数据字典加载失败，请稍后重试" action={<Button size="small" onClick={() => void load()}>重新加载</Button>} /> : <DataTable<DictionaryRow> rowKey="id" columns={columns} dataSource={rows} loading={loading} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<><div>{filteredEmpty ? "没有找到符合当前条件的数据字典" : "暂无数据字典"}</div><small>{filteredEmpty ? "请调整筛选条件后重试" : "当前还没有数据字典配置"}</small></>}>{filteredEmpty ? <Button onClick={resetFilter}>重置筛选</Button> : can("create") ? <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增数据字典</Button> : null}</Empty> }} pagination={{ current: page, pageSize, total, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100], showTotal: count => `共 ${count} 条`, onChange: (nextPage, nextSize) => { setPage(nextPage); setPageSize(nextSize); void load(nextPage, nextSize); } }} />}
    </Card>
    <Modal title={mode === "create" ? "新增数据字典" : mode === "edit" ? "编辑数据字典" : "查看数据字典"} open={Boolean(mode)} width={720} onCancel={closeForm} destroyOnHidden maskClosable={false} footer={mode === "view" ? <Button onClick={closeForm}>关闭</Button> : <Space><Button onClick={closeForm}>取消</Button><Button type="primary" loading={saving} onClick={() => void submit()}>保存</Button></Space>}>
      <Form form={form} layout="vertical" disabled={mode === "view"} initialValues={{ status: "ENABLED", remark: "" }} onValuesChange={() => { if (mode !== "view") setDirty(true); }}>
        <div className="dictionary-form-grid"><Form.Item label="记录编号"><Input disabled value={current?.recordNo} placeholder="保存后自动生成" /></Form.Item><Form.Item label="字典中文名称" name="name" rules={[{ required: true, message: "请输入字典中文名称" }, { validator: (_, value) => !value || Array.from(value.trim()).length <= 10 ? Promise.resolve() : Promise.reject(new Error("字典中文名称不能超过10个汉字")) }]}><Input showCount maxLength={10} placeholder="请输入字典中文名称" /></Form.Item><Form.Item label="字典英文名称" name="code" rules={[{ required: true, message: "请输入字典英文名称" }, { pattern: /^[A-Za-z0-9_]{1,30}$/, message: "字典英文名称只能包含英文字母、数字和下划线，且不能超过30个字符" }]}><Input maxLength={30} placeholder="例如：Area" /></Form.Item><Form.Item label="本地JSON文件" name="fileBase" rules={[{ required: true, message: "请输入本地JSON文件名称" }, { pattern: /^[A-Za-z0-9_]{1,30}$/, message: "文件名称只能包含英文字母、数字和下划线，且不能超过30个字符" }]} extra={mode === "edit" && hasValues ? "当前数据字典已存在枚举值，本地JSON文件名称不可修改。" : "文件将保存在项目 Data_Dictionary 目录中"}><Input addonAfter=".json" maxLength={30} placeholder="例如：Area" disabled={mode === "view" || (mode === "edit" && hasValues)} title={mode === "edit" && hasValues ? "当前数据字典已存在枚举值，本地JSON文件名称不可修改" : undefined} /></Form.Item><Form.Item label="状态" name="status" rules={[{ required: true, message: "请选择状态" }]}><Select options={statusOptions} disabled={mode === "view" || !statusEditable} /></Form.Item><div /></div>
        <Form.Item label="备注" name="remark" rules={[{ validator: (_, value) => !value || Array.from(value).length <= 200 ? Promise.resolve() : Promise.reject(new Error("备注不能超过200个字符")) }]}><Input.TextArea rows={4} showCount maxLength={200} placeholder="请输入备注（选填）" /></Form.Item>
      </Form>
    </Modal>
    <Modal title="数据字典-枚举值" open={Boolean(valuesTarget)} width={720} onCancel={closeValues} destroyOnHidden maskClosable={false} footer={can("values:edit") ? <Space><Button onClick={closeValues}>取消</Button><Button type="primary" loading={valuesSaving} disabled={valuesLoading} onClick={() => void saveValues()}>保存</Button></Space> : <Button onClick={closeValues}>关闭</Button>}>
      {valuesTarget && <><Descriptions size="small" column={1} bordered style={{ marginBottom: 16 }}><Descriptions.Item label="字典中文名称">{valuesTarget.name}</Descriptions.Item><Descriptions.Item label="字典英文名称">{valuesTarget.code}</Descriptions.Item><Descriptions.Item label="本地JSON文件">{valuesTarget.fileName}</Descriptions.Item></Descriptions><Alert type="warning" showIcon message="温馨提示" description="修改或删除枚举值可能影响系统相关业务页面，请确认后操作。枚举值之间请使用“|”分隔，排列顺序即业务下拉选项展示顺序。" style={{ marginBottom: 16 }} /><Typography.Text strong>枚举值</Typography.Text><Input.TextArea value={valuesText} onChange={event => setValuesText(event.target.value)} disabled={valuesLoading || !can("values:edit")} rows={7} placeholder="例如：1区|2区|3区|4区|5区" style={{ marginTop: 8 }} /></>}
    </Modal>
  </>;
}

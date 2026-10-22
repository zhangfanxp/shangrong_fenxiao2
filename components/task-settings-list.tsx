"use client";

import { DeleteOutlined, EyeOutlined, PlusOutlined, SyncOutlined, WarningOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Checkbox, Collapse, Descriptions, Form, Input, message, Modal, Select, Space, Tag, Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useState } from "react";
import { DataTable } from "@/components/data-table";
import { StatusTag } from "@/components/status-tag";
import { TaskPreviewModal } from "@/components/task-preview-modal";
import { TimeStringPicker } from "@/components/time-string-picker";
import { UnsavedChangesModal } from "@/components/unsaved-changes-modal";
import { canTaskSettingsAction } from "@/lib/task-settings-permissions";

type Option = { id: string; name: string; status?: string };
type CalendarTemplateOption = { id: string; recordNo: string; name: string; status?: string };
type AiServiceOption = { label: string; value: string };
type TaskRow = { id: string; recordNo: string; title: string; type: string; targetType: "STORE" | "STORE_EMPLOYEE"; specifiedTargets?: string[] | null; status: string; configFileName: string; createdAt: string; updatedAt: string; description?: string; includeCompletionRate: boolean; singleRecordForMultipleExecutors: boolean; executionDays?: string[]; weeklyExecutionDay?: string | null; monthlyExecutionDay?: string | null; deadlineDayOffset: -1 | 0 | 1; deadlineTime: string; configVersion: number; executorRole?: Option | null; executorRoles?: { role: Option }[]; r2Storage?: Option | null; calendarTemplate?: CalendarTemplateOption | null; brands: { brand: Option }[]; createdBy?: { realName: string } | null };
type FormValues = { title: string; type: string; calendarTemplateId?: string | null; targetType: "STORE" | "STORE_EMPLOYEE"; specifiedTargets: string; executorRoleIds: string[]; r2StorageId: string; brandIds: string[]; executionDays: string[]; weeklyExecutionDay?: string | null; monthlyExecutionDay?: string | null; deadlineDayOffset: -1 | 0 | 1; deadlineTime: string; includeCompletionRate: boolean; singleRecordForMultipleExecutors: boolean; configFileBase: string; submitContent: string; status: string };
type TaskUpdateResult = { date: string; total: number; created: number; covered: number; notGenerated: number; overdue: number; ignoredTasks: number };
const taskTypes = [{ value: "DAILY", label: "日任务" }, { value: "WEEKLY", label: "周任务" }, { value: "MONTHLY", label: "月任务" }, { value: "TEMPORARY", label: "临时任务" }, { value: "CALENDAR", label: "日历任务" }];
const taskTargets = [{ value: "STORE", label: "门店" }, { value: "STORE_EMPLOYEE", label: "门店员工" }];
const typeName: Record<string, string> = Object.fromEntries(taskTypes.map(item => [item.value, item.label]));
const days = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const monthlyDays = [{ value: "ANY_DAY", label: "不限" }, ...Array.from({ length: 28 }, (_, index) => ({ value: String(index + 1), label: `${index + 1}日` })), { value: "LAST_DAY", label: "月末（当月最后一天）" }];
const example = "餐厅【桌面】【摆放】｜[附件]拍照｜请拍摄桌面摆放情况｜必填｜1｜图片分析｜请分析图片中的物料是否齐全、摆放整齐且干净整洁，请回答“合格”或“不合格”，不合格时请说明理由。\n服务评分｜[输入框]评分｜请输入0至5分，可保留一位小数｜必填｜1｜｜\n营业目标｜[输入框]金额｜请填写今日的目标营业额｜必填｜1｜｜\n问题数量｜[输入框_5]数字｜请输入0至5之间的整数｜必填｜1｜｜\n交接说明｜[输入框]文字｜请填写需要交接的事项｜选填｜1｜｜";
const formatExample = "门店环境｜[附件]照片｜请拍照或从相册选择照片｜必填｜1｜图片分析｜请分析门店环境是否干净整洁，请回答“合格”或“不合格”，不合格时请说明理由。\n现场水印｜[附件]拍照｜请现场拍照｜必填｜1｜｜\n培训记录｜[附件]视频｜请录像或从相册选择视频｜选填｜1｜视频分析｜请分析视频中的培训流程是否完整，不完整时请说明缺少的环节。\n现场操作｜[附件]录像｜请现场拍摄操作视频｜必填｜2｜｜\n巡检文件｜[附件]文档｜请上传巡检文档｜选填｜1｜｜\n服务评分｜[输入框]评分｜请输入0至5分，可保留一位小数｜必填｜1｜｜\n营业目标｜[输入框]金额｜请填写今日目标营业额｜必填｜1｜｜\n来客人数｜[输入框]数量｜请填写今日来客人数｜必填｜1｜｜\n问题数量｜[输入框_5]数字｜请输入0至5之间的整数｜必填｜1｜｜\n交接说明｜[输入框]文字｜请填写需要交接的事项｜选填｜1｜｜\n检查结果｜[下拉选框]合格,不合格｜请选择检查结果｜必填｜1｜｜";
const attachmentFormats = [
  { syntax: "[附件]照片", description: "现场拍照或从相册选择照片，单张最大10MB。" },
  { syntax: "[附件]拍照", description: "仅调用相机现场拍照，不提供相册照片选择，单张最大10MB。" },
  { syntax: "[附件]视频", description: "现场拍摄或从相册选择视频；建议60–90秒，系统自动压缩，单个最大100MB。" },
  { syntax: "[附件]录像", description: "仅调用摄像头现场拍摄视频；建议60–90秒，系统自动压缩，单个最大100MB。" },
  { syntax: "[附件]文档", description: "上传PDF、Word、Excel、PPT、TXT或CSV文档，单个最大20MB。" },
] as const;
const otherFormats = [
  { syntax: "[输入框]评分", description: "输入0至5之间的评分，支持整数或最多一位小数，如0、5、4、4.6、4.7。" },
  { syntax: "[输入框]金额", description: "输入非负金额，最多保留2位小数。" },
  { syntax: "[输入框]数量 / [输入框]数字", description: "输入任意非负整数，如0、1、2、3，两种写法均支持。" },
  { syntax: "[输入框_5]数字", description: "下划线后的数字是允许录入的最大值；本例只允许输入0、1、2、3、4、5。也可按需写成[输入框_20]数字等。" },
  { syntax: "[输入框]文字", description: "输入普通文字，支持多行填写。" },
  { syntax: "[下拉选框]选项1,选项2", description: "使用半角逗号分隔选项，至少配置一个有效选项。" },
] as const;

function formatTime(value: string) { return new Date(value).toLocaleString("zh-CN", { hour12: false }); }
function parsePreview(value = "") {
  const items: { fields: string[]; index: number }[] = [];
  value.replace(/\r\n/g, "\n").split("\n").forEach((rawLine, index) => {
    const line = rawLine.trim().replace(/,+$/, "");
    if (!line) return;
    const previous = items.at(-1);
    if (!/[｜|]/.test(line) && previous?.fields.length === 7 && previous.fields[5] && previous.fields[6]) {
      previous.fields[6] = `${previous.fields[6]} ${line}`;
      return;
    }
    items.push({ fields: line.split(/[｜|]/).map(part => part.trim()), index });
  });
  return items;
}

export function TaskSettingsList({ permissions }: { permissions: string[] }) {
  const can = (action: Parameters<typeof canTaskSettingsAction>[1]) => canTaskSettingsAction(permissions, action);
  const canQuery = can("query");
  const [rows, setRows] = useState<TaskRow[]>([]); const [total, setTotal] = useState(0); const [loading, setLoading] = useState(true); const [error, setError] = useState(false);
  const [filters, setFilters] = useState({ keyword: "", type: "" }); const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(10);
  const [roles, setRoles] = useState<Option[]>([]); const [brands, setBrands] = useState<Option[]>([]); const [r2Storages, setR2Storages] = useState<Option[]>([]); const [calendarTemplates, setCalendarTemplates] = useState<CalendarTemplateOption[]>([]); const [aiServiceOptions, setAiServiceOptions] = useState<AiServiceOption[]>([]); const [aiServiceLoadError, setAiServiceLoadError] = useState(false); const [optionError, setOptionError] = useState(false);
  const [taskDefaults, setTaskDefaults] = useState<{ deadlineDayOffset: 0 | 1; deadlineTime: string }>({ deadlineDayOffset: 0, deadlineTime: "23:59" });
  const [mode, setMode] = useState<"create" | "edit" | "view" | null>(null); const [current, setCurrent] = useState<TaskRow | null>(null); const [saving, setSaving] = useState(false); const [dirty, setDirty] = useState(false); const [form] = Form.useForm<FormValues>();
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [updatingTasks, setUpdatingTasks] = useState(false);
  const [updateResult, setUpdateResult] = useState<TaskUpdateResult | null>(null);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [preview, setPreview] = useState<{ taskId: string; config: unknown } | null>(null);
  const [formatHelpOpen, setFormatHelpOpen] = useState(false);
  const [saveResult, setSaveResult] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TaskRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const load = async (nextPage = page, nextPageSize = pageSize, nextFilters = filters) => { if (!canQuery) return; setLoading(true); setError(false); try { const query = new URLSearchParams({ ...nextFilters, page: String(nextPage), pageSize: String(nextPageSize) }); const response = await fetch(`/api/tasks/settings?${query}`); if (!response.ok) throw new Error(); const data = await response.json(); setRows(data.rows); setTotal(data.total); } catch { setError(true); } finally { setLoading(false); } };
  const loadOptions = async () => { try { const response = await fetch("/api/tasks/settings/options"); if (!response.ok) throw new Error(); const data = await response.json(); setRoles(data.roles); setBrands(data.brands); setR2Storages(data.r2Storages); setCalendarTemplates(data.calendarTemplates || []); setAiServiceOptions(data.aiServiceOptions || []); setAiServiceLoadError(Boolean(data.aiServiceLoadError)); if (data.taskDefaults) setTaskDefaults(data.taskDefaults); } catch { setOptionError(true); setAiServiceLoadError(true); } };
  useEffect(() => { if (canQuery) void load(1, 10, { keyword: "", type: "" }); else setLoading(false); if (canQuery || can("create") || can("view") || can("edit")) void loadOptions(); }, []);
  const resetForm = () => { form.resetFields(); form.setFieldsValue({ targetType: "STORE", specifiedTargets: "", calendarTemplateId: null, executorRoleIds: [], brandIds: [], executionDays: [], weeklyExecutionDay: null, monthlyExecutionDay: null, deadlineDayOffset: taskDefaults.deadlineDayOffset, deadlineTime: taskDefaults.deadlineTime, includeCompletionRate: true, singleRecordForMultipleExecutors: false, status: "ENABLED", submitContent: "" }); setDirty(false); };
  const openCreate = () => { resetForm(); setCurrent(null); setMode("create"); };
  const openExisting = async (row: TaskRow, nextMode: "edit" | "view") => { setSaving(true); try { const response = await fetch(`/api/tasks/settings/${row.id}`); const data = await response.json(); if (!response.ok) { message.error(data.message || "任务配置文件加载失败，请联系系统管理员"); return; } const task = data.task as TaskRow; const linkedRoles = task.executorRoles?.map(item => item.role) || []; const configuredRoles = linkedRoles.length ? linkedRoles : task.executorRole ? [task.executorRole] : []; setCurrent(task); form.setFieldsValue({ title: task.title, type: task.type, calendarTemplateId: task.calendarTemplate?.id || null, targetType: task.targetType || "STORE", specifiedTargets: Array.isArray(task.specifiedTargets) ? task.specifiedTargets.join("｜") : "", executorRoleIds: configuredRoles.filter(role => nextMode === "view" || role.status !== "DISABLED").map(role => role.id), r2StorageId: nextMode === "edit" && task.r2Storage?.status === "DISABLED" ? undefined : task.r2Storage?.id, brandIds: task.brands.map(item => item.brand.id), executionDays: task.type === "DAILY" ? task.executionDays || [] : [], weeklyExecutionDay: task.weeklyExecutionDay || (task.type === "WEEKLY" ? task.executionDays?.[0] : null), monthlyExecutionDay: task.monthlyExecutionDay || (task.type === "MONTHLY" ? "1" : null), deadlineDayOffset: task.deadlineDayOffset ?? 0, deadlineTime: task.deadlineTime || "23:59", includeCompletionRate: task.includeCompletionRate, singleRecordForMultipleExecutors: task.singleRecordForMultipleExecutors ?? false, configFileBase: task.configFileName.replace(/\.json$/i, ""), submitContent: task.description || "", status: task.status }); setDirty(false); setMode(nextMode); } catch { message.error("任务配置文件加载失败，请联系系统管理员"); } finally { setSaving(false); } };
  const openPreview = async (row: TaskRow) => { try { const response = await fetch(`/api/tasks/settings/${row.id}`); const data = await response.json(); if (!response.ok) { message.error(data.message || "任务配置文件加载失败，请联系系统管理员"); return; } setPreview({ taskId: row.id, config: data.config }); } catch { message.error("任务配置文件加载失败，请联系系统管理员"); } };
  const dismissTaskModal = () => { setCloseConfirmOpen(false); setMode(null); setCurrent(null); setDirty(false); };
  const close = () => { if (dirty && mode !== "view") { setCloseConfirmOpen(true); return; } dismissTaskModal(); };
  const submit = async () => {
    let values: FormValues;
    try { values = await form.validateFields(); } catch { return; }
    try {
      setSaving(true); setSaveResult(null);
      const creating = mode === "create";
      const url = creating ? "/api/tasks/settings" : `/api/tasks/settings/${current?.id}`;
      const payload = creating ? values : { ...values, updatedAt: current?.updatedAt };
      const response = await fetch(url, { method: creating ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { setSaveResult({ type: "error", message: data.message || "保存失败，请稍后重试" }); return; }
      setMode(null); setDirty(false); setSaveResult({ type: "success", message: creating ? "任务新增成功。" : "任务保存成功。" });
      await load(1, pageSize, filters); setPage(1); void loadOptions();
    } catch (reason) {
      setSaveResult({ type: "error", message: reason instanceof Error ? reason.message : "保存失败，请检查网络后重试" });
    } finally { setSaving(false); }
  };
  const changeStatus = (row: TaskRow) => { const enabling = row.status === "DISABLED"; Modal.confirm({ title: `确认${enabling ? "启用" : "禁用"}任务？`, content: enabling ? "启用后，系统将按照当前任务配置重新参与后续任务生成。" : "禁用后，该任务设置将不再生成新的任务，已经产生的历史任务不受影响。", okText: `确认${enabling ? "启用" : "禁用"}`, cancelText: "取消", onOk: async () => { const response = await fetch(`/api/tasks/settings/${row.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "status", status: enabling ? "ENABLED" : "DISABLED", updatedAt: row.updatedAt }) }); const data = await response.json(); if (!response.ok) { message.error(data.message || "操作失败"); return Promise.reject(new Error()); } if (!enabling) setSelectedTaskIds(ids => ids.filter(id => id !== row.id)); message.success(data.message); await load(); } }); };
  const remove = (row: TaskRow) => { setDeleteError(null); setDeleteTarget(row); };
  const confirmDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true); setDeleteError(null);
    try {
      const response = await fetch(`/api/tasks/settings/${deleteTarget.id}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { setDeleteError(data.message || "删除失败，请稍后重试"); return; }
      setSelectedTaskIds(ids => ids.filter(id => id !== deleteTarget.id));
      setDeleteTarget(null); message.success(data.message || "任务设置删除成功"); await load();
    } catch (reason) {
      setDeleteError(reason instanceof Error ? reason.message : "删除失败，请检查网络后重试");
    } finally { setDeleting(false); }
  };
  const updateTasks = async () => { if (!can("update") || updatingTasks || !selectedTaskIds.length) return; setUpdatingTasks(true); try { const response = await fetch("/api/tasks/instances/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskIds: selectedTaskIds }) }); const data = await response.json(); if (!response.ok) { message.error(data.message || "任务更新失败，请稍后重试"); return; } setUpdateResult(data as TaskUpdateResult); setSelectedTaskIds([]); } catch { message.error("任务更新失败，请检查网络后重试"); } finally { setUpdatingTasks(false); } };
  const columns: ColumnsType<TaskRow> = [{ title: "记录编号", dataIndex: "recordNo", width: 150 }, { title: "任务名称", dataIndex: "title", width: 170, ellipsis: true }, { title: "任务类型", dataIndex: "type", width: 100, render: value => typeName[value] }, { title: "配置文件名称", dataIndex: "configFileName", width: 190, ellipsis: { showTitle: false }, render: value => <Tooltip title={value}>{value}</Tooltip> }, { title: "状态", dataIndex: "status", width: 90, render: value => <StatusTag value={value} /> }, { title: "创建人", dataIndex: ["createdBy", "realName"], width: 100, render: value => value || "系统" }, { title: "创建时间", dataIndex: "createdAt", width: 180, render: formatTime }, { title: "操作", fixed: "right", width: 300, render: (_, row) => <Space className="table-actions" size={0}>{can("edit") && <Button type="link" size="small" onClick={() => void openExisting(row, "edit")}>编辑</Button>}{can("view") && <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => void openExisting(row, "view")}>查看</Button>}{can("preview") && <Button type="link" size="small" onClick={() => void openPreview(row)}>预览</Button>}{(row.status === "ENABLED" ? can("disable") : can("enable")) && <Button type="link" size="small" onClick={() => changeStatus(row)}>{row.status === "ENABLED" ? "禁用" : "启用"}</Button>}{can("delete") && <Button type="link" danger size="small" icon={<DeleteOutlined />} onClick={() => remove(row)}>删除</Button>}</Space> }];
  const selectedTaskType = Form.useWatch("type", form);
  const selectedTaskTarget = Form.useWatch("targetType", form);
  const contentPreview = parsePreview(Form.useWatch("submitContent", form));
  const currentExecutorRoles = current?.executorRoles?.map(item => item.role) || (current?.executorRole ? [current.executorRole] : []);
  const visibleRoles = [...roles, ...currentExecutorRoles.filter(currentRole => !roles.some(role => role.id === currentRole.id)).map(role => ({ ...role, name: `${role.name}（已禁用）` }))];
  const visibleR2Storages = mode === "view" && current?.r2Storage && !r2Storages.some(storage => storage.id === current.r2Storage?.id) ? [...r2Storages, { ...current.r2Storage, name: `${current.r2Storage.name}（已禁用）` }] : r2Storages;
  const visibleCalendarTemplates = mode && current?.calendarTemplate && !calendarTemplates.some(template => template.id === current.calendarTemplate?.id) ? [...calendarTemplates, { ...current.calendarTemplate, name: `${current.calendarTemplate.name}${current.calendarTemplate.status === "DISABLED" ? "（已禁用）" : ""}` }] : calendarTemplates;
  return <>
    {canQuery && <Card style={{ marginBottom: 16 }}><Space wrap><Input placeholder="请输入任务名称" style={{ width: 240 }} value={filters.keyword} onChange={event => setFilters({ ...filters, keyword: event.target.value })} onPressEnter={() => { setPage(1); void load(1); }} /><Select style={{ width: 140 }} value={filters.type} options={[{ value: "", label: "全部" }, ...taskTypes]} onChange={type => setFilters({ ...filters, type })} /><Button onClick={() => { const next = { keyword: "", type: "" }; setFilters(next); setPage(1); void load(1, pageSize, next); }}>重置</Button><Button type="primary" onClick={() => { setPage(1); void load(1); }}>筛选</Button></Space></Card>}
    {!canQuery && <Alert style={{ marginBottom: 16 }} type="info" showIcon message="当前角色未配置任务设置查询权限" description="请在角色管理中勾选查询或查看后加载任务设置列表。" />}
    {optionError && <Alert style={{ marginBottom: 16 }} type="warning" showIcon message="执行人角色、品牌或R2存储空间数据加载失败，请稍后重试" />}
    {!optionError && aiServiceLoadError && <Alert style={{ marginBottom: 16 }} type="warning" showIcon message="Ai服务字典读取失败" description="不使用Ai分析的任务项仍可保存；如需配置Ai分析，请先检查《设置》/《数据字典》中的“Ai服务”记录。" />}
    <Card extra={<Space>{can("update") && <Button icon={<SyncOutlined />} loading={updatingTasks} disabled={updatingTasks || !selectedTaskIds.length} onClick={() => void updateTasks()}>{updatingTasks ? "更新中..." : selectedTaskIds.length ? `更新任务（${selectedTaskIds.length}）` : "更新任务"}</Button>}{can("create") && <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增</Button>}</Space>}>
      {error ? <Alert type="error" showIcon message="任务数据加载失败，请稍后重试" action={<Button size="small" onClick={() => void load()}>重新加载</Button>} /> : <DataTable rowKey="id" columns={columns} dataSource={rows} loading={loading} rowSelection={{ selectedRowKeys: selectedTaskIds, preserveSelectedRowKeys: true, onChange: keys => setSelectedTaskIds(keys.map(String)), getCheckboxProps: row => ({ disabled: row.status !== "ENABLED", name: row.title }) }} pagination={{ current: page, pageSize, total, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100], showTotal: count => `共 ${count} 条`, onChange: (nextPage, nextSize) => { setPage(nextPage); setPageSize(nextSize); void load(nextPage, nextSize); } }} />}
    </Card>
    <Modal title={mode === "create" ? "新增任务" : mode === "edit" ? "编辑任务" : "查看任务"} open={Boolean(mode)} width={1080} onCancel={close} maskClosable={false} destroyOnHidden footer={mode === "view" ? <Button onClick={close}>关闭</Button> : <Space><Button onClick={close}>取消</Button><Button type="primary" loading={saving} onClick={() => void submit()}>保存</Button></Space>}>
      <Form form={form} layout="vertical" disabled={mode === "view"} onValuesChange={() => { if (mode !== "view") setDirty(true); }} initialValues={{ targetType: "STORE", specifiedTargets: "", calendarTemplateId: null, executorRoleIds: [], brandIds: [], executionDays: [], deadlineDayOffset: 0, deadlineTime: "23:59", includeCompletionRate: true, singleRecordForMultipleExecutors: false, status: "ENABLED" }}>
        <h3 className="task-form-heading">基础配置</h3><div className="task-form-grid"><Form.Item label="记录编号"><Input disabled value={current?.recordNo || "保存后自动生成"} /></Form.Item><Form.Item label="任务名称" name="title" rules={[{ required: true, message: "请输入任务名称" }, { validator: (_, value) => !value || Array.from(value.trim()).length <= 20 ? Promise.resolve() : Promise.reject(new Error("任务名称不能超过20个汉字")) }]}><Input maxLength={20} placeholder="请输入任务名称" /></Form.Item><Form.Item label="任务类型" name="type" rules={[{ required: true, message: "请选择任务类型" }]}><Select placeholder="请选择" options={taskTypes} onChange={value => { if (value !== "MONTHLY" && form.getFieldValue("deadlineDayOffset") === -1) form.setFieldValue("deadlineDayOffset", 0); if (value !== "CALENDAR") form.setFieldValue("calendarTemplateId", null); }} /></Form.Item><Form.Item noStyle shouldUpdate={(previous, next) => previous.type !== next.type}>{({ getFieldValue }) => getFieldValue("type") === "CALENDAR" ? <Form.Item label="日历任务模版" name="calendarTemplateId" rules={[{ required: true, message: "请选择日历任务模版" }]}><Select placeholder="请选择" options={visibleCalendarTemplates.map(template => ({ value: template.id, label: template.name, disabled: template.status === "DISABLED" }))} notFoundContent="暂无可用的日历任务模版" /></Form.Item> : null}</Form.Item><Form.Item label="执行人角色" name="executorRoleIds" rules={[{ required: true, message: "请至少选择一个执行人角色" }]}><Select mode="multiple" allowClear maxTagCount="responsive" placeholder="请选择（可多选）" options={visibleRoles.map(role => ({ value: role.id, label: role.name, disabled: role.status === "DISABLED" }))} /></Form.Item><Form.Item label="配置文件名称" name="configFileBase" rules={[{ required: true, message: "请输入配置文件名称" }, { pattern: /^[A-Za-z0-9_]{1,30}(\.json)?$/, message: "配置文件名称只能包含英文字母、数字和下划线，且不能超过30个字符" }]}><Input placeholder="Pre_shift_meeting" addonAfter=".json" /></Form.Item><Form.Item label="存储空间" name="r2StorageId" rules={[{ required: true, message: "请选择存储空间" }]}><Select placeholder="请选择" options={visibleR2Storages.map(storage => ({ value: storage.id, label: storage.name, disabled: storage.status === "DISABLED" }))} notFoundContent="暂无已启用的R2存储空间" /></Form.Item></div>
        <Form.Item name="singleRecordForMultipleExecutors" valuePropName="checked" style={{ marginTop: 8 }}><Checkbox>同一门店存在多人可执行时系统仅生成一条记录</Checkbox></Form.Item>
        <Form.Item noStyle shouldUpdate={(previous, next) => previous.singleRecordForMultipleExecutors !== next.singleRecordForMultipleExecutors}>{({ getFieldValue }) => getFieldValue("singleRecordForMultipleExecutors") ? <Alert style={{ marginBottom: 16 }} type="info" showIcon message="同一门店的任务目标（含每位员工）只生成一条待办；首位点击开始执行的执行人取得编辑权，其他执行人只可查看。" /> : null}</Form.Item>
        <h3 className="task-form-heading">适用范围</h3><Form.Item label="品牌" name="brandIds"><Checkbox.Group options={brands.map(brand => ({ value: brand.id, label: brand.name }))} /></Form.Item><Form.Item noStyle shouldUpdate>{() => (form.getFieldValue("brandIds") || []).length === 0 ? <div className="task-form-hint">当前未选择任何品牌，该任务暂不会匹配品牌门店。</div> : null}</Form.Item><Form.Item noStyle shouldUpdate={(previous, next) => previous.type !== next.type}>{({ getFieldValue }) => {
          const type = getFieldValue("type");
          if (type === "DAILY") return <Form.Item label="执行星期" name="executionDays" rules={[{ required: true, message: "请至少选择一个日任务执行星期" }]}><Checkbox.Group options={days.map(day => ({ value: day, label: day }))} /></Form.Item>;
          if (type === "WEEKLY") return <Form.Item label="每周执行日" name="weeklyExecutionDay" rules={[{ required: true, message: "请选择周任务执行星期" }]}><Select style={{ width: 240 }} placeholder="请选择" options={days.map(day => ({ value: day, label: day }))} /></Form.Item>;
          if (type === "MONTHLY") return <Form.Item label="每月执行日" name="monthlyExecutionDay" rules={[{ required: true, message: "请选择月任务执行日期" }]}><Select style={{ width: 280 }} placeholder="请选择" options={monthlyDays} onChange={value => { if (value === "ANY_DAY") form.setFieldValue("deadlineDayOffset", -1); }} /></Form.Item>;
          if (type === "CALENDAR") return <Alert type="info" showIcon message="日历任务按照关联日历模版中当天勾选的日期生成；手动更新任务也只检查当天日期。" />;
          return <Alert type="info" showIcon message="临时任务不参与定时自动生成，可通过人工更新任务触发。" />;
        }}</Form.Item><div className="task-form-grid" style={{ marginTop: 16 }}><Form.Item label="任务截止日期" name="deadlineDayOffset" rules={[{ required: true, message: "请选择任务截止日期" }]}><Select options={[{ value: 0, label: "当日" }, { value: 1, label: "次日" }, ...(selectedTaskType === "MONTHLY" ? [{ value: -1, label: "月末" }] : [])]} /></Form.Item><Form.Item label="任务截止时间" name="deadlineTime" rules={[{ required: true, message: "请选择任务截止时间" }, { pattern: /^([01]\d|2[0-3]):[0-5]\d$/, message: "请选择正确的任务截止时间" }]}><TimeStringPicker /></Form.Item><Form.Item label="参与核算完成率" name="includeCompletionRate"><Select options={[{ value: true, label: "参与" }, { value: false, label: "不参与" }]} /></Form.Item></div>
        <div className="task-form-grid"><Form.Item label="任务对象" name="targetType" rules={[{ required: true, message: "请选择任务对象" }]}><Select options={taskTargets} /></Form.Item><Form.Item label="指定对象" name="specifiedTargets" extra={selectedTaskTarget === "STORE_EMPLOYEE" ? "可填写所属岗位星级或员工姓名；留空表示全部门店员工，多项使用｜分隔。" : "可填写门店名称、直营店或加盟店；留空表示全部门店，多项使用｜分隔。"}><Input.TextArea rows={3} maxLength={5000} placeholder={selectedTaskTarget === "STORE_EMPLOYEE" ? "例如：三星店员｜张三" : "例如：奋小二A店｜直营店"} /></Form.Item></div>
        <h3 className="task-form-heading">任务内容</h3><div className="task-submit-content-heading"><label htmlFor="submitContent"><span>*</span>提交内容</label><Button type="link" size="small" onClick={() => setFormatHelpOpen(true)}>格式说明</Button></div><Form.Item name="submitContent" rules={[{ required: true, message: "请输入提交内容" }]} extra="每行格式：任务项名称｜提交组件｜提示说明｜必填/选填｜提交数量｜Ai分析类型｜Ai分析提示词；附件的提交数量表示最多可上传几个，非附件组件填写1。"><Input.TextArea id="submitContent" rows={9} placeholder={example} className="task-content-input" /></Form.Item><Collapse size="small" items={[{ key: "help", label: "查看配置格式与示例", children: <div className="task-format-summary"><p>新格式共7个字段；原有5字段任务模板仍可继续编辑和保存。</p><Descriptions bordered size="small" column={1}>{[...attachmentFormats, ...otherFormats].map(item => <Descriptions.Item key={item.syntax} label={item.syntax}>{item.description}</Descriptions.Item>)}</Descriptions><h4>可用的Ai分析类型</h4>{aiServiceLoadError ? <Alert type="warning" showIcon message="Ai服务字典暂时无法读取" /> : aiServiceOptions.length ? <Space wrap>{aiServiceOptions.map(item => <Tag color="purple" key={item.value}>{item.label}</Tag>)}</Space> : <Alert type="info" showIcon message="Ai服务字典暂无枚举值" />}<h4>完整示例（每行一个任务项）</h4><pre className="task-example">{formatExample}</pre><small>第4项只能填写“必填”或“选填”；第5项是附件允许上传的最大数量，必须为大于0的整数，非附件组件请填写1；第6、7项必须同时填写或同时留空。</small></div> }, { key: "preview", label: `配置预览（${contentPreview.length} 项）`, children: contentPreview.length ? <Descriptions size="small" column={1}>{contentPreview.map(item => <Descriptions.Item key={item.index} label={`${item.index + 1}. ${item.fields[0] || "格式待完善"}`}><Space wrap>{item.fields[1] && <Tag>{item.fields[1]}</Tag>}{item.fields[3] && <Tag color={item.fields[3] === "必填" ? "blue" : "default"}>{item.fields[3]}</Tag>}{item.fields[4] && <Tag>提交数量：{item.fields[4]}</Tag>}{item.fields[5] && <Tag color="purple">Ai分析：{item.fields[5]}</Tag>}<span>{item.fields[2]}</span>{item.fields[6] && <span className="task-ai-prompt-preview">Ai提示词：{item.fields[6]}</span>}</Space></Descriptions.Item>)}</Descriptions> : "请输入提交内容后预览" }]} />
        <h3 className="task-form-heading">状态</h3><Form.Item label="任务状态" name="status" rules={[{ required: true, message: "请选择任务状态" }]}><Select style={{ width: 180 }} options={[{ value: "ENABLED", label: "启用" }, { value: "DISABLED", label: "禁用" }]} /></Form.Item>
      </Form>
    </Modal>
    <Modal
      title={<Space><WarningOutlined style={{ color: "#ff4d4f" }} />确认删除任务设置？</Space>}
      open={Boolean(deleteTarget)}
      centered
      maskClosable={!deleting}
      closable={!deleting}
      keyboard={!deleting}
      onCancel={() => { if (!deleting) { setDeleteTarget(null); setDeleteError(null); } }}
      footer={<Space><Button disabled={deleting} onClick={() => { setDeleteTarget(null); setDeleteError(null); }}>取消</Button><Button danger type="primary" loading={deleting} onClick={() => void confirmDelete()}>{deleting ? "删除中..." : "确认删除"}</Button></Space>}
    >
      <Alert type="warning" showIcon message={deleteTarget ? `${deleteTarget.title}（${deleteTarget.recordNo}）` : ""} description="删除后该任务设置及其配置文件将不再使用；如仍有关联任务记录或业务数据源，系统会阻止删除并说明原因。请确认是否继续。" />
      {deleteError && <Alert style={{ marginTop: 12 }} type="error" showIcon message="删除失败" description={deleteError} />}
    </Modal>
    <Modal title="温馨提示" open={Boolean(saveResult)} centered closable={false} maskClosable={false} footer={<Button type="primary" onClick={() => setSaveResult(null)}>我知道了</Button>}>
      {saveResult && <Alert showIcon type={saveResult.type} message={saveResult.type === "success" ? "保存成功" : "保存失败"} description={saveResult.message} />}
    </Modal>
    <UnsavedChangesModal open={closeConfirmOpen} title="确认关闭？" content="当前任务配置尚未保存，关闭后修改内容将丢失，是否继续？" onKeep={() => setCloseConfirmOpen(false)} onDiscard={dismissTaskModal} />
    <Modal title="提交内容格式规范说明" open={formatHelpOpen} width={820} footer={<Button type="primary" onClick={() => setFormatHelpOpen(false)}>我知道了</Button>} onCancel={() => setFormatHelpOpen(false)}>
      <div className="task-format-help">
        <Alert type="info" showIcon message="每个任务项单独占一行；新格式包含7个字段，原有5字段格式继续兼容。字段之间使用全角“｜”或半角“|”分隔。" />
        <h4>每行格式</h4><pre>任务项名称｜提交组件｜提示说明｜必填/选填｜提交数量｜Ai分析类型｜Ai分析提示词</pre>
        <Descriptions title="[附件] 后支持的规范内容" bordered size="small" column={1}>
          {attachmentFormats.map(item => <Descriptions.Item key={item.syntax} label={item.syntax}>{item.description}</Descriptions.Item>)}
        </Descriptions>
        <Descriptions title="其他提交组件" bordered size="small" column={1}>
          {otherFormats.map(item => <Descriptions.Item key={item.syntax} label={item.syntax}>{item.description}</Descriptions.Item>)}
        </Descriptions>
        <h4>Ai分析类型（读取自“Ai服务”数据字典）</h4>{aiServiceLoadError ? <Alert type="warning" showIcon message="Ai服务字典暂时无法读取，请检查数据字典配置" /> : aiServiceOptions.length ? <Space wrap>{aiServiceOptions.map(item => <Tag color="purple" key={item.value}>{item.label}</Tag>)}</Space> : <Alert type="info" showIcon message="Ai服务字典暂无枚举值" />}
        <h4>填写规则</h4><ul><li>必填属性只能填写“必填”或“选填”。</li><li>第5项“提交数量”必须填写大于0的整数；附件组件表示允许上传的最大附件数，必填附件最少上传1个，非附件组件请填写1。</li><li><code>[输入框]评分</code>只允许填写0至5之间的整数或最多一位小数。</li><li><code>[输入框]数字</code>支持任意非负整数；<code>[输入框_N]数字</code>中的N表示最大值，例如<code>[输入框_5]数字</code>只允许填写0至5。</li><li>Ai分析类型和Ai分析提示词必须同时填写或同时留空；同时留空表示当前任务项不进行Ai分析。</li><li>Ai分析类型必须填写上方“Ai服务”数据字典中的有效枚举值。</li><li>Ai分析提示词可以换行续写；续写行不能包含竖线，保存后系统会自动合并为空格。</li><li>每行不能缺少前5个字段，也不要在字段内容中使用竖线。</li></ul>
        <h4>完整示例</h4><pre>{formatExample}</pre>
      </div>
    </Modal>
    <TaskPreviewModal open={Boolean(preview)} onClose={() => setPreview(null)} taskId={preview?.taskId} config={preview?.config} />
    <Modal title="温馨提示" open={Boolean(updateResult)} centered closable={false} maskClosable={false} footer={<Button type="primary" onClick={() => setUpdateResult(null)}>我知道了</Button>}>
      {updateResult && <div className="task-update-result"><p>任务更新工作已执行完毕，本次共处理 <strong>{updateResult.total}</strong> 条任务记录。</p><div className="task-update-result-grid"><div><span>新创建</span><strong>{updateResult.created}</strong><small>新增任务或新增符合条件的执行人</small></div><div><span>覆盖</span><strong>{updateResult.covered}</strong><small>原任务未执行，已按最新配置覆盖</small></div><div><span>未生成</span><strong>{updateResult.notGenerated}</strong><small>原任务已完成或已逾期，未重复生成</small></div></div>{updateResult.overdue > 0 && <Alert type="info" showIcon message={`另有 ${updateResult.overdue} 条跨日待完成任务已自动转为“已逾期”`} />}{updateResult.ignoredTasks > 0 && <Alert style={{ marginTop: 10 }} type="warning" showIcon message={`有 ${updateResult.ignoredTasks} 个任务配置异常，未参与本次生成，请检查任务配置文件`} />}</div>}
    </Modal>
  </>;
}

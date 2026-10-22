"use client";

import { DeleteOutlined, DownloadOutlined, EyeOutlined, FileExcelOutlined, KeyOutlined, LockOutlined, PlusOutlined, SafetyCertificateOutlined, UploadOutlined, UserOutlined } from "@ant-design/icons";
import { Alert, Avatar, Button, Card, Checkbox, Descriptions, Form, Input, message, Modal, Select, Space, Tag, Tooltip, Upload } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { DataTable } from "@/components/data-table";
import { StatusTag } from "@/components/status-tag";
import { displayDate } from "@/lib/format";

type Status = "ENABLED" | "DISABLED";
type UserType = "SYSTEM" | "CUSTOM";
type Role = { id: string; name: string; code: string; status: Status };
type User = { id: string; username: string; realName: string; phone: string | null; tags: string | null; leadH5BrandIds: string[] | null; leadH5StoreIds: string[] | null; isRegionManager: boolean; managedRegions: { region: string }[]; type: UserType; status: Status; roleId: string; role: Role; createdByUserId: string | null; createdBy: { username: string; realName: string } | null; lastLoginAt: string | null; createdAt: string; updatedAt: string };
type UserFormValues = { username: string; realName: string; phone?: string; tags?: string; leadH5BrandIds?: string[]; leadH5StoreIds?: string[]; isRegionManager?: boolean; managedRegions?: string[]; roleId: string; status: Status; password?: string; confirmPassword?: string };
type BrandOption = { id: string; name: string };
type StoreOption = { id: string; name: string; brandId: string; brand: { name: string } };
type RegionOption = { label: string; value: string; assignedUserId: string | null; assignedUserName: string | null };
type PasswordFormValues = { password: string; confirmPassword: string };
type UserImportIssue = { row: number; excelRow: number; messages: string[] };
type UserImportFeedback = { title: string; content: ReactNode };

const statusOptions = [{ value: "", label: "全部状态" }, { value: "ENABLED", label: "已启用" }, { value: "DISABLED", label: "已禁用" }];
const typeText = (type: UserType) => type === "SYSTEM" ? "系统内置" : "自定义";
const typeTag = (type: UserType) => <Tag color={type === "SYSTEM" ? "blue" : "default"}>{typeText(type)}</Tag>;
const creatorText = (user: User | null) => user?.createdBy ? `${user.createdBy.realName}（${user.createdBy.username}）` : "系统生成";
const tagDisplay = (tags?: string | null) => tags ? <Space size={[4, 4]} wrap>{tags.split("|").filter(Boolean).map(tag => <Tag key={tag}>{tag}</Tag>)}</Space> : "未设置";

export function UserManagement() {
  const [rows, setRows] = useState<User[]>([]); const [roles, setRoles] = useState<Role[]>([]); const [brands, setBrands] = useState<BrandOption[]>([]); const [stores, setStores] = useState<StoreOption[]>([]); const [regions, setRegions] = useState<RegionOption[]>([]); const [total, setTotal] = useState(0); const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(10);
  const [filters, setFilters] = useState({ keyword: "", roleId: "", status: "" }); const [loading, setLoading] = useState(true); const [error, setError] = useState(false);
  const [mode, setMode] = useState<"create" | "edit" | "view" | null>(null); const [current, setCurrent] = useState<User | null>(null); const [saving, setSaving] = useState(false); const [passwordTarget, setPasswordTarget] = useState<User | null>(null);
  const [optionsLoading, setOptionsLoading] = useState(false); const [optionsError, setOptionsError] = useState(false); const optionsRequestId = useRef(0);
  const [importOpen, setImportOpen] = useState(false); const [importFile, setImportFile] = useState<File>(); const [importing, setImporting] = useState(false); const [importError, setImportError] = useState(""); const [importFeedback, setImportFeedback] = useState<UserImportFeedback>();
  const [form] = Form.useForm<UserFormValues>(); const [passwordForm] = Form.useForm<PasswordFormValues>();
  const loadOptions = async () => {
    const requestId = ++optionsRequestId.current;
    setOptionsLoading(true); setOptionsError(false);
    try {
      const response = await fetch("/api/settings/users/options", { cache: "no-store" }); const data = await response.json();
      if (requestId !== optionsRequestId.current) return;
      if (!response.ok) throw new Error(data.message); setRoles(data.roles); setBrands(data.brands || []); setStores(data.stores || []); setRegions(data.regions || []);
    } catch { if (requestId === optionsRequestId.current) { setOptionsError(true); message.error("用户选项加载失败，请稍后重试"); } }
    finally { if (requestId === optionsRequestId.current) setOptionsLoading(false); }
  };
  const load = async (nextPage = page, nextPageSize = pageSize, nextFilters = filters) => {
    setLoading(true); setError(false);
    try {
      const query = new URLSearchParams({ ...nextFilters, page: String(nextPage), pageSize: String(nextPageSize) }); const response = await fetch(`/api/settings/users?${query}`);
      if (!response.ok) throw new Error(); const data = await response.json(); setRows(data.rows); setTotal(data.total);
    } catch { setError(true); } finally { setLoading(false); }
  };
  useEffect(() => { void load(1); void loadOptions(); }, []);
  useEffect(() => {
    if (mode === "create") { form.resetFields(); form.setFieldsValue({ status: "ENABLED", leadH5BrandIds: [], leadH5StoreIds: [], isRegionManager: false, managedRegions: [] }); }
    if (mode === "edit" && current) form.setFieldsValue({ username: current.username, realName: current.realName, phone: current.phone || undefined, tags: current.tags || undefined, leadH5BrandIds: current.leadH5BrandIds || [], leadH5StoreIds: current.leadH5StoreIds || [], isRegionManager: current.isRegionManager, managedRegions: current.managedRegions?.map(item => item.region) || [], roleId: current.roleId, status: current.status });
  }, [mode, current, form]);
  useEffect(() => { if (passwordTarget) passwordForm.resetFields(); }, [passwordTarget, passwordForm]);
  const openCreate = () => { setCurrent(null); setMode("create"); void loadOptions(); };
  const openUser = async (user: User, nextMode: "edit" | "view") => {
    setSaving(true);
    try {
      const response = await fetch(`/api/settings/users/${user.id}`); const data = await response.json();
      if (!response.ok) return void message.error(data.message || "用户信息加载失败，请稍后重试");
      setCurrent(data); setMode(nextMode); void loadOptions();
    } catch { message.error("用户信息加载失败，请稍后重试"); } finally { setSaving(false); }
  };
  const close = () => { if (saving) return; setMode(null); setCurrent(null); };
  const submit = async () => {
    try {
      const values = await form.validateFields(); setSaving(true);
      const scopedValues = { ...values, leadH5BrandIds: values.leadH5BrandIds?.length ? values.leadH5BrandIds : null, leadH5StoreIds: values.leadH5StoreIds?.length ? values.leadH5StoreIds : null, isRegionManager: !!values.isRegionManager, managedRegions: values.isRegionManager && values.managedRegions?.length ? values.managedRegions : [] };
      const body = mode === "create" ? scopedValues : { username: scopedValues.username, realName: scopedValues.realName, phone: scopedValues.phone, tags: scopedValues.tags, leadH5BrandIds: scopedValues.leadH5BrandIds, leadH5StoreIds: scopedValues.leadH5StoreIds, isRegionManager: scopedValues.isRegionManager, managedRegions: scopedValues.managedRegions, roleId: scopedValues.roleId, status: scopedValues.status, updatedAt: current?.updatedAt };
      const response = await fetch(mode === "create" ? "/api/settings/users" : `/api/settings/users/${current?.id}`, { method: mode === "create" ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const data = await response.json();
      if (!response.ok) return void message.error(data.message || "保存失败，请稍后重试");
      message.success(mode === "create" ? "用户新增成功" : "用户保存成功"); close(); setPage(1); await load(1);
    } catch (reason) { if (!(reason instanceof Error)) return; } finally { setSaving(false); }
  };
  const changeStatus = (user: User) => {
    const enable = user.status === "DISABLED"; const action = enable ? "启用" : "禁用";
    Modal.confirm({ title: `确认${action}用户？`, content: enable ? "启用后，该用户可以重新登录系统。" : "禁用后，该用户将无法登录系统。", okText: `确认${action}`, cancelText: "取消", onOk: async () => {
      const response = await fetch(`/api/settings/users/${user.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "status", status: enable ? "ENABLED" : "DISABLED", updatedAt: user.updatedAt }) }); const data = await response.json();
      if (!response.ok) { message.error(data.message || "操作失败，请稍后重试"); return Promise.reject(new Error()); }
      message.success(`用户${action}成功`); await load();
    } });
  };
  const resetPassword = async () => {
    try {
      const values = await passwordForm.validateFields(); if (!passwordTarget) return; setSaving(true);
      const response = await fetch(`/api/settings/users/${passwordTarget.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "resetPassword", password: values.password, updatedAt: passwordTarget.updatedAt }) }); const data = await response.json();
      if (!response.ok) return void message.error(data.message || "重置密码失败，请稍后重试");
      message.success("密码重置成功"); setPasswordTarget(null); await load();
    } catch (reason) { if (!(reason instanceof Error)) return; } finally { setSaving(false); }
  };
  const remove = (user: User) => Modal.confirm({ title: "确认删除用户？", content: "删除后不可恢复，该用户将不能再登录系统。", okText: "确认删除", cancelText: "取消", okButtonProps: { danger: true }, onOk: async () => {
    const response = await fetch(`/api/settings/users/${user.id}`, { method: "DELETE" }); const data = await response.json();
    if (!response.ok) { message.error(data.message || "删除失败，请稍后重试"); return Promise.reject(new Error()); }
    message.success("用户删除成功"); const nextPage = rows.length === 1 && page > 1 ? page - 1 : page; if (nextPage !== page) setPage(nextPage); await load(nextPage);
  } });
  const downloadImportTemplate = async () => {
    try {
      const response = await fetch("/api/settings/users/import-template");
      if (!response.ok) { const data = await response.json(); throw new Error(data.message || "模板下载失败"); }
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = "用户批量导入模板.xlsx"; anchor.click(); URL.revokeObjectURL(url);
    } catch (error) { message.error(error instanceof Error ? error.message : "模板下载失败，请稍后重试"); }
  };
  const showImportIssues = (issues: UserImportIssue[]) => {
    setImportOpen(false);
    setImportFeedback({
      title: "导入数据校验未通过",
      content: <div><p>以下数据不符合系统要求，本次未导入任何用户。</p><div style={{ maxHeight: 360, overflowY: "auto" }}>{issues.map(issue => <div key={issue.excelRow} style={{ marginBottom: 12 }}><b>第 {issue.row} 条记录（Excel 第 {issue.excelRow} 行）</b><ul style={{ margin: "4px 0 0", paddingLeft: 20 }}>{issue.messages.map((item, index) => <li key={`${issue.excelRow}-${index}`}>{item}</li>)}</ul></div>)}</div></div>,
    });
  };
  const importUsers = async () => {
    if (!importFile) { const tip = "请先选择需要导入的 .xlsx 文件，再点击“立即导入”。"; setImportError(tip); message.warning(tip); return; }
    setImportError(""); setImporting(true);
    try {
      const formData = new FormData(); formData.append("file", importFile);
      const response = await fetch("/api/settings/users/import", { method: "POST", body: formData });
      const responseText = await response.text();
      let data: { message?: string; total?: number; success?: number; issues?: UserImportIssue[] } = {};
      try { data = JSON.parse(responseText); } catch { data = { message: response.ok ? "服务器返回了无法识别的导入结果" : `导入接口请求失败（${response.status}）` }; }
      if (!response.ok) {
        if (Array.isArray(data.issues)) { showImportIssues(data.issues); return; }
        throw new Error(data.message || "导入失败");
      }
      message.success(`导入用户共 ${data.total} 名，成功 ${data.success} 名`);
      setImportOpen(false); setImportFile(undefined); setPage(1); await load(1);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "导入失败，请稍后重试";
      setImportError(detail); setImportOpen(false); setImportFeedback({ title: "导入失败", content: detail });
    } finally { setImporting(false); }
  };
  const isProtected = (user: User) => user.type === "SYSTEM";
  const modalTitle = mode === "create" ? "新增用户" : mode === "edit" ? "编辑用户" : "查看用户";
  const modalSubtitle = mode === "create" ? "创建登录账号并配置用户角色" : mode === "edit" ? "维护用户资料、角色和使用状态" : "查看用户的账号资料和使用信息";
  const formRoles = current && !roles.some(role => role.id === current.roleId) ? [...roles, current.role] : roles;
  const regionOptions = regions.map(region => {
    const assignedToOther = !!region.assignedUserId && region.assignedUserId !== current?.id;
    return { value: region.value, label: assignedToOther ? `${region.label}（已分配给${region.assignedUserName}）` : region.label, disabled: assignedToOther };
  });
  const columns: ColumnsType<User> = [
    { title: "账号", dataIndex: "username", width: 150 }, { title: "真实姓名", dataIndex: "realName", width: 130 }, { title: "角色", dataIndex: ["role", "name"], width: 150 }, { title: "手机号", dataIndex: "phone", width: 140, render: value => value || "-" },
    { title: "类型", dataIndex: "type", width: 110, render: value => typeTag(value) }, { title: "状态", dataIndex: "status", width: 100, render: value => <StatusTag value={value} /> }, { title: "最后登录", dataIndex: "lastLoginAt", width: 150, render: displayDate }, { title: "创建时间", dataIndex: "createdAt", width: 150, render: displayDate },
    { title: "操作", fixed: "right", width: 310, render: (_, user) => <Space className="table-actions" size={0}><Button type="link" size="small" onClick={() => void openUser(user, "edit")}>编辑</Button><Button type="link" size="small" icon={<EyeOutlined />} onClick={() => void openUser(user, "view")}>查看</Button><Tooltip title={isProtected(user) ? "系统内置用户不可禁用" : undefined}><Button type="link" size="small" disabled={isProtected(user)} onClick={() => changeStatus(user)}>{user.status === "ENABLED" ? "禁用" : "启用"}</Button></Tooltip><Button type="link" size="small" icon={<KeyOutlined />} onClick={() => setPasswordTarget(user)}>重置密码</Button><Tooltip title={isProtected(user) ? "系统内置用户不可删除" : undefined}><Button type="link" danger size="small" icon={<DeleteOutlined />} disabled={isProtected(user)} onClick={() => remove(user)}>删除</Button></Tooltip></Space> },
  ];
  return <>
    <Card style={{ marginBottom: 16 }}><Space wrap><Input placeholder="账号、姓名或手机号" style={{ width: 240 }} value={filters.keyword} onChange={event => setFilters({ ...filters, keyword: event.target.value })} onPressEnter={() => { setPage(1); void load(1); }} /><Select style={{ width: 180 }} options={[{ value: "", label: "全部角色" }, ...roles.map(role => ({ value: role.id, label: role.name }))]} value={filters.roleId} onChange={roleId => setFilters({ ...filters, roleId })} /><Select style={{ width: 140 }} options={statusOptions} value={filters.status} onChange={status => setFilters({ ...filters, status })} /><Button onClick={() => { const next = { keyword: "", roleId: "", status: "" }; setFilters(next); setPage(1); void load(1, pageSize, next); }}>重置</Button><Button type="primary" onClick={() => { setPage(1); void load(1); }}>筛选</Button></Space></Card>
    <Card extra={<Space><Button icon={<UploadOutlined />} onClick={() => { setImportFile(undefined); setImportError(""); setImportFeedback(undefined); setImportOpen(true); }}>批量导入</Button><Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增用户</Button></Space>}><DataTable<User> rowKey="id" columns={columns} dataSource={rows} loading={loading} error={error} onRetry={() => void load()} pagination={{ current: page, pageSize, total, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100], showTotal: count => `共 ${count} 条`, onChange: (nextPage, nextPageSize) => { setPage(nextPage); setPageSize(nextPageSize); void load(nextPage, nextPageSize); } }} /></Card>
    <Modal title="批量导入用户" width={680} open={importOpen} destroyOnHidden closable={!importing} maskClosable={!importing} onCancel={() => !importing && setImportOpen(false)} footer={<Space><Button disabled={importing} onClick={() => setImportOpen(false)}>取消</Button><Button type="primary" disabled={!importFile} loading={importing} onClick={() => void importUsers()}>{importing ? "正在校验并导入..." : "立即导入"}</Button></Space>}>
      <Alert type="info" showIcon message="导入说明" description="账号、真实姓名、初始密码和角色为必填项。导入前会完整校验所有记录；任何一条不符合要求时，本次均不会写入。运营 H5 和区域管理权限可在导入后配置。" style={{ marginBottom: 16 }} />
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        <div><span style={{ marginRight: 12 }}>导入模板：</span><Button type="link" icon={<DownloadOutlined />} onClick={() => void downloadImportTemplate()}>下载导入模板</Button></div>
        <div><span style={{ marginRight: 12 }}>选择文件：</span><Upload accept=".xlsx" maxCount={1} fileList={importFile ? [{ uid: `${importFile.name}-${importFile.lastModified}`, name: importFile.name, size: importFile.size, status: "done" }] : []} beforeUpload={file => { if (!file.name.toLowerCase().endsWith(".xlsx")) { const tip = "仅支持 .xlsx 格式文件。"; setImportFile(undefined); setImportError(tip); message.warning(tip); return Upload.LIST_IGNORE; } if (file.size > 10 * 1024 * 1024) { const tip = "导入文件不能超过 10MB。"; setImportFile(undefined); setImportError(tip); message.warning(tip); return Upload.LIST_IGNORE; } setImportError(""); setImportFeedback(undefined); setImportFile(file); message.success(`已选择文件：${file.name}`); return false; }} onRemove={() => { setImportFile(undefined); setImportError(""); return true; }} disabled={importing}><Button icon={<FileExcelOutlined />}>选择 Excel 文件</Button></Upload></div>
        <span style={{ color: "#8c8c8c" }}>仅支持 .xlsx 文件，单次最多导入 500 名用户、文件不超过 10MB。模板第一行红色 * 为必填字段。</span>
        {importFile && !importing && <Alert type="success" showIcon message="文件已就绪" description={`${importFile.name}，请点击“立即导入”。`} />}
        {importing && <Alert type="info" showIcon message="正在校验并导入数据" description="请勿关闭弹窗或重复点击；全部数据校验通过后才会写入。" />}
        {importError && <Alert type="error" showIcon message="导入失败" description={importError} />}
      </Space>
    </Modal>
    <Modal title={importFeedback?.title || "温馨提示"} width={760} open={!!importFeedback} onOk={() => setImportFeedback(undefined)} onCancel={() => setImportFeedback(undefined)} okText="我知道了" cancelButtonProps={{ style: { display: "none" } }} zIndex={1200} destroyOnHidden>{importFeedback?.content}</Modal>
    <Modal rootClassName="user-management-modal" title={<div className="user-modal-title"><span className="user-modal-title-icon"><UserOutlined /></span><span><strong>{modalTitle}</strong><small>{modalSubtitle}</small></span></div>} open={!!mode} onCancel={close} width={720} destroyOnHidden maskClosable={false} footer={mode === "view" ? <Button size="large" onClick={close}>关闭</Button> : <Space><Button size="large" onClick={close}>取消</Button><Button size="large" type="primary" loading={saving} onClick={() => void submit()}>保存</Button></Space>}>
      {mode === "view" && current ? <div className="user-view-panel">
        <div className="user-view-summary"><Avatar size={52} icon={<UserOutlined />} /><div className="user-view-identity"><strong>{current.realName}</strong><span>@{current.username}</span></div><StatusTag value={current.status} /></div>
        <Descriptions className="user-view-descriptions" bordered size="middle" column={2}>
          <Descriptions.Item label="登录账号">{current.username}</Descriptions.Item><Descriptions.Item label="真实姓名">{current.realName}</Descriptions.Item>
          <Descriptions.Item label="手机号码">{current.phone || "未填写"}</Descriptions.Item><Descriptions.Item label="类型">{typeTag(current.type)}</Descriptions.Item>
          <Descriptions.Item label="用户标签" span={2}>{tagDisplay(current.tags)}</Descriptions.Item>
          <Descriptions.Item label="区域负责人">{current.isRegionManager ? "是" : "否"}</Descriptions.Item><Descriptions.Item label="区域管理权限">{current.isRegionManager && current.managedRegions?.length ? current.managedRegions.map(item => regions.find(region => region.value === item.region)?.label || item.region).join("、") : "未设置"}</Descriptions.Item>
          <Descriptions.Item label="H5品牌权限" span={2}>{current.leadH5BrandIds?.length ? current.leadH5BrandIds.map(id => brands.find(brand => brand.id === id)?.name || id).join("、") : "全部品牌"}</Descriptions.Item>
          <Descriptions.Item label="H5店铺权限" span={2}>{current.leadH5StoreIds?.length ? current.leadH5StoreIds.map(id => stores.find(store => store.id === id)?.name || id).join("、") : "全部店铺"}</Descriptions.Item>
          <Descriptions.Item label="用户角色">{current.role.name}</Descriptions.Item><Descriptions.Item label="账号状态"><StatusTag value={current.status} /></Descriptions.Item>
          <Descriptions.Item label="创建人">{creatorText(current)}</Descriptions.Item><Descriptions.Item label="创建时间">{displayDate(current.createdAt)}</Descriptions.Item>
          <Descriptions.Item label="最后登录">{displayDate(current.lastLoginAt)}</Descriptions.Item><Descriptions.Item label="更新时间">{displayDate(current.updatedAt)}</Descriptions.Item>
        </Descriptions>
      </div> : <Form form={form} layout="vertical" initialValues={{ status: "ENABLED" }} className="user-form">
        <section className="user-form-section"><div className="user-form-section-title"><UserOutlined /><span><strong>基本信息</strong><small>用于用户识别和日常联系</small></span></div><div className="user-form-grid">
          <Form.Item label="登录账号" name="username" rules={[{ required: true, message: "请输入账号" }, { pattern: /^[A-Za-z][A-Za-z0-9_]{1,29}$/, message: "账号须为2-30位字母、数字或下划线，且以字母开头" }]}><Input size="large" maxLength={30} placeholder="请输入登录账号" autoComplete="off" /></Form.Item>
          <Form.Item label="真实姓名" name="realName" rules={[{ required: true, message: "请输入真实姓名" }, { max: 30, message: "真实姓名不能超过30个字符" }]}><Input size="large" maxLength={30} placeholder="请输入真实姓名" /></Form.Item>
          <Form.Item label="手机号码" name="phone" rules={[{ pattern: /^$|^1\d{10}$/, message: "请输入11位手机号码" }]}><Input size="large" maxLength={11} placeholder="选填，请输入11位手机号" /></Form.Item>
          <Form.Item label="类型"><Input size="large" value={mode === "create" ? "自定义" : current ? typeText(current.type) : ""} disabled /></Form.Item>
          <Form.Item className="user-form-span" label="用户标签" name="tags" rules={[{ max: 200, message: "用户标签不能超过200个字符" }]} extra="多个标签之间请使用 | 分隔"><Input size="large" maxLength={200} placeholder="选填，例如：核心员工|门店负责人" /></Form.Item>
          <Form.Item label="创建人"><Input size="large" value={mode === "create" ? "保存后系统自动记录" : creatorText(current)} disabled /></Form.Item>
          <Form.Item label="创建时间"><Input size="large" value={mode === "create" ? "保存后系统自动生成" : displayDate(current?.createdAt)} disabled /></Form.Item>
        </div></section>
        {mode === "create" && <section className="user-form-section"><div className="user-form-section-title"><LockOutlined /><span><strong>账号安全</strong><small>设置用户首次登录使用的密码</small></span></div><div className="user-form-grid">
          <Form.Item label="初始密码" name="password" rules={[{ required: true, message: "请输入初始密码" }, { min: 8, message: "密码至少需要8位" }]} extra="密码长度至少为8位"><Input.Password size="large" placeholder="请输入初始密码" autoComplete="new-password" /></Form.Item>
          <Form.Item label="确认密码" name="confirmPassword" dependencies={["password"]} rules={[{ required: true, message: "请再次输入密码" }, ({ getFieldValue }) => ({ validator(_, value) { return !value || getFieldValue("password") === value ? Promise.resolve() : Promise.reject(new Error("两次输入的密码不一致")); } })]}><Input.Password size="large" placeholder="请再次输入初始密码" autoComplete="new-password" /></Form.Item>
        </div></section>}
        <section className="user-form-section"><div className="user-form-section-title"><SafetyCertificateOutlined /><span><strong>权限与状态</strong><small>设置用户在系统中的职责与可用状态</small></span></div><div className="user-form-grid">
          <Form.Item label="用户角色" name="roleId" rules={[{ required: true, message: "请选择角色" }]}><Select size="large" placeholder="请选择用户角色" disabled={current?.type === "SYSTEM"} options={formRoles.map(role => ({ value: role.id, label: role.name, disabled: role.status === "DISABLED" }))} /></Form.Item>
          <Form.Item label="账号状态" name="status" rules={[{ required: true, message: "请选择状态" }]}><Select size="large" options={statusOptions.filter(option => option.value)} disabled={current?.type === "SYSTEM"} /></Form.Item>
          <Form.Item className="user-form-span" name="isRegionManager" valuePropName="checked"><Checkbox>区域负责人</Checkbox></Form.Item>
          <Form.Item noStyle shouldUpdate={(previous, next) => previous.isRegionManager !== next.isRegionManager}>{({ getFieldValue }) => <Form.Item className="user-form-span" label="区域管理权限" name="managedRegions" extra={optionsError ? "区域选项加载失败，请重新打开弹窗重试" : "可选择多个区域；已分配给其他负责人的区域会自动置灰"}><Select mode="multiple" allowClear size="large" optionFilterProp="label" placeholder={getFieldValue("isRegionManager") ? "请选择负责区域（可多选）" : "请先勾选区域负责人"} disabled={!getFieldValue("isRegionManager")} loading={optionsLoading} options={regionOptions} getPopupContainer={trigger => (trigger.closest(".user-management-modal") as HTMLElement | null) ?? document.body} notFoundContent={optionsLoading ? "正在加载区域..." : optionsError ? "区域加载失败，请重新打开弹窗重试" : "暂无可选区域"} /></Form.Item>}</Form.Item>
          <Form.Item className="user-form-span" label="运营H5品牌权限" name="leadH5BrandIds" extra="不选择表示可访问全部品牌；选择后仅可查看所选品牌门店"><Select mode="multiple" allowClear size="large" optionFilterProp="label" placeholder="全部品牌" options={brands.map(brand => ({ value: brand.id, label: brand.name }))} onChange={() => form.setFieldValue("leadH5StoreIds", [])} /></Form.Item>
          <Form.Item noStyle shouldUpdate={(previous, next) => previous.leadH5BrandIds !== next.leadH5BrandIds}>{({ getFieldValue }) => { const selectedBrands = getFieldValue("leadH5BrandIds") as string[] | undefined; const availableStores = selectedBrands?.length ? stores.filter(store => selectedBrands.includes(store.brandId)) : stores; return <Form.Item className="user-form-span" label="运营H5店铺权限" name="leadH5StoreIds" extra="不选择表示品牌范围内全部店铺；服务端仍会在每次请求和提交时重新校验"><Select mode="multiple" allowClear size="large" optionFilterProp="label" placeholder="全部店铺" options={availableStores.map(store => ({ value: store.id, label: `${store.name}（${store.brand.name}）` }))} /></Form.Item>; }}</Form.Item>
        </div></section>
      </Form>}
    </Modal>
    <Modal title={`重置密码${passwordTarget ? `：${passwordTarget.realName}` : ""}`} open={!!passwordTarget} onCancel={() => { if (!saving) setPasswordTarget(null); }} onOk={() => void resetPassword()} okText="确认重置" cancelText="取消" confirmLoading={saving} destroyOnHidden>
      <Form form={passwordForm} layout="vertical" style={{ paddingTop: 8 }}><Form.Item label="新密码" name="password" rules={[{ required: true, message: "请输入新密码" }, { min: 8, message: "密码至少需要8位" }]} extra="重置后请将新密码安全告知用户"><Input.Password placeholder="请输入至少8位的新密码" autoComplete="new-password" /></Form.Item><Form.Item label="确认新密码" name="confirmPassword" dependencies={["password"]} rules={[{ required: true, message: "请再次输入新密码" }, ({ getFieldValue }) => ({ validator(_, value) { return !value || getFieldValue("password") === value ? Promise.resolve() : Promise.reject(new Error("两次输入的密码不一致")); } })]}><Input.Password placeholder="请再次输入新密码" autoComplete="new-password" /></Form.Item></Form>
    </Modal>
  </>;
}

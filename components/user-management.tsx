"use client";

import { DeleteOutlined, EyeOutlined, KeyOutlined, LockOutlined, PlusOutlined, SafetyCertificateOutlined, UserOutlined } from "@ant-design/icons";
import { Avatar, Button, Card, Descriptions, Form, Input, message, Modal, Select, Space, Tag, Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useState } from "react";
import { DataTable } from "@/components/data-table";
import { StatusTag } from "@/components/status-tag";
import { displayDate } from "@/lib/format";

type Status = "ENABLED" | "DISABLED";
type UserType = "SYSTEM" | "CUSTOM";
type Role = { id: string; name: string; code: string; status: Status };
type User = { id: string; username: string; realName: string; phone: string | null; tags: string | null; leadH5BrandIds: string[] | null; leadH5StoreIds: string[] | null; type: UserType; status: Status; roleId: string; role: Role; createdByUserId: string | null; createdBy: { username: string; realName: string } | null; lastLoginAt: string | null; createdAt: string; updatedAt: string };
type UserFormValues = { username: string; realName: string; phone?: string; tags?: string; leadH5BrandIds?: string[]; leadH5StoreIds?: string[]; roleId: string; status: Status; password?: string; confirmPassword?: string };
type BrandOption = { id: string; name: string };
type StoreOption = { id: string; name: string; brandId: string; brand: { name: string } };
type PasswordFormValues = { password: string; confirmPassword: string };

const statusOptions = [{ value: "", label: "全部状态" }, { value: "ENABLED", label: "已启用" }, { value: "DISABLED", label: "已禁用" }];
const typeText = (type: UserType) => type === "SYSTEM" ? "系统内置" : "自定义";
const typeTag = (type: UserType) => <Tag color={type === "SYSTEM" ? "blue" : "default"}>{typeText(type)}</Tag>;
const creatorText = (user: User | null) => user?.createdBy ? `${user.createdBy.realName}（${user.createdBy.username}）` : "系统生成";
const tagDisplay = (tags?: string | null) => tags ? <Space size={[4, 4]} wrap>{tags.split("|").filter(Boolean).map(tag => <Tag key={tag}>{tag}</Tag>)}</Space> : "未设置";

export function UserManagement() {
  const [rows, setRows] = useState<User[]>([]); const [roles, setRoles] = useState<Role[]>([]); const [brands, setBrands] = useState<BrandOption[]>([]); const [stores, setStores] = useState<StoreOption[]>([]); const [total, setTotal] = useState(0); const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(10);
  const [filters, setFilters] = useState({ keyword: "", roleId: "", status: "" }); const [loading, setLoading] = useState(true); const [error, setError] = useState(false);
  const [mode, setMode] = useState<"create" | "edit" | "view" | null>(null); const [current, setCurrent] = useState<User | null>(null); const [saving, setSaving] = useState(false); const [passwordTarget, setPasswordTarget] = useState<User | null>(null);
  const [form] = Form.useForm<UserFormValues>(); const [passwordForm] = Form.useForm<PasswordFormValues>();
  const loadRoles = async () => {
    try {
      const response = await fetch("/api/settings/users/options"); const data = await response.json();
      if (!response.ok) throw new Error(data.message); setRoles(data.roles); setBrands(data.brands || []); setStores(data.stores || []);
    } catch { message.error("角色选项加载失败，请稍后重试"); }
  };
  const load = async (nextPage = page, nextPageSize = pageSize, nextFilters = filters) => {
    setLoading(true); setError(false);
    try {
      const query = new URLSearchParams({ ...nextFilters, page: String(nextPage), pageSize: String(nextPageSize) }); const response = await fetch(`/api/settings/users?${query}`);
      if (!response.ok) throw new Error(); const data = await response.json(); setRows(data.rows); setTotal(data.total);
    } catch { setError(true); } finally { setLoading(false); }
  };
  useEffect(() => { void load(1); void loadRoles(); }, []);
  useEffect(() => {
    if (mode === "create") { form.resetFields(); form.setFieldsValue({ status: "ENABLED", leadH5BrandIds: [], leadH5StoreIds: [] }); }
    if (mode === "edit" && current) form.setFieldsValue({ username: current.username, realName: current.realName, phone: current.phone || undefined, tags: current.tags || undefined, leadH5BrandIds: current.leadH5BrandIds || [], leadH5StoreIds: current.leadH5StoreIds || [], roleId: current.roleId, status: current.status });
  }, [mode, current, form]);
  useEffect(() => { if (passwordTarget) passwordForm.resetFields(); }, [passwordTarget, passwordForm]);
  const openCreate = () => { setCurrent(null); setMode("create"); };
  const openUser = async (user: User, nextMode: "edit" | "view") => {
    setSaving(true);
    try {
      const response = await fetch(`/api/settings/users/${user.id}`); const data = await response.json();
      if (!response.ok) return void message.error(data.message || "用户信息加载失败，请稍后重试");
      setCurrent(data); setMode(nextMode);
    } catch { message.error("用户信息加载失败，请稍后重试"); } finally { setSaving(false); }
  };
  const close = () => { if (saving) return; setMode(null); setCurrent(null); };
  const submit = async () => {
    try {
      const values = await form.validateFields(); setSaving(true);
      const scopedValues = { ...values, leadH5BrandIds: values.leadH5BrandIds?.length ? values.leadH5BrandIds : null, leadH5StoreIds: values.leadH5StoreIds?.length ? values.leadH5StoreIds : null };
      const body = mode === "create" ? scopedValues : { username: scopedValues.username, realName: scopedValues.realName, phone: scopedValues.phone, tags: scopedValues.tags, leadH5BrandIds: scopedValues.leadH5BrandIds, leadH5StoreIds: scopedValues.leadH5StoreIds, roleId: scopedValues.roleId, status: scopedValues.status, updatedAt: current?.updatedAt };
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
  const isProtected = (user: User) => user.type === "SYSTEM";
  const modalTitle = mode === "create" ? "新增用户" : mode === "edit" ? "编辑用户" : "查看用户";
  const modalSubtitle = mode === "create" ? "创建登录账号并配置用户角色" : mode === "edit" ? "维护用户资料、角色和使用状态" : "查看用户的账号资料和使用信息";
  const formRoles = current && !roles.some(role => role.id === current.roleId) ? [...roles, current.role] : roles;
  const columns: ColumnsType<User> = [
    { title: "账号", dataIndex: "username", width: 150 }, { title: "真实姓名", dataIndex: "realName", width: 130 }, { title: "角色", dataIndex: ["role", "name"], width: 150 }, { title: "手机号", dataIndex: "phone", width: 140, render: value => value || "-" },
    { title: "类型", dataIndex: "type", width: 110, render: value => typeTag(value) }, { title: "状态", dataIndex: "status", width: 100, render: value => <StatusTag value={value} /> }, { title: "最后登录", dataIndex: "lastLoginAt", width: 150, render: displayDate }, { title: "创建时间", dataIndex: "createdAt", width: 150, render: displayDate },
    { title: "操作", fixed: "right", width: 310, render: (_, user) => <Space className="table-actions" size={0}><Button type="link" size="small" onClick={() => void openUser(user, "edit")}>编辑</Button><Button type="link" size="small" icon={<EyeOutlined />} onClick={() => void openUser(user, "view")}>查看</Button><Tooltip title={isProtected(user) ? "系统内置用户不可禁用" : undefined}><Button type="link" size="small" disabled={isProtected(user)} onClick={() => changeStatus(user)}>{user.status === "ENABLED" ? "禁用" : "启用"}</Button></Tooltip><Button type="link" size="small" icon={<KeyOutlined />} onClick={() => setPasswordTarget(user)}>重置密码</Button><Tooltip title={isProtected(user) ? "系统内置用户不可删除" : undefined}><Button type="link" danger size="small" icon={<DeleteOutlined />} disabled={isProtected(user)} onClick={() => remove(user)}>删除</Button></Tooltip></Space> },
  ];
  return <>
    <Card style={{ marginBottom: 16 }}><Space wrap><Input placeholder="账号、姓名或手机号" style={{ width: 240 }} value={filters.keyword} onChange={event => setFilters({ ...filters, keyword: event.target.value })} onPressEnter={() => { setPage(1); void load(1); }} /><Select style={{ width: 180 }} options={[{ value: "", label: "全部角色" }, ...roles.map(role => ({ value: role.id, label: role.name }))]} value={filters.roleId} onChange={roleId => setFilters({ ...filters, roleId })} /><Select style={{ width: 140 }} options={statusOptions} value={filters.status} onChange={status => setFilters({ ...filters, status })} /><Button onClick={() => { const next = { keyword: "", roleId: "", status: "" }; setFilters(next); setPage(1); void load(1, pageSize, next); }}>重置</Button><Button type="primary" onClick={() => { setPage(1); void load(1); }}>筛选</Button></Space></Card>
    <Card extra={<Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增用户</Button>}><DataTable<User> rowKey="id" columns={columns} dataSource={rows} loading={loading} error={error} onRetry={() => void load()} pagination={{ current: page, pageSize, total, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100], showTotal: count => `共 ${count} 条`, onChange: (nextPage, nextPageSize) => { setPage(nextPage); setPageSize(nextPageSize); void load(nextPage, nextPageSize); } }} /></Card>
    <Modal rootClassName="user-management-modal" title={<div className="user-modal-title"><span className="user-modal-title-icon"><UserOutlined /></span><span><strong>{modalTitle}</strong><small>{modalSubtitle}</small></span></div>} open={!!mode} onCancel={close} width={720} destroyOnHidden maskClosable={false} footer={mode === "view" ? <Button size="large" onClick={close}>关闭</Button> : <Space><Button size="large" onClick={close}>取消</Button><Button size="large" type="primary" loading={saving} onClick={() => void submit()}>保存</Button></Space>}>
      {mode === "view" && current ? <div className="user-view-panel">
        <div className="user-view-summary"><Avatar size={52} icon={<UserOutlined />} /><div className="user-view-identity"><strong>{current.realName}</strong><span>@{current.username}</span></div><StatusTag value={current.status} /></div>
        <Descriptions className="user-view-descriptions" bordered size="middle" column={2}>
          <Descriptions.Item label="登录账号">{current.username}</Descriptions.Item><Descriptions.Item label="真实姓名">{current.realName}</Descriptions.Item>
          <Descriptions.Item label="手机号码">{current.phone || "未填写"}</Descriptions.Item><Descriptions.Item label="类型">{typeTag(current.type)}</Descriptions.Item>
          <Descriptions.Item label="用户标签" span={2}>{tagDisplay(current.tags)}</Descriptions.Item>
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

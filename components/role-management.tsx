"use client";

import { AppstoreOutlined, DeleteOutlined, EyeOutlined, PlusOutlined, SafetyCertificateOutlined, TeamOutlined } from "@ant-design/icons";
import { Button, Card, Checkbox, Descriptions, Form, Input, message, Modal, Select, Space, Tag, Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useState } from "react";
import { DataTable } from "@/components/data-table";
import { StatusTag } from "@/components/status-tag";
import { displayDate } from "@/lib/format";
import { permissionGroups, permissionValues } from "@/lib/role-permissions";

type Role = { id: string; name: string; code: string; type: "SYSTEM" | "CUSTOM"; status: "ENABLED" | "DISABLED"; permissions: string[]; createdAt: string; updatedAt: string; _count: { users: number } };
type FormValues = { name: string; code: string; permissions: string[]; status: "ENABLED" | "DISABLED" };
const statusOptions = [{ value: "", label: "全部状态" }, { value: "ENABLED", label: "已启用" }, { value: "DISABLED", label: "已禁用" }];
const typeOptions = [{ value: "", label: "全部类型" }, { value: "SYSTEM", label: "系统内置" }, { value: "CUSTOM", label: "自定义" }];

export function RoleManagement() {
  const [rows, setRows] = useState<Role[]>([]); const [total, setTotal] = useState(0); const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(10);
  const [filters, setFilters] = useState({ keyword: "", type: "", status: "" }); const [loading, setLoading] = useState(true); const [error, setError] = useState(false);
  const [mode, setMode] = useState<"create" | "edit" | "view" | null>(null); const [current, setCurrent] = useState<Role | null>(null); const [saving, setSaving] = useState(false); const [form] = Form.useForm<FormValues>();
  const load = async (nextPage = page, nextPageSize = pageSize, nextFilters = filters) => {
    setLoading(true); setError(false);
    try {
      const query = new URLSearchParams({ ...nextFilters, page: String(nextPage), pageSize: String(nextPageSize) }); const response = await fetch(`/api/settings/roles?${query}`);
      if (!response.ok) throw new Error(); const data = await response.json(); setRows(data.rows); setTotal(data.total);
    } catch { setError(true); } finally { setLoading(false); }
  };
  useEffect(() => { void load(1); }, []);
  const openCreate = () => { form.resetFields(); form.setFieldsValue({ permissions: [], status: "ENABLED" }); setCurrent(null); setMode("create"); };
  const openRole = async (role: Role, nextMode: "edit" | "view") => {
    setSaving(true);
    try {
      const response = await fetch(`/api/settings/roles/${role.id}`); const data = await response.json();
      if (!response.ok) return void message.error(data.message || "角色信息加载失败，请稍后重试");
      const next = data as Role; const permissions = Array.isArray(next.permissions) && next.permissions.includes("*") ? permissionValues : Array.isArray(next.permissions) ? next.permissions : [];
      setCurrent(next); form.setFieldsValue({ name: next.name, code: next.code, permissions, status: next.status }); setMode(nextMode);
    } catch { message.error("角色信息加载失败，请稍后重试"); } finally { setSaving(false); }
  };
  const close = () => { if (saving) return; setMode(null); setCurrent(null); };
  const submit = async () => {
    try {
      const values = await form.validateFields(); setSaving(true);
      const url = mode === "create" ? "/api/settings/roles" : `/api/settings/roles/${current?.id}`;
      const body = mode === "create" ? values : { ...values, updatedAt: current?.updatedAt };
      const response = await fetch(url, { method: mode === "create" ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const data = await response.json();
      if (!response.ok) return void message.error(data.message || "保存失败，请稍后重试");
      message.success(mode === "create" ? "角色新增成功" : "角色保存成功"); close(); setPage(1); await load(1);
    } catch (reason) { if (!(reason instanceof Error)) return; } finally { setSaving(false); }
  };
  const changeStatus = (role: Role) => {
    const enable = role.status === "DISABLED"; const action = enable ? "启用" : "禁用";
    Modal.confirm({ title: `确认${action}角色？`, content: enable ? "启用后，该角色下的账号可以重新正常使用系统。" : "禁用后，该角色下的账号将无法登录系统。", okText: `确认${action}`, cancelText: "取消", onOk: async () => {
      const response = await fetch(`/api/settings/roles/${role.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "status", status: enable ? "ENABLED" : "DISABLED", updatedAt: role.updatedAt }) }); const data = await response.json();
      if (!response.ok) { message.error(data.message || "操作失败，请稍后重试"); return Promise.reject(new Error()); }
      message.success(`角色${action}成功`); await load();
    } });
  };
  const remove = (role: Role) => Modal.confirm({ title: "确认删除角色？", content: "删除后不可恢复；仅未关联用户的自定义角色可删除。", okText: "确认删除", cancelText: "取消", okButtonProps: { danger: true }, onOk: async () => {
    const response = await fetch(`/api/settings/roles/${role.id}`, { method: "DELETE" }); const data = await response.json();
    if (!response.ok) { message.error(data.message || "删除失败，请稍后重试"); return Promise.reject(new Error()); }
    message.success("角色删除成功"); const nextPage = rows.length === 1 && page > 1 ? page - 1 : page; if (nextPage !== page) setPage(nextPage); await load(nextPage);
  } });
  const columns: ColumnsType<Role> = [
    { title: "角色名称", dataIndex: "name", width: 180 }, { title: "英文名称", dataIndex: "code", width: 180 }, { title: "类型", dataIndex: "type", width: 110, render: value => value === "SYSTEM" ? <Tag color="blue">系统内置</Tag> : "自定义" },
    { title: "关联用户", dataIndex: ["_count", "users"], width: 100, render: value => `${value} 人` }, { title: "状态", dataIndex: "status", width: 100, render: value => <StatusTag value={value} /> }, { title: "创建时间", dataIndex: "createdAt", width: 180, render: displayDate },
    { title: "操作", fixed: "right", width: 265, render: (_, role) => <Space className="table-actions" size={0}><Button type="link" size="small" onClick={() => void openRole(role, "edit")}>编辑</Button><Button type="link" size="small" icon={<EyeOutlined />} onClick={() => void openRole(role, "view")}>查看</Button><Button type="link" size="small" onClick={() => changeStatus(role)} disabled={role.code === "SUPER_ADMIN" && role.status === "ENABLED"}>{role.status === "ENABLED" ? "禁用" : "启用"}</Button><Tooltip title={role.type === "SYSTEM" ? "系统内置角色不可删除" : role._count.users ? "角色仍关联用户，不可删除" : undefined}><Button type="link" danger size="small" icon={<DeleteOutlined />} disabled={role.type === "SYSTEM" || role._count.users > 0} onClick={() => remove(role)}>删除</Button></Tooltip></Space> },
  ];
  const selectedPermissions = Form.useWatch("permissions", form) || [];
  const allSelected = permissionValues.every(value => selectedPermissions.includes(value));
  const modalTitle = mode === "create" ? "新增角色" : mode === "edit" ? "编辑角色" : "查看角色";
  const modalSubtitle = mode === "create" ? "创建角色并设置可访问的功能范围" : mode === "edit" ? "维护角色名称、功能权限和使用状态" : "查看角色权限范围和基础信息";
  const selectedPermissionGroups = current?.permissions.includes("*") ? permissionGroups : permissionGroups.map(group => ({ ...group, permissions: group.permissions.filter(permission => current?.permissions.includes(permission.value)) })).filter(group => group.permissions.length);
  return <>
    <Card style={{ marginBottom: 16 }}><Space wrap><Input placeholder="角色名称或英文名称" style={{ width: 240 }} value={filters.keyword} onChange={event => setFilters({ ...filters, keyword: event.target.value })} onPressEnter={() => { setPage(1); void load(1); }} /><Select style={{ width: 140 }} options={typeOptions} value={filters.type} onChange={type => setFilters({ ...filters, type })} /><Select style={{ width: 140 }} options={statusOptions} value={filters.status} onChange={status => setFilters({ ...filters, status })} /><Button onClick={() => { const next = { keyword: "", type: "", status: "" }; setFilters(next); setPage(1); void load(1, pageSize, next); }}>重置</Button><Button type="primary" onClick={() => { setPage(1); void load(1); }}>筛选</Button></Space></Card>
    <Card extra={<Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增角色</Button>}><DataTable<Role> rowKey="id" columns={columns} dataSource={rows} loading={loading} error={error} onRetry={() => void load()} pagination={{ current: page, pageSize, total, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100], showTotal: count => `共 ${count} 条`, onChange: (nextPage, nextPageSize) => { setPage(nextPage); setPageSize(nextPageSize); void load(nextPage, nextPageSize); } }} /></Card>
    <Modal rootClassName="role-management-modal" title={<div className="role-modal-title"><span className="role-modal-title-icon"><SafetyCertificateOutlined /></span><span><strong>{modalTitle}</strong><small>{modalSubtitle}</small></span></div>} open={!!mode} onCancel={close} width={780} destroyOnHidden maskClosable={false} footer={mode === "view" ? <Button size="large" onClick={close}>关闭</Button> : <Space><Button size="large" onClick={close}>取消</Button><Button size="large" type="primary" loading={saving} onClick={() => void submit()}>保存</Button></Space>}>
      {mode === "view" && current ? <div className="role-view-panel">
        <div className="role-view-summary"><span className="role-view-summary-icon"><SafetyCertificateOutlined /></span><div className="role-view-identity"><strong>{current.name}</strong><span>{current.code}</span></div><Tag color={current.type === "SYSTEM" ? "blue" : "default"}>{current.type === "SYSTEM" ? "系统内置" : "自定义"}</Tag><StatusTag value={current.status} /></div>
        <Descriptions className="role-view-descriptions" bordered size="middle" column={2}>
          <Descriptions.Item label="角色名称">{current.name}</Descriptions.Item><Descriptions.Item label="英文名称">{current.code}</Descriptions.Item>
          <Descriptions.Item label="角色类型">{current.type === "SYSTEM" ? "系统内置" : "自定义"}</Descriptions.Item><Descriptions.Item label="使用状态"><StatusTag value={current.status} /></Descriptions.Item>
          <Descriptions.Item label="关联用户">{current._count.users} 人</Descriptions.Item><Descriptions.Item label="创建时间">{displayDate(current.createdAt)}</Descriptions.Item>
          <Descriptions.Item label="更新时间">{displayDate(current.updatedAt)}</Descriptions.Item><Descriptions.Item label="权限数量">{current.permissions.includes("*") ? "全量权限" : `${current.permissions.length} 项`}</Descriptions.Item>
          <Descriptions.Item label="功能权限" span={2}><div className="role-view-permissions">{selectedPermissionGroups.length ? selectedPermissionGroups.map(group => <div key={group.key} className="role-view-permission-group"><span>{group.label}</span><Space size={[4, 4]} wrap>{group.permissions.map(permission => <Tag key={permission.value} color="blue">{permission.label}</Tag>)}</Space></div>) : "暂未配置功能权限"}</div></Descriptions.Item>
        </Descriptions>
      </div> : <Form form={form} layout="vertical" initialValues={{ permissions: [], status: "ENABLED" }} className="role-form">
        <section className="role-form-section"><div className="role-form-section-title"><TeamOutlined /><span><strong>基本信息</strong><small>设置角色名称与系统识别标识</small></span></div><div className="role-form-grid">
          <Form.Item label="角色名称" name="name" rules={[{ required: true, message: "请输入角色名称" }, { max: 30, message: "角色名称不能超过30个字符" }]}><Input size="large" maxLength={30} placeholder="请输入角色名称" /></Form.Item>
          <Form.Item label="英文名称" name="code" normalize={(value: string) => value.toUpperCase()} rules={[{ required: true, message: "请输入英文名称" }, { pattern: /^[A-Z][A-Z0-9_]{1,29}$/, message: "请输入2-30位大写字母、数字或下划线" }]} extra={current?.type === "SYSTEM" ? "系统内置角色的英文名称不可修改" : "输入时将自动转换为大写"}><Input size="large" maxLength={30} placeholder="例如：STORE_MANAGER" disabled={current?.type === "SYSTEM"} /></Form.Item>
        </div><div className="role-type-tip"><span>角色类型</span><Tag color={current?.type === "SYSTEM" ? "blue" : "default"}>{current?.type === "SYSTEM" ? "系统内置" : "自定义"}</Tag><small>{current?.type === "SYSTEM" ? "系统内置角色不可删除。" : "新增角色默认为自定义角色。"}</small></div></section>
        <section className="role-form-section"><div className="role-form-section-title"><AppstoreOutlined /><span><strong>功能权限</strong><small>按角色职责勾选可访问的业务功能</small></span></div><div className="role-permission-panel"><div className="role-permission-panel-head"><div><strong>权限范围</strong><span>未勾选的功能将不授予该角色</span></div><Checkbox checked={allSelected} indeterminate={selectedPermissions.length > 0 && !allSelected} onChange={event => form.setFieldValue("permissions", event.target.checked ? permissionValues : [])}>全选权限</Checkbox></div><Form.Item name="permissions" rules={[{ type: "array" }]} noStyle><Checkbox.Group className="role-permission-grid">{permissionGroups.map(group => <div key={group.key} className="role-permission-group"><div className="role-permission-group-name">{group.label}</div><Space size={[12, 8]} wrap>{group.permissions.map(permission => <Checkbox key={permission.value} value={permission.value}>{permission.label}</Checkbox>)}</Space></div>)}</Checkbox.Group></Form.Item></div></section>
        <section className="role-form-section role-status-section"><div className="role-form-section-title"><SafetyCertificateOutlined /><span><strong>使用状态</strong><small>禁用后，该角色关联的账号将无法登录系统</small></span></div><Form.Item label="角色状态" name="status" rules={[{ required: true, message: "请选择状态" }]}><Select size="large" style={{ width: 220 }} disabled={current?.code === "SUPER_ADMIN"} options={statusOptions.filter(option => option.value)} /></Form.Item></section>
      </Form>}
    </Modal>
  </>;
}

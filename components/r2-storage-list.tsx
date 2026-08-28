"use client";

import { DeleteOutlined, EyeOutlined, PlusOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Empty, Form, Input, InputNumber, message, Modal, Select, Space, Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { useEffect, useState } from "react";
import { DataTable } from "@/components/data-table";
import { StatusTag } from "@/components/status-tag";
import { UnsavedChangesModal } from "@/components/unsaved-changes-modal";

type Permission = "query" | "create" | "edit" | "view" | "test" | "enable" | "disable" | "delete";
type R2Row = {
  id: string; recordNo: string; name: string; accountId: string; bucketName: string; endpoint: string;
  signedUrlExpireSeconds: number; status: "ENABLED" | "DISABLED"; version: number;
  createdAt: string; updatedAt: string; createdBy?: { realName: string } | null;
  _count: { references: number }; accessKeyIdMasked?: string; secretAccessKeyMasked?: string;
};
type FormValues = {
  name: string; accountId: string; accessKeyId?: string; secretAccessKey?: string; bucketName: string;
  endpoint: string; signedUrlExpireSeconds: number; status: "ENABLED" | "DISABLED";
};

function formatTime(value: string) { return dayjs(value).format("YYYY-MM-DD HH:mm:ss"); }

export function R2StorageList({ permissions }: { permissions: string[] }) {
  const hasAll = permissions.includes("*"); const can = (action: Permission) => hasAll || permissions.includes(`r2-storage:${action}`);
  const [rows, setRows] = useState<R2Row[]>([]); const [total, setTotal] = useState(0); const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState(""); const [accountId, setAccountId] = useState(""); const [bucketName, setBucketName] = useState("");
  const [applied, setApplied] = useState({ accountId: "", bucketName: "" }); const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(10);
  const [mode, setMode] = useState<"create" | "edit" | "view" | null>(null); const [current, setCurrent] = useState<R2Row | null>(null);
  const [saving, setSaving] = useState(false); const [actionId, setActionId] = useState(""); const [dirty, setDirty] = useState(false); const [form] = Form.useForm<FormValues>();
  const [discardOpen, setDiscardOpen] = useState(false);

  const load = async (nextPage = page, nextPageSize = pageSize, filters = applied) => {
    setLoading(true); setErrorMessage("");
    try {
      const query = new URLSearchParams({ accountId: filters.accountId.trim(), bucketName: filters.bucketName.trim(), page: String(nextPage), pageSize: String(nextPageSize) });
      const response = await fetch(`/api/r2-storage?${query}`); const data = await response.json();
      if (!response.ok) throw new Error(data.message || "R2存储空间数据加载失败，请稍后重试");
      setRows(data.rows); setTotal(data.total);
    } catch (error) { setErrorMessage(error instanceof Error ? error.message : "R2存储空间数据加载失败，请稍后重试"); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (can("query")) void load(1, 10, { accountId: "", bucketName: "" }); else setLoading(false); }, []);

  const applyFilter = () => { const filters = { accountId: accountId.trim(), bucketName: bucketName.trim() }; setApplied(filters); setPage(1); void load(1, pageSize, filters); };
  const resetFilter = () => { const filters = { accountId: "", bucketName: "" }; setAccountId(""); setBucketName(""); setApplied(filters); setPage(1); void load(1, pageSize, filters); };
  const openCreate = () => { setCurrent(null); form.resetFields(); form.setFieldsValue({ signedUrlExpireSeconds: 300, status: "ENABLED" }); setDirty(false); setMode("create"); };

  const openExisting = async (row: R2Row, nextMode: "edit" | "view") => {
    setActionId(row.id);
    try {
      const response = await fetch(`/api/r2-storage/${row.id}?intent=${nextMode}`); const data = await response.json();
      if (!response.ok) return void message.error(data.message || "R2存储空间加载失败，请稍后重试");
      const next = data as R2Row; setCurrent(next);
      form.setFieldsValue({
        name: next.name, accountId: next.accountId, bucketName: next.bucketName, endpoint: next.endpoint,
        signedUrlExpireSeconds: next.signedUrlExpireSeconds, status: next.status,
        accessKeyId: nextMode === "view" ? next.accessKeyIdMasked : "", secretAccessKey: nextMode === "view" ? next.secretAccessKeyMasked : "",
      });
      setDirty(false); setMode(nextMode);
    } catch { message.error("R2存储空间加载失败，请稍后重试"); } finally { setActionId(""); }
  };

  const closeForm = () => {
    if (saving) return;
    if (dirty && mode !== "view") {
      setDiscardOpen(true);
      return;
    }
    setMode(null); setDirty(false);
  };

  const submit = async () => {
    try {
      const values = await form.validateFields(); setSaving(true);
      const creating = mode === "create"; const url = creating ? "/api/r2-storage" : `/api/r2-storage/${current?.id}`;
      const payload = creating ? values : { ...values, updatedAt: current?.updatedAt };
      const response = await fetch(url, { method: creating ? "POST" : "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) return void message.error(data.message || "R2存储空间保存失败，请稍后重试");
      message.success(creating ? "R2存储空间新增成功" : "R2存储空间编辑成功"); setMode(null); setDirty(false); setPage(1); await load(1, pageSize, applied);
    } catch (reason) { if (reason instanceof Error) message.error(reason.message); } finally { setSaving(false); }
  };

  const changeStatus = (row: R2Row) => {
    const enabling = row.status === "DISABLED"; const action = enabling ? "启用" : "禁用";
    Modal.confirm({
      title: `确认${action}R2存储空间？`,
      content: enabling ? "启用后，该R2配置可以重新供相关文件存储业务使用。" : "禁用后，该R2存储空间将不能继续作为新的文件上传目标，但不会自动删除已经存储的文件。",
      okText: `确认${action}`, cancelText: "取消",
      onOk: async () => {
        setActionId(row.id);
        try {
          const response = await fetch(`/api/r2-storage/${row.id}/${enabling ? "enable" : "disable"}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ updatedAt: row.updatedAt }) });
          const data = await response.json(); if (!response.ok) { message.error(data.message || `${action}失败，请稍后重试`); throw new Error(); }
          message.success(data.message); await load();
        } finally { setActionId(""); }
      },
    });
  };

  const testStorage = async (row: R2Row) => {
    const messageKey = `r2-test-${row.id}`; setActionId(row.id); message.loading({ key: messageKey, content: "正在上传R2测试文件...", duration: 0 });
    try {
      const response = await fetch(`/api/r2-storage/${row.id}/test`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) { message.error({ key: messageKey, content: data.message || "R2测试失败，请检查配置后重试" }); return; }
      message.destroy(messageKey);
      Modal.success({ title: "温馨提示", content: "R2 存储桶连接正常，数据已成功写入并读取。配置有效，可正常使用。", okText: "我知道了", centered: true });
    } catch { message.error({ key: messageKey, content: "R2测试失败，请稍后重试" }); }
    finally { setActionId(""); }
  };

  const remove = (row: R2Row) => Modal.confirm({
    title: "确认删除R2存储空间？",
    content: "删除后该R2连接配置将不能继续使用，但不会自动删除Cloudflare R2存储桶及其中已经存在的文件。",
    okText: "确认删除", cancelText: "取消", okButtonProps: { danger: true },
    onOk: async () => {
      setActionId(row.id);
      try {
        const response = await fetch(`/api/r2-storage/${row.id}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ updatedAt: row.updatedAt }) });
        const data = await response.json(); if (!response.ok) { message.error(data.message || "删除失败，请稍后重试"); throw new Error(); }
        message.success(data.message); const nextPage = rows.length === 1 && page > 1 ? page - 1 : page; setPage(nextPage); await load(nextPage);
      } finally { setActionId(""); }
    },
  });

  if (!can("query")) return <Alert type="warning" showIcon message="暂无R2存储空间查询权限" description="请联系管理员为当前角色配置相应权限。" />;

  const columns: ColumnsType<R2Row> = [
    { title: "记录编号", dataIndex: "recordNo", width: 140 },
    { title: "R2存储空间名称", dataIndex: "name", width: 180, ellipsis: true },
    { title: "accountID", dataIndex: "accountId", width: 210, ellipsis: { showTitle: false }, render: value => <Tooltip title={value}>{value}</Tooltip> },
    { title: "bucketName", dataIndex: "bucketName", width: 190, ellipsis: { showTitle: false }, render: value => <Tooltip title={value}>{value}</Tooltip> },
    { title: "创建人", dataIndex: ["createdBy", "realName"], width: 110, render: value => value || "系统" },
    { title: "创建时间", dataIndex: "createdAt", width: 175, render: formatTime },
    { title: "状态", dataIndex: "status", width: 90, render: value => <StatusTag value={value} /> },
    { title: "操作", fixed: "right", width: 320, render: (_, row) => <Space className="table-actions" size={0}>
      {can("edit") && <Button type="link" size="small" disabled={Boolean(actionId)} onClick={() => void openExisting(row, "edit")}>编辑</Button>}
      {can("view") && <Button type="link" size="small" icon={<EyeOutlined />} disabled={Boolean(actionId)} onClick={() => void openExisting(row, "view")}>查看</Button>}
      {can("test") && <Tooltip title={row.status === "DISABLED" ? "已禁用的R2存储空间不能执行上传测试" : "上传内容为test的TXT文件，不会自动删除"}><Button type="link" size="small" loading={actionId === row.id} disabled={(Boolean(actionId) && actionId !== row.id) || row.status === "DISABLED"} onClick={() => void testStorage(row)}>测试</Button></Tooltip>}
      {((row.status === "ENABLED" && can("disable")) || (row.status === "DISABLED" && can("enable"))) && <Button type="link" size="small" disabled={Boolean(actionId)} onClick={() => changeStatus(row)}>{row.status === "ENABLED" ? "禁用" : "启用"}</Button>}
      {can("delete") && <Tooltip title={row._count.references ? "该R2存储空间正在被系统业务使用，请使用禁用操作" : undefined}><Button type="link" danger size="small" icon={<DeleteOutlined />} disabled={Boolean(actionId) || row._count.references > 0} onClick={() => remove(row)}>删除</Button></Tooltip>}
    </Space> },
  ];

  const filteredEmpty = Boolean(applied.accountId || applied.bucketName);
  const credentialRules = (field: "accessKeyId" | "secretAccessKey", max: number) => [
    { validator: (_: unknown, value?: string) => {
      if (mode === "create" && !value) return Promise.reject(new Error(`请输入${field}`));
      if (value && value.length > max) return Promise.reject(new Error(`${field}不能超过${max}个字符`));
      return Promise.resolve();
    } },
  ];

  return <>
    <Card className="r2-filter-card" style={{ marginBottom: 16 }}><div className="r2-filter-grid">
      <Form.Item label="accountID" style={{ marginBottom: 0 }}><Input allowClear value={accountId} onChange={event => setAccountId(event.target.value)} onPressEnter={applyFilter} placeholder="请输入accountID" /></Form.Item>
      <Form.Item label="存储桶名称" style={{ marginBottom: 0 }}><Input allowClear value={bucketName} onChange={event => setBucketName(event.target.value)} onPressEnter={applyFilter} placeholder="请输入存储桶名称" /></Form.Item>
      <Space className="r2-filter-actions"><Button onClick={resetFilter}>重置</Button><Button type="primary" onClick={applyFilter}>筛选</Button></Space>
    </div></Card>
    <Card extra={can("create") ? <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增</Button> : null}>
      {errorMessage ? <Alert type="error" showIcon message={errorMessage} action={<Button size="small" onClick={() => void load()}>重新加载</Button>} /> : <DataTable<R2Row> rowKey="id" columns={columns} dataSource={rows} loading={loading} scroll={{ x: 1380 }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<><div>{filteredEmpty ? "没有找到符合当前条件的R2存储空间" : "暂无R2存储空间"}</div><small>{filteredEmpty ? "请调整筛选条件后重试" : "当前还没有配置Cloudflare R2存储空间"}</small></>}>{filteredEmpty ? <Button onClick={resetFilter}>重置筛选</Button> : can("create") ? <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增</Button> : null}</Empty> }} pagination={{ current: page, pageSize, total, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100], showTotal: count => `共 ${count} 条`, onChange: (nextPage, nextSize) => { setPage(nextPage); setPageSize(nextSize); void load(nextPage, nextSize); } }} />}
    </Card>
    <Modal title={mode === "create" ? "新增R2存储空间" : mode === "edit" ? "编辑R2存储空间" : "查看R2存储空间"} open={Boolean(mode)} width={920} onCancel={closeForm} maskClosable={false} destroyOnHidden styles={{ body: { maxHeight: "72vh", overflowY: "auto" } }} footer={mode === "view" ? <Button onClick={closeForm}>关闭</Button> : <Space><Button onClick={closeForm}>取消</Button><Button type="primary" loading={saving} onClick={() => void submit()}>保存</Button></Space>}>
      <Form form={form} layout="vertical" disabled={mode === "view"} initialValues={{ signedUrlExpireSeconds: 300, status: "ENABLED" }} onValuesChange={() => { if (mode !== "view") setDirty(true); }}>
        <h3 className="r2-form-heading">基础信息</h3><div className="r2-form-grid">
          <Form.Item label="记录编号"><Input disabled value={current?.recordNo} placeholder="保存后自动生成" /></Form.Item>
          <Form.Item label="R2存储空间名称" name="name" rules={[{ required: true, message: "请输入R2存储空间名称" }, { validator: (_, value) => !value || Array.from(value.trim()).length <= 20 ? Promise.resolve() : Promise.reject(new Error("R2存储空间名称不能超过20个汉字")) }]}><Input showCount maxLength={20} placeholder="请输入R2存储空间名称" /></Form.Item>
          <Form.Item label="accountID" name="accountId" rules={[{ required: true, message: "请输入accountID" }, { max: 50, message: "accountID不能超过50个字符" }]}><Input maxLength={50} placeholder="请输入accountID" /></Form.Item>
          <Form.Item label="bucketName" name="bucketName" rules={[{ required: true, message: "请输入bucketName" }, { max: 50, message: "bucketName不能超过50个字符" }]}><Input maxLength={50} placeholder="请输入bucketName" /></Form.Item>
          <Form.Item className="r2-form-span" label="endpoint" name="endpoint" rules={[{ required: true, message: "请输入endpoint" }, { max: 150, message: "endpoint不能超过150个字符" }, { type: "url", message: "请输入正确的endpoint地址" }]}><Input maxLength={150} placeholder="https://xxxxxxxx.r2.cloudflarestorage.com" /></Form.Item>
        </div>
        <h3 className="r2-form-heading">访问凭证</h3><div className="r2-form-grid">
          <Form.Item label="accessKeyId" name="accessKeyId" rules={credentialRules("accessKeyId", 50)} extra={mode === "edit" ? `当前：${current?.accessKeyIdMasked || "已配置"}；留空表示保持原值` : undefined}>{mode === "view" ? <Input /> : <Input.Password maxLength={50} autoComplete="new-password" placeholder={mode === "edit" ? "留空表示保持原Access Key不变" : "请输入accessKeyId"} />}</Form.Item>
          <Form.Item label="secretAccessKey" name="secretAccessKey" rules={credentialRules("secretAccessKey", 100)} extra={mode === "edit" ? "留空表示保持原Secret不变" : undefined}>{mode === "view" ? <Input /> : <Input.Password maxLength={100} autoComplete="new-password" placeholder={mode === "edit" ? "留空表示保持原Secret不变" : "请输入secretAccessKey"} />}</Form.Item>
        </div>
        <h3 className="r2-form-heading">Signed URL</h3><div className="r2-form-grid">
          <Form.Item label="默认有效时间（秒）" name="signedUrlExpireSeconds" rules={[{ required: true, message: "请输入Signed URL有效时间" }, { type: "integer", min: 1, max: 604800, message: "Signed URL有效时间必须为1至604800之间的正整数" }]}><InputNumber min={1} max={604800} precision={0} style={{ width: "100%" }} /></Form.Item>
          <Form.Item label="状态" name="status" rules={[{ required: true, message: "请选择状态" }]}><Select options={[{ value: "ENABLED", label: "启用" }, { value: "DISABLED", label: "禁用" }]} /></Form.Item>
        </div>
        <h3 className="r2-form-heading">系统信息</h3><div className="r2-form-grid">
          <Form.Item label="创建人"><Input disabled value={current?.createdBy?.realName} placeholder="保存后自动生成" /></Form.Item>
          <Form.Item label="创建时间"><Input disabled value={current?.createdAt ? formatTime(current.createdAt) : undefined} placeholder="保存后自动生成" /></Form.Item>
        </div>
      </Form>
    </Modal>
    <UnsavedChangesModal open={discardOpen} title="当前R2配置尚未保存" onKeep={() => setDiscardOpen(false)} onDiscard={() => { setDiscardOpen(false); setMode(null); setDirty(false); }} />
  </>;
}

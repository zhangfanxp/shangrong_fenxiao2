"use client";

import { CalendarOutlined, CheckCircleOutlined, InfoCircleOutlined, TeamOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Checkbox, DatePicker, Empty, Form, Input, message, Modal, Select, Space, Table, Tag, Tooltip } from "antd";
import type { ColumnsType, TableRowSelection } from "antd/es/table/interface";
import dayjs, { type Dayjs } from "dayjs";
import { useCallback, useEffect, useRef, useState } from "react";

type Recipient = { userId: string; username: string; realName: string; roleId: string; roleName: string; phoneMasked: string };
type RoleOption = { id: string; name: string };
type NotificationTypeValue = "" | "GENERAL" | "MID_MONTH_OFFLINE_MEETING" | "MONTHLY_ONLINE_MEETING";
type FormValues = { title: string; content: string; releaseDate: Dayjs; publisherName: string; notificationType: NotificationTypeValue; showAfterLogin: boolean; publishImmediately: boolean };
type SaveSuccessInfo = { releaseDate: string; immediate: boolean; showAfterLogin: boolean };

const meetingNotificationTypes: NotificationTypeValue[] = ["MID_MONTH_OFFLINE_MEETING", "MONTHLY_ONLINE_MEETING"];
const notificationTypeOptions = [
  { value: "", label: "请选择" },
  { value: "GENERAL", label: "普通通知" },
  { value: "MID_MONTH_OFFLINE_MEETING", label: "月中线下会通知" },
  { value: "MONTHLY_ONLINE_MEETING", label: "每月线上会通知" },
];

function newRequestId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function NotificationPublishForm({
  realName,
  today,
  defaultReleaseDate,
  canSave,
  canSelectUsers,
}: {
  realName: string;
  today: string;
  defaultReleaseDate: string;
  canSave: boolean;
  canSelectUsers: boolean;
}) {
  const [form] = Form.useForm<FormValues>();
  const [selectedUsers, setSelectedUsers] = useState<Map<string, Recipient>>(new Map());
  const [draftUsers, setDraftUsers] = useState<Map<string, Recipient>>(new Map());
  const [recipientError, setRecipientError] = useState(false);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [rows, setRows] = useState<Recipient[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [rolesError, setRolesError] = useState(false);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filters, setFilters] = useState({ realName: "", roleIds: [] as string[] });
  const [appliedFilters, setAppliedFilters] = useState({ realName: "", roleIds: [] as string[] });
  const [saving, setSaving] = useState(false);
  const [successInfo, setSuccessInfo] = useState<SaveSuccessInfo | null>(null);
  const requestId = useRef(newRequestId());
  const publishImmediately = Form.useWatch("publishImmediately", form) ?? false;

  const resetForm = useCallback(() => {
    form.resetFields();
    setSelectedUsers(new Map());
    setRecipientError(false);
    requestId.current = newRequestId();
  }, [form]);

  useEffect(() => { resetForm(); }, [resetForm]);

  const loadRoles = useCallback(async () => {
    setRolesLoading(true); setRolesError(false);
    try {
      const response = await fetch("/api/notifications/available-users/roles", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      setRoles(data.roles || []);
    } catch { setRolesError(true); message.error("角色数据加载失败，请稍后重试"); }
    finally { setRolesLoading(false); }
  }, []);

  const loadUsers = useCallback(async (nextPage: number, nextPageSize: number, nextFilters: typeof appliedFilters) => {
    setUsersLoading(true); setUsersError(false);
    try {
      const query = new URLSearchParams({ realName: nextFilters.realName.trim(), page: String(nextPage), pageSize: String(nextPageSize) });
      nextFilters.roleIds.forEach(roleId => query.append("roleIds", roleId));
      const response = await fetch(`/api/notifications/available-users?${query}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      setRows(data.rows || []); setTotal(data.total || 0);
    } catch { setUsersError(true); }
    finally { setUsersLoading(false); }
  }, []);

  const openSelector = () => {
    if (!canSelectUsers) return;
    setDraftUsers(new Map(selectedUsers));
    setSelectorOpen(true);
    setPage(1);
    void loadRoles();
    void loadUsers(1, pageSize, appliedFilters);
  };

  const applySearch = () => {
    const next = { realName: filters.realName.trim(), roleIds: filters.roleIds };
    setAppliedFilters(next); setPage(1); void loadUsers(1, pageSize, next);
  };

  const resetFilters = () => {
    const next = { realName: "", roleIds: [] as string[] };
    setFilters(next); setAppliedFilters(next); setPage(1); void loadUsers(1, pageSize, next);
  };

  const rowSelection: TableRowSelection<Recipient> = {
    selectedRowKeys: [...draftUsers.keys()],
    preserveSelectedRowKeys: true,
    onSelect: (record, selected) => setDraftUsers(previous => {
      const next = new Map(previous);
      if (selected) next.set(record.userId, record); else next.delete(record.userId);
      return next;
    }),
    onSelectAll: (selected, _selectedRows, changedRows) => setDraftUsers(previous => {
      const next = new Map(previous);
      changedRows.forEach(record => { if (selected) next.set(record.userId, record); else next.delete(record.userId); });
      return next;
    }),
  };

  const confirmSelection = () => {
    if (!draftUsers.size) return;
    setSelectedUsers(new Map(draftUsers)); setRecipientError(false); setSelectorOpen(false);
  };

  const hasDraft = () => form.isFieldsTouched() || selectedUsers.size > 0;
  const cancelEditing = () => {
    if (!hasDraft()) { resetForm(); return; }
    Modal.confirm({
      title: "确认取消当前编辑？",
      content: "当前通知内容尚未保存，取消后填写内容将被清空，是否继续？",
      okText: "确认取消",
      cancelText: "继续编辑",
      onOk: resetForm,
    });
  };

  const save = async () => {
    if (!selectedUsers.size) { setRecipientError(true); message.error("请至少选择1位接收人"); }
    try {
      const values = await form.validateFields();
      if (!selectedUsers.size) return;
      setSaving(true);
      const response = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientRequestId: requestId.current,
          title: values.title.trim(),
          recipientUserIds: [...selectedUsers.keys()],
          content: values.content,
          releaseDate: values.releaseDate.format("YYYY-MM-DD"),
          publisherName: values.publisherName.trim(),
          notificationType: values.notificationType,
          showAfterLogin: Boolean(values.showAfterLogin),
          publishImmediately: Boolean(values.publishImmediately),
        }),
      });
      const data = await response.json();
      if (!response.ok) { message.error(data.message || "通知保存失败，请稍后重试"); return; }
      const releaseDate = values.releaseDate.format("YYYY-MM-DD");
      setSuccessInfo({ releaseDate, immediate: Boolean(values.publishImmediately), showAfterLogin: Boolean(values.showAfterLogin) });
    } catch (reason) {
      if (reason instanceof TypeError) message.error("通知保存失败，请稍后重试");
    } finally { setSaving(false); }
  };

  const columns: ColumnsType<Recipient> = [
    { title: "真实姓名", dataIndex: "realName", width: 180 },
    { title: "角色", dataIndex: "roleName", width: 180, render: value => <Tag color="blue">{value}</Tag> },
    { title: "手机号", dataIndex: "phoneMasked", width: 180 },
  ];

  return <>
    <Card className="notification-form-card">
      <Form form={form} layout="vertical" requiredMark initialValues={{ publisherName: realName, releaseDate: dayjs(defaultReleaseDate), notificationType: "", showAfterLogin: false, publishImmediately: false }}>
        <section className="notification-form-section">
          <div className="notification-section-heading"><InfoCircleOutlined /><span><strong>基本信息</strong><small>填写通知内容并指定明确的接收用户</small></span></div>
          <div className="notification-form-grid">
            <Form.Item label="记录编号"><Input size="large" disabled placeholder="保存后自动生成" /></Form.Item>
            <Form.Item label="通知标题" name="title" rules={[
              { required: true, message: "请输入通知标题" },
              { max: 30, message: "通知标题不能超过30个字符" },
              { pattern: /^[\p{Script=Han}A-Za-z0-9-]+$/u, message: "通知标题仅支持汉字、数字、英文字母和“-”" },
            ]}><Input size="large" maxLength={30} showCount placeholder="请输入通知标题" /></Form.Item>
            <Form.Item className="notification-form-span" label="接收人" required validateStatus={recipientError ? "error" : undefined} help={recipientError ? "请至少选择1位接收人" : undefined}>
              <div className={`notification-recipient-box ${recipientError ? "has-error" : ""}`}>
                <div><TeamOutlined /><span>{selectedUsers.size ? <>已选择 <strong>{selectedUsers.size}</strong> 人</> : "尚未选择接收人"}</span></div>
                <Tooltip title={canSelectUsers ? undefined : "暂无接收用户选择权限"}><Button type="primary" ghost onClick={openSelector} disabled={!canSelectUsers}>选择用户</Button></Tooltip>
              </div>
            </Form.Item>
            <div className="notification-form-span notification-type-row">
              <Form.Item label="通知类型" name="notificationType" rules={[{ required: true, message: "请选择通知类型" }]}>
                <Select size="large" options={notificationTypeOptions} onChange={(value: NotificationTypeValue) => { if (meetingNotificationTypes.includes(value)) form.setFieldValue("showAfterLogin", true); }} />
              </Form.Item>
              <Form.Item className="notification-login-display-option" name="showAfterLogin" valuePropName="checked">
                <Checkbox><span><strong>登录后展示通知正文</strong><small>勾选后，接收用户登录相应终端时必须逐条点击“我已知晓”，通知弹窗才会消失</small></span></Checkbox>
              </Form.Item>
            </div>
            <Form.Item className="notification-form-span" label="通知正文" name="content" rules={[{ required: true, message: "请输入通知正文" }, { max: 500, message: "通知正文不能超过500个字符" }]}>
              <Input.TextArea rows={7} maxLength={500} showCount placeholder="请输入通知正文，支持换行和常规符号" />
            </Form.Item>
          </div>
        </section>

        <section className="notification-form-section">
          <div className="notification-section-heading"><CalendarOutlined /><span><strong>发布设置</strong><small>{publishImmediately ? "保存成功后由服务端立即正式发布" : "通知将在所选日期的 06:00 由服务端自动发布"}</small></span></div>
          <div className="notification-form-grid">
            <Form.Item className="notification-form-span notification-immediate-option" name="publishImmediately" valuePropName="checked">
              <Checkbox><span><strong>立即发布</strong><small>勾选后，保存成功即正式发布；是否在用户登录时强制弹窗仍由“登录后展示通知正文”控制</small></span></Checkbox>
            </Form.Item>
            <Form.Item label="发布日期" name="releaseDate" required={!publishImmediately} extra={publishImmediately ? "立即发布时由服务端按上海时区记录当前日期和时间" : "仅可选择未来日期，正式发布时间固定为 06:00"} rules={[{ validator: (_, value) => publishImmediately || value ? Promise.resolve() : Promise.reject(new Error("请选择发布日期")) }]}>
              <DatePicker size="large" style={{ width: "100%" }} format="YYYY-MM-DD" allowClear={false} disabled={publishImmediately} disabledDate={current => current.format("YYYY-MM-DD") <= today} />
            </Form.Item>
            <Form.Item label="发布人" name="publisherName" extra="用于各终端展示，可填写姓名或部门名称" rules={[{ required: true, message: "请输入发布人" }, { max: 10, message: "发布人不能超过10个字符" }]}>
              <Input size="large" maxLength={10} showCount placeholder="请输入发布人" />
            </Form.Item>
          </div>
        </section>

        <section className="notification-form-section">
          <div className="notification-section-heading"><CheckCircleOutlined /><span><strong>系统信息</strong><small>保存成功后由系统自动生成，用户不可修改</small></span></div>
          <div className="notification-form-grid">
            <Form.Item label="创建日期"><Input size="large" disabled placeholder="保存后自动生成" /></Form.Item>
            <Form.Item label="创建人"><Input size="large" disabled placeholder="保存后自动生成" /></Form.Item>
          </div>
        </section>

        {!canSave && <Alert type="warning" showIcon message="当前账号可以访问页面，但没有保存通知的权限" style={{ marginBottom: 18 }} />}
        <div className="notification-form-actions"><Space><Button size="large" onClick={cancelEditing} disabled={saving}>取消</Button><Tooltip title={canSave ? undefined : "暂无发布通知保存权限"}><Button size="large" type="primary" loading={saving} disabled={!canSave} onClick={() => void save()}>{saving ? "保存中..." : "保存"}</Button></Tooltip></Space></div>
      </Form>
    </Card>

    <Modal
      rootClassName="notification-user-modal"
      title={<div><strong>用户选择</strong><span>按姓名和角色筛选平台用户，支持跨页保留已选项</span></div>}
      open={selectorOpen}
      onCancel={() => setSelectorOpen(false)}
      width={960}
      maskClosable={false}
      destroyOnHidden
      footer={<div className="notification-user-footer"><span>已选择 <strong>{draftUsers.size}</strong> 人{draftUsers.size > 0 && <Button type="link" size="small" onClick={() => setDraftUsers(new Map())}>清空已选</Button>}</span><Space><Button onClick={() => setSelectorOpen(false)}>取消</Button><Button type="primary" disabled={!draftUsers.size} onClick={confirmSelection}>选择并返回</Button></Space></div>}
    >
      <div className="notification-user-filters">
        <Input value={filters.realName} onChange={event => setFilters(previous => ({ ...previous, realName: event.target.value }))} onPressEnter={applySearch} allowClear placeholder="请输入姓名" />
        <Select mode="multiple" maxTagCount="responsive" loading={rolesLoading} value={filters.roleIds} onChange={roleIds => setFilters(previous => ({ ...previous, roleIds }))} options={roles.map(role => ({ value: role.id, label: role.name }))} placeholder="全部角色" />
        <Space><Button onClick={resetFilters}>重置筛选</Button><Button type="primary" onClick={applySearch}>查询</Button></Space>
      </div>
      {rolesError && <Alert type="error" showIcon message="角色数据加载失败，请稍后重试" action={<Button size="small" onClick={() => void loadRoles()}>重新加载</Button>} style={{ marginBottom: 12 }} />}
      {usersError ? <Alert type="error" showIcon message="用户数据加载失败，请稍后重试" action={<Button size="small" onClick={() => void loadUsers(page, pageSize, appliedFilters)}>重新加载</Button>} /> : <Table<Recipient>
        rowKey="userId"
        size="middle"
        loading={{ spinning: usersLoading, tip: "用户数据加载中..." }}
        rowSelection={rowSelection}
        columns={columns}
        dataSource={rows}
        scroll={{ x: 720, y: 390 }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<><div>没有找到符合当前条件的用户</div><Button type="link" onClick={resetFilters}>重置筛选</Button></>} /> }}
        pagination={{ current: page, pageSize, total, showSizeChanger: true, pageSizeOptions: [20, 50, 100], showTotal: count => `共 ${count} 人`, onChange: (nextPage, nextPageSize) => { setPage(nextPage); setPageSize(nextPageSize); void loadUsers(nextPage, nextPageSize, appliedFilters); } }}
      />}
    </Modal>
    <Modal
      rootClassName="notification-save-success-modal"
      title="温馨提示"
      open={Boolean(successInfo)}
      closable={false}
      maskClosable={false}
      keyboard={false}
      centered
      width={460}
      onCancel={() => undefined}
      footer={<Button className="notification-save-success-button" type="primary" onClick={() => { setSuccessInfo(null); resetForm(); }}>我知道了</Button>}
    >
      <div className="notification-save-success-content"><CheckCircleOutlined /><div><strong>{successInfo?.immediate ? "通知已立即发布" : "通知已保存"}</strong>{successInfo?.immediate ? <><p>接收人现在可以在通知列表中查看该通知。</p>{successInfo.showAfterLogin && <p>接收人下次登录相应终端时，将自动弹窗展示通知正文。</p>}</> : <p>该通知将于 <b>{successInfo?.releaseDate} 06:00</b> 正式发布。</p>}</div></div>
    </Modal>
  </>;
}

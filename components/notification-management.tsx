"use client";

import { DownloadOutlined, EyeOutlined, SearchOutlined, StopOutlined, WarningOutlined } from "@ant-design/icons";
import { Alert, Button, Card, DatePicker, Descriptions, Empty, Form, Input, message, Modal, Skeleton, Space, Table, Tabs, Tag, Tooltip } from "antd";
import type { ColumnsType, TableRowSelection } from "antd/es/table/interface";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import { useCallback, useEffect, useRef, useState } from "react";

type NotificationStatus = "PENDING" | "PUBLISHED" | "STOPPED" | "FAILED";
type NotificationRow = { id: string; recordNo: string; title: string; readCount: number; unreadCount: number; releaseDate: string; publisherName: string; createdAt: string; status: NotificationStatus };
type Filters = { title: string; releaseStartDate: string; releaseEndDate: string; publisherName: string };
type FormValues = { title?: string; releaseStartDate?: Dayjs | null; releaseEndDate?: Dayjs | null; publisherName?: string };
type Detail = { id: string; recordNo: string; title: string; showAfterLogin: boolean; content: string; releaseDate: string; releaseAt: string; publisherName: string; createdAt: string; createdByName: string; status: NotificationStatus; readCount: number; unreadCount: number };
type PersonRow = { id: string; realName: string; role: string; readAt: string | null };

const emptyFilters: Filters = { title: "", releaseStartDate: "", releaseEndDate: "", publisherName: "" };

function responseFileName(response: Response) {
  const encoded = response.headers.get("Content-Disposition")?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  return encoded ? decodeURIComponent(encoded) : `通知管理_${dayjs().format("YYYYMMDD_HHmmss")}.xlsx`;
}

export function NotificationManagement({ permissions }: { permissions: string[] }) {
  const hasAll = permissions.includes("*") || permissions.includes("notifications:manage");
  const canView = hasAll || permissions.includes("notifications:manage:view");
  const canExport = hasAll || permissions.includes("notifications:manage:export");
  const canStop = hasAll || permissions.includes("notifications:manage:stop");
  const [form] = Form.useForm<FormValues>();
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [exporting, setExporting] = useState(false);
  const [detailId, setDetailId] = useState<string>();
  const [detail, setDetail] = useState<Detail>();
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const [activeTab, setActiveTab] = useState("content");
  const [readPeople, setReadPeople] = useState<PersonRow[]>();
  const [unreadPeople, setUnreadPeople] = useState<PersonRow[]>();
  const [peopleLoading, setPeopleLoading] = useState<"read" | "unread">();
  const [peopleError, setPeopleError] = useState<"read" | "unread">();
  const [stopRow, setStopRow] = useState<NotificationRow>();
  const [stopping, setStopping] = useState(false);
  const requestSequence = useRef(0);

  const load = useCallback(async (nextPage = page, nextPageSize = pageSize, nextFilters = filters) => {
    const sequence = ++requestSequence.current;
    setLoading(true); setLoadError(false);
    try {
      const query = new URLSearchParams({ page: String(nextPage), pageSize: String(nextPageSize) });
      Object.entries(nextFilters).forEach(([key, value]) => { if (value) query.set(key, value); });
      const response = await fetch(`/api/notifications/manage?${query}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "通知记录加载失败，请稍后重试");
      if (sequence !== requestSequence.current) return;
      setRows(data.rows || []); setTotal(data.total || 0);
    } catch (reason) {
      if (sequence === requestSequence.current) {
        setLoadError(true);
        message.error(reason instanceof Error ? reason.message : "通知记录加载失败，请稍后重试");
      }
    } finally { if (sequence === requestSequence.current) setLoading(false); }
  }, [filters, page, pageSize]);

  useEffect(() => { void load(1, 20, emptyFilters); }, []);

  const readFilters = (): Filters | null => {
    const values = form.getFieldsValue();
    const next: Filters = {
      title: values.title?.trim() || "",
      releaseStartDate: values.releaseStartDate?.format("YYYY-MM-DD") || "",
      releaseEndDate: values.releaseEndDate?.format("YYYY-MM-DD") || "",
      publisherName: values.publisherName?.trim() || "",
    };
    if (next.releaseStartDate && next.releaseEndDate && next.releaseStartDate > next.releaseEndDate) {
      message.warning("发布开始日期不能晚于发布截止日期");
      return null;
    }
    return next;
  };

  const applyFilters = () => {
    const next = readFilters();
    if (!next) return;
    setFilters(next); setPage(1); setSelectedRowKeys([]); void load(1, pageSize, next);
  };
  const resetFilters = () => {
    form.resetFields(); setFilters(emptyFilters); setPage(1); setSelectedRowKeys([]); void load(1, pageSize, emptyFilters);
  };

  const exportRows = async () => {
    setExporting(true);
    try {
      const response = await fetch("/api/notifications/manage/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notificationIds: selectedRowKeys.length ? selectedRowKeys : undefined, filters }) });
      if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.message || "通知记录导出失败，请稍后重试"); }
      const blob = await response.blob(); const href = URL.createObjectURL(blob); const link = document.createElement("a");
      link.href = href; link.download = responseFileName(response); document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(href);
      message.success(`导出成功，共导出 ${selectedRowKeys.length || total} 条通知记录`);
    } catch (reason) { message.error(reason instanceof Error ? reason.message : "通知记录导出失败，请稍后重试"); }
    finally { setExporting(false); }
  };

  const loadPeople = async (id: string, type: "read" | "unread") => {
    setPeopleLoading(type); setPeopleError(undefined);
    try {
      const response = await fetch(`/api/notifications/manage/${id}?people=${type}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `${type === "read" ? "已读" : "未读"}人员加载失败，请稍后重试`);
      if (type === "read") setReadPeople(data.rows || []); else setUnreadPeople(data.rows || []);
    } catch (reason) {
      setPeopleError(type);
      message.error(reason instanceof Error ? reason.message : `${type === "read" ? "已读" : "未读"}人员加载失败，请稍后重试`);
    } finally { setPeopleLoading(undefined); }
  };

  const openDetail = async (id: string) => {
    setDetailId(id); setDetail(undefined); setDetailError(false); setDetailLoading(true); setActiveTab("content"); setReadPeople(undefined); setUnreadPeople(undefined); setPeopleError(undefined);
    try {
      const response = await fetch(`/api/notifications/manage/${id}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "通知详情加载失败，请稍后重试");
      setDetail(data);
    } catch (reason) { setDetailError(true); message.error(reason instanceof Error ? reason.message : "通知详情加载失败，请稍后重试"); }
    finally { setDetailLoading(false); }
  };

  const switchTab = (key: string) => {
    setActiveTab(key);
    if (!detailId) return;
    if (key === "read" && readPeople === undefined) void loadPeople(detailId, "read");
    if (key === "unread" && unreadPeople === undefined) void loadPeople(detailId, "unread");
  };

  const stopNotification = async () => {
    if (!stopRow) return;
    setStopping(true);
    try {
      const response = await fetch(`/api/notifications/manage/${stopRow.id}/stop`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "通知停止失败，请稍后重试");
      message.success("通知已停止，未读接收人将不再看到该通知"); setStopRow(undefined); void load(page, pageSize, filters);
    } catch (reason) { message.error(reason instanceof Error ? reason.message : "通知停止失败，请稍后重试"); }
    finally { setStopping(false); }
  };

  const peopleColumns: ColumnsType<PersonRow> = [
    { title: "真实姓名", dataIndex: "realName", width: 180 }, { title: "角色", dataIndex: "role", ellipsis: true },
    ...(activeTab === "read" ? [{ title: "首次阅读时间", dataIndex: "readAt", width: 180 }] : []),
  ];
  const columns: ColumnsType<NotificationRow> = [
    { title: "记录编号", dataIndex: "recordNo", width: 145, fixed: "left" },
    { title: "通知标题", dataIndex: "title", width: 260, ellipsis: { showTitle: false }, render: value => <Tooltip title={value}>{value}</Tooltip> },
    { title: "已读数量", dataIndex: "readCount", width: 100, align: "center", render: value => <Tag color="success">{value}</Tag> },
    { title: "未读数量", dataIndex: "unreadCount", width: 100, align: "center", render: value => <Tag color={value ? "warning" : "default"}>{value}</Tag> },
    { title: "发布日期", dataIndex: "releaseDate", width: 125 }, { title: "发布人", dataIndex: "publisherName", width: 150, ellipsis: true },
    { title: "创建日期", dataIndex: "createdAt", width: 175 },
    { title: "操作", key: "actions", width: 145, fixed: "right", render: (_, row) => <Space size={2} className="table-actions">
      {canView && <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => void openDetail(row.id)}>查看</Button>}
      {canStop && (row.status === "PENDING" || row.status === "PUBLISHED") ? <Button type="link" danger size="small" icon={<StopOutlined />} onClick={() => setStopRow(row)}>停止</Button> : row.status === "STOPPED" ? <span className="notification-stopped-text">已停止</span> : null}
    </Space> },
  ];
  const rowSelection: TableRowSelection<NotificationRow> = { selectedRowKeys, preserveSelectedRowKeys: true, onChange: setSelectedRowKeys, columnWidth: 48 };

  const peopleContent = (type: "read" | "unread") => {
    const data = type === "read" ? readPeople : unreadPeople;
    const error = peopleError === type;
    if (peopleLoading === type && data === undefined) return <Skeleton active paragraph={{ rows: 6 }} />;
    if (error) return <Alert type="error" showIcon message={`${type === "read" ? "已读" : "未读"}人员加载失败，请稍后重试`} action={<Button size="small" onClick={() => detailId && void loadPeople(detailId, type)}>重新加载</Button>} />;
    return <Table<PersonRow> rowKey="id" size="small" pagination={false} columns={peopleColumns} dataSource={data || []} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={type === "read" ? "当前通知暂无已读用户" : "当前通知所有接收人均已阅读"} /> }} scroll={{ y: 360 }} />;
  };

  return <>
    <Card className="notification-manage-filter-card">
      <Form form={form} layout="vertical"><div className="notification-manage-filter-grid">
        <Form.Item label="通知标题" name="title"><Input allowClear placeholder="请输入通知标题" onPressEnter={applyFilters} /></Form.Item>
        <Form.Item label="发布开始日期" name="releaseStartDate"><DatePicker format="YYYY-MM-DD" placeholder="开始日期" /></Form.Item>
        <Form.Item label="发布截止日期" name="releaseEndDate"><DatePicker format="YYYY-MM-DD" placeholder="截止日期" /></Form.Item>
        <Form.Item label="发布人" name="publisherName"><Input allowClear placeholder="请输入发布人" onPressEnter={applyFilters} /></Form.Item>
        <div className="notification-manage-filter-actions"><Space><Button onClick={resetFilters}>重置</Button><Button type="primary" icon={<SearchOutlined />} onClick={applyFilters}>筛选</Button></Space></div>
      </div></Form>
    </Card>
    <Card className="notification-manage-list-card">
      <div className="notification-manage-toolbar"><span>已选择 <strong>{selectedRowKeys.length}</strong> 条</span>{canExport && <Button icon={<DownloadOutlined />} loading={exporting} onClick={() => void exportRows()}>{exporting ? "导出中..." : "批量导出"}</Button>}</div>
      {loadError ? <Alert type="error" showIcon message="通知记录加载失败，请稍后重试" action={<Button size="small" onClick={() => void load()}>重新加载</Button>} /> : <Table<NotificationRow> rowKey="id" dataSource={rows} loading={loading} columns={columns} rowSelection={rowSelection} scroll={{ x: 1250 }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={Object.values(filters).some(Boolean) ? <><div>没有找到符合当前条件的通知</div><small>请调整筛选条件后重试</small><div><Button type="link" onClick={resetFilters}>重置筛选</Button></div></> : "暂无通知记录"} /> }} pagination={{ current: page, pageSize, total, showSizeChanger: true, pageSizeOptions: [20, 50, 100], showTotal: value => `共 ${value} 条`, onChange: (nextPage, nextSize) => { const targetPage = nextSize !== pageSize ? 1 : nextPage; setPage(targetPage); setPageSize(nextSize); void load(targetPage, nextSize, filters); } }} />}
    </Card>

    <Modal className="notification-detail-modal" width={900} open={!!detailId} title="查看通知" onCancel={() => setDetailId(undefined)} footer={<Button onClick={() => setDetailId(undefined)}>关闭</Button>}>
      {detailLoading ? <Skeleton active paragraph={{ rows: 10 }} /> : detailError ? <Alert type="error" showIcon message="通知详情加载失败，请稍后重试" action={<Button size="small" onClick={() => detailId && void openDetail(detailId)}>重新加载</Button>} /> : detail && <Tabs activeKey={activeTab} onChange={switchTab} items={[
        { key: "content", label: "通知内容", children: <div className="notification-detail-content"><Descriptions bordered size="small" column={2}><Descriptions.Item label="记录编号">{detail.recordNo}</Descriptions.Item><Descriptions.Item label="通知标题">{detail.title}</Descriptions.Item><Descriptions.Item label="登录后展示">{detail.showAfterLogin ? "是" : "否"}</Descriptions.Item><Descriptions.Item label="发布日期">{detail.releaseDate}</Descriptions.Item><Descriptions.Item label="发布人">{detail.publisherName}</Descriptions.Item><Descriptions.Item label="创建日期">{detail.createdAt}</Descriptions.Item><Descriptions.Item label="创建人">{detail.createdByName}</Descriptions.Item><Descriptions.Item label="正式发布时间">{detail.releaseAt}</Descriptions.Item><Descriptions.Item label="通知正文" span={2}><div className="notification-detail-body">{detail.content}</div></Descriptions.Item></Descriptions></div> },
        { key: "read", label: `已读人（${detail.readCount}）`, children: peopleContent("read") },
        { key: "unread", label: `未读人（${detail.unreadCount}）`, children: peopleContent("unread") },
      ]} />}
    </Modal>

    <Modal open={!!stopRow} title={<Space><WarningOutlined style={{ color: "#ff4d4f" }} />温馨提示</Space>} onCancel={() => !stopping && setStopRow(undefined)} closable={!stopping} maskClosable={!stopping} footer={<Space><Button disabled={stopping} onClick={() => setStopRow(undefined)}>我再想想</Button><Button danger type="primary" loading={stopping} onClick={() => void stopNotification()}>{stopping ? "停止中..." : "我知道了，继续停止"}</Button></Space>}>
      <Alert type="error" showIcon message="停止操作不可逆" description={stopRow ? `${stopRow.recordNo} · ${stopRow.title}` : undefined} />
      <div className="notification-stop-copy"><p>通知停止后，所有尚未阅读该通知的用户将不再看到当前通知。</p><p>已经阅读用户的历史阅读记录不会被删除，已读和未读人员名单也会继续保留。</p><p>如需再次发布相同内容，请创建一条新的通知。请谨慎操作。</p></div>
    </Modal>
  </>;
}

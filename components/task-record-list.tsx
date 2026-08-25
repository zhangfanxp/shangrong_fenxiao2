"use client";

import { DeleteOutlined, DownloadOutlined, EyeOutlined, ReloadOutlined, SearchOutlined, WarningOutlined } from "@ant-design/icons";
import { Alert, Button, Card, DatePicker, Descriptions, Empty, Form, Image, Input, message, Modal, Select, Skeleton, Space, Table, Tag } from "antd";
import type { ColumnsType, TableRowSelection } from "antd/es/table/interface";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import { useCallback, useEffect, useRef, useState } from "react";

type TaskStatus = "COMPLETED" | "PENDING";
type TaskType = "DAILY" | "WEEKLY" | "MONTHLY" | "TEMPORARY";
type TaskRecordRow = {
  id: string;
  recordNo: string;
  taskName: string;
  taskType: TaskType | null;
  taskTypeLabel: string;
  executor: string;
  includeCompletionRate: boolean;
  createdAt: string;
  submittedAt: string;
  status: TaskStatus;
};
type Filters = { status: "" | TaskStatus; taskName: string; taskType: "" | TaskType; executorKeyword: string; submitStartDate: string; submitEndDate: string };
type FormValues = { status?: TaskStatus; taskName?: string; taskType?: TaskType; executorKeyword?: string; submitStartDate?: Dayjs | null; submitEndDate?: Dayjs | null };
type TaskDetailItem = {
  id: string;
  itemName: string;
  componentType: "attachment" | "input" | "select";
  dataType: "photo" | "video" | "document" | "amount" | "quantity" | null;
  description: string;
  required: boolean;
  weight: number;
  value: string | null;
  attachmentName: string | null;
  attachmentMimeType: string | null;
  attachmentUrl: string | null;
  sortOrder: number;
};
type TaskDetail = {
  id: string;
  recordNo: string;
  taskName: string;
  taskTypeLabel: string;
  executor: string;
  includeCompletionRate: boolean;
  createdAt: string;
  submittedAt: string;
  status: "COMPLETED";
  configVersion: number;
  items: TaskDetailItem[];
};

const emptyFilters: Filters = { status: "", taskName: "", taskType: "", executorKeyword: "", submitStartDate: "", submitEndDate: "" };
const taskTypeOptions = [
  { value: "DAILY", label: "日任务" },
  { value: "WEEKLY", label: "周任务" },
  { value: "MONTHLY", label: "月任务" },
  { value: "TEMPORARY", label: "临时任务" },
] satisfies { value: TaskType; label: string }[];

function responseFileName(response: Response) {
  const encoded = response.headers.get("Content-Disposition")?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  return encoded ? decodeURIComponent(encoded) : `任务记录_${dayjs().format("YYYYMMDD_HHmmss")}.xlsx`;
}

function AttachmentResult({ item }: { item: TaskDetailItem }) {
  if (!item.attachmentName) return <span className="task-record-empty-value">未提交附件</span>;
  if (!item.attachmentUrl) return <Alert type="warning" showIcon message={`${item.attachmentName} 暂时无法访问，请稍后重新打开详情`} />;
  if (item.dataType === "photo") return <Image className="task-record-image" width={180} src={item.attachmentUrl} alt={item.attachmentName} />;
  if (item.dataType === "video") return <video className="task-record-video" controls preload="metadata" src={item.attachmentUrl}>当前浏览器不支持视频播放</video>;
  return <Button href={item.attachmentUrl} target="_blank" rel="noreferrer">查看附件：{item.attachmentName}</Button>;
}

export function TaskRecordList({ permissions }: { permissions: string[] }) {
  const hasAll = permissions.includes("*");
  const canView = hasAll || permissions.includes("tasks:records:view");
  const canExport = hasAll || permissions.includes("tasks:records:export");
  const canDelete = hasAll || permissions.includes("tasks:records:delete");
  const [form] = Form.useForm<FormValues>();
  const [rows, setRows] = useState<TaskRecordRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [exporting, setExporting] = useState(false);
  const [detailId, setDetailId] = useState<string>();
  const [detail, setDetail] = useState<TaskDetail>();
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const [deleteRow, setDeleteRow] = useState<TaskRecordRow>();
  const [deleting, setDeleting] = useState(false);
  const listRequestSequence = useRef(0);

  const load = useCallback(async (nextPage = page, nextPageSize = pageSize, nextFilters = filters, background = false) => {
    const requestSequence = ++listRequestSequence.current;
    if (!background) { setLoading(true); setLoadError(false); }
    try {
      const query = new URLSearchParams({ page: String(nextPage), pageSize: String(nextPageSize) });
      Object.entries(nextFilters).forEach(([key, value]) => { if (value) query.set(key, value); });
      if (background) query.set("_background", "1");
      const response = await fetch(`/api/task-records?${query}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "任务记录加载失败，请稍后重试");
      if (requestSequence !== listRequestSequence.current) return;
      setRows(data.rows); setTotal(data.total);
    } catch (reason) {
      if (!background && requestSequence === listRequestSequence.current) {
        setLoadError(true);
        message.error(reason instanceof Error ? reason.message : "任务记录加载失败，请稍后重试");
      }
    } finally {
      if (!background && requestSequence === listRequestSequence.current) setLoading(false);
    }
  }, [filters, page, pageSize]);

  useEffect(() => { void load(1, 20, emptyFilters); }, []);
  useEffect(() => {
    const refreshWhenVisible = () => { if (document.visibilityState === "visible") void load(page, pageSize, filters, true); };
    const timer = window.setInterval(refreshWhenVisible, 30_000);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refreshWhenVisible); document.removeEventListener("visibilitychange", refreshWhenVisible); };
  }, [filters, load, page, pageSize]);

  const readFilters = (): Filters | null => {
    const values = form.getFieldsValue();
    const next: Filters = {
      status: values.status || "",
      taskName: values.taskName?.trim() || "",
      taskType: values.taskType || "",
      executorKeyword: values.executorKeyword?.trim() || "",
      submitStartDate: values.submitStartDate?.format("YYYY-MM-DD") || "",
      submitEndDate: values.submitEndDate?.format("YYYY-MM-DD") || "",
    };
    if (next.submitStartDate && next.submitEndDate && next.submitStartDate > next.submitEndDate) {
      message.warning("任务提交开始日期不能晚于任务提交截止日期");
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
      const response = await fetch("/api/task-records/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskInstanceIds: selectedRowKeys.length ? selectedRowKeys : undefined, filters }) });
      if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.message || "任务记录导出失败，请稍后重试"); }
      const blob = await response.blob();
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href; link.download = responseFileName(response); document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(href);
      message.success(`导出成功，共导出 ${selectedRowKeys.length || total} 条任务记录`);
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : "任务记录导出失败，请稍后重试");
    } finally { setExporting(false); }
  };

  const openDetail = async (id: string) => {
    setDetailId(id); setDetail(undefined); setDetailError(false); setDetailLoading(true);
    try {
      const response = await fetch(`/api/task-records/${id}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "任务详情加载失败，请稍后重试");
      setDetail(data);
    } catch (reason) {
      setDetailError(true); message.error(reason instanceof Error ? reason.message : "任务详情加载失败，请稍后重试");
    } finally { setDetailLoading(false); }
  };

  const performDelete = async () => {
    if (!deleteRow) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/task-records/${deleteRow.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "任务记录删除失败，请稍后重试");
      message.success(data.message);
      setDeleteRow(undefined); setSelectedRowKeys(keys => keys.filter(key => key !== deleteRow.id));
      const nextPage = rows.length === 1 && page > 1 ? page - 1 : page;
      setPage(nextPage); void load(nextPage, pageSize, filters);
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : "任务记录删除失败，请稍后重试");
    } finally { setDeleting(false); }
  };

  const columns: ColumnsType<TaskRecordRow> = [
    { title: "记录编号", dataIndex: "recordNo", width: 150, fixed: "left" },
    { title: "任务名称", dataIndex: "taskName", width: 220, ellipsis: true },
    { title: "任务类型", dataIndex: "taskTypeLabel", width: 100 },
    { title: "任务执行人", dataIndex: "executor", width: 180, ellipsis: true },
    { title: "参与核算完成率", dataIndex: "includeCompletionRate", width: 145, render: value => <Tag color={value ? "blue" : "default"}>{value ? "参与" : "不参与"}</Tag> },
    { title: "任务创建日期", dataIndex: "createdAt", width: 170 },
    { title: "任务提交日期", dataIndex: "submittedAt", width: 170 },
    { title: "任务状态", dataIndex: "status", width: 100, render: value => <Tag color={value === "COMPLETED" ? "success" : "warning"}>{value === "COMPLETED" ? "已完成" : "未完成"}</Tag> },
    { title: "操作", key: "actions", width: canView && canDelete ? 128 : 76, fixed: "right", render: (_, row) => <Space size={4} className="table-actions">{canView && row.status === "COMPLETED" && <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => void openDetail(row.id)}>查看</Button>}{canDelete && <Button type="link" danger size="small" icon={<DeleteOutlined />} onClick={() => setDeleteRow(row)}>删除</Button>}</Space> },
  ];
  const rowSelection: TableRowSelection<TaskRecordRow> = { selectedRowKeys, preserveSelectedRowKeys: true, onChange: setSelectedRowKeys, columnWidth: 48 };

  return <>
    <Card className="task-record-filter-card">
      <Form form={form} layout="vertical">
        <div className="task-record-filter-grid">
          <Form.Item label="任务状态" name="status"><Select allowClear placeholder="全部" options={[{ value: "COMPLETED", label: "已完成" }, { value: "PENDING", label: "未完成" }]} /></Form.Item>
          <Form.Item label="任务名称" name="taskName"><Input allowClear placeholder="请输入任务名称" onPressEnter={applyFilters} /></Form.Item>
          <Form.Item label="任务类型" name="taskType"><Select allowClear placeholder="全部" options={taskTypeOptions} /></Form.Item>
          <Form.Item label="任务执行人" name="executorKeyword"><Input allowClear placeholder="请输入执行人姓名" onPressEnter={applyFilters} /></Form.Item>
          <Form.Item label="提交开始日期" name="submitStartDate"><DatePicker format="YYYY-MM-DD" placeholder="开始日期" /></Form.Item>
          <Form.Item label="提交截止日期" name="submitEndDate"><DatePicker format="YYYY-MM-DD" placeholder="截止日期" /></Form.Item>
          <div className="task-record-filter-actions"><Space><Button onClick={resetFilters}>重置</Button><Button type="primary" icon={<SearchOutlined />} onClick={applyFilters}>筛选</Button></Space></div>
        </div>
      </Form>
    </Card>
    <Card className="task-record-list-card">
      <div className="task-record-toolbar"><span>已选择 <strong>{selectedRowKeys.length}</strong> 条</span><Space><Button icon={<ReloadOutlined />} disabled={exporting} onClick={() => void load()}>刷新</Button>{canExport && <Button icon={<DownloadOutlined />} loading={exporting} onClick={() => void exportRows()}>{exporting ? "导出中..." : "批量导出"}</Button>}</Space></div>
      {loadError ? <Alert type="error" showIcon message="任务记录加载失败，请稍后重试" action={<Button size="small" onClick={() => void load()}>重新加载</Button>} /> : <Table<TaskRecordRow>
        rowKey="id" dataSource={rows} loading={loading} columns={columns} rowSelection={rowSelection} scroll={{ x: 1410 }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={Object.values(filters).some(Boolean) ? <><div>没有找到符合当前条件的任务记录</div><small>请调整筛选条件后重试</small><div><Button type="link" onClick={resetFilters}>重置筛选</Button></div></> : "暂无任务记录"} /> }}
        pagination={{ current: page, pageSize, total, showSizeChanger: true, pageSizeOptions: [20, 50, 100], showTotal: value => `共 ${value} 条`, onChange: (nextPage, nextSize) => { const targetPage = nextSize !== pageSize ? 1 : nextPage; setPage(targetPage); setPageSize(nextSize); void load(targetPage, nextSize, filters); } }}
      />}
    </Card>

    <Modal className="task-record-detail-modal" width={1100} open={!!detailId} title="查看任务" onCancel={() => setDetailId(undefined)} footer={<Button onClick={() => setDetailId(undefined)}>关闭</Button>}>
      {detailLoading ? <Skeleton active paragraph={{ rows: 10 }} /> : detailError ? <Alert type="error" showIcon message="任务详情加载失败，请稍后重试" action={<Button size="small" onClick={() => detailId && void openDetail(detailId)}>重新加载</Button>} /> : detail && <div className="task-record-detail">
        <h3>任务信息</h3>
        <Descriptions bordered size="small" column={4}>
          <Descriptions.Item label="记录编号">{detail.recordNo}</Descriptions.Item><Descriptions.Item label="任务名称">{detail.taskName}</Descriptions.Item><Descriptions.Item label="任务类型">{detail.taskTypeLabel}</Descriptions.Item><Descriptions.Item label="任务执行人">{detail.executor}</Descriptions.Item>
          <Descriptions.Item label="参与核算完成率"><Tag color={detail.includeCompletionRate ? "blue" : "default"}>{detail.includeCompletionRate ? "参与" : "不参与"}</Tag></Descriptions.Item><Descriptions.Item label="任务创建日期">{detail.createdAt}</Descriptions.Item><Descriptions.Item label="任务提交日期">{detail.submittedAt}</Descriptions.Item><Descriptions.Item label="任务状态"><Tag color="success">已完成</Tag></Descriptions.Item>
        </Descriptions>
        <div className="task-record-detail-heading"><h3>提交内容</h3><Tag color="blue">配置版本 V{detail.configVersion}</Tag></div>
        {detail.items.length ? detail.items.map((item, index) => <section className="task-record-detail-item" key={item.id}>
          <div className="task-record-detail-index">{index + 1}</div>
          <div className="task-record-detail-content"><div className="task-record-detail-title">{item.itemName}{item.required && <span>*</span>}<Tag>{item.weight} 分</Tag></div>{item.description && <p>{item.description}</p>}<div className="task-record-result">{item.componentType === "attachment" ? <AttachmentResult item={item} /> : item.componentType === "select" && item.value ? <Tag color="blue">{item.value}</Tag> : <span className={item.value ? "" : "task-record-empty-value"}>{item.value || "未填写"}</span>}</div></div>
        </section>) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="该任务未保存提交明细" />}
      </div>}
    </Modal>

    <Modal open={!!deleteRow} title={<Space><WarningOutlined style={{ color: "#ff4d4f" }} />温馨提示</Space>} onCancel={() => !deleting && setDeleteRow(undefined)} closable={!deleting} maskClosable={!deleting} footer={<Space><Button disabled={deleting} onClick={() => setDeleteRow(undefined)}>我再想想</Button><Button danger type="primary" loading={deleting} onClick={() => void performDelete()}>{deleting ? "删除中..." : "我知道了，继续删除"}</Button></Space>}>
      <Alert type="error" showIcon message="删除操作不可逆" description={deleteRow ? `${deleteRow.taskName} · ${deleteRow.executor} · ${deleteRow.status === "COMPLETED" ? "已完成" : "未完成"}` : undefined} />
      <div className="task-record-delete-copy"><p>一旦删除成功，当前任务记录及已经提交的任务数据将无法恢复。</p><p>删除后，当前用户的此项任务将恢复为“未生成”状态，需要重新生成任务后才能再次执行。</p><p>请谨慎操作。</p></div>
    </Modal>
  </>;
}

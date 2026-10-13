"use client";

import { DeleteOutlined, DownloadOutlined, EditOutlined, EyeOutlined, LoadingOutlined, ReloadOutlined, RobotOutlined, SearchOutlined, UploadOutlined, WarningOutlined } from "@ant-design/icons";
import { Alert, Button, Card, DatePicker, Descriptions, Empty, Form, Image, Input, message, Modal, Select, Skeleton, Space, Spin, Table, Tag, Upload } from "antd";
import type { ColumnsType, TableRowSelection } from "antd/es/table/interface";
import type { UploadProps } from "antd";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { optimizeTaskPhoto, putFileWithProgress } from "@/lib/client/store-h5-direct-upload";
import { optimizeTaskVideo } from "@/lib/client/task-video-compression";
import { taskAttachmentMaxBytes, taskAttachmentMaxMb } from "@/lib/task-attachment-rules";

type TaskStatus = "COMPLETED" | "PENDING" | "OVERDUE";
type TaskType = "DAILY" | "WEEKLY" | "MONTHLY" | "TEMPORARY";
type TaskRecordRow = {
  id: string;
  recordNo: string;
  taskName: string;
  taskType: TaskType | null;
  taskTypeLabel: string;
  executor: string;
  targetEmployee: string;
  includeCompletionRate: boolean;
  createdAt: string;
  submittedAt: string;
  status: TaskStatus;
  hasAiAnalysis: boolean;
};
type Filters = { status: "" | TaskStatus; taskName: string; taskType: "" | TaskType; executorKeyword: string; submitStartDate: string; submitEndDate: string };
type FormValues = { status?: TaskStatus; taskName?: string; taskType?: TaskType; executorKeyword?: string; submitStartDate?: Dayjs | null; submitEndDate?: Dayjs | null };
type TaskDetailAttachment = { id: string; name: string; mimeType: string | null; objectKey: string; url: string | null };
type TaskDetailItem = {
  id: string;
  itemName: string;
  componentType: "attachment" | "input" | "select";
  dataType: "photo" | "video" | "document" | "amount" | "quantity" | "score" | "text" | null;
  description: string;
  required: boolean;
  weight: number;
  value: string | null;
  attachmentObjectKey: string | null;
  attachmentName: string | null;
  attachmentMimeType: string | null;
  attachmentUrl: string | null;
  attachments: TaskDetailAttachment[];
  aiAnalysisType: string | null;
  aiAnalysisPrompt: string | null;
  aiAnalysisStatus: "RUNNING" | "SUCCESS" | "FAILED" | null;
  aiAnalysisResult: string | null;
  aiUnqualifiedReasonDescription: string | null;
  aiAnalysisFailureReason: string | null;
  aiAnalyzedAt: string;
  aiAnalyzedByName: string | null;
  sortOrder: number;
};
type TaskDetail = {
  id: string;
  recordNo: string;
  taskName: string;
  taskTypeLabel: string;
  executor: string;
  targetEmployee: string;
  includeCompletionRate: boolean;
  createdAt: string;
  submittedAt: string;
  status: "COMPLETED";
  configVersion: number;
  editable: boolean;
  items: TaskDetailItem[];
};
type EditAttachment = {
  attachmentId?: string;
  name: string;
  status: "uploading" | "success" | "error";
  progress: number;
  message?: string;
};
type AiAnalysisSummary = {
  message: string;
  selectedRecordCount: number;
  selectedDayCount: number;
  analysisItemCount: number;
  successCount: number;
  failureCount: number;
  failures: Array<{ recordNo: string; itemName: string; reason: string }>;
};
type AiAnalysisDialog =
  | { phase: "RUNNING"; selectedRecordCount: number }
  | { phase: "SUCCESS"; summary: AiAnalysisSummary }
  | { phase: "WARNING" | "ERROR"; message: string };

const emptyFilters: Filters = { status: "", taskName: "", taskType: "", executorKeyword: "", submitStartDate: "", submitEndDate: "" };
const taskTypeOptions = [
  { value: "DAILY", label: "日任务" },
  { value: "WEEKLY", label: "周任务" },
  { value: "MONTHLY", label: "月任务" },
  { value: "TEMPORARY", label: "临时任务" },
] satisfies { value: TaskType; label: string }[];
const taskStatusMeta: Record<TaskStatus, { label: string; color: "success" | "processing" | "error" }> = {
  COMPLETED: { label: "已完成", color: "success" },
  PENDING: { label: "待完成", color: "processing" },
  OVERDUE: { label: "已逾期", color: "error" },
};

function responseFileName(response: Response) {
  const encoded = response.headers.get("Content-Disposition")?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  return encoded ? decodeURIComponent(encoded) : `任务记录_${dayjs().format("YYYYMMDD_HHmmss")}.xlsx`;
}

function AttachmentResult({ item }: { item: TaskDetailItem }) {
  const attachments = item.attachments?.length ? item.attachments : item.attachmentName && item.attachmentObjectKey ? [{ id: item.id, name: item.attachmentName, mimeType: item.attachmentMimeType, objectKey: item.attachmentObjectKey, url: item.attachmentUrl }] : [];
  if (!attachments.length) return <span className="task-record-empty-value">未提交附件</span>;
  return <div className="task-record-attachment-list">{attachments.map((attachment, index) => <div className="task-record-attachment" key={attachment.id || `${attachment.objectKey}-${index}`}>
    <small>附件 {index + 1}/{attachments.length}</small>
    {!attachment.url ? <Alert type="warning" showIcon message={`${attachment.name} 暂时无法访问，请稍后重新打开详情`} /> : item.dataType === "photo" ? <Image className="task-record-image" width={180} src={attachment.url} alt={attachment.name} /> : item.dataType === "video" ? <video className="task-record-video" controls preload="metadata" src={attachment.url}>当前浏览器不支持视频播放</video> : <Button href={attachment.url} target="_blank" rel="noreferrer">查看附件：{attachment.name}</Button>}
  </div>)}</div>;
}

function AiAnalysisResult({ item }: { item: TaskDetailItem }) {
  if (!item.aiAnalysisType) return null;
  const status = item.aiAnalysisStatus;
  return <div className="task-record-ai-result">
    <div className="task-record-ai-result-heading">
      <strong><RobotOutlined /> 智能分析</strong>
      <Space>
        <Tag color="purple">{item.aiAnalysisType}</Tag>
        <Tag color={status === "SUCCESS" ? "success" : status === "FAILED" ? "error" : "default"}>
          {status === "SUCCESS" ? "分析成功" : status === "FAILED" ? "分析失败" : status === "RUNNING" ? "分析中" : "尚未分析"}
        </Tag>
      </Space>
    </div>
    {item.aiAnalysisPrompt && <p className="task-record-ai-prompt">提示词：{item.aiAnalysisPrompt}</p>}
    {status === "SUCCESS" && <>
      <div><span>分析结果</span><p>{item.aiAnalysisResult || "-"}</p></div>
      <div><span>不合格原因描述</span><p>{item.aiUnqualifiedReasonDescription || "-"}</p></div>
    </>}
    {status === "FAILED" && <Alert showIcon type="error" message="本项智能分析失败" description={item.aiAnalysisFailureReason || "请稍后重新分析"} />}
    {item.aiAnalyzedAt !== "-" && <small>分析人：{item.aiAnalyzedByName || "-"}　分析时间：{item.aiAnalyzedAt}</small>}
  </div>;
}

export function TaskRecordList({ permissions }: { permissions: string[] }) {
  const router = useRouter();
  const hasAll = permissions.includes("*");
  const canView = hasAll || permissions.includes("tasks:records:view");
  const canEdit = hasAll || permissions.includes("tasks:records:edit");
  const canExport = hasAll || permissions.includes("tasks:records:export");
  const canAnalyze = hasAll || permissions.includes("tasks:records:analyze");
  const canOpenAnalysisList = hasAll || permissions.includes("intelligent-analysis:query") || permissions.includes("intelligent-analysis:view");
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
  const [selectedStatuses, setSelectedStatuses] = useState<Record<string, TaskStatus>>({});
  const [exporting, setExporting] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisDialog, setAnalysisDialog] = useState<AiAnalysisDialog>();
  const [detailId, setDetailId] = useState<string>();
  const [detail, setDetail] = useState<TaskDetail>();
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const [editId, setEditId] = useState<string>();
  const [editDetail, setEditDetail] = useState<TaskDetail>();
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState(false);
  const [editAttachments, setEditAttachments] = useState<Record<string, EditAttachment>>({});
  const [editSaving, setEditSaving] = useState(false);
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
    setFilters(next); setPage(1); setSelectedRowKeys([]); setSelectedStatuses({}); void load(1, pageSize, next);
  };
  const resetFilters = () => {
    form.resetFields(); setFilters(emptyFilters); setPage(1); setSelectedRowKeys([]); setSelectedStatuses({}); void load(1, pageSize, emptyFilters);
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

  const runAiAnalysis = async () => {
    if (!selectedRowKeys.length) {
      setAnalysisDialog({ phase: "WARNING", message: "请先勾选状态为“已完成”的任务记录，再点击“智能分析”。" });
      return;
    }
    const hasInvalidStatus = selectedRowKeys.some(key => {
      const status = selectedStatuses[String(key)];
      return status && status !== "COMPLETED";
    });
    if (hasInvalidStatus) {
      setAnalysisDialog({ phase: "WARNING", message: "智能分析只能选择状态为“已完成”的任务记录，请取消其他状态的勾选后重试。" });
      return;
    }
    setAnalyzing(true);
    setAnalysisDialog({ phase: "RUNNING", selectedRecordCount: selectedRowKeys.length });
    try {
      const response = await fetch("/api/task-records/intelligent-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskInstanceIds: selectedRowKeys.map(String) }),
      });
      const data = await response.json().catch(() => ({})) as Partial<AiAnalysisSummary> & { message?: string };
      if (!response.ok) throw new Error(data.message || "任务记录智能分析失败，请稍后重试");
      const summary = data as AiAnalysisSummary;
      setAnalysisDialog({ phase: "SUCCESS", summary });
      void load(page, pageSize, filters, true);
    } catch (reason) {
      setAnalysisDialog({ phase: "ERROR", message: reason instanceof Error ? reason.message : "任务记录智能分析失败，请稍后重试" });
    } finally { setAnalyzing(false); }
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

  const openEditor = async (id: string) => {
    setEditId(id); setEditDetail(undefined); setEditAttachments({}); setEditError(false); setEditLoading(true);
    try {
      const response = await fetch(`/api/task-records/${id}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "任务详情加载失败，请稍后重试");
      if (!data.editable) throw new Error("仅已完成且尚未智能分析的任务记录支持编辑");
      setEditDetail(data);
    } catch (reason) {
      setEditError(true); message.error(reason instanceof Error ? reason.message : "任务详情加载失败，请稍后重试");
    } finally { setEditLoading(false); }
  };

  const uploadEditAttachment = (item: TaskDetailItem): UploadProps["beforeUpload"] => async file => {
    if (!editId || (item.dataType !== "photo" && item.dataType !== "video")) return Upload.LIST_IGNORE;
    const dataType = item.dataType;
    const typeOkay = dataType === "video" ? file.type.startsWith("video/") : file.type.startsWith("image/");
    const maxBytes = taskAttachmentMaxBytes(dataType);
    const maxMb = taskAttachmentMaxMb(dataType);
    if (!typeOkay || (dataType === "photo" && file.size > maxBytes)) {
      setEditAttachments(current => ({ ...current, [item.id]: { name: file.name, status: "error", progress: 0, message: !typeOkay ? "文件类型不符合要求" : `文件不能超过 ${maxMb}MB` } }));
      return Upload.LIST_IGNORE;
    }
    setEditAttachments(current => ({ ...current, [item.id]: { name: file.name, status: "uploading", progress: 0, message: dataType === "photo" ? "正在优化图片..." : "正在读取并压缩视频..." } }));
    try {
      const prepared = dataType === "photo"
        ? await optimizeTaskPhoto(file)
        : await optimizeTaskVideo(file, progress => setEditAttachments(current => ({ ...current, [item.id]: { ...current[item.id], name: file.name, status: "uploading", progress: Math.round(progress * .35), message: `正在压缩视频 ${progress}%` } })));
      const directFile = prepared.file;
      if (directFile.size > maxBytes) throw new Error(`文件不能超过 ${maxMb}MB`);
      setEditAttachments(current => ({ ...current, [item.id]: { ...current[item.id], name: directFile.name, status: "uploading", progress: dataType === "video" && prepared.optimized ? 35 : 0, message: "正在上传到R2..." } }));
      const signResponse = await fetch(`/api/task-records/${editId}/attachments/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, name: directFile.name, type: directFile.type || "application/octet-stream", size: directFile.size }),
      });
      const sign = await signResponse.json();
      if (!signResponse.ok) throw new Error(sign.message || "生成R2直传地址失败，请稍后重试");
      const uploaded = await putFileWithProgress({
        url: sign.uploadUrl,
        file: directFile,
        headers: sign.headers,
        onProgress: progress => setEditAttachments(current => ({ ...current, [item.id]: { ...current[item.id], name: directFile.name, status: "uploading", progress: dataType === "video" && prepared.optimized ? 35 + Math.round(progress * .65) : progress, message: "正在上传到R2..." } })),
      });
      const confirmResponse = await fetch(`/api/task-records/${editId}/attachments/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadToken: sign.uploadToken, etag: uploaded.etag }),
      });
      const confirmed = await confirmResponse.json();
      if (!confirmResponse.ok) throw new Error(confirmed.message || "确认R2附件失败，请重新上传");
      setEditAttachments(current => ({ ...current, [item.id]: { attachmentId: confirmed.id, name: confirmed.name, status: "success", progress: 100, message: "新附件已上传，保存后正式替换原附件" } }));
    } catch (reason) {
      setEditAttachments(current => ({ ...current, [item.id]: { name: current[item.id]?.name || file.name, status: "error", progress: current[item.id]?.progress || 0, message: reason instanceof Error ? reason.message : "附件上传失败，请重新上传" } }));
    }
    return Upload.LIST_IGNORE;
  };

  const closeEditor = () => {
    if (editSaving || Object.values(editAttachments).some(item => item.status === "uploading")) return;
    const attachmentIds = Object.values(editAttachments).flatMap(item => item.status === "success" && item.attachmentId ? [item.attachmentId] : []);
    if (editId && attachmentIds.length) {
      void fetch(`/api/task-records/${editId}/attachments`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attachmentIds }),
      }).catch(() => undefined);
    }
    setEditId(undefined); setEditDetail(undefined); setEditAttachments({});
  };

  const saveEdit = async () => {
    if (!editId || !editDetail || editSaving) return;
    const items = editDetail.items.flatMap(item => {
      const replacement = editAttachments[item.id];
      return replacement?.status === "success" && replacement.attachmentId
        ? [{ itemId: item.id, attachmentId: replacement.attachmentId, originalObjectKey: item.attachmentObjectKey }]
        : [];
    });
    if (!items.length) { message.warning("请至少重新上传一个图片或视频附件"); return; }
    setEditSaving(true);
    try {
      const response = await fetch(`/api/task-records/${editId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "任务记录保存失败，请稍后重试");
      message.success(data.message || "任务记录附件已更新");
      setEditId(undefined); setEditDetail(undefined); setEditAttachments({});
      void load(page, pageSize, filters, true);
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : "任务记录保存失败，请稍后重试");
    } finally { setEditSaving(false); }
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
      setSelectedStatuses(previous => {
        const next = { ...previous };
        delete next[deleteRow.id];
        return next;
      });
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
    { title: "任务对象", dataIndex: "targetEmployee", width: 180, ellipsis: true },
    { title: "参与核算完成率", dataIndex: "includeCompletionRate", width: 145, render: value => <Tag color={value ? "blue" : "default"}>{value ? "参与" : "不参与"}</Tag> },
    { title: "任务创建日期", dataIndex: "createdAt", width: 170 },
    { title: "任务提交日期", dataIndex: "submittedAt", width: 170 },
    { title: "任务状态", dataIndex: "status", width: 100, render: (value: TaskStatus) => <Tag color={taskStatusMeta[value].color}>{taskStatusMeta[value].label}</Tag> },
    { title: "操作", key: "actions", width: 210, fixed: "right", render: (_, row) => <Space size={4} className="table-actions">{canView && row.status === "COMPLETED" && <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => void openDetail(row.id)}>查看</Button>}{canEdit && row.status === "COMPLETED" && !row.hasAiAnalysis && <Button type="link" size="small" icon={<EditOutlined />} onClick={() => void openEditor(row.id)}>编辑</Button>}{canDelete && <Button type="link" danger size="small" icon={<DeleteOutlined />} onClick={() => setDeleteRow(row)}>删除</Button>}</Space> },
  ];
  const rowSelection: TableRowSelection<TaskRecordRow> = {
    selectedRowKeys,
    preserveSelectedRowKeys: true,
    columnWidth: 48,
    onChange: (keys, selectedRows) => {
      setSelectedRowKeys(keys);
      setSelectedStatuses(previous => {
        const selected = new Set(keys.map(String));
        const next: Record<string, TaskStatus> = {};
        for (const [id, status] of Object.entries(previous)) if (selected.has(id)) next[id] = status;
        for (const row of selectedRows) next[row.id] = row.status;
        for (const row of rows) if (selected.has(row.id)) next[row.id] = row.status;
        return next;
      });
    },
  };

  return <>
    <Card className="task-record-filter-card">
      <Form form={form} layout="vertical">
        <div className="task-record-filter-grid">
          <Form.Item label="任务状态" name="status"><Select allowClear placeholder="全部" options={[{ value: "PENDING", label: "待完成" }, { value: "COMPLETED", label: "已完成" }, { value: "OVERDUE", label: "已逾期" }]} /></Form.Item>
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
      <div className="task-record-toolbar">
        <span>已选择 <strong>{selectedRowKeys.length}</strong> 条</span>
        <Space>
          <Button icon={<ReloadOutlined />} disabled={exporting || analyzing} onClick={() => void load()}>刷新</Button>
          {canAnalyze && <Button type="primary" icon={<RobotOutlined />} loading={analyzing} disabled={exporting} onClick={() => void runAiAnalysis()}>{analyzing ? "分析中..." : "智能分析"}</Button>}
          {canExport && <Button icon={<DownloadOutlined />} loading={exporting} disabled={analyzing} onClick={() => void exportRows()}>批量导出</Button>}
        </Space>
      </div>
      {loadError ? <Alert type="error" showIcon message="任务记录加载失败，请稍后重试" action={<Button size="small" onClick={() => void load()}>重新加载</Button>} /> : <Table<TaskRecordRow>
        rowKey="id" dataSource={rows} loading={loading} columns={columns} rowSelection={rowSelection} scroll={{ x: 1490 }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={Object.values(filters).some(Boolean) ? <><div>没有找到符合当前条件的任务记录</div><small>请调整筛选条件后重试</small><div><Button type="link" onClick={resetFilters}>重置筛选</Button></div></> : "暂无任务记录"} /> }}
        pagination={{ current: page, pageSize, total, showSizeChanger: true, pageSizeOptions: [20, 50, 100], showTotal: value => `共 ${value} 条`, onChange: (nextPage, nextSize) => { const targetPage = nextSize !== pageSize ? 1 : nextPage; setPage(targetPage); setPageSize(nextSize); void load(targetPage, nextSize, filters); } }}
      />}
    </Card>

    <Modal
      className="task-ai-analysis-modal"
      width={580}
      centered
      open={!!analysisDialog}
      title={<Space><RobotOutlined style={{ color: "#722ed1" }} />温馨提示</Space>}
      closable={!analyzing}
      maskClosable={!analyzing}
      keyboard={!analyzing}
      onCancel={() => !analyzing && setAnalysisDialog(undefined)}
      footer={analyzing ? null : analysisDialog?.phase === "SUCCESS" && analysisDialog.summary.successCount > 0 && canOpenAnalysisList
        ? <Space><Button onClick={() => setAnalysisDialog(undefined)}>关闭</Button><Button type="primary" onClick={() => { setAnalysisDialog(undefined); router.push("/lead_pc/tasks/analysis"); }}>查看智能分析</Button></Space>
        : <Button type="primary" onClick={() => setAnalysisDialog(undefined)}>我知道了</Button>}
    >
      {analysisDialog?.phase === "RUNNING" && <div className="task-ai-analysis-progress">
        <Spin size="large" />
        <strong>正在进行智能分析，请稍候……</strong>
        <p>已提交 {analysisDialog.selectedRecordCount} 条任务记录。图片或视频分析可能需要一些时间，请勿重复点击。</p>
      </div>}
      {analysisDialog?.phase === "SUCCESS" && <div className="task-ai-analysis-summary">
        <p>{analysisDialog.summary.message || "本次任务记录智能分析已结束。"}</p>
        <div className="task-ai-analysis-summary-grid">
          <div><span>选中任务记录</span><strong>{analysisDialog.summary.selectedRecordCount}</strong><small>条（覆盖 {analysisDialog.summary.selectedDayCount} 天）</small></div>
          <div><span>智能分析任务项</span><strong>{analysisDialog.summary.analysisItemCount}</strong><small>项</small></div>
          <div><span>分析成功</span><strong className="success">{analysisDialog.summary.successCount}</strong><small>条任务记录</small></div>
          <div><span>分析失败</span><strong className={analysisDialog.summary.failureCount ? "failure" : "success"}>{analysisDialog.summary.failureCount}</strong><small>条任务记录</small></div>
        </div>
        {!analysisDialog.summary.analysisItemCount && <Alert showIcon type="info" message="所选任务记录的配置快照中没有需要进行AI分析的任务项" />}
        {analysisDialog.summary.failures.length > 0 && <Alert showIcon type="warning" message="部分任务记录分析失败" description={<ul>{analysisDialog.summary.failures.slice(0, 5).map((failure, index) => <li key={`${failure.recordNo}-${failure.itemName}-${index}`}>{failure.recordNo} · {failure.itemName}：{failure.reason}</li>)}{analysisDialog.summary.failures.length > 5 && <li>另有 {analysisDialog.summary.failures.length - 5} 条失败信息，请稍后重新分析。</li>}</ul>} />}
      </div>}
      {analysisDialog?.phase === "WARNING" && <Alert showIcon type="warning" message="无法开始智能分析" description={analysisDialog.message} />}
      {analysisDialog?.phase === "ERROR" && <Alert showIcon type="error" message="智能分析未完成" description={analysisDialog.message} />}
    </Modal>

    <Modal className="task-record-detail-modal" width={1100} open={!!detailId} title="查看任务" onCancel={() => setDetailId(undefined)} footer={<Button onClick={() => setDetailId(undefined)}>关闭</Button>}>
      {detailLoading ? <Skeleton active paragraph={{ rows: 10 }} /> : detailError ? <Alert type="error" showIcon message="任务详情加载失败，请稍后重试" action={<Button size="small" onClick={() => detailId && void openDetail(detailId)}>重新加载</Button>} /> : detail && <div className="task-record-detail">
        <h3>任务信息</h3>
        <Descriptions bordered size="small" column={4}>
          <Descriptions.Item label="记录编号">{detail.recordNo}</Descriptions.Item><Descriptions.Item label="任务名称">{detail.taskName}</Descriptions.Item><Descriptions.Item label="任务类型">{detail.taskTypeLabel}</Descriptions.Item><Descriptions.Item label="任务执行人">{detail.executor}</Descriptions.Item><Descriptions.Item label="任务对象">{detail.targetEmployee}</Descriptions.Item>
          <Descriptions.Item label="参与核算完成率"><Tag color={detail.includeCompletionRate ? "blue" : "default"}>{detail.includeCompletionRate ? "参与" : "不参与"}</Tag></Descriptions.Item><Descriptions.Item label="任务创建日期">{detail.createdAt}</Descriptions.Item><Descriptions.Item label="任务提交日期">{detail.submittedAt}</Descriptions.Item><Descriptions.Item label="任务状态"><Tag color="success">已完成</Tag></Descriptions.Item>
        </Descriptions>
        <div className="task-record-detail-heading"><h3>提交内容</h3><Tag color="blue">配置版本 V{detail.configVersion}</Tag></div>
        {detail.items.length ? detail.items.map((item, index) => <section className="task-record-detail-item" key={item.id}>
          <div className="task-record-detail-index">{index + 1}</div>
          <div className="task-record-detail-content"><div className="task-record-detail-title">{item.itemName}{item.required && <span>*</span>}{item.componentType === "attachment" && <Tag>最多 {item.weight} 个附件</Tag>}</div>{item.description && <p>{item.description}</p>}<div className="task-record-result">{item.componentType === "attachment" ? <AttachmentResult item={item} /> : item.componentType === "select" && item.value ? <Tag color="blue">{item.value}</Tag> : <span className={item.value ? "" : "task-record-empty-value"}>{item.value || "未填写"}</span>}</div><AiAnalysisResult item={item} /></div>
        </section>) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="该任务未保存提交明细" />}
      </div>}
    </Modal>

    <Modal
      className="task-record-detail-modal task-record-edit-modal"
      width={1100}
      open={!!editId}
      title="编辑任务"
      maskClosable={false}
      closable={!editSaving && !Object.values(editAttachments).some(item => item.status === "uploading")}
      onCancel={closeEditor}
      footer={<Space>
        <Button disabled={editSaving || Object.values(editAttachments).some(item => item.status === "uploading")} onClick={closeEditor}>取消</Button>
        <Button type="primary" loading={editSaving} disabled={!Object.values(editAttachments).some(item => item.status === "success") || Object.values(editAttachments).some(item => item.status === "uploading")} onClick={() => void saveEdit()}>{editSaving ? "保存中..." : "保存"}</Button>
      </Space>}
    >
      {editLoading ? <Skeleton active paragraph={{ rows: 10 }} /> : editError ? <Alert type="error" showIcon message="任务详情加载失败或当前记录已不支持编辑" action={<Button size="small" onClick={() => editId && void openEditor(editId)}>重新加载</Button>} /> : editDetail && <div className="task-record-detail">
        <Alert className="task-record-edit-tip" type="info" showIcon message="仅图片、视频附件支持重新上传；点击保存后才会正式替换原附件。" />
        <h3>任务信息</h3>
        <Descriptions bordered size="small" column={4}>
          <Descriptions.Item label="记录编号">{editDetail.recordNo}</Descriptions.Item><Descriptions.Item label="任务名称">{editDetail.taskName}</Descriptions.Item><Descriptions.Item label="任务类型">{editDetail.taskTypeLabel}</Descriptions.Item><Descriptions.Item label="任务执行人">{editDetail.executor}</Descriptions.Item><Descriptions.Item label="任务对象">{editDetail.targetEmployee}</Descriptions.Item>
          <Descriptions.Item label="参与核算完成率"><Tag color={editDetail.includeCompletionRate ? "blue" : "default"}>{editDetail.includeCompletionRate ? "参与" : "不参与"}</Tag></Descriptions.Item><Descriptions.Item label="任务创建日期">{editDetail.createdAt}</Descriptions.Item><Descriptions.Item label="任务提交日期">{editDetail.submittedAt}</Descriptions.Item><Descriptions.Item label="任务状态"><Tag color="success">已完成</Tag></Descriptions.Item>
        </Descriptions>
        <div className="task-record-detail-heading"><h3>提交内容</h3><Tag color="blue">配置版本 V{editDetail.configVersion}</Tag></div>
        {editDetail.items.length ? editDetail.items.map((item, index) => {
          const replacement = editAttachments[item.id];
          const attachmentEditable = item.componentType === "attachment" && (item.dataType === "photo" || item.dataType === "video");
          return <section className="task-record-detail-item" key={item.id}>
            <div className="task-record-detail-index">{index + 1}</div>
            <div className="task-record-detail-content">
              <div className="task-record-detail-title">{item.itemName}{item.required && <span>*</span>}{item.componentType === "attachment" && <Tag>最多 {item.weight} 个附件</Tag>}</div>
              {item.description && <p>{item.description}</p>}
              <div className="task-record-result">{item.componentType === "attachment" ? <AttachmentResult item={item} /> : item.componentType === "select" && item.value ? <Tag color="blue">{item.value}</Tag> : <span className={item.value ? "" : "task-record-empty-value"}>{item.value || "未填写"}</span>}</div>
              {attachmentEditable && <div className="task-record-edit-upload">
                <Upload accept={item.dataType === "video" ? "video/*" : "image/*"} showUploadList={false} maxCount={1} beforeUpload={uploadEditAttachment(item)}>
                  <Button icon={<UploadOutlined />} loading={replacement?.status === "uploading"} disabled={editSaving}>{replacement?.status === "uploading" ? `上传中 ${replacement.progress}%` : item.dataType === "video" ? "重新上传视频" : "重新上传图片"}</Button>
                </Upload>
                {replacement && <div className={`task-record-edit-upload-status ${replacement.status}`}>
                  {replacement.status === "uploading" && <LoadingOutlined />}
                  <span>{replacement.name}</span>
                  <small>{replacement.message}</small>
                </div>}
              </div>}
              <AiAnalysisResult item={item} />
            </div>
          </section>;
        }) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="该任务未保存提交明细" />}
      </div>}
    </Modal>

    <Modal open={!!deleteRow} title={<Space><WarningOutlined style={{ color: "#ff4d4f" }} />温馨提示</Space>} onCancel={() => !deleting && setDeleteRow(undefined)} closable={!deleting} maskClosable={!deleting} footer={<Space><Button disabled={deleting} onClick={() => setDeleteRow(undefined)}>我再想想</Button><Button danger type="primary" loading={deleting} onClick={() => void performDelete()}>{deleting ? "删除中..." : "我知道了，继续删除"}</Button></Space>}>
      <Alert type="error" showIcon message="删除操作不可逆" description={deleteRow ? `${deleteRow.taskName} · ${deleteRow.executor} · ${taskStatusMeta[deleteRow.status].label}` : undefined} />
      <div className="task-record-delete-copy"><p>一旦删除成功，当前任务记录及已经提交的任务数据将无法恢复。</p>{deleteRow?.hasAiAnalysis && <p>当前任务记录已生成智能分析结果，删除任务记录后相关智能分析结果也将同步删除。</p>}<p>删除后，当前用户的此项任务将恢复为“未生成”状态，需要重新生成任务后才能再次执行。</p><p>请谨慎操作。</p></div>
    </Modal>
  </>;
}

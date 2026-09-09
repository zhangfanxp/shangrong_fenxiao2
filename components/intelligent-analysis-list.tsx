"use client";

import { DownloadOutlined, EyeOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { Alert, Button, Card, DatePicker, Descriptions, Empty, Form, Image, Input, message, Modal, Select, Skeleton, Space, Table, Tag, Tooltip } from "antd";
import type { ColumnsType, TableRowSelection } from "antd/es/table/interface";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import { useCallback, useEffect, useRef, useState } from "react";
import { useBusinessDictionaries } from "@/hooks/use-business-dictionaries";

type AnalysisRow = {
  id: string;
  recordNo: string;
  taskName: string;
  taskRecordNo: string;
  brandName: string;
  storeName: string;
  executorName: string;
  taskSubmittedAt: string;
  analysisResultSummary: string;
  analyzedAt: string;
};

type Filters = {
  brand: string;
  storeKeyword: string;
  taskSettingId: string;
  taskRecordNo: string;
  executorKeyword: string;
  taskStartDate: string;
  taskEndDate: string;
};

type FormValues = {
  brand?: string;
  storeKeyword?: string;
  taskSettingId?: string;
  taskRecordNo?: string;
  executorKeyword?: string;
  taskStartDate?: Dayjs | null;
  taskEndDate?: Dayjs | null;
};

type TaskOption = { taskSettingId: string; taskName: string };
type AnalysisDetail = {
  summary: {
    id: string;
    recordNo: string;
    taskName: string;
    taskRecordNo: string;
    brandName: string;
    storeName: string;
    executorName: string;
    taskSubmittedAt: string;
    analyzedAt: string;
  };
  items: Array<{
    id: string;
    taskItemName: string;
    hint: string;
    analysisType: string;
    analysisPrompt: string;
    analysisResult: string;
    isQualified: boolean | null;
    unqualifiedReason: string;
    analyzedAt: string;
    dataType: string | null;
    photoAttachment: {
      name: string;
      mimeType: string | null;
      url: string | null;
    } | null;
  }>;
};

const emptyFilters: Filters = { brand: "", storeKeyword: "", taskSettingId: "", taskRecordNo: "", executorKeyword: "", taskStartDate: "", taskEndDate: "" };

function responseFileName(response: Response) {
  const encoded = response.headers.get("Content-Disposition")?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  return encoded ? decodeURIComponent(encoded) : `智能分析_${dayjs().format("YYYYMMDD_HHmmss")}.xlsx`;
}

export function IntelligentAnalysisList({ permissions }: { permissions: string[] }) {
  const hasAll = permissions.includes("*");
  const canView = hasAll || permissions.includes("intelligent-analysis:view");
  const canExport = hasAll || permissions.includes("intelligent-analysis:export");
  const [form] = Form.useForm<FormValues>();
  const { options: dictionaries, loading: brandsLoading, error: brandsError, reload: reloadBrands } = useBusinessDictionaries(["BRAND"]);
  const [taskOptions, setTaskOptions] = useState<TaskOption[]>([]);
  const [taskOptionsLoading, setTaskOptionsLoading] = useState(true);
  const [taskOptionsError, setTaskOptionsError] = useState(false);
  const [rows, setRows] = useState<AnalysisRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [exporting, setExporting] = useState(false);
  const [detailId, setDetailId] = useState<string>();
  const [detail, setDetail] = useState<AnalysisDetail>();
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const listRequestSequence = useRef(0);

  const loadTaskOptions = useCallback(async () => {
    setTaskOptionsLoading(true); setTaskOptionsError(false);
    try {
      const response = await fetch("/api/intelligent-analysis/task-options", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "任务名称加载失败，请稍后重试");
      setTaskOptions(data.tasks || []);
    } catch (reason) {
      setTaskOptions([]); setTaskOptionsError(true);
      message.error(reason instanceof Error ? reason.message : "任务名称加载失败，请稍后重试");
    } finally { setTaskOptionsLoading(false); }
  }, []);

  const load = useCallback(async (nextPage = page, nextPageSize = pageSize, nextFilters = filters, background = false) => {
    const requestSequence = ++listRequestSequence.current;
    if (!background) { setLoading(true); setLoadError(false); }
    try {
      const query = new URLSearchParams({ page: String(nextPage), pageSize: String(nextPageSize) });
      Object.entries(nextFilters).forEach(([key, value]) => { if (value) query.set(key, value); });
      if (background) query.set("_background", "1");
      const response = await fetch(`/api/intelligent-analysis?${query}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "智能分析记录加载失败，请稍后重试");
      if (requestSequence !== listRequestSequence.current) return;
      setRows(data.rows || []); setTotal(data.total || 0);
    } catch (reason) {
      if (!background && requestSequence === listRequestSequence.current) {
        setLoadError(true);
        message.error(reason instanceof Error ? reason.message : "智能分析记录加载失败，请稍后重试");
      }
    } finally {
      if (!background && requestSequence === listRequestSequence.current) setLoading(false);
    }
  }, [filters, page, pageSize]);

  useEffect(() => { void load(1, 20, emptyFilters); void loadTaskOptions(); }, []);
  useEffect(() => {
    const refreshWhenVisible = () => { if (document.visibilityState === "visible") void load(page, pageSize, filters, true); };
    const timer = window.setInterval(refreshWhenVisible, 30_000);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [filters, load, page, pageSize]);

  const readFilters = (): Filters | null => {
    const values = form.getFieldsValue();
    const next: Filters = {
      brand: values.brand || "",
      storeKeyword: values.storeKeyword?.trim() || "",
      taskSettingId: values.taskSettingId || "",
      taskRecordNo: values.taskRecordNo?.trim() || "",
      executorKeyword: values.executorKeyword?.trim() || "",
      taskStartDate: values.taskStartDate?.format("YYYY-MM-DD") || "",
      taskEndDate: values.taskEndDate?.format("YYYY-MM-DD") || "",
    };
    if (next.taskStartDate && next.taskEndDate && next.taskStartDate > next.taskEndDate) {
      message.warning("任务开始日期不能晚于任务截止日期");
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
      const response = await fetch("/api/intelligent-analysis/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysisIds: selectedRowKeys.length ? selectedRowKeys.map(String) : undefined, filters }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || "智能分析记录导出失败，请稍后重试");
      }
      const blob = await response.blob();
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href; link.download = responseFileName(response); document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(href);
      message.success(`导出成功，共导出${selectedRowKeys.length || total}条智能分析记录`);
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : "智能分析记录导出失败，请稍后重试");
    } finally { setExporting(false); }
  };

  const openDetail = async (id: string) => {
    setDetailId(id); setDetail(undefined); setDetailError(false); setDetailLoading(true);
    try {
      const response = await fetch(`/api/intelligent-analysis/${id}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "智能分析详情加载失败，请稍后重试");
      setDetail(data);
    } catch (reason) {
      setDetailError(true);
      message.error(reason instanceof Error ? reason.message : "智能分析详情加载失败，请稍后重试");
    } finally { setDetailLoading(false); }
  };

  const columns: ColumnsType<AnalysisRow> = [
    { title: "记录编号", dataIndex: "recordNo", width: 145, fixed: "left" },
    { title: "任务名称", dataIndex: "taskName", width: 210, ellipsis: { showTitle: false }, render: value => <Tooltip title={value}>{value}</Tooltip> },
    { title: "任务记录编号", dataIndex: "taskRecordNo", width: 165 },
    { title: "品牌", dataIndex: "brandName", width: 120, ellipsis: true },
    { title: "门店名称", dataIndex: "storeName", width: 190, ellipsis: true },
    { title: "任务执行人", dataIndex: "executorName", width: 120, ellipsis: true },
    { title: "任务提交时间", dataIndex: "taskSubmittedAt", width: 170 },
    { title: "分析结果", dataIndex: "analysisResultSummary", width: 240 },
    { title: "操作", key: "actions", width: 80, fixed: "right", render: (_, row) => canView ? <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => void openDetail(row.id)}>查看</Button> : "-" },
  ];

  const rowSelection: TableRowSelection<AnalysisRow> = {
    selectedRowKeys,
    preserveSelectedRowKeys: true,
    columnWidth: 48,
    onChange: setSelectedRowKeys,
  };

  const hasFilters = Object.values(filters).some(Boolean);
  return <>
    <Card className="intelligent-analysis-filter-card">
      <Form form={form} layout="vertical">
        <div className="intelligent-analysis-filter-grid">
          <Form.Item label="品牌" name="brand"><Select allowClear loading={brandsLoading} placeholder="全部" options={dictionaries.BRAND} /></Form.Item>
          <Form.Item label="门店名称" name="storeKeyword"><Input allowClear placeholder="请输入门店名称" onPressEnter={applyFilters} /></Form.Item>
          <Form.Item label="任务名称" name="taskSettingId"><Select allowClear showSearch optionFilterProp="label" loading={taskOptionsLoading} placeholder="全部" options={taskOptions.map(task => ({ value: task.taskSettingId, label: task.taskName }))} /></Form.Item>
          <Form.Item label="任务记录编号" name="taskRecordNo"><Input allowClear maxLength={14} placeholder="请输入任务记录编号" onPressEnter={applyFilters} /></Form.Item>
          <Form.Item label="任务执行人" name="executorKeyword"><Input allowClear placeholder="请输入任务执行人" onPressEnter={applyFilters} /></Form.Item>
          <Form.Item label="任务执行开始日期" name="taskStartDate"><DatePicker format="YYYY-MM-DD" placeholder="开始日期" /></Form.Item>
          <Form.Item label="任务执行截止日期" name="taskEndDate"><DatePicker format="YYYY-MM-DD" placeholder="截止日期" /></Form.Item>
          <div className="intelligent-analysis-filter-actions"><Space><Button onClick={resetFilters}>重置</Button><Button type="primary" icon={<SearchOutlined />} onClick={applyFilters}>筛选</Button></Space></div>
        </div>
      </Form>
      {brandsError && <Alert type="error" showIcon message="品牌数据加载失败，请稍后重试" action={<Button size="small" onClick={() => void reloadBrands()}>重新加载</Button>} />}
      {taskOptionsError && <Alert type="error" showIcon message="任务名称加载失败，请稍后重试" action={<Button size="small" onClick={() => void loadTaskOptions()}>重新加载</Button>} />}
    </Card>

    <Card className="intelligent-analysis-list-card">
      <div className="intelligent-analysis-toolbar">
        <span>已选择 <strong>{selectedRowKeys.length}</strong> 条</span>
        <Space>
          <Button icon={<ReloadOutlined />} disabled={exporting} onClick={() => void load()}>刷新</Button>
          {canExport && <Button icon={<DownloadOutlined />} loading={exporting} onClick={() => void exportRows()}>{exporting ? "导出中..." : "批量导出"}</Button>}
        </Space>
      </div>
      {loadError ? <Alert type="error" showIcon message="智能分析记录加载失败，请稍后重试" action={<Button size="small" onClick={() => void load()}>重新加载</Button>} /> : <Table<AnalysisRow>
        rowKey="id"
        dataSource={rows}
        loading={loading}
        columns={columns}
        rowSelection={rowSelection}
        scroll={{ x: 1400 }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={hasFilters ? <><div>没有找到符合当前条件的智能分析记录</div><small>请调整筛选条件后重试</small><div><Button type="link" onClick={resetFilters}>重置筛选</Button></div></> : <><div>暂无智能分析记录</div><small>请前往“任务记录”选择已完成任务并执行智能分析</small></>} /> }}
        pagination={{ current: page, pageSize, total, showSizeChanger: true, pageSizeOptions: [20, 50, 100], showTotal: value => `共 ${value} 条`, onChange: (nextPage, nextSize) => { const targetPage = nextSize !== pageSize ? 1 : nextPage; setPage(targetPage); setPageSize(nextSize); void load(targetPage, nextSize, filters); } }}
      />}
    </Card>

    <Modal className="intelligent-analysis-detail-modal" width={1100} open={!!detailId} title="查看-智能分析" onCancel={() => setDetailId(undefined)} footer={<Button onClick={() => setDetailId(undefined)}>关闭</Button>}>
      {detailLoading ? <Skeleton active paragraph={{ rows: 12 }} /> : detailError ? <Alert type="error" showIcon message="智能分析详情加载失败，请稍后重试" action={<Button size="small" onClick={() => detailId && void openDetail(detailId)}>重新加载</Button>} /> : detail && <div className="intelligent-analysis-detail">
        <h3>任务信息</h3>
        <Descriptions bordered size="small" column={3}>
          <Descriptions.Item label="记录编号">{detail.summary.recordNo}</Descriptions.Item>
          <Descriptions.Item label="任务名称">{detail.summary.taskName}</Descriptions.Item>
          <Descriptions.Item label="任务记录编号">{detail.summary.taskRecordNo}</Descriptions.Item>
          <Descriptions.Item label="品牌">{detail.summary.brandName}</Descriptions.Item>
          <Descriptions.Item label="门店名称">{detail.summary.storeName}</Descriptions.Item>
          <Descriptions.Item label="任务执行人">{detail.summary.executorName}</Descriptions.Item>
          <Descriptions.Item label="任务提交时间" span={3}>{detail.summary.taskSubmittedAt}</Descriptions.Item>
        </Descriptions>
        <h3>任务项分析明细</h3>
        {detail.items.map((item, index) => <section className="intelligent-analysis-detail-item" key={item.id}>
          <div className="intelligent-analysis-detail-item-heading"><strong>任务项 {index + 1}</strong>{item.isQualified !== null && <Tag color={item.isQualified ? "success" : "error"}>{item.isQualified ? "合格" : "不合格"}</Tag>}</div>
          <Descriptions bordered size="small" column={1}>
            <Descriptions.Item label="任务项名称">{item.taskItemName}</Descriptions.Item>
            <Descriptions.Item label="提示说明"><div className="intelligent-analysis-readonly">{item.hint}</div></Descriptions.Item>
            {item.dataType === "photo" && <Descriptions.Item label="提交照片附件">
              {!item.photoAttachment ? <span className="task-record-empty-value">未提交照片附件</span> : item.photoAttachment.url
                ? <div className="intelligent-analysis-photo-attachment"><Image className="task-record-image" width={140} height={105} src={item.photoAttachment.url} alt={item.photoAttachment.name} preview={{ mask: <span><EyeOutlined /> 点击查看</span> }} /><span title={item.photoAttachment.name}>{item.photoAttachment.name}</span></div>
                : <Alert type="warning" showIcon message={`${item.photoAttachment.name} 暂时无法访问，请稍后重新打开详情`} />}
            </Descriptions.Item>}
            <Descriptions.Item label="AI分析类型"><Tag color="purple">{item.analysisType}</Tag></Descriptions.Item>
            <Descriptions.Item label="AI分析提示词"><div className="intelligent-analysis-readonly">{item.analysisPrompt}</div></Descriptions.Item>
            <Descriptions.Item label="分析结果"><div className="intelligent-analysis-readonly">{item.analysisResult}</div></Descriptions.Item>
            <Descriptions.Item label="不合格原因"><div className="intelligent-analysis-readonly">{item.unqualifiedReason}</div></Descriptions.Item>
            <Descriptions.Item label="分析时间">{item.analyzedAt}</Descriptions.Item>
          </Descriptions>
        </section>)}
      </div>}
    </Modal>
  </>;
}

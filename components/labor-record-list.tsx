"use client";

import { DownloadOutlined, EyeOutlined, SearchOutlined } from "@ant-design/icons";
import { Alert, Button, Card, DatePicker, Descriptions, Empty, Form, Input, message, Modal, Select, Skeleton, Space, Table, Tag, Tooltip, Typography } from "antd";
import type { ColumnsType, TableRowSelection } from "antd/es/table/interface";
import type { Dayjs } from "dayjs";
import { useCallback, useEffect, useRef, useState, type Key } from "react";

type LaborStatus = "NORMAL" | "OVERSTAFFED" | "UNDERSTAFFED" | "UNABLE_TO_CALCULATE";
type AssessmentMetric = "RECEIVED_AMOUNT" | "ACTUAL_SALES_AMOUNT";
type BrandOption = { label: string; value: string };

type LaborRecordRow = {
  id: string;
  brandName: string;
  storeName: string;
  businessDate: string;
  receivedAmount: string | null;
  actualSalesAmount: string | null;
  actualHeadcount: number | null;
  laborStatus: LaborStatus;
  laborStatusLabel: string;
  unavailableReason: string | null;
  assessmentMetric: AssessmentMetric | null;
  assessmentMetricLabel: string | null;
  assessedAmount: string | null;
  standardHeadcount: number | null;
  lowerAmount: string | null;
  upperAmount: string | null;
  policyVersion: number | null;
};

type LaborRecordDetail = {
  overview: {
    brandName: string;
    storeName: string;
    businessDate: string;
    actualHeadcount: number | null;
    attendanceRecordNo: string | null;
    hasAttendance: boolean;
  };
  details: Array<{
    personnelId: string;
    personnelName: string;
    positionStar: string;
    attendanceStatus: string;
    attendanceType: "FULL_ATTENDANCE" | "REST" | "LEAVE_FULL_DAY" | "LEAVE_HOURS";
    overtimeHours: string;
    dailyLaborCost: string | null;
    hourlyLaborCost: string | null;
    actualLaborCost: string | null;
  }>;
};

type Filters = { brand: string; storeNameKeyword: string; startDate: string; endDate: string; laborStatus: string };
type FilterForm = { brand?: string; storeNameKeyword?: string; startDate?: Dayjs | null; endDate?: Dayjs | null; laborStatus?: string };

const emptyFilters: Filters = { brand: "", storeNameKeyword: "", startDate: "", endDate: "", laborStatus: "" };
const statusOptions = [
  { value: "NORMAL", label: "正常" },
  { value: "OVERSTAFFED", label: "用工过多" },
  { value: "UNDERSTAFFED", label: "用工过少" },
  { value: "UNABLE_TO_CALCULATE", label: "无法计算" },
];

function formatMoney(value: string | null | undefined) {
  if (value === null || value === undefined || value === "") return "-";
  const [integer, decimal = "00"] = value.split(".");
  return `${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${decimal.padEnd(2, "0").slice(0, 2)}`;
}

function responseFileName(response: Response) {
  const encoded = response.headers.get("Content-Disposition")?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  return encoded ? decodeURIComponent(encoded) : "用工记录.xlsx";
}

function downloadBlob(blob: Blob, fileName: string) {
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}

function statusColor(status: LaborStatus) {
  if (status === "NORMAL") return "success";
  if (status === "OVERSTAFFED") return "warning";
  if (status === "UNDERSTAFFED") return "error";
  return "default";
}

function rangeText(row: LaborRecordRow) {
  if (row.lowerAmount === null && row.upperAmount === null) return "-";
  return `${row.lowerAmount === null ? "不限" : formatMoney(row.lowerAmount)} ≤ 金额 < ${row.upperAmount === null ? "不限" : formatMoney(row.upperAmount)}`;
}

function decimalText(value: string | null, suffix: string) {
  if (value === null) return "-";
  return `${Number(value).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}${suffix}`;
}

function moneyText(value: string | null) {
  if (value === null) return "-";
  return `¥ ${formatMoney(value)}`;
}

function attendanceStatusTag(status: string, type: LaborRecordDetail["details"][number]["attendanceType"]) {
  const color = type === "FULL_ATTENDANCE" ? "success" : type === "REST" ? "default" : type === "LEAVE_FULL_DAY" ? "error" : "warning";
  return <Tag color={color}>{status}</Tag>;
}

export function LaborRecordList({ permissions }: { permissions: string[] }) {
  const [messageApi, messageContextHolder] = message.useMessage();
  const [filterForm] = Form.useForm<FilterForm>();
  const canQuery = permissions.includes("*") || permissions.includes("operations:view") || permissions.includes("labor-records:query");
  const canView = permissions.includes("*") || permissions.includes("operations:view") || permissions.includes("labor-records:view");
  const canExport = permissions.includes("*") || permissions.includes("labor-records:export");
  const [brandOptions, setBrandOptions] = useState<BrandOption[]>([]);
  const [brandsLoading, setBrandsLoading] = useState(canQuery);
  const [brandsError, setBrandsError] = useState("");
  const [rows, setRows] = useState<LaborRecordRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [selectedKeys, setSelectedKeys] = useState<Key[]>([]);
  const [loading, setLoading] = useState(canQuery);
  const [loadError, setLoadError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [detailId, setDetailId] = useState<string>();
  const [detail, setDetail] = useState<LaborRecordDetail>();
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const requestSequence = useRef(0);
  const detailRequestSequence = useRef(0);

  const loadBrands = useCallback(async () => {
    setBrandsLoading(true);
    setBrandsError("");
    try {
      const response = await fetch("/api/labor-records/brands", { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || "品牌数据加载失败，请稍后重试");
      setBrandOptions(data?.brands || []);
    } catch (error) {
      setBrandOptions([]);
      setBrandsError(error instanceof Error ? error.message : "品牌数据加载失败，请稍后重试");
    } finally {
      setBrandsLoading(false);
    }
  }, []);

  const load = useCallback(async (targetPage: number, targetPageSize: number, targetFilters: Filters) => {
    const sequence = ++requestSequence.current;
    setLoading(true);
    setLoadError("");
    const query = new URLSearchParams({ page: String(targetPage), pageSize: String(targetPageSize) });
    Object.entries(targetFilters).forEach(([key, value]) => { if (value) query.set(key, value); });
    try {
      const response = await fetch(`/api/labor-records?${query}`, { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || "用工记录加载失败，请稍后重试");
      if (sequence !== requestSequence.current) return;
      setRows(data?.rows || []);
      setTotal(data?.total || 0);
      setPage(data?.page || targetPage);
      setPageSize(data?.pageSize || targetPageSize);
    } catch (error) {
      if (sequence !== requestSequence.current) return;
      const errorMessage = error instanceof Error ? error.message : "用工记录加载失败，请稍后重试";
      setRows([]);
      setTotal(0);
      setLoadError(errorMessage);
      messageApi.error(errorMessage);
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, [messageApi]);

  useEffect(() => {
    if (!canQuery) return;
    void loadBrands();
    void load(1, 20, emptyFilters);
  }, [canQuery, load, loadBrands]);

  const applyFilters = async () => {
    try {
      const values = await filterForm.validateFields();
      const next: Filters = {
        brand: values.brand === "ALL" ? "" : values.brand || "",
        storeNameKeyword: values.storeNameKeyword?.trim() || "",
        startDate: values.startDate?.format("YYYY-MM-DD") || "",
        endDate: values.endDate?.format("YYYY-MM-DD") || "",
        laborStatus: values.laborStatus === "ALL" ? "" : values.laborStatus || "",
      };
      setFilters(next);
      setPage(1);
      setSelectedKeys([]);
      void load(1, pageSize, next);
    } catch { /* 表单直接显示校验信息 */ }
  };

  const resetFilters = () => {
    filterForm.resetFields();
    setFilters(emptyFilters);
    setPage(1);
    setSelectedKeys([]);
    void load(1, pageSize, emptyFilters);
  };

  const exportRows = async () => {
    setExporting(true);
    try {
      const response = await fetch("/api/labor-records/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordIds: selectedKeys.length ? selectedKeys.map(String) : undefined, filters }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.message || "用工记录导出失败，请稍后重试");
      }
      downloadBlob(await response.blob(), responseFileName(response));
      messageApi.success(`已导出${selectedKeys.length ? `所选 ${selectedKeys.length} 条` : "当前筛选结果全部"}记录`);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "用工记录导出失败，请稍后重试");
    } finally {
      setExporting(false);
    }
  };

  const openDetail = async (row: LaborRecordRow) => {
    const sequence = ++detailRequestSequence.current;
    setDetailId(row.id);
    setDetail(undefined);
    setDetailError("");
    setDetailLoading(true);
    try {
      const response = await fetch(`/api/labor-records/${encodeURIComponent(row.id)}`, { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || "用工考勤详情加载失败，请稍后重试");
      if (sequence === detailRequestSequence.current) setDetail(data);
    } catch (error) {
      if (sequence === detailRequestSequence.current) setDetailError(error instanceof Error ? error.message : "用工考勤详情加载失败，请稍后重试");
    } finally {
      if (sequence === detailRequestSequence.current) setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    detailRequestSequence.current += 1;
    setDetailId(undefined);
    setDetail(undefined);
    setDetailError("");
    setDetailLoading(false);
  };

  if (!canQuery) return <Alert type="warning" showIcon message="暂无用工记录查询权限" description="请联系管理员为当前角色配置相应权限。" />;

  const columns: ColumnsType<LaborRecordRow> = [
    { title: "品牌", dataIndex: "brandName", width: 170, fixed: "left", ellipsis: true },
    { title: "门店名称", dataIndex: "storeName", width: 240, ellipsis: true },
    { title: "日期", dataIndex: "businessDate", width: 130, align: "center" },
    { title: "实收金额", dataIndex: "receivedAmount", width: 160, align: "right", render: value => <span className="labor-record-money">{formatMoney(value)}</span> },
    { title: "实际用工（人）", dataIndex: "actualHeadcount", width: 150, align: "center", render: value => value === null || value === undefined ? "-" : value },
    { title: "用工状态", dataIndex: "laborStatusLabel", width: 150, align: "center", render: (value, row) => <Tooltip title={<div className="labor-record-status-tip">
      {row.unavailableReason ? <div>{row.unavailableReason}</div> : <>
        <div>考核标准：{row.assessmentMetricLabel || "-"}</div>
        <div>考核金额：{formatMoney(row.assessedAmount)}</div>
        <div>金额区间：{rangeText(row)}</div>
        <div>标准用工：{row.standardHeadcount === null ? "-" : `${row.standardHeadcount} 人`}</div>
        <div>实际用工：{row.actualHeadcount === null ? "-" : `${row.actualHeadcount} 人`}</div>
        <div>标准版本：{row.policyVersion === null ? "-" : `V${row.policyVersion}`}</div>
      </>}
    </div>}><Tag color={statusColor(row.laborStatus)}>{value}</Tag></Tooltip> },
    { title: "操作", key: "actions", width: 100, align: "center", fixed: "right", render: (_, row) => canView ? <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => void openDetail(row)}>查看</Button> : "-" },
  ];
  const rowSelection: TableRowSelection<LaborRecordRow> = {
    selectedRowKeys: selectedKeys,
    preserveSelectedRowKeys: true,
    onChange: setSelectedKeys,
    columnWidth: 48,
    fixed: true,
  };
  const hasFilters = Boolean(filters.brand || filters.storeNameKeyword || filters.startDate || filters.endDate || filters.laborStatus);

  return <>
    {messageContextHolder}
    {brandsError && <Alert className="labor-record-alert" type="warning" showIcon message={brandsError} action={<Button size="small" onClick={() => void loadBrands()}>重试</Button>} />}
    <Card className="labor-record-filter-card">
      <Form form={filterForm} layout="vertical" initialValues={{ brand: "ALL", laborStatus: "ALL" }}>
        <div className="labor-record-filter-grid">
          <Form.Item label="品牌" name="brand"><Select showSearch optionFilterProp="label" loading={brandsLoading} options={[{ value: "ALL", label: "全部" }, ...brandOptions]} /></Form.Item>
          <Form.Item label="门店名称" name="storeNameKeyword" rules={[{ max: 100, message: "门店名称不能超过100个字符" }]}><Input allowClear maxLength={100} placeholder="请输入门店名称" onPressEnter={() => void applyFilters()} /></Form.Item>
          <Form.Item label="开始日期" name="startDate" dependencies={["endDate"]} rules={[({ getFieldValue }) => ({
            validator(_, value?: Dayjs | null) {
              const endDate = getFieldValue("endDate") as Dayjs | undefined;
              return value && endDate && value.isAfter(endDate, "day") ? Promise.reject(new Error("开始日期不能晚于截止日期")) : Promise.resolve();
            },
          })]}><DatePicker allowClear format="YYYY-MM-DD" placeholder="请选择开始日期" /></Form.Item>
          <Form.Item label="截止日期" name="endDate" dependencies={["startDate"]} rules={[({ getFieldValue }) => ({
            validator(_, value?: Dayjs | null) {
              const startDate = getFieldValue("startDate") as Dayjs | undefined;
              return value && startDate && value.isBefore(startDate, "day") ? Promise.reject(new Error("开始日期不能晚于截止日期")) : Promise.resolve();
            },
          })]}><DatePicker allowClear format="YYYY-MM-DD" placeholder="请选择截止日期" /></Form.Item>
          <Form.Item label="用工状态" name="laborStatus"><Select options={[{ value: "ALL", label: "全部" }, ...statusOptions]} /></Form.Item>
          <div className="labor-record-filter-actions"><Space><Button onClick={resetFilters}>重置</Button><Button type="primary" icon={<SearchOutlined />} onClick={() => void applyFilters()}>筛选</Button></Space></div>
        </div>
      </Form>
    </Card>

    <Card className="labor-record-list-card">
      <div className="labor-record-toolbar">
        <Typography.Text type="secondary">共 <strong>{total}</strong> 条记录{selectedKeys.length ? <>，已选择 <strong>{selectedKeys.length}</strong> 条</> : null}</Typography.Text>
        {canExport && <Space size={12}><Typography.Text type="secondary">未勾选时导出当前筛选结果</Typography.Text><Button icon={<DownloadOutlined />} loading={exporting} disabled={loading || total === 0} onClick={() => void exportRows()}>{exporting ? "导出中..." : "批量导出"}</Button></Space>}
      </div>
      {loadError ? <Alert type="error" showIcon message={loadError} action={<Button size="small" onClick={() => void load(page, pageSize, filters)}>重新加载</Button>} /> : <Table<LaborRecordRow>
        rowKey="id"
        dataSource={rows}
        columns={columns}
        rowSelection={canExport ? rowSelection : undefined}
        loading={loading}
        scroll={{ x: 1200 }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={hasFilters ? "没有找到符合当前条件的用工记录" : "暂无用工记录"} /> }}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          pageSizeOptions: [20, 50, 100],
          showTotal: value => `共 ${value} 条`,
          onChange: (nextPage, nextPageSize) => {
            const targetPage = nextPageSize !== pageSize ? 1 : nextPage;
            setPage(targetPage);
            setPageSize(nextPageSize);
            void load(targetPage, nextPageSize, filters);
          },
        }}
      />}
    </Card>

    <Modal
      className="labor-record-detail-modal"
      width={1180}
      title="查看用工考勤详情"
      open={Boolean(detailId)}
      onCancel={closeDetail}
      footer={<Button onClick={closeDetail}>关闭</Button>}
    >
      {detailLoading ? <Skeleton active paragraph={{ rows: 8 }} /> : detailError ? <Alert type="error" showIcon message={detailError} action={<Button size="small" onClick={() => { const row = rows.find(item => item.id === detailId); if (row) void openDetail(row); }}>重新加载</Button>} /> : detail && <div className="labor-record-detail">
        <Descriptions bordered size="small" column={3}>
          <Descriptions.Item label="品牌">{detail.overview.brandName}</Descriptions.Item>
          <Descriptions.Item label="门店名称">{detail.overview.storeName}</Descriptions.Item>
          <Descriptions.Item label="日期">{detail.overview.businessDate}</Descriptions.Item>
          <Descriptions.Item label="考勤记录编号">{detail.overview.attendanceRecordNo || "-"}</Descriptions.Item>
          <Descriptions.Item label="实际用工">{detail.overview.actualHeadcount === null ? "-" : `${detail.overview.actualHeadcount} 人`}</Descriptions.Item>
        </Descriptions>
        {!detail.overview.hasAttendance ? <Alert className="labor-record-detail-empty-alert" type="info" showIcon message="当日没有考勤记录，暂无员工考勤明细。" /> : <>
          <div className="labor-record-detail-heading"><strong>员工考勤明细</strong><span>共 {detail.details.length} 人，实际用工仅统计“全勤”人数</span></div>
          <Table
            rowKey="personnelId"
            size="small"
            pagination={false}
            dataSource={detail.details}
            scroll={{ x: 1050, y: 420 }}
            columns={[
              { title: "员工姓名", dataIndex: "personnelName", width: 130 },
              { title: "岗位星级", dataIndex: "positionStar", width: 160, ellipsis: true },
              { title: "考勤状态", dataIndex: "attendanceStatus", width: 150, render: (value, item) => attendanceStatusTag(value, item.attendanceType) },
              { title: "加班小时", dataIndex: "overtimeHours", width: 120, align: "right" as const, render: value => decimalText(value, " 小时") },
              { title: "用工日成本", dataIndex: "dailyLaborCost", width: 145, align: "right" as const, render: moneyText },
              { title: "用工小时成本", dataIndex: "hourlyLaborCost", width: 155, align: "right" as const, render: moneyText },
              { title: "实际用工成本", dataIndex: "actualLaborCost", width: 155, fixed: "right" as const, align: "right" as const, render: value => <strong className="labor-record-actual-cost">{moneyText(value)}</strong> },
            ]}
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无员工考勤明细" /> }}
          />
        </>}
      </div>}
    </Modal>
  </>;
}

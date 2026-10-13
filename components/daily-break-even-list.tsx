"use client";

import { DownloadOutlined, EyeOutlined, SearchOutlined } from "@ant-design/icons";
import { Alert, Button, Card, DatePicker, Descriptions, Empty, Form, Input, message, Modal, Select, Space, Table, Tag, Typography } from "antd";
import type { ColumnsType, TableRowSelection } from "antd/es/table/interface";
import type { Dayjs } from "dayjs";
import { useCallback, useEffect, useRef, useState, type Key } from "react";

type BrandOption = { label: string; value: string };
type AchievementCode = "QUALIFIED" | "UNQUALIFIED";

export type DailyBreakEvenRow = {
  id: string;
  taskRecordNo: string;
  businessDate: string;
  submittedAt: string;
  brandName: string;
  storeName: string;
  submitterName: string;
  receivedAmount: number | null;
  monthlyBreakEvenRevenue: number | null;
  dailyBreakEvenRevenue: number | null;
  achievementCode: AchievementCode | null;
  achievementLabel: string | null;
};

type Filters = { brand: string; storeNameKeyword: string; startDate: string; endDate: string; achievement: "" | AchievementCode };
type FilterForm = { brand?: string; storeNameKeyword?: string; startDate?: Dayjs | null; endDate?: Dayjs | null; achievement?: "ALL" | AchievementCode };

const emptyFilters: Filters = { brand: "", storeNameKeyword: "", startDate: "", endDate: "", achievement: "" };
const moneyFormatter = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function formatMoney(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? moneyFormatter.format(value) : "-";
}

function responseFileName(response: Response) {
  const encoded = response.headers.get("Content-Disposition")?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  return encoded ? decodeURIComponent(encoded) : "每日保本营业额.xlsx";
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

function AchievementTag({ row }: { row: Pick<DailyBreakEvenRow, "achievementCode" | "achievementLabel"> }) {
  if (!row.achievementLabel) return <>-</>;
  return <Tag color={row.achievementCode === "QUALIFIED" ? "success" : row.achievementCode === "UNQUALIFIED" ? "error" : "default"}>{row.achievementLabel}</Tag>;
}

export function DailyBreakEvenList({ permissions }: { permissions: string[] }) {
  const [messageApi, messageContextHolder] = message.useMessage();
  const [filterForm] = Form.useForm<FilterForm>();
  const canQuery = permissions.includes("*") || permissions.includes("operations:view") || permissions.includes("daily-break-even:query");
  const canView = permissions.includes("*") || permissions.includes("operations:view") || permissions.includes("daily-break-even:view");
  const canExport = permissions.includes("*") || permissions.includes("daily-break-even:export");
  const [brandOptions, setBrandOptions] = useState<BrandOption[]>([]);
  const [brandsLoading, setBrandsLoading] = useState(canQuery);
  const [brandsError, setBrandsError] = useState("");
  const [rows, setRows] = useState<DailyBreakEvenRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [selectedKeys, setSelectedKeys] = useState<Key[]>([]);
  const [loading, setLoading] = useState(canQuery);
  const [loadError, setLoadError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [detail, setDetail] = useState<DailyBreakEvenRow | null>(null);
  const [detailLoadingId, setDetailLoadingId] = useState("");
  const requestSequence = useRef(0);

  const loadBrands = useCallback(async () => {
    setBrandsLoading(true);
    setBrandsError("");
    try {
      const response = await fetch("/api/daily-break-even/brands", { cache: "no-store" });
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
      const response = await fetch(`/api/daily-break-even?${query}`, { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || "每日保本营业额加载失败，请稍后重试");
      if (sequence !== requestSequence.current) return;
      setRows(data?.rows || []);
      setTotal(data?.total || 0);
      setPage(data?.page || targetPage);
      setPageSize(data?.pageSize || targetPageSize);
    } catch (error) {
      if (sequence !== requestSequence.current) return;
      const errorMessage = error instanceof Error ? error.message : "每日保本营业额加载失败，请稍后重试";
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
    void load(1, 10, emptyFilters);
  }, [canQuery, load, loadBrands]);

  const applyFilters = async () => {
    try {
      const values = await filterForm.validateFields();
      const next: Filters = {
        brand: values.brand === "ALL" ? "" : values.brand || "",
        storeNameKeyword: values.storeNameKeyword?.trim() || "",
        startDate: values.startDate?.format("YYYY-MM-DD") || "",
        endDate: values.endDate?.format("YYYY-MM-DD") || "",
        achievement: values.achievement === "ALL" ? "" : values.achievement || "",
      };
      setFilters(next);
      setPage(1);
      setSelectedKeys([]);
      void load(1, pageSize, next);
    } catch { /* 表单直接展示校验信息 */ }
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
      const response = await fetch("/api/daily-break-even/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordIds: selectedKeys.length ? selectedKeys.map(String) : undefined, filters }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.message || "每日保本营业额导出失败，请稍后重试");
      }
      downloadBlob(await response.blob(), responseFileName(response));
      messageApi.success(`已导出${selectedKeys.length ? `所选 ${selectedKeys.length} 条` : "当前筛选结果全部"}记录`);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "每日保本营业额导出失败，请稍后重试");
    } finally {
      setExporting(false);
    }
  };

  const viewDetail = async (id: string) => {
    setDetailLoadingId(id);
    try {
      const response = await fetch(`/api/daily-break-even/${encodeURIComponent(id)}`, { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || "每日保本营业额详情加载失败，请稍后重试");
      setDetail(data?.detail || null);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "每日保本营业额详情加载失败，请稍后重试");
    } finally {
      setDetailLoadingId("");
    }
  };

  if (!canQuery) return <Alert type="warning" showIcon message="暂无每日保本营业额查询权限" description="请联系管理员为当前角色配置相应权限。" />;

  const columns: ColumnsType<DailyBreakEvenRow> = [
    { title: "业务日期", dataIndex: "businessDate", width: 130, align: "center", fixed: "left" },
    { title: "任务记录编号", dataIndex: "taskRecordNo", width: 175, ellipsis: true },
    { title: "品牌", dataIndex: "brandName", width: 150, ellipsis: true },
    { title: "门店", dataIndex: "storeName", width: 220, ellipsis: true },
    { title: "【营业数据】实收金额", dataIndex: "receivedAmount", width: 200, align: "right", render: value => <span className="daily-break-even-money">{formatMoney(value as number | null)}</span> },
    { title: "日保本营业额", dataIndex: "dailyBreakEvenRevenue", width: 165, align: "right", render: value => <span className="daily-break-even-money">{formatMoney(value as number | null)}</span> },
    { title: "保本达标", dataIndex: "achievementLabel", width: 120, align: "center", render: (_, row) => <AchievementTag row={row} /> },
    { title: "操作", key: "actions", width: 100, align: "center", fixed: "right", render: (_, row) => canView ? <Button type="link" size="small" icon={<EyeOutlined />} loading={detailLoadingId === row.id} disabled={Boolean(detailLoadingId) && detailLoadingId !== row.id} onClick={() => void viewDetail(row.id)}>查看</Button> : "-" },
  ];
  const rowSelection: TableRowSelection<DailyBreakEvenRow> = {
    selectedRowKeys: selectedKeys,
    preserveSelectedRowKeys: true,
    onChange: setSelectedKeys,
    columnWidth: 48,
    fixed: true,
  };
  const hasFilters = Boolean(filters.brand || filters.storeNameKeyword || filters.startDate || filters.endDate || filters.achievement);

  return <>
    {messageContextHolder}
    {brandsError && <Alert className="daily-break-even-alert" type="warning" showIcon message={brandsError} action={<Button size="small" onClick={() => void loadBrands()}>重试</Button>} />}
    <Card className="daily-break-even-filter-card">
      <Form form={filterForm} layout="vertical" initialValues={{ brand: "ALL", achievement: "ALL" }}>
        <div className="daily-break-even-filter-grid">
          <Form.Item label="品牌" name="brand">
            <Select showSearch optionFilterProp="label" loading={brandsLoading} options={[{ value: "ALL", label: "全部" }, ...brandOptions]} />
          </Form.Item>
          <Form.Item label="门店名称" name="storeNameKeyword" rules={[{ max: 100, message: "门店名称不能超过100个字符" }]}>
            <Input allowClear maxLength={100} placeholder="请输入门店名称" onPressEnter={() => void applyFilters()} />
          </Form.Item>
          <Form.Item label="开始日期" name="startDate" dependencies={["endDate"]} rules={[({ getFieldValue }) => ({
            validator(_, value?: Dayjs | null) {
              const endDate = getFieldValue("endDate") as Dayjs | undefined;
              return value && endDate && value.isAfter(endDate, "day") ? Promise.reject(new Error("开始日期不能晚于截止日期")) : Promise.resolve();
            },
          })]}>
            <DatePicker allowClear format="YYYY-MM-DD" placeholder="请选择开始日期" />
          </Form.Item>
          <Form.Item label="截止日期" name="endDate" dependencies={["startDate"]} rules={[({ getFieldValue }) => ({
            validator(_, value?: Dayjs | null) {
              const startDate = getFieldValue("startDate") as Dayjs | undefined;
              return value && startDate && value.isBefore(startDate, "day") ? Promise.reject(new Error("开始日期不能晚于截止日期")) : Promise.resolve();
            },
          })]}>
            <DatePicker allowClear format="YYYY-MM-DD" placeholder="请选择截止日期" />
          </Form.Item>
          <Form.Item label="保本达标" name="achievement">
            <Select options={[{ value: "ALL", label: "全部" }, { value: "QUALIFIED", label: "合格" }, { value: "UNQUALIFIED", label: "不合格" }]} />
          </Form.Item>
          <div className="daily-break-even-filter-actions"><Space><Button onClick={resetFilters}>重置</Button><Button type="primary" icon={<SearchOutlined />} onClick={() => void applyFilters()}>筛选</Button></Space></div>
        </div>
      </Form>
    </Card>

    <Card className="daily-break-even-list-card">
      <div className="daily-break-even-toolbar">
        <div>
          <Typography.Text type="secondary">共 <strong>{total}</strong> 条记录</Typography.Text>
          {canExport && selectedKeys.length > 0 && <Typography.Text type="secondary">，已选择 <strong>{selectedKeys.length}</strong> 条</Typography.Text>}
        </div>
        {canExport && <Space size={12}>
          <Typography.Text className="daily-break-even-export-hint" type="secondary">未勾选时导出当前筛选结果</Typography.Text>
          <Button icon={<DownloadOutlined />} loading={exporting} disabled={loading || total === 0} onClick={() => void exportRows()}>{exporting ? "导出中..." : "批量导出"}</Button>
        </Space>}
      </div>
      {loadError ? <Alert className="daily-break-even-table-error" type="error" showIcon message={loadError} action={<Button size="small" onClick={() => void load(page, pageSize, filters)}>重新加载</Button>} /> : <Table<DailyBreakEvenRow>
        rowKey="id"
        dataSource={rows}
        columns={columns}
        rowSelection={canExport ? rowSelection : undefined}
        loading={loading}
        scroll={{ x: 1320 }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={hasFilters ? <><div>没有找到符合当前条件的保本营业额记录</div><small>请调整筛选条件后重试</small><div><Button type="link" onClick={resetFilters}>重置筛选</Button></div></> : <><div>暂无每日保本营业额记录</div><small>当前业务数据源中还没有正式上报数据</small></>} /> }}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          pageSizeOptions: [10, 20, 50, 100],
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

    <Modal title="查看每日保本营业额" open={Boolean(detail)} onCancel={() => setDetail(null)} footer={<Button type="primary" onClick={() => setDetail(null)}>关闭</Button>} width={780} destroyOnHidden>
      {detail && <Descriptions bordered column={2} size="middle">
        <Descriptions.Item label="任务记录编号">{detail.taskRecordNo}</Descriptions.Item>
        <Descriptions.Item label="业务日期">{detail.businessDate}</Descriptions.Item>
        <Descriptions.Item label="上报时间">{detail.submittedAt}</Descriptions.Item>
        <Descriptions.Item label="品牌">{detail.brandName}</Descriptions.Item>
        <Descriptions.Item label="门店">{detail.storeName}</Descriptions.Item>
        <Descriptions.Item label="上报人">{detail.submitterName}</Descriptions.Item>
        <Descriptions.Item label="【营业数据】实收金额">{formatMoney(detail.receivedAmount)}</Descriptions.Item>
        <Descriptions.Item label="月保本营业额">{formatMoney(detail.monthlyBreakEvenRevenue)}</Descriptions.Item>
        <Descriptions.Item label="日保本营业额">{formatMoney(detail.dailyBreakEvenRevenue)}</Descriptions.Item>
        <Descriptions.Item label="保本达标"><AchievementTag row={detail} /></Descriptions.Item>
      </Descriptions>}
    </Modal>
  </>;
}

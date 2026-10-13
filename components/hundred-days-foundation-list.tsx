"use client";

import { DownloadOutlined, SearchOutlined } from "@ant-design/icons";
import { Alert, Button, Card, DatePicker, Empty, Form, Input, message, Select, Space, Table } from "antd";
import type { ColumnsType, TableRowSelection } from "antd/es/table/interface";
import type { Dayjs } from "dayjs";
import { useCallback, useEffect, useRef, useState, type Key } from "react";
import { useBusinessDictionaries } from "@/hooks/use-business-dictionaries";

type PlatformCode = "KUAISHOU" | "MEITUAN" | "DOUYIN" | "GAODE";

const platformOptions: Array<{ value: PlatformCode; label: string }> = [
  { value: "KUAISHOU", label: "快手团购" },
  { value: "MEITUAN", label: "美团团购" },
  { value: "DOUYIN", label: "抖音团购" },
  { value: "GAODE", label: "高德团购" },
];

export type HundredDaysRow = {
  id: string;
  submissionId: string;
  platformCode: PlatformCode;
  brandName: string;
  storeName: string;
  weekDate: string;
  platformName: string;
  shopScore: number | null;
  rating: number | null;
  weeklyOrders: number | null;
  weeklyReviews: number | null;
  weeklyPositiveReviews: number | null;
  weeklyNegativeReviews: number | null;
  reviewRate: number | null;
  positiveRate: number | null;
  negativeRate: number | null;
  productQuality: string | null;
  serviceExperience: string | null;
  environmentExperience: string | null;
};

type Filters = { brand: string; storeNameKeyword: string; platform: "" | PlatformCode; startDate: string; endDate: string };
type FilterForm = { brand?: string; storeNameKeyword?: string; platform?: "ALL" | PlatformCode; startDate?: Dayjs | null; endDate?: Dayjs | null };

const emptyFilters: Filters = { brand: "", storeNameKeyword: "", platform: "", startDate: "", endDate: "" };
const numberFormatter = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 });
const percentFormatter = new Intl.NumberFormat("zh-CN", { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 });

function displayNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? numberFormatter.format(value) : "-";
}

function displayPercent(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? percentFormatter.format(value) : "-";
}

function responseFileName(response: Response) {
  const encoded = response.headers.get("Content-Disposition")?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  return encoded ? decodeURIComponent(encoded) : "百日筑基表.xlsx";
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

export function HundredDaysFoundationList({ permissions }: { permissions: string[] }) {
  const [messageApi, messageContextHolder] = message.useMessage();
  const [filterForm] = Form.useForm<FilterForm>();
  const { options: dictionaries, loading: dictionariesLoading, error: dictionaryError, reload: reloadDictionaries } = useBusinessDictionaries(["BRAND"]);
  const canQuery = permissions.includes("*") || permissions.includes("operations:view") || permissions.includes("hundred-days:query");
  const canExport = permissions.includes("*") || permissions.includes("hundred-days:export");
  const [rows, setRows] = useState<HundredDaysRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [selectedKeys, setSelectedKeys] = useState<Key[]>([]);
  const [loading, setLoading] = useState(canQuery);
  const [loadError, setLoadError] = useState("");
  const [exporting, setExporting] = useState(false);
  const requestSequence = useRef(0);

  const load = useCallback(async (targetPage: number, targetPageSize: number, targetFilters: Filters) => {
    const sequence = ++requestSequence.current;
    setLoading(true);
    setLoadError("");
    const query = new URLSearchParams({ page: String(targetPage), pageSize: String(targetPageSize) });
    Object.entries(targetFilters).forEach(([key, value]) => { if (value) query.set(key, value); });
    try {
      const response = await fetch(`/api/hundred-days-foundation?${query}`, { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || "百日筑基表数据加载失败，请稍后重试");
      if (sequence !== requestSequence.current) return;
      setRows(data?.rows || []);
      setTotal(data?.total || 0);
      setPage(data?.page || targetPage);
      setPageSize(data?.pageSize || targetPageSize);
    } catch (error) {
      if (sequence !== requestSequence.current) return;
      const errorMessage = error instanceof Error ? error.message : "百日筑基表数据加载失败，请稍后重试";
      setRows([]);
      setTotal(0);
      setLoadError(errorMessage);
      messageApi.error(errorMessage);
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, [messageApi]);

  useEffect(() => {
    if (canQuery) void load(1, 10, emptyFilters);
  }, [canQuery, load]);

  const applyFilters = async () => {
    try {
      const values = await filterForm.validateFields();
      const next: Filters = {
        brand: values.brand === "ALL" ? "" : values.brand || "",
        storeNameKeyword: values.storeNameKeyword?.trim() || "",
        platform: values.platform === "ALL" ? "" : values.platform || "",
        startDate: values.startDate?.format("YYYY-MM-DD") || "",
        endDate: values.endDate?.format("YYYY-MM-DD") || "",
      };
      setFilters(next);
      setPage(1);
      setSelectedKeys([]);
      void load(1, pageSize, next);
    } catch { /* 表单直接展示日期范围校验信息 */ }
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
      const response = await fetch("/api/hundred-days-foundation/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordIds: selectedKeys.length ? selectedKeys.map(String) : undefined, filters }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.message || "百日筑基表导出失败，请稍后重试");
      }
      downloadBlob(await response.blob(), responseFileName(response));
      messageApi.success(`已导出${selectedKeys.length ? `所选 ${selectedKeys.length} 条` : "当前筛选结果全部"}记录`);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "百日筑基表导出失败，请稍后重试");
    } finally {
      setExporting(false);
    }
  };

  if (!canQuery) return <Alert type="warning" showIcon message="暂无百日筑基表查询权限" description="请联系管理员为当前角色配置相应权限。" />;

  const numberColumn = (title: string, dataIndex: keyof HundredDaysRow, width = 125): ColumnsType<HundredDaysRow>[number] => ({
    title,
    dataIndex,
    width,
    align: "right",
    render: value => displayNumber(value as number | null),
  });
  const percentColumn = (title: string, dataIndex: keyof HundredDaysRow): ColumnsType<HundredDaysRow>[number] => ({
    title,
    dataIndex,
    width: 125,
    align: "right",
    render: value => displayPercent(value as number | null),
  });
  const columns: ColumnsType<HundredDaysRow> = [
    { title: "品牌", dataIndex: "brandName", width: 150, fixed: "left", ellipsis: true },
    { title: "门店名称", dataIndex: "storeName", width: 220, fixed: "left", ellipsis: true },
    { title: "周次日期", dataIndex: "weekDate", width: 130, align: "center" },
    { title: "平台名称", dataIndex: "platformName", width: 130 },
    numberColumn("店铺分", "shopScore"),
    numberColumn("评分", "rating"),
    numberColumn("周单量", "weeklyOrders"),
    numberColumn("周评价数", "weeklyReviews"),
    numberColumn("周好评数", "weeklyPositiveReviews"),
    numberColumn("周差评数", "weeklyNegativeReviews"),
    percentColumn("评价率", "reviewRate"),
    percentColumn("好评率", "positiveRate"),
    percentColumn("差评率", "negativeRate"),
    { title: "产品质量(内容)", dataIndex: "productQuality", width: 260, ellipsis: true, render: value => value || "-" },
    { title: "服务体验(内容)", dataIndex: "serviceExperience", width: 260, ellipsis: true, render: value => value || "-" },
    { title: "环境卫生体验(内容)", dataIndex: "environmentExperience", width: 280, ellipsis: true, render: value => value || "-" },
  ];
  const rowSelection: TableRowSelection<HundredDaysRow> = {
    selectedRowKeys: selectedKeys,
    preserveSelectedRowKeys: true,
    onChange: setSelectedKeys,
    columnWidth: 48,
    fixed: true,
  };
  const hasFilters = Boolean(filters.brand || filters.storeNameKeyword || filters.platform || filters.startDate || filters.endDate);

  return <>
    {messageContextHolder}
    {dictionaryError && <Alert className="hundred-days-alert" type="warning" showIcon message="品牌数据加载失败，请稍后重试" action={<Button size="small" onClick={() => void reloadDictionaries()}>重试</Button>} />}
    <Card className="hundred-days-filter-card">
      <Form form={filterForm} layout="vertical" initialValues={{ brand: "ALL", platform: "ALL" }}>
        <div className="hundred-days-filter-grid">
          <Form.Item label="品牌" name="brand">
            <Select loading={dictionariesLoading} options={[{ value: "ALL", label: "全部" }, ...(dictionaries.BRAND || [])]} />
          </Form.Item>
          <Form.Item label="门店名称" name="storeNameKeyword" rules={[{ max: 100, message: "门店名称不能超过100个字符" }]}>
            <Input allowClear maxLength={100} placeholder="请输入门店名称" onPressEnter={() => void applyFilters()} />
          </Form.Item>
          <Form.Item label="平台" name="platform">
            <Select options={[{ value: "ALL", label: "全部" }, ...platformOptions]} />
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
          <div className="hundred-days-filter-actions"><Space><Button onClick={resetFilters}>重置</Button><Button type="primary" icon={<SearchOutlined />} onClick={() => void applyFilters()}>筛选</Button></Space></div>
        </div>
      </Form>
    </Card>

    <Card className="hundred-days-list-card">
      <div className="hundred-days-toolbar">
        <span>共 <strong>{total}</strong> 条平台记录{selectedKeys.length ? `，已选择 ${selectedKeys.length} 条` : ""}</span>
        {canExport && <Button icon={<DownloadOutlined />} loading={exporting} disabled={loading || total === 0} onClick={() => void exportRows()}>{exporting ? "导出中..." : "批量导出"}</Button>}
      </div>
      {loadError ? <Alert type="error" showIcon message={loadError} action={<Button size="small" onClick={() => void load(page, pageSize, filters)}>重新加载</Button>} /> : <Table<HundredDaysRow>
        rowKey="id"
        dataSource={rows}
        columns={columns}
        rowSelection={canExport ? rowSelection : undefined}
        loading={loading}
        scroll={{ x: 2760 }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={hasFilters ? <><div>没有找到符合当前条件的百日筑基表记录</div><small>请调整筛选条件后重试</small><div><Button type="link" onClick={resetFilters}>重置筛选</Button></div></> : <><div>暂无百日筑基表记录</div><small>当前业务数据源中还没有正式上报数据</small></>} /> }}
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
  </>;
}

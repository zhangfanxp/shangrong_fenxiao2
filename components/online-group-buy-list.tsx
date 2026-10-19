"use client";

import { DownloadOutlined, SearchOutlined } from "@ant-design/icons";
import { Alert, AutoComplete, Button, Card, DatePicker, Descriptions, Empty, Form, Input, Modal, Select, Space, Table, Typography, message } from "antd";
import type { ColumnsType, TableRowSelection } from "antd/es/table/interface";
import type { Dayjs } from "dayjs";
import { useCallback, useEffect, useRef, useState, type Key } from "react";

type BrandOption = { label: string; value: string };
type Filters = { brand: string; storeName: string; storeNameKeyword: string; startDate: string; endDate: string };
type FilterForm = { brand?: string; storeName?: string; startDate?: Dayjs | null; endDate?: Dayjs | null };

export type OnlineGroupBuyRow = {
  id: string;
  recordNo: string;
  brandName: string;
  storeName: string;
  businessDate: string;
  actualSalesAmount: number | null;
  receivedAmount: number | null;
  scanCashAmount: number | null;
  meituanAmount: number | null;
  douyinAmount: number | null;
  kuaishouAmount: number | null;
  gaodeAmount: number | null;
  takeawayAmount: number | null;
  submitterName: string;
  meituanPercent: number | null;
  douyinPercent: number | null;
  kuaishouPercent: number | null;
  gaodePercent: number | null;
  takeawayPercent: number | null;
  offlinePercent: number | null;
};

const emptyFilters: Filters = { brand: "", storeName: "", storeNameKeyword: "", startDate: "", endDate: "" };
const moneyFormatter = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function formatMoney(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? moneyFormatter.format(value) : "-";
}

function formatPercent(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(2)}%` : "-";
}

function responseFileName(response: Response) {
  const encoded = response.headers.get("Content-Disposition")?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  return encoded ? decodeURIComponent(encoded) : "线上团购数据.xlsx";
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

export function OnlineGroupBuyList({ permissions }: { permissions: string[] }) {
  const [messageApi, messageContextHolder] = message.useMessage();
  const [filterForm] = Form.useForm<FilterForm>();
  const canQuery = permissions.includes("*") || permissions.includes("operations:view") || permissions.includes("online-group-buy:query");
  const canView = canQuery || permissions.includes("online-group-buy:view");
  const canExport = permissions.includes("*") || permissions.includes("online-group-buy:export");
  const [brandOptions, setBrandOptions] = useState<BrandOption[]>([]);
  const [brandsLoading, setBrandsLoading] = useState(canQuery);
  const [brandsError, setBrandsError] = useState("");
  const [storeOptions, setStoreOptions] = useState<string[]>([]);
  const [selectedStoreName, setSelectedStoreName] = useState("");
  const [rows, setRows] = useState<OnlineGroupBuyRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [selectedKeys, setSelectedKeys] = useState<Key[]>([]);
  const [loading, setLoading] = useState(canQuery);
  const [loadError, setLoadError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<OnlineGroupBuyRow | null>(null);
  const requestSequence = useRef(0);
  const storeSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const storeSearchSequence = useRef(0);
  const selectedStoreNameRef = useRef("");

  const loadBrands = useCallback(async () => {
    setBrandsLoading(true);
    setBrandsError("");
    try {
      const response = await fetch("/api/online-group-buy/brands", { cache: "no-store" });
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

  const loadStores = useCallback(async (keyword: string, brand: string, sequence: number) => {
    if (!keyword.trim()) { if (sequence === storeSearchSequence.current) setStoreOptions([]); return; }
    const query = new URLSearchParams({ keyword: keyword.trim() });
    if (brand && brand !== "ALL") query.set("brand", brand);
    try {
      const response = await fetch(`/api/online-group-buy/stores?${query}`, { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || "门店名称加载失败");
      if (sequence !== storeSearchSequence.current) return;
      setStoreOptions(Array.isArray(data?.stores) ? data.stores : []);
    } catch (error) {
      if (sequence !== storeSearchSequence.current) return;
      setStoreOptions([]);
      messageApi.error(error instanceof Error ? error.message : "门店名称加载失败");
    }
  }, [messageApi]);

  const load = useCallback(async (targetPage: number, targetPageSize: number, targetFilters: Filters) => {
    const sequence = ++requestSequence.current;
    setLoading(true);
    setLoadError("");
    const query = new URLSearchParams({ page: String(targetPage), pageSize: String(targetPageSize) });
    Object.entries(targetFilters).forEach(([key, value]) => { if (value) query.set(key, value); });
    try {
      const response = await fetch(`/api/online-group-buy?${query}`, { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || "线上团购数据加载失败，请稍后重试");
      if (sequence !== requestSequence.current) return;
      setRows(data?.rows || []);
      setTotal(data?.total || 0);
      setPage(data?.page || targetPage);
      setPageSize(data?.pageSize || targetPageSize);
    } catch (error) {
      if (sequence !== requestSequence.current) return;
      const errorMessage = error instanceof Error ? error.message : "线上团购数据加载失败，请稍后重试";
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
    return () => { if (storeSearchTimer.current) clearTimeout(storeSearchTimer.current); };
  }, [canQuery, load, loadBrands]);

  const applyFilters = async () => {
    try {
      const values = await filterForm.validateFields();
      const storeInput = values.storeName?.trim() || "";
      const next: Filters = {
        brand: values.brand === "ALL" ? "" : values.brand || "",
        storeName: selectedStoreName && selectedStoreName === storeInput ? selectedStoreName : "",
        storeNameKeyword: selectedStoreName && selectedStoreName === storeInput ? "" : storeInput,
        startDate: values.startDate?.format("YYYY-MM-DD") || "",
        endDate: values.endDate?.format("YYYY-MM-DD") || "",
      };
      setFilters(next);
      setPage(1);
      setSelectedKeys([]);
      void load(1, pageSize, next);
    } catch { /* 表单直接展示校验信息 */ }
  };

  const resetFilters = () => {
    filterForm.resetFields();
    selectedStoreNameRef.current = "";
    storeSearchSequence.current += 1;
    if (storeSearchTimer.current) clearTimeout(storeSearchTimer.current);
    setSelectedStoreName("");
    setStoreOptions([]);
    setFilters(emptyFilters);
    setPage(1);
    setSelectedKeys([]);
    void load(1, pageSize, emptyFilters);
  };

  const exportRows = async () => {
    setExporting(true);
    try {
      const response = await fetch("/api/online-group-buy/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordIds: selectedKeys.length ? selectedKeys.map(String) : undefined, filters }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.message || "线上团购数据导出失败，请稍后重试");
      }
      downloadBlob(await response.blob(), responseFileName(response));
      messageApi.success(`已导出${selectedKeys.length ? `所选 ${selectedKeys.length} 条` : "当前筛选结果全部"}记录`);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "线上团购数据导出失败，请稍后重试");
    } finally {
      setExporting(false);
    }
  };

  const openDetail = async (id: string) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetail(null);
    try {
      const response = await fetch(`/api/online-group-buy/${encodeURIComponent(id)}`, { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || "线上团购数据详情加载失败，请稍后重试");
      setDetail(data.row || null);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "线上团购数据详情加载失败，请稍后重试");
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  if (!canQuery) return <Alert type="warning" showIcon message="暂无线上团购数据查询权限" description="请联系管理员为当前角色配置相应权限。" />;

  const percentColumn = (title: string, dataIndex: keyof OnlineGroupBuyRow): ColumnsType<OnlineGroupBuyRow>[number] => ({
    title,
    dataIndex,
    width: 145,
    align: "right",
    render: value => <span className="online-group-buy-percent">{formatPercent(value as number | null)}</span>,
  });
  const columns: ColumnsType<OnlineGroupBuyRow> = [
    { title: "业务日期", dataIndex: "businessDate", width: 130, align: "center", fixed: "left" },
    { title: "品牌", dataIndex: "brandName", width: 145, ellipsis: true },
    { title: "门店", dataIndex: "storeName", width: 220, ellipsis: true },
    percentColumn("美团订单占比", "meituanPercent"),
    percentColumn("抖音订单占比", "douyinPercent"),
    percentColumn("快手订单占比", "kuaishouPercent"),
    percentColumn("高德订单占比", "gaodePercent"),
    percentColumn("外卖占比", "takeawayPercent"),
    percentColumn("线下订单占比", "offlinePercent"),
    { title: "操作", key: "actions", width: 90, fixed: "right", align: "center", render: (_, row) => canView ? <Button type="link" size="small" onClick={() => void openDetail(row.id)}>查看</Button> : "-" },
  ];
  const rowSelection: TableRowSelection<OnlineGroupBuyRow> = {
    selectedRowKeys: selectedKeys,
    preserveSelectedRowKeys: true,
    onChange: setSelectedKeys,
    columnWidth: 48,
    fixed: true,
  };
  const hasFilters = Boolean(filters.brand || filters.storeName || filters.storeNameKeyword || filters.startDate || filters.endDate);

  return <>
    {messageContextHolder}
    {brandsError && <Alert className="online-group-buy-alert" type="warning" showIcon message={brandsError} action={<Button size="small" onClick={() => void loadBrands()}>重试</Button>} />}
    <Card className="online-group-buy-filter-card">
      <Form form={filterForm} layout="vertical" initialValues={{ brand: "ALL" }}>
        <div className="online-group-buy-filter-grid">
          <Form.Item label="品牌" name="brand">
            <Select showSearch optionFilterProp="label" loading={brandsLoading} options={[{ value: "ALL", label: "全部" }, ...brandOptions]} onChange={() => { selectedStoreNameRef.current = ""; storeSearchSequence.current += 1; if (storeSearchTimer.current) clearTimeout(storeSearchTimer.current); setSelectedStoreName(""); setStoreOptions([]); filterForm.setFieldValue("storeName", ""); }} />
          </Form.Item>
          <Form.Item label="门店名称" name="storeName">
            <AutoComplete
              options={storeOptions.map(store => ({ value: store, label: store }))}
              onChange={value => {
                if (value !== selectedStoreNameRef.current) {
                  selectedStoreNameRef.current = "";
                  setSelectedStoreName("");
                }
              }}
              onSelect={value => { selectedStoreNameRef.current = value; storeSearchSequence.current += 1; if (storeSearchTimer.current) clearTimeout(storeSearchTimer.current); setSelectedStoreName(value); setStoreOptions([]); }}
              onSearch={value => {
                if (storeSearchTimer.current) clearTimeout(storeSearchTimer.current);
                const sequence = ++storeSearchSequence.current;
                if (!value.trim() || value === selectedStoreNameRef.current) { setStoreOptions([]); return; }
                storeSearchTimer.current = setTimeout(() => void loadStores(value, filterForm.getFieldValue("brand") || "ALL", sequence), 250);
              }}
            >
              <Input allowClear maxLength={100} placeholder="请输入门店名称关键词" onPressEnter={() => void applyFilters()} />
            </AutoComplete>
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
          <div className="online-group-buy-filter-actions"><Space><Button onClick={resetFilters}>重置</Button><Button type="primary" icon={<SearchOutlined />} onClick={() => void applyFilters()}>查询</Button></Space></div>
        </div>
      </Form>
    </Card>

    <Card className="online-group-buy-list-card">
      <div className="online-group-buy-toolbar">
        <div>
          <Typography.Text type="secondary">共 <strong>{total}</strong> 条记录</Typography.Text>
          {canExport && selectedKeys.length > 0 && <Typography.Text type="secondary">，已选择 <strong>{selectedKeys.length}</strong> 条</Typography.Text>}
        </div>
        {canExport && <Space size={12}>
          <Typography.Text className="online-group-buy-export-hint" type="secondary">未勾选时导出当前筛选结果</Typography.Text>
          <Button icon={<DownloadOutlined />} loading={exporting} disabled={loading || total === 0} onClick={() => void exportRows()}>{exporting ? "导出中..." : "批量导出"}</Button>
        </Space>}
      </div>
      {loadError ? <Alert className="online-group-buy-table-error" type="error" showIcon message={loadError} action={<Button size="small" onClick={() => void load(page, pageSize, filters)}>重新加载</Button>} /> : <Table<OnlineGroupBuyRow>
        rowKey="id"
        dataSource={rows}
        columns={columns}
        rowSelection={canExport ? rowSelection : undefined}
        loading={loading}
        scroll={{ x: 1570 }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={hasFilters ? <><div>没有找到符合当前条件的线上团购数据</div><small>请调整筛选条件后重试</small><div><Button type="link" onClick={resetFilters}>重置筛选</Button></div></> : <><div>暂无线上团购数据</div><small>当前业务数据源中还没有正式上报记录</small></>} /> }}
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

    <Modal title="查看线上团购数据" open={detailOpen} onCancel={() => setDetailOpen(false)} footer={<Button onClick={() => setDetailOpen(false)}>关闭</Button>} width={900} destroyOnClose>
      {detailLoading ? <div className="online-group-buy-detail-loading">加载中...</div> : detail && <Descriptions bordered column={2} size="small">
        <Descriptions.Item label="记录编号">{detail.recordNo}</Descriptions.Item>
        <Descriptions.Item label="业务日期">{detail.businessDate}</Descriptions.Item>
        <Descriptions.Item label="品牌">{detail.brandName}</Descriptions.Item>
        <Descriptions.Item label="门店">{detail.storeName}</Descriptions.Item>
        <Descriptions.Item label="美团订单">{formatMoney(detail.meituanAmount)}</Descriptions.Item>
        <Descriptions.Item label="美团占比">{formatPercent(detail.meituanPercent)}</Descriptions.Item>
        <Descriptions.Item label="抖音订单">{formatMoney(detail.douyinAmount)}</Descriptions.Item>
        <Descriptions.Item label="抖音占比">{formatPercent(detail.douyinPercent)}</Descriptions.Item>
        <Descriptions.Item label="快手订单">{formatMoney(detail.kuaishouAmount)}</Descriptions.Item>
        <Descriptions.Item label="快手占比">{formatPercent(detail.kuaishouPercent)}</Descriptions.Item>
        <Descriptions.Item label="高德订单">{formatMoney(detail.gaodeAmount)}</Descriptions.Item>
        <Descriptions.Item label="高德占比">{formatPercent(detail.gaodePercent)}</Descriptions.Item>
        <Descriptions.Item label="外卖">{formatMoney(detail.takeawayAmount)}</Descriptions.Item>
        <Descriptions.Item label="外卖占比">{formatPercent(detail.takeawayPercent)}</Descriptions.Item>
        <Descriptions.Item label="扫码/现金">{formatMoney(detail.scanCashAmount)}</Descriptions.Item>
        <Descriptions.Item label="线下占比">{formatPercent(detail.offlinePercent)}</Descriptions.Item>
        <Descriptions.Item label="实收金额">{formatMoney(detail.receivedAmount)}</Descriptions.Item>
        <Descriptions.Item label="实际销售金额">{formatMoney(detail.actualSalesAmount)}</Descriptions.Item>
      </Descriptions>}
    </Modal>
  </>;
}

"use client";

import { DownloadOutlined, EyeOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { Alert, Button, Card, DatePicker, Descriptions, Empty, Form, message, Modal, Select, Skeleton, Space, Table, Tag } from "antd";
import type { ColumnsType, TableRowSelection } from "antd/es/table/interface";
import type { Dayjs } from "dayjs";
import { useRef, useState } from "react";
import { useBusinessDictionaries } from "@/hooks/use-business-dictionaries";

export type LaborCostRow = {
  id: string;
  attendanceDate: string;
  recordNo: string;
  brandName: string;
  storeName: string;
  cooperationType: string;
  fullTimeLaborCost: string | null;
  partTimeLaborCost: string;
  totalLaborCost: string | null;
};

type Filters = { brand: string; storeId: string; startDate: string; endDate: string };
type FilterForm = { brand?: string; storeId?: string; startDate?: Dayjs | null; endDate?: Dayjs | null };
type StoreOption = { storeId: string; storeName: string; brandCode: string; brandName: string };
type LaborCostDetail = {
  overview: LaborCostRow;
  details: Array<{
    personnelId: string;
    personnelName: string;
    positionStar: string;
    attendanceStatus: string;
    attendanceType: string;
    leaveHours: string | null;
    overtimeHours: string;
    dailyLaborCost: string | null;
    hourlyLaborCost: string | null;
    actualLaborCost: string | null;
  }>;
};

const emptyFilters: Filters = { brand: "", storeId: "", startDate: "", endDate: "" };

function responseFileName(response: Response) {
  const encoded = response.headers.get("Content-Disposition")?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  return encoded ? decodeURIComponent(encoded) : "人力成本.xlsx";
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

function moneyText(amount: string | null) {
  if (amount === null) return "-";
  return `¥ ${Number(amount).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function decimalText(value: string | null, suffix: string) {
  if (value === null) return "-";
  return `${Number(value).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}${suffix}`;
}

function statusTag(status: string, type: string) {
  const color = type === "FULL_ATTENDANCE" ? "success" : type === "REST" ? "default" : type === "LEAVE_FULL_DAY" ? "error" : "warning";
  return <Tag color={color}>{status}</Tag>;
}

export function LaborCostList({ permissions, initialRows = [], initialTotal = 0 }: { permissions: string[]; initialRows?: LaborCostRow[]; initialTotal?: number }) {
  const [messageApi, messageContextHolder] = message.useMessage();
  const [filterForm] = Form.useForm<FilterForm>();
  const startDate = Form.useWatch("startDate", filterForm);
  const endDate = Form.useWatch("endDate", filterForm);
  const { options: dictionaries, loading: dictionaryLoading, error: dictionaryError, reload: reloadDictionaries } = useBusinessDictionaries(["BRAND"]);
  const [rows, setRows] = useState(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);
  const [exporting, setExporting] = useState(false);
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [storeSearching, setStoreSearching] = useState(false);
  const storeSearchSequence = useRef(0);
  const [detailId, setDetailId] = useState<string>();
  const [detail, setDetail] = useState<LaborCostDetail>();
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(false);

  const all = permissions.includes("*");
  const can = (action: "query" | "view" | "export") => all || permissions.includes(`labor-costs:${action}`) || ((action === "query" || action === "view") && permissions.includes("operations:view"));

  const load = async (nextPage = page, nextPageSize = pageSize, nextFilters = filters) => {
    setLoading(true);
    setLoadError(false);
    const query = new URLSearchParams({ page: String(nextPage), pageSize: String(nextPageSize) });
    Object.entries(nextFilters).forEach(([key, value]) => { if (value) query.set(key, value); });
    try {
      const response = await fetch(`/api/labor-costs?${query}`, { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || "人力成本数据加载失败，请稍后重试");
      setRows(data.rows || []);
      setTotal(data.total || 0);
      setPage(data.page || nextPage);
      setPageSize(data.pageSize || nextPageSize);
    } catch (error) {
      setLoadError(true);
      messageApi.error(error instanceof Error ? error.message : "人力成本数据加载失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  const searchStores = async (keyword = "", brand = filterForm.getFieldValue("brand") || "") => {
    const sequence = ++storeSearchSequence.current;
    setStoreSearching(true);
    try {
      const query = new URLSearchParams();
      if (keyword.trim()) query.set("keyword", keyword.trim());
      if (brand) query.set("brand", brand);
      const response = await fetch(`/api/labor-costs/store-options?${query}`, { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || "门店数据加载失败，请稍后重试");
      if (sequence === storeSearchSequence.current) {
        const selectedId = filterForm.getFieldValue("storeId");
        setStores(current => {
          const selected = current.find(item => item.storeId === selectedId);
          const next = data as StoreOption[];
          return selected && !next.some(item => item.storeId === selected.storeId) ? [selected, ...next] : next;
        });
      }
    } catch (error) {
      if (sequence === storeSearchSequence.current) {
        setStores([]);
        messageApi.error(error instanceof Error ? error.message : "门店数据加载失败，请稍后重试");
      }
    } finally {
      if (sequence === storeSearchSequence.current) setStoreSearching(false);
    }
  };

  const applyFilters = () => {
    const values = filterForm.getFieldsValue();
    const nextStartDate = values.startDate?.format("YYYY-MM-DD") || "";
    const nextEndDate = values.endDate?.format("YYYY-MM-DD") || "";
    if (nextStartDate && nextEndDate && nextStartDate > nextEndDate) {
      messageApi.error("开始日期不能晚于截止日期");
      return;
    }
    const next = { brand: values.brand || "", storeId: values.storeId || "", startDate: nextStartDate, endDate: nextEndDate };
    setFilters(next);
    setSelectedKeys([]);
    void load(1, pageSize, next);
  };

  const resetFilters = () => {
    filterForm.resetFields();
    setStores([]);
    setFilters(emptyFilters);
    setSelectedKeys([]);
    void load(1, pageSize, emptyFilters);
  };

  const exportRows = async () => {
    setExporting(true);
    try {
      const response = await fetch("/api/labor-costs/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordIds: selectedKeys.map(String), filters }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.message || "人力成本导出失败，请稍后重试");
      }
      downloadBlob(await response.blob(), responseFileName(response));
      messageApi.success(`已导出${selectedKeys.length ? `所选 ${selectedKeys.length} 条` : "当前筛选结果全部"}人力成本记录`);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "人力成本导出失败，请稍后重试");
    } finally {
      setExporting(false);
    }
  };

  const openDetail = async (row: LaborCostRow) => {
    setDetailId(row.id);
    setDetail(undefined);
    setDetailError(false);
    setDetailLoading(true);
    try {
      const response = await fetch(`/api/labor-costs/${row.id}`, { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || "人力成本详情加载失败，请稍后重试");
      setDetail(data);
    } catch (error) {
      setDetailError(true);
      messageApi.error(error instanceof Error ? error.message : "人力成本详情加载失败，请稍后重试");
    } finally {
      setDetailLoading(false);
    }
  };

  const columns: ColumnsType<LaborCostRow> = [
    { title: "考勤日期", dataIndex: "attendanceDate", width: 120, fixed: "left" },
    { title: "记录编号", dataIndex: "recordNo", width: 145 },
    { title: "品牌", dataIndex: "brandName", width: 120, ellipsis: true },
    { title: "门店名称", dataIndex: "storeName", width: 210, ellipsis: true },
    { title: "合作类型", dataIndex: "cooperationType", width: 110 },
    { title: "全职人员用工成本", dataIndex: "fullTimeLaborCost", width: 180, align: "right", render: moneyText },
    { title: "兼职人员成本", dataIndex: "partTimeLaborCost", width: 160, align: "right", render: moneyText },
    { title: "当日用工成本（合计）", dataIndex: "totalLaborCost", width: 200, align: "right", render: value => <strong className="labor-cost-total">{moneyText(value)}</strong> },
    { title: "操作", key: "actions", width: 90, fixed: "right", render: (_, row) => can("view") ? <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => void openDetail(row)}>查看</Button> : "-" },
  ];
  const rowSelection: TableRowSelection<LaborCostRow> = {
    selectedRowKeys: selectedKeys,
    preserveSelectedRowKeys: true,
    onChange: setSelectedKeys,
    columnWidth: 48,
  };
  const hasFilters = Object.values(filters).some(Boolean);

  return <>
    {messageContextHolder}
    {dictionaryError && <Alert className="labor-cost-alert" type="error" showIcon message="品牌数据加载失败，请稍后重试" action={<Button size="small" icon={<ReloadOutlined />} onClick={() => void reloadDictionaries()}>重试</Button>} />}
    <Card className="labor-cost-filter-card">
      <Form form={filterForm} layout="vertical">
        <div className="labor-cost-filter-grid">
          <Form.Item label="品牌" name="brand"><Select allowClear loading={dictionaryLoading} placeholder="全部" options={dictionaries.BRAND || []} onChange={brand => { filterForm.setFieldValue("storeId", undefined); setStores([]); void searchStores("", brand || ""); }} /></Form.Item>
          <Form.Item label="门店名称" name="storeId"><Select showSearch allowClear filterOption={false} loading={storeSearching} placeholder="请输入门店名称" onFocus={() => void searchStores()} onSearch={value => void searchStores(value)} notFoundContent={storeSearching ? "搜索中..." : "暂无匹配门店"} options={stores.map(store => ({ value: store.storeId, label: store.storeName }))} /></Form.Item>
          <Form.Item label="开始日期" name="startDate"><DatePicker format="YYYY-MM-DD" placeholder="请选择开始日期" disabledDate={current => Boolean(endDate && current.isAfter(endDate, "day"))} /></Form.Item>
          <Form.Item label="截止日期" name="endDate"><DatePicker format="YYYY-MM-DD" placeholder="请选择截止日期" disabledDate={current => Boolean(startDate && current.isBefore(startDate, "day"))} /></Form.Item>
          <div className="labor-cost-filter-actions"><Space><Button onClick={resetFilters}>重置</Button><Button type="primary" icon={<SearchOutlined />} onClick={applyFilters}>筛选</Button></Space></div>
        </div>
      </Form>
    </Card>
    <Card className="labor-cost-list-card">
      <div className="labor-cost-toolbar"><span>已选择 <strong>{selectedKeys.length}</strong> 条</span>{can("export") && <Button icon={<DownloadOutlined />} loading={exporting} onClick={() => void exportRows()}>{exporting ? "导出中..." : "批量导出"}</Button>}</div>
      {loadError ? <Alert type="error" showIcon message="人力成本数据加载失败，请稍后重试" action={<Button size="small" onClick={() => void load()}>重新加载</Button>} /> : <Table<LaborCostRow>
        rowKey="id" dataSource={rows} columns={columns} rowSelection={rowSelection} loading={loading} scroll={{ x: 1450 }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={hasFilters ? <><div>没有找到符合当前条件的人力成本记录</div><small>请调整筛选条件后重试</small><div><Button type="link" onClick={resetFilters}>重置筛选</Button></div></> : <><div>暂无人力成本记录</div><small>门店提交每日考勤后将自动生成对应记录</small></>} /> }}
        pagination={{ current: page, pageSize, total, showSizeChanger: true, pageSizeOptions: [20, 50, 100], showTotal: value => `共 ${value} 条`, onChange: (nextPage, nextSize) => { void load(nextSize !== pageSize ? 1 : nextPage, nextSize, filters); } }}
      />}
    </Card>

    <Modal className="labor-cost-detail-modal" width={1180} title="查看人力成本" open={!!detailId} onCancel={() => setDetailId(undefined)} footer={<Button onClick={() => setDetailId(undefined)}>关闭</Button>}>
      {detailLoading ? <Skeleton active paragraph={{ rows: 9 }} /> : detailError ? <Alert type="error" showIcon message="人力成本详情加载失败，请稍后重试" action={<Button size="small" onClick={() => { const row = rows.find(item => item.id === detailId); if (row) void openDetail(row); }}>重新加载</Button>} /> : detail && <div className="labor-cost-detail">
        <Descriptions bordered size="small" column={3}>
          <Descriptions.Item label="考勤日期">{detail.overview.attendanceDate}</Descriptions.Item>
          <Descriptions.Item label="记录编号">{detail.overview.recordNo}</Descriptions.Item>
          <Descriptions.Item label="合作类型">{detail.overview.cooperationType}</Descriptions.Item>
          <Descriptions.Item label="品牌">{detail.overview.brandName}</Descriptions.Item>
          <Descriptions.Item label="门店名称" span={2}>{detail.overview.storeName}</Descriptions.Item>
          <Descriptions.Item label="全职人员用工成本">{moneyText(detail.overview.fullTimeLaborCost)}</Descriptions.Item>
          <Descriptions.Item label="兼职人员成本">{moneyText(detail.overview.partTimeLaborCost)}</Descriptions.Item>
          <Descriptions.Item label="当日用工成本（合计）"><strong className="labor-cost-total">{moneyText(detail.overview.totalLaborCost)}</strong></Descriptions.Item>
        </Descriptions>
        <div className="labor-cost-detail-heading"><strong>员工考勤明细</strong><span>共 {detail.details.length} 人</span></div>
        <Table rowKey="personnelId" size="small" pagination={false} dataSource={detail.details} scroll={{ x: 1050, y: 420 }} columns={[
          { title: "员工姓名", dataIndex: "personnelName", width: 120 },
          { title: "岗位星级", dataIndex: "positionStar", width: 160, ellipsis: true },
          { title: "考勤状态", dataIndex: "attendanceStatus", width: 150, render: (value, item) => statusTag(value, item.attendanceType) },
          { title: "加班小时", dataIndex: "overtimeHours", width: 120, align: "right" as const, render: value => decimalText(value, " 小时") },
          { title: "用工日成本", dataIndex: "dailyLaborCost", width: 140, align: "right" as const, render: moneyText },
          { title: "用工小时成本", dataIndex: "hourlyLaborCost", width: 150, align: "right" as const, render: moneyText },
          { title: "实际用工成本", dataIndex: "actualLaborCost", width: 150, fixed: "right" as const, align: "right" as const, render: value => <strong className="labor-cost-actual">{moneyText(value)}</strong> },
        ]} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无员工考勤明细" /> }} />
      </div>}
    </Modal>
  </>;
}

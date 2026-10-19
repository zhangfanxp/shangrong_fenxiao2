"use client";

import { DownloadOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { Alert, Button, Card, DatePicker, Empty, Form, Input, message, Select, Space, Table } from "antd";
import type { ColumnsType, TableRowSelection } from "antd/es/table/interface";
import type { Dayjs } from "dayjs";
import { useRef, useState } from "react";
import { useBusinessDictionaries } from "@/hooks/use-business-dictionaries";

export type EmployeeAttendanceMonthlyRow = {
  id: string;
  statMonth: string;
  brandName: string;
  storeName: string;
  employeeName: string;
  position: string;
  attendanceDays: number;
  restDays: number;
  overtimeHours: number;
  leaveHours: number;
};

type Filters = { brand: string; storeId: string; startMonth: string; endMonth: string; employeeName: string; position: string };
type FilterForm = { brand?: string; storeId?: string; startMonth?: Dayjs | null; endMonth?: Dayjs | null; employeeName?: string; position?: string };
type StoreOption = { storeId: string; storeName: string; brandCode: string; brandName: string };

const emptyFilters: Filters = { brand: "", storeId: "", startMonth: "", endMonth: "", employeeName: "", position: "" };

function responseFileName(response: Response, fallback: string) {
  const encoded = response.headers.get("Content-Disposition")?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  return encoded ? decodeURIComponent(encoded) : fallback;
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

function decimalText(value: number) {
  return value.toLocaleString("zh-CN", { minimumFractionDigits: 0, maximumFractionDigits: 1 });
}

export function EmployeeAttendanceMonthlyList({ permissions, initialRows = [], initialTotal = 0 }: { permissions: string[]; initialRows?: EmployeeAttendanceMonthlyRow[]; initialTotal?: number }) {
  const [messageApi, messageContextHolder] = message.useMessage();
  const [filterForm] = Form.useForm<FilterForm>();
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

  const all = permissions.includes("*");
  const canExport = all || permissions.includes("statistics:attendance-monthly:export");

  const load = async (nextPage = page, nextPageSize = pageSize, nextFilters = filters) => {
    setLoading(true); setLoadError(false);
    const query = new URLSearchParams({ page: String(nextPage), pageSize: String(nextPageSize) });
    Object.entries(nextFilters).forEach(([key, value]) => { if (value) query.set(key, value); });
    try {
      const response = await fetch(`/api/employee-attendance-monthly?${query}`, { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || "员工出勤月度汇总加载失败，请稍后重试");
      setRows(data.rows || []); setTotal(data.total || 0); setPage(data.page || nextPage); setPageSize(data.pageSize || nextPageSize);
    } catch (error) {
      setLoadError(true); messageApi.error(error instanceof Error ? error.message : "员工出勤月度汇总加载失败，请稍后重试");
    } finally { setLoading(false); }
  };

  const searchStores = async (keyword = "", brand = filterForm.getFieldValue("brand") || "") => {
    const sequence = ++storeSearchSequence.current;
    setStoreSearching(true);
    try {
      const query = new URLSearchParams();
      if (keyword.trim()) query.set("keyword", keyword.trim());
      if (brand) query.set("brand", brand);
      const response = await fetch(`/api/attendance-records/store-options?${query}`, { cache: "no-store" });
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
    } finally { if (sequence === storeSearchSequence.current) setStoreSearching(false); }
  };

  const applyFilters = () => {
    const values = filterForm.getFieldsValue();
    const startMonth = values.startMonth?.format("YYYY-MM") || "";
    const endMonth = values.endMonth?.format("YYYY-MM") || "";
    if (startMonth && endMonth && startMonth > endMonth) {
      messageApi.error("开始月份不能晚于截止月份");
      return;
    }
    const next = { brand: values.brand || "", storeId: values.storeId || "", startMonth, endMonth, employeeName: values.employeeName?.trim() || "", position: values.position?.trim() || "" };
    setFilters(next); setSelectedKeys([]); void load(1, pageSize, next);
  };

  const resetFilters = () => {
    filterForm.resetFields(); setStores([]); setFilters(emptyFilters); setSelectedKeys([]); void load(1, pageSize, emptyFilters);
  };

  const exportRows = async () => {
    setExporting(true);
    try {
      const response = await fetch("/api/employee-attendance-monthly/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rowIds: selectedKeys.map(String), filters }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.message || "员工出勤月度汇总导出失败，请稍后重试");
      }
      downloadBlob(await response.blob(), responseFileName(response, "员工出勤月度汇总表.xlsx"));
      messageApi.success(`已导出${selectedKeys.length ? `所选 ${selectedKeys.length} 条` : "当前筛选结果全部"}汇总记录`);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "员工出勤月度汇总导出失败，请稍后重试");
    } finally { setExporting(false); }
  };

  const columns: ColumnsType<EmployeeAttendanceMonthlyRow> = [
    { title: "统计日期", dataIndex: "statMonth", width: 120 },
    { title: "品牌", dataIndex: "brandName", width: 130, ellipsis: true },
    { title: "门店名称", dataIndex: "storeName", width: 220, ellipsis: true },
    { title: "员工姓名", dataIndex: "employeeName", width: 130 },
    { title: "岗位", dataIndex: "position", width: 170, ellipsis: true },
    { title: "出勤(天)", dataIndex: "attendanceDays", width: 110, align: "right" },
    { title: "休息(天)", dataIndex: "restDays", width: 110, align: "right" },
    { title: "加班(小时)", dataIndex: "overtimeHours", width: 130, align: "right", render: decimalText },
    { title: "请假(小时)", dataIndex: "leaveHours", width: 130, align: "right", render: decimalText },
  ];
  const rowSelection: TableRowSelection<EmployeeAttendanceMonthlyRow> = { selectedRowKeys: selectedKeys, preserveSelectedRowKeys: true, onChange: setSelectedKeys, columnWidth: 48 };
  const hasFilters = Object.values(filters).some(Boolean);

  return <>
    {messageContextHolder}
    {dictionaryError && <Alert className="employee-attendance-monthly-alert" type="error" showIcon message="品牌数据加载失败，请稍后重试" action={<Button size="small" icon={<ReloadOutlined />} onClick={() => void reloadDictionaries()}>重试</Button>} />}
    <Card className="employee-attendance-monthly-filter-card">
      <Form form={filterForm} layout="vertical">
        <div className="employee-attendance-monthly-filter-grid">
          <Form.Item label="品牌" name="brand"><Select allowClear loading={dictionaryLoading} placeholder="全部" options={dictionaries.BRAND || []} onChange={brand => { filterForm.setFieldValue("storeId", undefined); setStores([]); void searchStores("", brand || ""); }} /></Form.Item>
          <Form.Item label="门店名称" name="storeId"><Select showSearch allowClear filterOption={false} loading={storeSearching} placeholder="请输入门店名称" onFocus={() => void searchStores()} onSearch={value => void searchStores(value)} notFoundContent={storeSearching ? "搜索中..." : "暂无匹配门店"} options={stores.map(store => ({ value: store.storeId, label: store.storeName }))} /></Form.Item>
          <Form.Item label="开始月份" name="startMonth"><DatePicker picker="month" format="YYYY-MM" placeholder="开始月份" /></Form.Item>
          <Form.Item label="截止月份" name="endMonth"><DatePicker picker="month" format="YYYY-MM" placeholder="截止月份" /></Form.Item>
          <Form.Item label="员工姓名" name="employeeName"><Input allowClear placeholder="请输入员工姓名" /></Form.Item>
          <Form.Item label="岗位" name="position"><Input allowClear placeholder="请输入岗位" /></Form.Item>
          <div className="employee-attendance-monthly-filter-actions"><Space><Button onClick={resetFilters}>重置</Button><Button type="primary" icon={<SearchOutlined />} onClick={applyFilters}>查询</Button></Space></div>
        </div>
      </Form>
    </Card>
    <Card className="employee-attendance-monthly-list-card">
      <div className="employee-attendance-monthly-toolbar"><span>已选择 <strong>{selectedKeys.length}</strong> 条</span>{canExport && <Button icon={<DownloadOutlined />} loading={exporting} onClick={() => void exportRows()}>{exporting ? "导出中..." : "批量导出"}</Button>}</div>
      {loadError ? <Alert type="error" showIcon message="员工出勤月度汇总加载失败，请稍后重试" action={<Button size="small" onClick={() => void load()}>重新加载</Button>} /> : <Table<EmployeeAttendanceMonthlyRow>
        rowKey="id" dataSource={rows} columns={columns} rowSelection={rowSelection} loading={loading} scroll={{ x: 1250 }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={hasFilters ? <><div>没有找到符合当前条件的汇总记录</div><small>请调整筛选条件后重试</small><div><Button type="link" onClick={resetFilters}>重置筛选</Button></div></> : <><div>暂无员工出勤汇总记录</div><small>当前还没有门店提交每日考勤记录</small></>} /> }}
        pagination={{ current: page, pageSize, total, showSizeChanger: true, pageSizeOptions: [20, 50, 100], showTotal: value => `共 ${value} 条`, onChange: (nextPage, nextSize) => { void load(nextSize !== pageSize ? 1 : nextPage, nextSize, filters); } }}
      />}
    </Card>
  </>;
}

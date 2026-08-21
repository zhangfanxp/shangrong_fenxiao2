"use client";

import { DownloadOutlined, ReloadOutlined } from "@ant-design/icons";
import { Alert, Button, Card, DatePicker, Empty, Form, Input, message, Modal, Space, Table, Tag, TimePicker, Tooltip } from "antd";
import type { ColumnsType, TableRowSelection } from "antd/es/table/interface";
import dayjs, { type Dayjs } from "dayjs";
import { useEffect, useState } from "react";

type OperationLogRow = {
  id: string;
  recordNo: string;
  username: string;
  client: string;
  page: string;
  action: string;
  result: string;
  detail?: string | null;
  operationDate: string;
  operationTime: string;
  ip: string;
};

type FilterValues = {
  startDate?: Dayjs | null;
  endDate?: Dayjs | null;
  startTime?: Dayjs | null;
  endTime?: Dayjs | null;
  ipAddress?: string;
};

type AppliedFilters = {
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  ipAddress: string;
};

const emptyFilters: AppliedFilters = { startDate: "", endDate: "", startTime: "", endTime: "", ipAddress: "" };

function validIp(value: string) {
  if (!value) return true;
  const ipv4 = value.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) return ipv4.slice(1).every(part => Number(part) <= 255);
  if (!value.includes(":")) return false;
  try { return new URL(`http://[${value}]/`).hostname.length > 2; } catch { return false; }
}

function resultTag(value: string) {
  const color = value === "成功" ? "success" : value === "取消" ? "warning" : "error";
  return <Tag color={color}>{value}</Tag>;
}

function clientTag(value: string) {
  const color = value === "运营PC端" ? "blue" : value === "运营移动端" ? "cyan" : "default";
  return <Tag color={color}>{value}</Tag>;
}

export function OperationLogList({ permissions }: { permissions: string[] }) {
  const canExport = permissions.includes("*") || permissions.includes("operation-logs:export") || permissions.includes("settings:logs");
  const [form] = Form.useForm<FilterValues>();
  const [rows, setRows] = useState<OperationLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filters, setFilters] = useState<AppliedFilters>(emptyFilters);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [exporting, setExporting] = useState(false);

  const load = async (nextPage = page, nextPageSize = pageSize, nextFilters = filters) => {
    setLoading(true); setError(false);
    try {
      const query = new URLSearchParams({ page: String(nextPage), pageSize: String(nextPageSize) });
      Object.entries(nextFilters).forEach(([key, value]) => { if (value) query.set(key, value); });
      const response = await fetch(`/api/operation-logs?${query}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "操作日志加载失败，请稍后重试");
      setRows(data.rows); setTotal(data.total);
    } catch (reason) {
      setError(true);
      if (reason instanceof Error && reason.message !== "操作日志加载失败，请稍后重试") message.error(reason.message);
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(1, 20, emptyFilters); }, []);

  const readFilters = (): AppliedFilters | null => {
    const values = form.getFieldsValue();
    const next = {
      startDate: values.startDate?.format("YYYY-MM-DD") || "",
      endDate: values.endDate?.format("YYYY-MM-DD") || "",
      startTime: values.startTime?.format("HH:mm:ss") || "",
      endTime: values.endTime?.format("HH:mm:ss") || "",
      ipAddress: values.ipAddress?.trim() || "",
    };
    if (next.startDate && next.endDate && next.startDate > next.endDate) { message.warning("开始日期不能晚于截止日期"); return null; }
    if (next.startTime && next.endTime && next.startTime > next.endTime) { message.warning("开始时间不能晚于截止时间"); return null; }
    if (!validIp(next.ipAddress)) { message.warning("请输入正确的IP地址"); return null; }
    return next;
  };

  const applyFilter = () => {
    const next = readFilters(); if (!next) return;
    setFilters(next); setPage(1); setSelectedRowKeys([]); void load(1, pageSize, next);
  };
  const resetFilter = () => {
    form.resetFields(); setFilters(emptyFilters); setPage(1); setSelectedRowKeys([]); void load(1, pageSize, emptyFilters);
  };

  const performExport = async () => {
    setExporting(true);
    try {
      const response = await fetch("/api/operation-logs/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedRowKeys.length ? selectedRowKeys : undefined, filters }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || "导出失败，请稍后重试");
      }
      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") || "";
      const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
      const filename = encodedName ? decodeURIComponent(encodedName) : `操作日志_${dayjs().format("YYYYMMDD_HHmmss")}.xlsx`;
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a"); link.href = href; link.download = filename; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(href);
      message.success(`导出成功，共导出${selectedRowKeys.length || total}条日志`);
      await load(page, pageSize, filters);
    } catch (reason) { message.error(reason instanceof Error ? reason.message : "导出失败，请稍后重试"); }
    finally { setExporting(false); }
  };

  const confirmExport = () => Modal.confirm({
    title: "确认导出操作日志？",
    content: selectedRowKeys.length
      ? `确认导出已选择的 ${selectedRowKeys.length} 条操作日志？`
      : `当前未选择具体日志，将导出当前筛选条件下的全部 ${total} 条操作日志，是否继续？`,
    okText: "确认导出",
    cancelText: "取消",
    onOk: performExport,
  });

  const columns: ColumnsType<OperationLogRow> = [
    { title: "记录编号", dataIndex: "recordNo", width: 160, fixed: "left", ellipsis: true, render: value => <Tooltip title={value}>{value}</Tooltip> },
    { title: "用户名", dataIndex: "username", width: 120, ellipsis: true, render: value => <Tooltip title={value}>{value}</Tooltip> },
    { title: "操作端", dataIndex: "client", width: 140, render: clientTag },
    { title: "页面", dataIndex: "page", width: 140, ellipsis: true, render: value => <Tooltip title={value}>{value}</Tooltip> },
    { title: "功能", dataIndex: "action", width: 110, ellipsis: true },
    { title: "操作结果", dataIndex: "result", width: 100, align: "center", render: resultTag },
    { title: "操作日期", dataIndex: "operationDate", width: 115 },
    { title: "操作时间", dataIndex: "operationTime", width: 105 },
    { title: "IP地址", dataIndex: "ip", width: 160, ellipsis: true, render: value => <Tooltip title={value}>{value}</Tooltip> },
  ];
  const rowSelection: TableRowSelection<OperationLogRow> = {
    selectedRowKeys,
    preserveSelectedRowKeys: true,
    onChange: keys => setSelectedRowKeys(keys),
  };
  const filtered = Object.values(filters).some(Boolean);

  return <>
    <Card className="operation-log-filter-card">
      <Form form={form} layout="vertical" onFinish={applyFilter}>
        <div className="operation-log-filter-grid">
          <Form.Item label="操作日期"><Space.Compact block><Form.Item name="startDate" noStyle><DatePicker allowClear placeholder="开始日期" format="YYYY-MM-DD" /></Form.Item><span className="operation-log-range-separator">至</span><Form.Item name="endDate" noStyle><DatePicker allowClear placeholder="截止日期" format="YYYY-MM-DD" /></Form.Item></Space.Compact></Form.Item>
          <Form.Item label="操作时间"><Space.Compact block><Form.Item name="startTime" noStyle><TimePicker allowClear placeholder="开始时间" format="HH:mm:ss" /></Form.Item><span className="operation-log-range-separator">至</span><Form.Item name="endTime" noStyle><TimePicker allowClear placeholder="截止时间" format="HH:mm:ss" /></Form.Item></Space.Compact></Form.Item>
          <Form.Item label="IP地址" name="ipAddress"><Input allowClear maxLength={45} placeholder="请输入IP地址" onPressEnter={applyFilter} /></Form.Item>
          <Form.Item label=" "><Space><Button onClick={resetFilter}>重置</Button><Button type="primary" htmlType="submit">筛选</Button></Space></Form.Item>
        </div>
      </Form>
    </Card>
    <Card className="operation-log-list-card" title="操作日志列表" extra={<Space>{selectedRowKeys.length > 0 && <span className="operation-log-selected">已选择 {selectedRowKeys.length} 条日志</span>}{canExport && <Button type="primary" icon={<DownloadOutlined />} loading={exporting} disabled={loading || total === 0} onClick={confirmExport}>{exporting ? "导出中..." : "批量导出"}</Button>}</Space>}>
      {error ? <Alert type="error" showIcon message="操作日志加载失败，请稍后重试" action={<Button size="small" icon={<ReloadOutlined />} onClick={() => void load()}>重新加载</Button>} /> : <Table<OperationLogRow>
        rowKey="id"
        size="middle"
        columns={columns}
        dataSource={rows}
        rowSelection={rowSelection}
        loading={loading}
        scroll={{ x: 1250 }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<><div>{filtered ? "没有找到符合当前筛选条件的操作日志" : "暂无操作日志"}</div><small>{filtered ? "请调整筛选条件后重试" : "当前系统还没有产生操作记录"}</small></>}>{filtered && <Button onClick={resetFilter}>重置筛选</Button>}</Empty> }}
        pagination={{ current: page, pageSize, total, showSizeChanger: true, pageSizeOptions: [20, 50, 100], showTotal: count => `共 ${count} 条`, onChange: (nextPage, nextPageSize) => { setPage(nextPage); setPageSize(nextPageSize); void load(nextPage, nextPageSize); } }}
      />}
    </Card>
  </>;
}

"use client";

import { DownloadOutlined, SearchOutlined } from "@ant-design/icons";
import { Alert, Button, Card, DatePicker, Empty, Form, Input, message, Select, Space, Table } from "antd";
import type { ColumnsType, TableRowSelection } from "antd/es/table/interface";
import type { Dayjs } from "dayjs";
import { useCallback, useEffect, useRef, useState, type Key } from "react";
import { useBusinessDictionaries } from "@/hooks/use-business-dictionaries";

export type WechatPrivateDailyNewRow = {
  id: string;
  recordNo: string;
  brandName: string;
  storeName: string;
  businessDate: string;
  todayNewWechatFriends: number;
  submitterName: string;
  submittedAt: string;
};

type Filters = { brand: string; storeNameKeyword: string; startDate: string; endDate: string };
type FilterForm = { brand?: string; storeNameKeyword?: string; startDate?: Dayjs | null; endDate?: Dayjs | null };

const emptyFilters: Filters = { brand: "", storeNameKeyword: "", startDate: "", endDate: "" };

function responseFileName(response: Response) {
  const encoded = response.headers.get("Content-Disposition")?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  return encoded ? decodeURIComponent(encoded) : "微信私域每日新增.xlsx";
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

export function WechatPrivateDailyNewList({ permissions }: { permissions: string[] }) {
  const [messageApi, messageContextHolder] = message.useMessage();
  const [filterForm] = Form.useForm<FilterForm>();
  const { options: dictionaries, loading: dictionariesLoading, error: dictionaryError, reload: reloadDictionaries } = useBusinessDictionaries(["BRAND"]);
  const canQuery = permissions.includes("*") || permissions.includes("operations:view") || permissions.includes("wechat-private-daily-new:query");
  const canExport = permissions.includes("*") || permissions.includes("wechat-private-daily-new:export");
  const [rows, setRows] = useState<WechatPrivateDailyNewRow[]>([]);
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
      const response = await fetch(`/api/wechat-private-daily-new?${query}`, { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || "微信私域每日新增数据加载失败，请稍后重试");
      if (sequence !== requestSequence.current) return;
      setRows(data.rows || []);
      setTotal(data.total || 0);
      setPage(data.page || targetPage);
      setPageSize(data.pageSize || targetPageSize);
    } catch (error) {
      if (sequence !== requestSequence.current) return;
      const errorMessage = error instanceof Error ? error.message : "微信私域每日新增数据加载失败，请稍后重试";
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
      const next = {
        brand: values.brand === "ALL" ? "" : values.brand || "",
        storeNameKeyword: values.storeNameKeyword?.trim() || "",
        startDate: values.startDate?.format("YYYY-MM-DD") || "",
        endDate: values.endDate?.format("YYYY-MM-DD") || "",
      };
      setFilters(next);
      setPage(1);
      setSelectedKeys([]);
      void load(1, pageSize, next);
    } catch { /* 表单会展示日期范围校验信息 */ }
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
      const response = await fetch("/api/wechat-private-daily-new/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordIds: selectedKeys.length ? selectedKeys.map(String) : undefined, filters }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.message || "微信私域每日新增导出失败，请稍后重试");
      }
      downloadBlob(await response.blob(), responseFileName(response));
      messageApi.success(`已导出${selectedKeys.length ? `所选 ${selectedKeys.length} 条` : "当前筛选结果全部"}记录`);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "微信私域每日新增导出失败，请稍后重试");
    } finally {
      setExporting(false);
    }
  };

  if (!canQuery) return <Alert type="warning" showIcon message="暂无微信私域每日新增查询权限" description="请联系管理员为当前角色配置相应权限。" />;

  const columns: ColumnsType<WechatPrivateDailyNewRow> = [
    { title: "任务记录编号", dataIndex: "recordNo", width: 180, fixed: "left" },
    { title: "品牌", dataIndex: "brandName", width: 180, ellipsis: true },
    { title: "门店", dataIndex: "storeName", width: 260, ellipsis: true },
    { title: "业务日期", dataIndex: "businessDate", width: 150, align: "center" },
    { title: "今日新增微信好友", dataIndex: "todayNewWechatFriends", width: 210, align: "right", render: value => Number(value).toLocaleString("zh-CN") },
    { title: "上报人", dataIndex: "submitterName", width: 140, ellipsis: true },
    { title: "上报时间", dataIndex: "submittedAt", width: 190 },
  ];
  const rowSelection: TableRowSelection<WechatPrivateDailyNewRow> = {
    selectedRowKeys: selectedKeys,
    preserveSelectedRowKeys: true,
    onChange: setSelectedKeys,
    columnWidth: 48,
    fixed: true,
  };
  const hasFilters = Boolean(filters.brand || filters.storeNameKeyword || filters.startDate || filters.endDate);

  return <>
    {messageContextHolder}
    {dictionaryError && <Alert className="wechat-private-alert" type="warning" showIcon message="品牌数据加载失败，请稍后重试" action={<Button size="small" onClick={() => void reloadDictionaries()}>重试</Button>} />}
    <Card className="wechat-private-filter-card">
      <Form form={filterForm} layout="vertical" initialValues={{ brand: "ALL" }}>
        <div className="wechat-private-filter-grid">
          <Form.Item label="品牌" name="brand">
            <Select loading={dictionariesLoading} options={[{ value: "ALL", label: "全部" }, ...(dictionaries.BRAND || [])]} />
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
          <div className="wechat-private-filter-actions"><Space><Button onClick={resetFilters}>重置</Button><Button type="primary" icon={<SearchOutlined />} onClick={() => void applyFilters()}>筛选</Button></Space></div>
        </div>
      </Form>
    </Card>

    <Card className="wechat-private-list-card">
      <div className="wechat-private-toolbar">
        <span>已选择 <strong>{selectedKeys.length}</strong> 条</span>
        {canExport && <Button icon={<DownloadOutlined />} loading={exporting} disabled={loading} onClick={() => void exportRows()}>{exporting ? "导出中..." : "批量导出"}</Button>}
      </div>
      {loadError ? <Alert type="error" showIcon message={loadError} action={<Button size="small" onClick={() => void load(page, pageSize, filters)}>重新加载</Button>} /> : <Table<WechatPrivateDailyNewRow>
        rowKey="id"
        dataSource={rows}
        columns={columns}
        rowSelection={canExport ? rowSelection : undefined}
        loading={loading}
        scroll={{ x: 1400 }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={hasFilters ? <><div>没有找到符合当前条件的微信私域每日新增记录</div><small>请调整筛选条件后重试</small><div><Button type="link" onClick={resetFilters}>重置筛选</Button></div></> : <><div>暂无微信私域每日新增记录</div><small>当前业务数据源中还没有正式上报数据</small></>} /> }}
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

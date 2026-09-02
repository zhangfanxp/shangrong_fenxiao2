"use client";

import {
  CalculatorOutlined, DeleteOutlined, DownloadOutlined, EyeOutlined, PlusOutlined,
  ReloadOutlined, SearchOutlined, WarningOutlined,
} from "@ant-design/icons";
import {
  Alert, Button, Card, DatePicker, Descriptions, Empty, Form, Input, InputNumber, message,
  Modal, Progress, Select, Skeleton, Space, Table, Tabs, Tag, Tooltip,
} from "antd";
import type { ColumnsType, TableRowSelection } from "antd/es/table/interface";
import dayjs, { type Dayjs } from "dayjs";
import { useCallback, useEffect, useRef, useState } from "react";
import { useBusinessDictionaries } from "@/hooks/use-business-dictionaries";

export type RevenueTargetRow = {
  id: string;
  recordNo: string;
  targetMonth: string;
  brandName: string;
  storeName: string;
  regionName: string;
  targetAmount: string;
  dailyTargetStatus: string;
};

type Filters = { brand: string; storeKeyword: string; targetMonth: string };
type FilterForm = { brand?: string; storeKeyword?: string; targetMonth?: Dayjs | null };
type StoreOption = { storeId: string; storeName: string; brandId: string; brandCode: string; brandName: string; regionName: string };
type CreateForm = { targetMonth: Dayjs; brand: string; storeId: string; targetAmount: number; remark?: string };
type PreviousActual = { exists: boolean; actualMonth: string; actualRevenue: string | null; actualRevenueRecordId: string | null; targetExists: boolean };
type DailyTarget = { id: string; targetDate: string; weekday: string; targetAmount: string };
type Detail = {
  overview: { id: string; recordNo: string; targetMonth: string; brandName: string; storeName: string; regionName: string; previousActualMonth: string; previousActualRevenue: string; targetAmount: string; remark: string; dailyTargetStatus: string };
  dailyTargets: DailyTarget[];
};
type CalculationStatus = "running" | "success" | "error";

const emptyFilters: Filters = { brand: "", storeKeyword: "", targetMonth: "" };

function money(value: string | null | undefined) {
  return value === null || value === undefined ? "-" : `¥ ${Number(value).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function sumMoneyValues(values: string[]) {
  const cents = values.reduce((total, value) => {
    const match = value.match(/^(\d+)(?:\.(\d{1,2}))?$/);
    if (!match) return total;
    return total + BigInt(match[1]) * 100n + BigInt((match[2] || "").padEnd(2, "0"));
  }, 0n);
  return `${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`;
}

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

export function RevenueTargetList({ permissions, initialRows = [], initialTotal = 0 }: { permissions: string[]; initialRows?: RevenueTargetRow[]; initialTotal?: number }) {
  const all = permissions.includes("*");
  const can = (action: string) => all || permissions.includes(`revenue-targets:${action}`) || (["query", "view"].includes(action) && (permissions.includes("operations:view") || permissions.includes("actual-revenue:set-monthly-target")));
  const [filterForm] = Form.useForm<FilterForm>();
  const [createForm] = Form.useForm<CreateForm>();
  const { options: dictionaries, loading: dictionaryLoading, error: dictionaryError, reload: reloadDictionaries } = useBusinessDictionaries(["BRAND"]);
  const [rows, setRows] = useState<RevenueTargetRow[]>(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);
  const [exporting, setExporting] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [storeSearching, setStoreSearching] = useState(false);
  const [previous, setPrevious] = useState<PreviousActual>();
  const [previousLoading, setPreviousLoading] = useState(false);
  const [previousError, setPreviousError] = useState<string>();
  const [detailId, setDetailId] = useState<string>();
  const [detail, setDetail] = useState<Detail>();
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const [calculatingId, setCalculatingId] = useState<string>();
  const [calculationRow, setCalculationRow] = useState<RevenueTargetRow>();
  const [calculationProgress, setCalculationProgress] = useState(0);
  const [calculationStatus, setCalculationStatus] = useState<CalculationStatus>("running");
  const [calculationMessage, setCalculationMessage] = useState("正在准备计算...");
  const [deleteRow, setDeleteRow] = useState<RevenueTargetRow>();
  const [deleting, setDeleting] = useState(false);
  const requestSequence = useRef(0);
  const actualSequence = useRef(0);
  const calculationProgressTimer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const calculationCloseTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const clearCalculationTimers = useCallback(() => {
    if (calculationProgressTimer.current) clearInterval(calculationProgressTimer.current);
    if (calculationCloseTimer.current) clearTimeout(calculationCloseTimer.current);
    calculationProgressTimer.current = undefined;
    calculationCloseTimer.current = undefined;
  }, []);

  useEffect(() => () => clearCalculationTimers(), [clearCalculationTimers]);

  const load = useCallback(async (nextPage = page, nextSize = pageSize, nextFilters = filters, background = false) => {
    const sequence = ++requestSequence.current;
    if (!background) { setLoading(true); setLoadError(false); }
    try {
      const query = new URLSearchParams({ page: String(nextPage), pageSize: String(nextSize) });
      Object.entries(nextFilters).forEach(([key, value]) => value && query.set(key, value));
      if (background) query.set("_background", "1");
      const response = await fetch(`/api/revenue-targets?${query}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "目标营业额数据加载失败，请稍后重试");
      if (sequence !== requestSequence.current) return;
      setRows(data.rows); setTotal(data.total); setPage(data.page); setPageSize(data.pageSize); setFilters(nextFilters);
    } catch (error) {
      if (sequence !== requestSequence.current) return;
      setLoadError(true);
      if (!background) message.error(error instanceof Error ? error.message : "目标营业额数据加载失败，请稍后重试");
    } finally { if (sequence === requestSequence.current) setLoading(false); }
  }, [filters, page, pageSize]);

  const applyFilters = () => {
    const values = filterForm.getFieldsValue();
    void load(1, pageSize, {
      brand: values.brand || "",
      storeKeyword: values.storeKeyword?.trim() || "",
      targetMonth: values.targetMonth?.format("YYYY-MM") || "",
    });
  };

  const resetFilters = () => {
    filterForm.resetFields(); setSelectedKeys([]); void load(1, pageSize, emptyFilters);
  };

  const exportRows = async () => {
    setExporting(true);
    try {
      const body = selectedKeys.length ? { recordIds: selectedKeys.map(String), filters: {} } : { filters };
      const response = await fetch("/api/revenue-targets/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.message || "目标营业额导出失败，请稍后重试"); }
      const blob = await response.blob();
      downloadBlob(blob, responseFileName(response, `目标营业额_${dayjs().format("YYYYMMDD_HHmmss")}.xlsx`));
      message.success(`已导出${selectedKeys.length ? `所选 ${selectedKeys.length} 条` : "当前筛选结果"}`);
    } catch (error) { message.error(error instanceof Error ? error.message : "目标营业额导出失败，请稍后重试"); }
    finally { setExporting(false); }
  };

  const searchStores = async (keyword = "", brandValue?: string) => {
    const brand = brandValue ?? createForm.getFieldValue("brand");
    if (!brand) { setStores([]); return; }
    setStoreSearching(true);
    try {
      const query = new URLSearchParams({ brand, keyword });
      const response = await fetch(`/api/revenue-targets/stores?${query}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "门店数据加载失败，请稍后重试");
      setStores(data);
    } catch (error) { setStores([]); message.error(error instanceof Error ? error.message : "门店数据加载失败，请稍后重试"); }
    finally { setStoreSearching(false); }
  };

  const lookupPrevious = async (storeId?: string, month?: Dayjs | null) => {
    const targetMonth = month ?? createForm.getFieldValue("targetMonth");
    const selectedStoreId = storeId ?? createForm.getFieldValue("storeId");
    const sequence = ++actualSequence.current;
    setPrevious(undefined); setPreviousError(undefined);
    if (!selectedStoreId || !targetMonth) { setPreviousLoading(false); return; }
    setPreviousLoading(true);
    try {
      const query = new URLSearchParams({ storeId: selectedStoreId, targetMonth: targetMonth.format("YYYY-MM") });
      const response = await fetch(`/api/revenue-targets/previous-actual?${query}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "上月实际营业额查询失败，请稍后重试");
      if (sequence === actualSequence.current) setPrevious(data);
    } catch (error) {
      if (sequence === actualSequence.current) setPreviousError(error instanceof Error ? error.message : "上月实际营业额查询失败，请稍后重试");
    } finally { if (sequence === actualSequence.current) setPreviousLoading(false); }
  };

  const openCreate = () => {
    createForm.resetFields(); setStores([]); setPrevious(undefined); setPreviousError(undefined); setCreateOpen(true);
  };

  const closeCreate = () => {
    setCreateOpen(false); createForm.resetFields(); setStores([]); setPrevious(undefined); setPreviousError(undefined);
  };

  const requestCloseCreate = () => {
    if (!createForm.isFieldsTouched()) { closeCreate(); return; }
    Modal.confirm({ title: "当前目标营业额尚未保存", content: "关闭后填写内容将丢失，是否继续？", okText: "继续关闭", cancelText: "返回填写", onOk: closeCreate });
  };

  const saveTarget = async () => {
    try {
      const values = await createForm.validateFields();
      if (!previous?.exists) throw new Error("当前门店暂无上月实际营业额，请先导入上月实际营业数据");
      if (previous.targetExists) throw new Error(`当前门店${values.targetMonth.format("YYYY-MM")}的目标营业额已存在，请勿重复创建`);
      setSaving(true);
      const response = await fetch("/api/revenue-targets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...values, targetMonth: values.targetMonth.format("YYYY-MM") }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "目标营业额创建失败，请稍后重试");
      closeCreate(); await load(1, pageSize, filters);
      Modal.success({ title: "温馨提示", content: "新记录已创建成功", okText: "我知道了" });
    } catch (error) { if (error instanceof Error) message.error(error.message); }
    finally { setSaving(false); }
  };

  const openDetail = async (row: RevenueTargetRow) => {
    setDetailId(row.id); setDetail(undefined); setDetailError(false); setDetailLoading(true);
    try {
      const response = await fetch(`/api/revenue-targets/${row.id}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "目标营业额详情加载失败，请稍后重试");
      setDetail(data);
    } catch (error) { setDetailError(true); message.error(error instanceof Error ? error.message : "目标营业额详情加载失败，请稍后重试"); }
    finally { setDetailLoading(false); }
  };

  const calculateDaily = async (row: RevenueTargetRow) => {
    clearCalculationTimers();
    setCalculationRow(row);
    setCalculatingId(row.id);
    setCalculationProgress(6);
    setCalculationStatus("running");
    setCalculationMessage("正在提取上月每日实际营业额...");
    calculationProgressTimer.current = setInterval(() => {
      setCalculationProgress(current => {
        const next = Math.min(88, current + Math.max(1, Math.ceil((90 - current) / 8)));
        if (next >= 65) setCalculationMessage("正在生成并校准每日目标金额...");
        else if (next >= 32) setCalculationMessage("正在计算星期均值并剔除异常数据...");
        return next;
      });
    }, 260);
    try {
      const response = await fetch(`/api/revenue-targets/${row.id}/calculate-daily`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "每日目标营业额计算失败，请稍后重试");
      if (calculationProgressTimer.current) clearInterval(calculationProgressTimer.current);
      calculationProgressTimer.current = undefined;
      setCalculationProgress(100);
      setCalculationStatus("success");
      setCalculationMessage("每日的目标金额已计算完毕，请点击“查看”查看每日明细。");
      await load(page, pageSize, filters);
      calculationCloseTimer.current = setTimeout(() => {
        setCalculationRow(undefined);
        calculationCloseTimer.current = undefined;
      }, 1800);
    } catch (error) {
      if (calculationProgressTimer.current) clearInterval(calculationProgressTimer.current);
      calculationProgressTimer.current = undefined;
      setCalculationStatus("error");
      setCalculationMessage(error instanceof Error ? error.message : "每日目标营业额计算失败，请稍后重试");
    }
    finally { setCalculatingId(undefined); }
  };

  const closeCalculation = () => {
    if (calculationStatus === "running") return;
    clearCalculationTimers();
    setCalculationRow(undefined);
  };

  const performDelete = async () => {
    if (!deleteRow) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/revenue-targets/${deleteRow.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "目标营业额删除失败，请稍后重试");
      message.success(data.message || "目标营业额记录删除成功");
      setSelectedKeys(keys => keys.filter(key => key !== deleteRow.id)); setDeleteRow(undefined);
      const nextPage = rows.length === 1 && page > 1 ? page - 1 : page; await load(nextPage, pageSize, filters);
    } catch (error) { message.error(error instanceof Error ? error.message : "目标营业额删除失败，请稍后重试"); }
    finally { setDeleting(false); }
  };

  const columns: ColumnsType<RevenueTargetRow> = [
    { title: "记录编号", dataIndex: "recordNo", width: 140, fixed: "left" },
    { title: "所属月份", dataIndex: "targetMonth", width: 110 },
    { title: "品牌", dataIndex: "brandName", width: 120, ellipsis: true },
    { title: "门店名称", dataIndex: "storeName", width: 200, ellipsis: true },
    { title: "所属区域", dataIndex: "regionName", width: 130, ellipsis: true },
    { title: "目标营业额", dataIndex: "targetAmount", width: 160, align: "right", render: money },
    { title: "每日目标分解", dataIndex: "dailyTargetStatus", width: 140, align: "center", render: value => value === "GENERATED" ? <Tag color="success">已生成</Tag> : <Tag color="warning">待生成</Tag> },
    { title: "操作", key: "actions", width: 290, fixed: "right", render: (_, row) => <Space size={2} className="table-actions">
      {can("view") && <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => void openDetail(row)}>查看</Button>}
      {can("calculate") && <Tooltip title={row.dailyTargetStatus === "GENERATED" ? "当前记录已生成每日目标，不支持重复计算" : undefined}><span><Button type="link" size="small" loading={calculatingId === row.id} disabled={row.dailyTargetStatus === "GENERATED" || !!calculatingId} icon={<CalculatorOutlined />} onClick={() => void calculateDaily(row)}>立即计算</Button></span></Tooltip>}
      {can("delete") && <Tooltip title={row.dailyTargetStatus === "GENERATED" ? "当前记录已生成每日目标，不支持删除" : calculatingId === row.id ? "当前记录正在计算每日目标" : undefined}><span><Button type="link" danger size="small" disabled={row.dailyTargetStatus === "GENERATED" || calculatingId === row.id} icon={<DeleteOutlined />} onClick={() => setDeleteRow(row)}>删除</Button></span></Tooltip>}
    </Space> },
  ];
  const rowSelection: TableRowSelection<RevenueTargetRow> = { selectedRowKeys: selectedKeys, preserveSelectedRowKeys: true, onChange: setSelectedKeys, columnWidth: 48, selections: true };
  const targetInputDisabled = !previous?.exists || previous.targetExists || previousLoading || !!previousError;

  return <>
    {dictionaryError && <Alert className="revenue-target-alert" type="warning" showIcon message="品牌数据加载失败，请稍后重试" description={dictionaryError} action={<Button size="small" icon={<ReloadOutlined />} onClick={() => void reloadDictionaries()}>重试</Button>} />}
    <Card className="revenue-target-filter-card">
      <Form form={filterForm} layout="vertical">
        <div className="revenue-target-filter-grid">
          <Form.Item label="品牌" name="brand"><Select allowClear loading={dictionaryLoading} placeholder="全部" options={dictionaries.BRAND} /></Form.Item>
          <Form.Item label="门店名称" name="storeKeyword"><Input allowClear maxLength={100} placeholder="请输入门店名称" onPressEnter={applyFilters} /></Form.Item>
          <Form.Item label="所属月份" name="targetMonth"><DatePicker picker="month" format="YYYY-MM" placeholder="请选择月份" /></Form.Item>
          <div className="revenue-target-filter-actions"><Space><Button onClick={resetFilters}>重置</Button><Button type="primary" icon={<SearchOutlined />} onClick={applyFilters}>筛选</Button></Space></div>
        </div>
      </Form>
    </Card>
    <Card className="revenue-target-list-card">
      <div className="revenue-target-toolbar">
        <Space>{can("create") && <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增</Button>}<span>已选择 <strong>{selectedKeys.length}</strong> 条</span></Space>
        <Space><Button icon={<ReloadOutlined />} disabled={loading || exporting} onClick={() => void load()}>刷新</Button>{can("export") && <Button icon={<DownloadOutlined />} loading={exporting} onClick={() => void exportRows()}>{exporting ? "导出中..." : "批量导出"}</Button>}</Space>
      </div>
      {loadError ? <Alert type="error" showIcon message="目标营业额数据加载失败，请稍后重试" action={<Button size="small" onClick={() => void load()}>重新加载</Button>} /> : <Table<RevenueTargetRow>
        rowKey="id" dataSource={rows} columns={columns} rowSelection={rowSelection} loading={loading} scroll={{ x: 1350 }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={Object.values(filters).some(Boolean) ? <><div>没有找到符合当前条件的目标营业额记录</div><small>请调整筛选条件后重试</small><div><Button type="link" onClick={resetFilters}>重置筛选</Button></div></> : "暂无目标营业额记录"} /> }}
        pagination={{ current: page, pageSize, total, showSizeChanger: true, pageSizeOptions: [20, 50, 100], showTotal: value => `共 ${value} 条`, onChange: (nextPage, nextSize) => { const targetPage = nextSize !== pageSize ? 1 : nextPage; setSelectedKeys([]); void load(targetPage, nextSize, filters); } }}
      />}
    </Card>

    <Modal width={680} title="新增-目标营业额" open={createOpen} closable={!saving} maskClosable={false} onCancel={requestCloseCreate} footer={<Space><Button disabled={saving} onClick={requestCloseCreate}>取消</Button><Button type="primary" loading={saving} disabled={targetInputDisabled} onClick={() => void saveTarget()}>{saving ? "保存中..." : "保存"}</Button></Space>} destroyOnHidden>
      <Form form={createForm} layout="vertical" className="revenue-target-create-form">
        <Form.Item label="记录编号"><Input value="" readOnly placeholder="保存成功后由系统自动生成" /></Form.Item>
        <Form.Item label="所属月份" name="targetMonth" rules={[{ required: true, message: "请选择所属月份" }]}><DatePicker picker="month" format="YYYY-MM" placeholder="请选择" onChange={value => { createForm.setFieldValue("targetAmount", undefined); void lookupPrevious(undefined, value); }} /></Form.Item>
        <Form.Item label="品牌" name="brand" rules={[{ required: true, message: "请选择品牌" }]}><Select loading={dictionaryLoading} placeholder="请选择" options={dictionaries.BRAND} onChange={value => { createForm.setFieldValue("storeId", undefined); createForm.setFieldValue("targetAmount", undefined); setPrevious(undefined); setPreviousError(undefined); void searchStores("", value); }} /></Form.Item>
        <Form.Item label="门店名称" name="storeId" rules={[{ required: true, message: "请选择系统中的正式门店记录" }]}><Select showSearch filterOption={false} disabled={!createForm.getFieldValue("brand")} loading={storeSearching} placeholder="请输入门店名称关键词" onFocus={() => void searchStores()} onSearch={value => void searchStores(value)} onChange={value => { createForm.setFieldValue("targetAmount", undefined); void lookupPrevious(value); }} notFoundContent={storeSearching ? "搜索中..." : "暂无匹配门店"} options={stores.map(store => ({ value: store.storeId, label: `${store.storeName}${store.regionName === "-" ? "" : `（${store.regionName}）`}` }))} /></Form.Item>
        <Form.Item label="上月实际营业额（元）" validateStatus={previousError || (previous && !previous.exists) ? "error" : undefined} help={previousError || (previous && !previous.exists ? "请先导入当前门店的上月实际营业额" : previous?.targetExists ? "当前门店该月份目标营业额已存在" : undefined)}>
          <Input readOnly status={previousError || (previous && !previous.exists) ? "error" : undefined} value={previousLoading ? "查询中..." : previous?.exists ? money(previous.actualRevenue) : previous ? "暂无" : "请选择月份和正式门店"} />
        </Form.Item>
        {previous && !previous.exists && <Alert type="error" showIcon message="当前门店暂无上月实际营业额" description="请先通过《运营 → 实际营业额》导入该门店上月实际营业数据，再创建目标营业额。" />}
        <Form.Item label="当月目标营业额（元）" name="targetAmount" rules={[{ required: true, message: "请输入当月目标营业额" }, { validator: (_, value) => Number.isInteger(value) && value > 0 ? Promise.resolve() : Promise.reject(new Error("当月目标营业额仅支持输入大于0的整数")) }]}><InputNumber min={1} precision={0} controls={false} disabled={targetInputDisabled} placeholder="请输入大于0的整数" style={{ width: "100%" }} /></Form.Item>
        <Form.Item label="备注" name="remark"><Input.TextArea maxLength={200} showCount rows={4} placeholder="请输入备注（选填）" /></Form.Item>
      </Form>
    </Modal>

    <Modal className="revenue-target-detail-modal" width={920} title="月度目标营业额" open={!!detailId} onCancel={() => setDetailId(undefined)} footer={<Button onClick={() => setDetailId(undefined)}>关闭</Button>}>
      {detailLoading ? <Skeleton active paragraph={{ rows: 8 }} /> : detailError ? <Alert type="error" showIcon message="目标营业额详情加载失败，请稍后重试" action={<Button size="small" onClick={() => { const row = rows.find(item => item.id === detailId); if (row) void openDetail(row); }}>重新加载</Button>} /> : detail && <Tabs defaultActiveKey="overview" items={[
        { key: "overview", label: "目标概览", children: <Descriptions bordered size="small" column={2}><Descriptions.Item label="记录编号">{detail.overview.recordNo}</Descriptions.Item><Descriptions.Item label="所属月份">{detail.overview.targetMonth}</Descriptions.Item><Descriptions.Item label="品牌">{detail.overview.brandName}</Descriptions.Item><Descriptions.Item label="门店名称">{detail.overview.storeName}</Descriptions.Item><Descriptions.Item label={`上月实际营业额（${detail.overview.previousActualMonth}）`}>{money(detail.overview.previousActualRevenue)}</Descriptions.Item><Descriptions.Item label="当月目标营业额">{money(detail.overview.targetAmount)}</Descriptions.Item><Descriptions.Item label="备注" span={2}>{detail.overview.remark}</Descriptions.Item></Descriptions> },
        { key: "daily", label: "每日明细", children: detail.overview.dailyTargetStatus !== "GENERATED" ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="每日目标尚未生成" /> : <Table<DailyTarget> rowKey="id" size="small" pagination={false} dataSource={detail.dailyTargets} columns={[{ title: "日期", dataIndex: "targetDate" }, { title: "星期", dataIndex: "weekday" }, { title: "目标营业额（元）", dataIndex: "targetAmount", align: "right", render: money }]} summary={data => <Table.Summary fixed><Table.Summary.Row className="revenue-target-daily-total-row"><Table.Summary.Cell index={0} colSpan={2}><strong>本月每日目标合计</strong></Table.Summary.Cell><Table.Summary.Cell index={2} align="right"><strong>{money(sumMoneyValues(data.map(item => item.targetAmount)))}</strong></Table.Summary.Cell></Table.Summary.Row></Table.Summary>} locale={{ emptyText: "每日目标尚未生成" }} /> },
      ]} />}
    </Modal>

    <Modal className="revenue-target-calculation-modal" width={520} title="立即计算每日目标" open={!!calculationRow} closable={calculationStatus !== "running"} maskClosable={false} keyboard={calculationStatus !== "running"} onCancel={closeCalculation} footer={calculationStatus === "error" && calculationRow ? <Space><Button onClick={closeCalculation}>关闭</Button><Button type="primary" onClick={() => void calculateDaily(calculationRow)}>重新计算</Button></Space> : null}>
      {calculationRow && <div className="revenue-target-calculation-content">
        <div className="revenue-target-calculation-record">{calculationRow.storeName} · {calculationRow.targetMonth} · {money(calculationRow.targetAmount)}</div>
        <Progress percent={calculationProgress} status={calculationStatus === "running" ? "active" : calculationStatus === "success" ? "success" : "exception"} strokeColor={calculationStatus === "running" ? { from: "#1677ff", to: "#52c41a" } : undefined} />
        <div className={`revenue-target-calculation-message is-${calculationStatus}`}>{calculationMessage}</div>
        {calculationStatus === "running" && <div className="revenue-target-calculation-help">计算期间请勿关闭页面或重复操作</div>}
      </div>}
    </Modal>

    <Modal open={!!deleteRow} title={<Space><WarningOutlined style={{ color: "#ff4d4f" }} />温馨提示</Space>} closable={!deleting} maskClosable={!deleting} onCancel={() => !deleting && setDeleteRow(undefined)} footer={<Space><Button disabled={deleting} onClick={() => setDeleteRow(undefined)}>我再想想</Button><Button danger type="primary" loading={deleting} onClick={() => void performDelete()}>{deleting ? "删除中..." : "我知道了，继续删除"}</Button></Space>}>
      <Alert type="error" showIcon message="删除操作不可逆" description={deleteRow ? `${deleteRow.storeName} · ${deleteRow.targetMonth} · ${deleteRow.recordNo}` : undefined} />
      <div className="revenue-target-delete-copy">删除成功后，当前门店该月份的目标营业额记录将无法恢复；对应上月实际营业额会解除目标锁定，请谨慎操作。</div>
    </Modal>
  </>;
}

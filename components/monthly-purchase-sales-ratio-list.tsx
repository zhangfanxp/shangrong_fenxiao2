"use client";

import {
  CopyOutlined, DeleteOutlined, DownloadOutlined, EditOutlined, EyeOutlined,
  InboxOutlined, PlusOutlined, SearchOutlined, UploadOutlined,
} from "@ant-design/icons";
import {
  Alert, Button, Card, Descriptions, Empty, Form, Input, InputNumber, message,
  Modal, Select, Skeleton, Space, Statistic, Table, Tooltip, Upload,
} from "antd";
import type { ColumnsType, TableRowSelection } from "antd/es/table/interface";
import type { UploadFile } from "antd/es/upload/interface";
import dayjs from "dayjs";
import { useCallback, useMemo, useRef, useState } from "react";
import { useBusinessDictionaries } from "@/hooks/use-business-dictionaries";

export type MonthlyPurchaseSalesRow = {
  id: string;
  recordNo: string;
  storeId: string;
  storeName: string;
  aliasId: string;
  storeAlias: string;
  brandCode: string;
  brandName: string;
  year: number;
  month: number;
  preDiscountSales: string;
  postDiscountSales: string | null;
  purchaseAmount: string;
  preDiscountPurchaseSalesRatio: string;
  postDiscountPurchaseSalesRatio: string | null;
  remark: string;
  sourceType: "MANUAL" | "IMPORT";
  createdByName: string;
  createdAt: string;
  updatedAt: string;
};

type Filters = { brandCode: string; storeNameKeyword: string; year: string; month: string };
type FilterValues = { brandCode?: string; storeNameKeyword?: string; year?: string; month?: string };
type FormValues = {
  aliasId?: string;
  year?: number | null;
  month?: number;
  preDiscountSales?: number | null;
  postDiscountSales?: number | null;
  purchaseAmount?: number | null;
  remark?: string;
};
type AliasOption = { aliasId: string; aliasName: string; storeId: string; storeName: string; brandCode: string; brandName: string };
type ImportResult = {
  batchId: string; year: number; month: number; totalCount: number; successCount: number;
  insertedCount: number; updatedCount: number; skippedCount: number; failedCount: number;
  failedRows: { rowNo: number; storeAlias: string; reason: string }[];
};
type ModalMode = "create" | "view" | "edit";

const emptyFilters: Filters = { brandCode: "", storeNameKeyword: "", year: "", month: "" };
const months = [{ value: "ALL", label: "全部" }, ...Array.from({ length: 12 }, (_, index) => ({ value: String(index + 1), label: `${index + 1}月` }))];
const formMonths = Array.from({ length: 12 }, (_, index) => ({ value: index + 1, label: `${index + 1}月` }));
const money = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function can(permissions: string[], action: string) {
  return permissions.includes("*") || permissions.includes(`monthly-purchase-sales:${action}`) || (["query", "view"].includes(action) && permissions.includes("operations:view"));
}

function formatMoney(value: string | null) {
  return value === null ? "-" : money.format(Number(value));
}

function formatRatio(value: string | null) {
  return value === null ? "-" : `${Number(value).toFixed(2)}%`;
}

function previewRatio(purchase?: number | null, sales?: number | null) {
  if (purchase === null || purchase === undefined || sales === null || sales === undefined || sales <= 0 || purchase < 0) return "-";
  return `${((purchase / sales) * 100).toFixed(2)}%`;
}

function responseFileName(response: Response) {
  const encoded = response.headers.get("Content-Disposition")?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  return encoded ? decodeURIComponent(encoded) : `每月采销比_${dayjs().format("YYYYMMDD_HHmmss")}.xlsx`;
}

export function MonthlyPurchaseSalesRatioList({ permissions, currentUserName, initialRows, initialTotal }: {
  permissions: string[];
  currentUserName: string;
  initialRows: MonthlyPurchaseSalesRow[];
  initialTotal: number;
}) {
  const canCreate = can(permissions, "create");
  const canImport = can(permissions, "import");
  const canExport = can(permissions, "export");
  const canView = can(permissions, "view");
  const canEdit = can(permissions, "edit");
  const canDelete = can(permissions, "delete");
  const [filterForm] = Form.useForm<FilterValues>();
  const [recordForm] = Form.useForm<FormValues>();
  const { options: dictionaries, loading: brandsLoading, error: dictionaryError, reload: reloadDictionaries } = useBusinessDictionaries(["BRAND"]);
  const [rows, setRows] = useState(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);
  const [modalMode, setModalMode] = useState<ModalMode>();
  const [activeRow, setActiveRow] = useState<MonthlyPurchaseSalesRow>();
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aliasOptions, setAliasOptions] = useState<AliasOption[]>([]);
  const [aliasLoading, setAliasLoading] = useState(false);
  const [selectedAlias, setSelectedAlias] = useState<AliasOption>();
  const [unavailableMonths, setUnavailableMonths] = useState<number[]>([]);
  const [monthsLoading, setMonthsLoading] = useState(false);
  const [monthsError, setMonthsError] = useState(false);
  const aliasTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const monthRequestSequence = useRef(0);
  const requestSequence = useRef(0);
  const [importOpen, setImportOpen] = useState(false);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult>();
  const [deleteRow, setDeleteRow] = useState<MonthlyPurchaseSalesRow>();
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const preDiscountSales = Form.useWatch("preDiscountSales", recordForm);
  const postDiscountSales = Form.useWatch("postDiscountSales", recordForm);
  const purchaseAmount = Form.useWatch("purchaseAmount", recordForm);
  const selectedYear = Form.useWatch("year", recordForm);

  const load = useCallback(async (targetPage: number, targetSize: number, targetFilters: Filters) => {
    const sequence = ++requestSequence.current;
    setLoading(true); setLoadError(false);
    try {
      const query = new URLSearchParams({ page: String(targetPage), pageSize: String(targetSize) });
      Object.entries(targetFilters).forEach(([key, value]) => value && query.set(key, value));
      const response = await fetch(`/api/monthly-purchase-sales-ratios?${query}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "月度采销比数据加载失败，请稍后重试");
      if (sequence !== requestSequence.current) return;
      setRows(data.rows || []); setTotal(data.total || 0);
    } catch (error) {
      if (sequence === requestSequence.current) { setLoadError(true); message.error(error instanceof Error ? error.message : "月度采销比数据加载失败，请稍后重试"); }
    } finally { if (sequence === requestSequence.current) setLoading(false); }
  }, []);

  const applyFilters = async () => {
    try {
      const values = await filterForm.validateFields();
      const next = { brandCode: values.brandCode === "ALL" ? "" : values.brandCode || "", storeNameKeyword: values.storeNameKeyword?.trim() || "", year: values.year?.trim() || "", month: values.month === "ALL" ? "" : values.month || "" };
      setFilters(next); setPage(1); setSelectedKeys([]); void load(1, pageSize, next);
    } catch { /* validation message is rendered by Form */ }
  };

  const resetFilters = () => {
    filterForm.resetFields(); setFilters(emptyFilters); setPage(1); setSelectedKeys([]); void load(1, pageSize, emptyFilters);
  };

  const searchAliases = useCallback(async (keyword = "") => {
    setAliasLoading(true);
    try {
      const response = await fetch(`/api/monthly-purchase-sales-ratios/store-alias-options?keyword=${encodeURIComponent(keyword)}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "门店别名数据加载失败，请稍后重试");
      setAliasOptions(data);
    } catch (error) { message.error(error instanceof Error ? error.message : "门店别名数据加载失败，请稍后重试"); }
    finally { setAliasLoading(false); }
  }, []);

  const onAliasSearch = (keyword: string) => {
    if (aliasTimer.current) clearTimeout(aliasTimer.current);
    aliasTimer.current = setTimeout(() => void searchAliases(keyword.trim()), 300);
  };

  const loadUnavailableMonths = useCallback(async (aliasId: string, year: number) => {
    const sequence = ++monthRequestSequence.current;
    setMonthsLoading(true); setMonthsError(false); setUnavailableMonths([]);
    try {
      const query = new URLSearchParams({ aliasId, year: String(year) });
      const response = await fetch(`/api/monthly-purchase-sales-ratios/available-months?${query}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "门店已占用月份加载失败，请稍后重试");
      if (sequence !== monthRequestSequence.current) return;
      setUnavailableMonths(Array.isArray(data.unavailableMonths) ? data.unavailableMonths : []);
    } catch (error) {
      if (sequence !== monthRequestSequence.current) return;
      setMonthsError(true);
      message.error(error instanceof Error ? error.message : "门店已占用月份加载失败，请稍后重试");
    } finally { if (sequence === monthRequestSequence.current) setMonthsLoading(false); }
  }, []);

  const closeRecord = () => {
    monthRequestSequence.current++;
    setModalMode(undefined); setActiveRow(undefined); setSelectedAlias(undefined); setUnavailableMonths([]); setMonthsLoading(false); setMonthsError(false); setDetailError(false); recordForm.resetFields();
  };

  const openCreate = () => {
    monthRequestSequence.current++;
    setModalMode("create"); setActiveRow(undefined); setSelectedAlias(undefined); setAliasOptions([]); setUnavailableMonths([]); setMonthsLoading(false); setMonthsError(false);
    recordForm.resetFields(); recordForm.setFieldsValue({ year: dayjs().year(), month: undefined, remark: "" });
    void searchAliases();
  };

  const openExisting = async (row: MonthlyPurchaseSalesRow, mode: "view" | "edit") => {
    setModalMode(mode); setActiveRow(undefined); setDetailError(false); setDetailLoading(true);
    try {
      const response = await fetch(`/api/monthly-purchase-sales-ratios/${row.id}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "月度采销比详情加载失败，请稍后重试");
      setActiveRow(data);
      const alias = { aliasId: data.aliasId, aliasName: data.storeAlias, storeId: data.storeId, storeName: data.storeName, brandCode: data.brandCode, brandName: data.brandName };
      setSelectedAlias(alias); setAliasOptions([alias]);
      if (mode === "edit") recordForm.setFieldsValue({ aliasId: data.aliasId, year: data.year, month: data.month, preDiscountSales: Number(data.preDiscountSales), postDiscountSales: data.postDiscountSales === null ? null : Number(data.postDiscountSales), purchaseAmount: Number(data.purchaseAmount), remark: data.remark });
    } catch (error) { setDetailError(true); message.error(error instanceof Error ? error.message : "月度采销比详情加载失败，请稍后重试"); }
    finally { setDetailLoading(false); }
  };

  const saveRecord = async () => {
    try {
      const values = await recordForm.validateFields();
      setSaving(true);
      const editing = modalMode === "edit" && activeRow;
      const response = await fetch(editing ? `/api/monthly-purchase-sales-ratios/${activeRow.id}` : "/api/monthly-purchase-sales-ratios", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing ? { year: values.year, month: values.month, preDiscountSales: values.preDiscountSales, postDiscountSales: values.postDiscountSales ?? null, purchaseAmount: values.purchaseAmount } : values),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "月度采销比保存失败，请稍后重试");
      message.success(editing ? "月度采销比保存成功" : "月度采销比新增成功");
      closeRecord(); const nextPage = editing ? page : 1; if (!editing) setPage(1); void load(nextPage, pageSize, filters);
    } catch (error) { if (error instanceof Error) message.error(error.message); }
    finally { setSaving(false); }
  };

  const startImport = async () => {
    const file = fileList[0]?.originFileObj;
    if (!file) { message.warning("请选择.xlsx文件"); return; }
    setImporting(true);
    try {
      const form = new FormData(); form.append("file", file);
      const response = await fetch("/api/monthly-purchase-sales-ratios/import", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "门店订销对比表导入失败，请稍后重试");
      setImportResult(data); setImportOpen(false); setFileList([]); setPage(1); setSelectedKeys([]); void load(1, pageSize, filters);
    } catch (error) { message.error(error instanceof Error ? error.message : "门店订销对比表导入失败，请稍后重试"); }
    finally { setImporting(false); }
  };

  const exportRows = async () => {
    setExporting(true);
    try {
      const response = await fetch("/api/monthly-purchase-sales-ratios/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recordIds: selectedKeys.length ? selectedKeys.map(String) : undefined, filters }) });
      if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.message || "月度采销比导出失败，请稍后重试"); }
      const href = URL.createObjectURL(await response.blob()); const link = document.createElement("a"); link.href = href; link.download = responseFileName(response); document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(href); message.success("月度采销比导出成功");
    } catch (error) { message.error(error instanceof Error ? error.message : "月度采销比导出失败，请稍后重试"); }
    finally { setExporting(false); }
  };

  const confirmDelete = async () => {
    if (!deleteRow) return; setDeleting(true);
    try {
      const response = await fetch(`/api/monthly-purchase-sales-ratios/${deleteRow.id}`, { method: "DELETE" }); const data = await response.json();
      if (!response.ok) throw new Error(data.message || "月度采销比删除失败，请稍后重试");
      message.success("月度采销比删除成功"); setSelectedKeys(keys => keys.filter(key => String(key) !== deleteRow.id)); setDeleteRow(undefined);
      const nextPage = rows.length === 1 && page > 1 ? page - 1 : page; setPage(nextPage); void load(nextPage, pageSize, filters);
    } catch (error) { message.error(error instanceof Error ? error.message : "月度采销比删除失败，请稍后重试"); }
    finally { setDeleting(false); }
  };

  const columns: ColumnsType<MonthlyPurchaseSalesRow> = useMemo(() => [
    { title: "记录编号", dataIndex: "recordNo", width: 145, fixed: "left" },
    { title: "所属年份", dataIndex: "year", width: 100, align: "center" },
    { title: "所属月份", dataIndex: "month", width: 100, align: "center", render: value => `${value}月` },
    { title: "门店名称", dataIndex: "storeName", width: 200, ellipsis: true },
    { title: "门店（别名）", dataIndex: "storeAlias", width: 200, ellipsis: true },
    { title: "品牌", dataIndex: "brandName", width: 130 },
    { title: "折前销售额", dataIndex: "preDiscountSales", width: 145, align: "right", render: formatMoney },
    { title: "要货金额", dataIndex: "purchaseAmount", width: 145, align: "right", render: formatMoney },
    { title: "折前要货占销比", dataIndex: "preDiscountPurchaseSalesRatio", width: 165, align: "right", render: formatRatio },
    { title: "创建时间", dataIndex: "createdAt", width: 180 },
    { title: "创建人", dataIndex: "createdByName", width: 120, ellipsis: true },
    { title: "操作", key: "actions", width: 190, fixed: "right", render: (_, row) => <Space size={0} className="table-actions">
      {canView && <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => void openExisting(row, "view")}>查看</Button>}
      {canEdit && (row.sourceType === "MANUAL" ? <Button type="link" size="small" icon={<EditOutlined />} onClick={() => void openExisting(row, "edit")}>编辑</Button> : <Tooltip title="批量导入记录不支持手工编辑，请通过重新导入文件更新"><Button type="link" size="small" icon={<EditOutlined />} disabled>编辑</Button></Tooltip>)}
      {canDelete && <Button danger type="link" size="small" icon={<DeleteOutlined />} onClick={() => setDeleteRow(row)}>删除</Button>}
    </Space> },
  ], [canDelete, canEdit, canView]);

  const rowSelection: TableRowSelection<MonthlyPurchaseSalesRow> = { selectedRowKeys: selectedKeys, preserveSelectedRowKeys: true, onChange: setSelectedKeys, columnWidth: 48 };
  const hasFilters = Boolean(filters.brandCode || filters.storeNameKeyword || filters.year || filters.month);
  const failureText = importResult?.failedRows.map(item => `${item.storeAlias || `第${item.rowNo}行`} —— ${item.reason}`).join("\n") || "";

  return <>
    {dictionaryError && <Alert className="monthly-ps-alert" type="warning" showIcon message="品牌数据加载失败，请稍后重试" action={<Button size="small" onClick={() => void reloadDictionaries()}>重试</Button>} />}
    <Card className="monthly-ps-filter-card">
      <Form form={filterForm} layout="vertical" initialValues={{ brandCode: "ALL", month: "ALL" }}>
        <div className="monthly-ps-filter-grid">
          <Form.Item label="品牌" name="brandCode"><Select loading={brandsLoading} options={[{ value: "ALL", label: "全部" }, ...(dictionaries.BRAND || [])]} /></Form.Item>
          <Form.Item label="门店名称" name="storeNameKeyword"><Input allowClear maxLength={100} placeholder="请输入门店名称" onPressEnter={() => void applyFilters()} /></Form.Item>
          <Form.Item label="所属年份" name="year" validateFirst getValueFromEvent={event => String(event.target.value || "").replace(/\D/g, "").slice(0, 4)} rules={[
            { pattern: /^\d{4}$/, message: "请输入2026-2999之间的四位年份" },
            { validator: (_, value) => !value || (Number(value) >= 2026 && Number(value) <= 2999) ? Promise.resolve() : Promise.reject(new Error("请输入2026-2999之间的四位年份")) },
          ]}><Input allowClear inputMode="numeric" maxLength={4} placeholder="请输入年份" onPressEnter={() => void applyFilters()} /></Form.Item>
          <Form.Item label="所属月份" name="month"><Select options={months} /></Form.Item>
          <div className="monthly-ps-filter-actions"><Space><Button onClick={resetFilters}>重置</Button><Button type="primary" icon={<SearchOutlined />} onClick={() => void applyFilters()}>筛选</Button></Space></div>
        </div>
      </Form>
    </Card>

    <Card className="monthly-ps-list-card">
      <div className="monthly-ps-toolbar">
        <Space wrap>{canCreate && <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增</Button>}{canImport && <Button icon={<UploadOutlined />} onClick={() => setImportOpen(true)}>批量导入</Button>}<span>已选择 <strong>{selectedKeys.length}</strong> 条</span></Space>
        {canExport && <Button icon={<DownloadOutlined />} loading={exporting} disabled={loading} onClick={() => void exportRows()}>{exporting ? "导出中..." : "批量导出"}</Button>}
      </div>
      {loadError ? <Alert type="error" showIcon message="月度采销比数据加载失败，请稍后重试" action={<Button size="small" onClick={() => void load(page, pageSize, filters)}>重新加载</Button>} /> : <Table<MonthlyPurchaseSalesRow>
        rowKey="id" dataSource={rows} columns={columns} loading={loading} rowSelection={canExport ? rowSelection : undefined} scroll={{ x: 1700 }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={hasFilters ? <><div>没有找到符合当前条件的月度采销比记录</div><small>请调整筛选条件后重试</small><div><Button type="link" onClick={resetFilters}>重置筛选</Button></div></> : <><div>当前还没有门店月度采销比数据</div><Space>{canCreate && <Button type="link" onClick={openCreate}>新增</Button>}{canImport && <Button type="link" onClick={() => setImportOpen(true)}>批量导入</Button>}</Space></>} /> }}
        pagination={{ current: page, pageSize, total, showSizeChanger: true, pageSizeOptions: [20, 50, 100], showTotal: value => `共 ${value} 条`, onChange: (nextPage, nextSize) => { const target = nextSize !== pageSize ? 1 : nextPage; setPage(target); setPageSize(nextSize); void load(target, nextSize, filters); } }}
      />}
    </Card>

    <Modal width={920} open={Boolean(modalMode)} title={modalMode === "create" ? "新增-月度采销比" : modalMode === "edit" ? "编辑-门店月度采销比" : "查看-门店月度采销比"} onCancel={() => !saving && closeRecord()} maskClosable={false} closable={!saving} footer={modalMode === "view" ? <Button onClick={closeRecord}>关闭</Button> : <Space><Button disabled={saving} onClick={closeRecord}>取消</Button><Button type="primary" loading={saving} onClick={() => void saveRecord()}>{saving ? "保存中..." : "保存"}</Button></Space>}>
      {modalMode === "view" ? detailLoading ? <Skeleton active paragraph={{ rows: 10 }} /> : detailError ? <Alert type="error" showIcon message="月度采销比详情加载失败，请稍后重试" /> : activeRow && <Descriptions bordered size="small" column={2}>
        <Descriptions.Item label="记录编号">{activeRow.recordNo}</Descriptions.Item><Descriptions.Item label="门店（别名）">{activeRow.storeAlias}</Descriptions.Item>
        <Descriptions.Item label="门店名称">{activeRow.storeName}</Descriptions.Item><Descriptions.Item label="品牌">{activeRow.brandName}</Descriptions.Item>
        <Descriptions.Item label="所属年份">{activeRow.year}</Descriptions.Item><Descriptions.Item label="所属月份">{activeRow.month}月</Descriptions.Item>
        <Descriptions.Item label="折前销售额">{formatMoney(activeRow.preDiscountSales)}</Descriptions.Item><Descriptions.Item label="折后销售额">{formatMoney(activeRow.postDiscountSales)}</Descriptions.Item>
        <Descriptions.Item label="要货金额">{formatMoney(activeRow.purchaseAmount)}</Descriptions.Item><Descriptions.Item label="折前要货占销比">{formatRatio(activeRow.preDiscountPurchaseSalesRatio)}</Descriptions.Item>
        <Descriptions.Item label="折后要货占销比">{formatRatio(activeRow.postDiscountPurchaseSalesRatio)}</Descriptions.Item><Descriptions.Item label="备注">{activeRow.remark || "-"}</Descriptions.Item>
        <Descriptions.Item label="创建人">{activeRow.createdByName}</Descriptions.Item><Descriptions.Item label="创建时间">{activeRow.createdAt}</Descriptions.Item>
      </Descriptions> : detailLoading ? <Skeleton active paragraph={{ rows: 10 }} /> : detailError ? <Alert type="error" showIcon message="月度采销比详情加载失败，请稍后重试" /> : <Form form={recordForm} layout="vertical" onValuesChange={(changed: Partial<FormValues>) => {
        if (modalMode !== "create" || !("year" in changed)) return;
        monthRequestSequence.current++;
        recordForm.setFieldValue("month", undefined);
        setUnavailableMonths([]); setMonthsError(false);
        const year = changed.year;
        if (selectedAlias && Number.isInteger(year) && Number(year) >= 2026 && Number(year) <= 2999) void loadUnavailableMonths(selectedAlias.aliasId, Number(year));
      }}>
        <div className="monthly-ps-form-grid">
          <Form.Item label="记录编号"><Input readOnly value={activeRow?.recordNo || ""} placeholder="保存成功后由系统生成" /></Form.Item>
          <Form.Item label="门店（别名）" name="aliasId" rules={[{ required: true, message: "请选择系统中已配置的美团管家门店别名" }]}><Select showSearch allowClear disabled={modalMode === "edit"} filterOption={false} loading={aliasLoading} placeholder="请输入并选择美团管家门店别名" onSearch={onAliasSearch} onClear={() => { monthRequestSequence.current++; setSelectedAlias(undefined); setUnavailableMonths([]); setMonthsError(false); recordForm.setFieldValue("month", undefined); }} onChange={value => {
            const alias = aliasOptions.find(item => item.aliasId === value);
            setSelectedAlias(alias); recordForm.setFieldValue("month", undefined); setUnavailableMonths([]); setMonthsError(false);
            if (alias && Number.isInteger(selectedYear) && Number(selectedYear) >= 2026 && Number(selectedYear) <= 2999) void loadUnavailableMonths(alias.aliasId, Number(selectedYear));
          }} options={aliasOptions.map(item => ({ value: item.aliasId, label: item.aliasName }))} notFoundContent={aliasLoading ? "搜索中..." : "未找到正式别名"} /></Form.Item>
          <Form.Item label="门店名称"><Input readOnly value={selectedAlias?.storeName || activeRow?.storeName || ""} /></Form.Item>
          <Form.Item label="品牌"><Input readOnly value={selectedAlias?.brandName || activeRow?.brandName || ""} /></Form.Item>
          <Form.Item label="所属年份" name="year" rules={[{ required: true, message: "请输入所属年份" }, { validator: (_, value) => Number.isInteger(value) && value >= 2026 && value <= 2999 ? Promise.resolve() : Promise.reject(new Error("请输入2026-2999之间的四位年份")) }]}><InputNumber controls={false} precision={0} min={2026} max={2999} style={{ width: "100%" }} placeholder="请输入年份" /></Form.Item>
          <Form.Item label="所属月份" name="month" extra={modalMode === "create" ? monthsError ? <span className="monthly-ps-month-error">已占用月份加载失败，请重新选择门店或年份后重试</span> : unavailableMonths.length ? `已存在记录的月份不可选择：${unavailableMonths.map(month => `${month}月`).join("、")}` : "同一门店同一年中，已有记录的月份不可重复新增" : undefined} rules={[{ required: true, message: "请选择所属月份" }]}><Select loading={monthsLoading} disabled={modalMode === "create" && (!selectedAlias || !Number.isInteger(selectedYear) || monthsLoading || monthsError)} placeholder={modalMode === "create" && !selectedAlias ? "请先选择门店别名" : "请选择"} options={formMonths.map(option => ({ ...option, disabled: modalMode === "create" && unavailableMonths.includes(option.value) }))} /></Form.Item>
          <Form.Item label="折前销售额" name="preDiscountSales" rules={[{ required: true, message: "请输入折前销售额" }, { validator: (_, value) => typeof value === "number" && value > 0 ? Promise.resolve() : Promise.reject(new Error("折前销售额必须大于0")) }]}><InputNumber min={0.01} precision={2} controls={false} style={{ width: "100%" }} placeholder="请输入金额" /></Form.Item>
          <Form.Item label="折后销售额" name="postDiscountSales" rules={[{ validator: (_, value) => value === null || value === undefined || (typeof value === "number" && value > 0) ? Promise.resolve() : Promise.reject(new Error("折后销售额必须大于0")) }]}><InputNumber min={0.01} precision={2} controls={false} style={{ width: "100%" }} placeholder="请输入金额（选填）" /></Form.Item>
          <Form.Item label="要货金额" name="purchaseAmount" rules={[{ required: true, message: "请输入要货金额" }, { validator: (_, value) => typeof value === "number" && value >= 0 ? Promise.resolve() : Promise.reject(new Error("要货金额不能为负数")) }]}><InputNumber min={0} precision={2} controls={false} style={{ width: "100%" }} placeholder="请输入金额" /></Form.Item>
          <Form.Item label="折前要货占销比"><Input readOnly value={previewRatio(purchaseAmount, preDiscountSales)} /></Form.Item>
          <Form.Item label="折后要货占销比"><Input readOnly value={previewRatio(purchaseAmount, postDiscountSales)} /></Form.Item>
          <Form.Item className="monthly-ps-form-span" label="备注" name="remark" rules={[{ max: 200, message: "备注不能超过200个字符" }]}><Input.TextArea readOnly={modalMode === "edit"} rows={3} maxLength={200} showCount={modalMode === "create"} placeholder="请输入备注（选填）" /></Form.Item>
          <Form.Item label="创建人"><Input readOnly value={activeRow?.createdByName || currentUserName} /></Form.Item>
          <Form.Item label="创建时间"><Input readOnly value={activeRow?.createdAt || ""} placeholder="保存成功后由系统生成" /></Form.Item>
        </div>
      </Form>}
    </Modal>

    <Modal width={700} open={importOpen} title="导入门店订销对比表" onCancel={() => !importing && setImportOpen(false)} maskClosable={false} closable={!importing} okText={importing ? "导入中..." : "立即导入"} cancelText="取消" confirmLoading={importing} onOk={() => void startImport()}>
      <Upload.Dragger accept=".xlsx" maxCount={1} fileList={fileList} disabled={importing} beforeUpload={() => false} onChange={({ fileList: next }) => setFileList(next.slice(-1))}>
        <p className="ant-upload-drag-icon"><InboxOutlined /></p><p className="ant-upload-text">点击或拖拽 .xlsx 文件到此区域</p><p className="ant-upload-hint">第1行须为“门店订销对比表”，第2行须包含营业日期，第3行为字段名称</p>
      </Upload.Dragger>
    </Modal>

    <Modal width={760} open={Boolean(importResult)} title="温馨提示" footer={<Button type="primary" onClick={() => setImportResult(undefined)}>我知道了</Button>} onCancel={() => setImportResult(undefined)}>
      {importResult && <><div className="monthly-ps-import-stats"><Statistic title="总记录数" value={importResult.totalCount} suffix="条" /><Statistic title="成功导入" value={importResult.successCount} suffix="条" /><Statistic title="新增" value={importResult.insertedCount} suffix="条" /><Statistic title="覆盖更新" value={importResult.updatedCount} suffix="条" /><Statistic title="一致跳过" value={importResult.skippedCount} suffix="条" /><Statistic title="导入失败" value={importResult.failedCount} suffix="条" /></div>{importResult.failedCount > 0 && <div className="monthly-ps-failures"><div className="monthly-ps-failures-title"><strong>未导入门店及原因</strong><Button size="small" icon={<CopyOutlined />} onClick={() => void navigator.clipboard.writeText(failureText).then(() => message.success("未导入门店名单已复制")).catch(() => message.error("复制失败，请手工复制"))}>复制</Button></div><Input.TextArea readOnly value={failureText} autoSize={{ minRows: 4, maxRows: 12 }} /></div>}</>}
    </Modal>

    <Modal open={Boolean(deleteRow)} title="温馨提示" okText={deleting ? "删除中..." : "我知道了，继续删除"} cancelText="我再想想" okButtonProps={{ danger: true, disabled: deleting }} cancelButtonProps={{ disabled: deleting }} confirmLoading={deleting} closable={!deleting} maskClosable={false} onCancel={() => !deleting && setDeleteRow(undefined)} onOk={() => void confirmDelete()}>
      <p>删除操作不可逆，一旦删除成功，当前门店该年月的采销比数据将从系统中永久删除，原始数据无法恢复，请谨慎操作。</p>
      {deleteRow && <Alert type="warning" showIcon message={`${deleteRow.storeName} · ${deleteRow.year}年${deleteRow.month}月`} />}
    </Modal>
  </>;
}

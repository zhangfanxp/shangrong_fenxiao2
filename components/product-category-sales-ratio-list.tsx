"use client";

import { CopyOutlined, DeleteOutlined, DownloadOutlined, EyeOutlined, InboxOutlined, SearchOutlined, UploadOutlined } from "@ant-design/icons";
import { Alert, Button, Card, DatePicker, Descriptions, Empty, Form, Input, message, Modal, Select, Skeleton, Space, Statistic, Table, Upload } from "antd";
import type { ColumnsType, TableRowSelection } from "antd/es/table/interface";
import type { UploadFile } from "antd/es/upload/interface";
import dayjs, { type Dayjs } from "dayjs";
import { useCallback, useMemo, useRef, useState } from "react";
import { useBusinessDictionaries } from "@/hooks/use-business-dictionaries";

export type ProductCategorySalesRow = {
  id: string;
  recordNo: string;
  year: number;
  month: number;
  storeId: string;
  storeName: string;
  storeAlias: string;
  brandCode: string;
  brandName: string;
  totalSalesQuantity: string;
  totalSalesAmount: string;
  createdAt: string;
};

type Filters = { brandCode: string; storeNameKeyword: string; month: string };
type FilterValues = { brandCode?: string; storeNameKeyword?: string; month?: Dayjs | null };
type DetailRow = {
  id: string; categoryName: string; salesQuantity: string; salesQuantityRatio: string | null;
  salesAmount: string; salesAmountRatio: string | null; dishIncome: string; dishIncomeRatio: string | null;
  dishDiscount: string; dishDiscountRatio: string | null; sortOrder: number;
};
type DetailResult = {
  summary: { recordNo: string; storeAlias: string; storeName: string; brandName: string; year: number; month: number; city: string; createdByName: string; createdAt: string };
  details: DetailRow[];
};
type ImportResult = {
  batchId: string; periodStart: string; periodEnd: string; year: number; month: number; rawRowCount: number; storeCount: number;
  totalCount: number; successCount: number; insertedCount: number; updatedCount: number; skippedCount: number; failedCount: number;
  failedStores: { storeAlias: string; reason: string; excelRows: number[] }[];
};

const emptyFilters: Filters = { brandCode: "", storeNameKeyword: "", month: "" };
const money = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const quantity = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

function can(permissions: string[], action: string) {
  return permissions.includes("*") || permissions.includes(`product-category-sales:${action}`) || (["query", "view"].includes(action) && permissions.includes("operations:view"));
}

function formatMoney(value: string) { return money.format(Number(value)); }
function formatQuantity(value: string) { return quantity.format(Number(value)); }
function formatRatio(value: string | null) { return value === null ? "-" : `${Number(value).toFixed(2)}%`; }

function responseFileName(response: Response) {
  const encoded = response.headers.get("Content-Disposition")?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  return encoded ? decodeURIComponent(encoded) : `产品类别销售占比_${dayjs().format("YYYYMMDD_HHmmss")}.xlsx`;
}

export function ProductCategorySalesRatioList({ permissions, initialRows, initialTotal }: { permissions: string[]; initialRows: ProductCategorySalesRow[]; initialTotal: number }) {
  const canImport = can(permissions, "import");
  const canExport = can(permissions, "export");
  const canView = can(permissions, "view");
  const canDelete = can(permissions, "delete");
  const [filterForm] = Form.useForm<FilterValues>();
  const { options: dictionaries, loading: brandsLoading, error: dictionaryError, reload: reloadDictionaries } = useBusinessDictionaries(["BRAND"]);
  const [rows, setRows] = useState(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const [detail, setDetail] = useState<DetailResult>();
  const [importOpen, setImportOpen] = useState(false);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult>();
  const [deleteRow, setDeleteRow] = useState<ProductCategorySalesRow>();
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const requestSequence = useRef(0);

  const load = useCallback(async (targetPage: number, targetSize: number, targetFilters: Filters) => {
    const sequence = ++requestSequence.current;
    setLoading(true); setLoadError(false);
    try {
      const query = new URLSearchParams({ page: String(targetPage), pageSize: String(targetSize) });
      Object.entries(targetFilters).forEach(([key, value]) => value && query.set(key, value));
      const response = await fetch(`/api/product-category-sales-ratios?${query}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "产品类别销售占比数据加载失败，请稍后重试");
      if (sequence !== requestSequence.current) return;
      setRows(data.rows || []); setTotal(data.total || 0);
    } catch (error) {
      if (sequence === requestSequence.current) { setLoadError(true); message.error(error instanceof Error ? error.message : "产品类别销售占比数据加载失败，请稍后重试"); }
    } finally { if (sequence === requestSequence.current) setLoading(false); }
  }, []);

  const applyFilters = async () => {
    const values = await filterForm.validateFields();
    const next = { brandCode: values.brandCode === "ALL" ? "" : values.brandCode || "", storeNameKeyword: values.storeNameKeyword?.trim() || "", month: values.month?.format("YYYY-MM") || "" };
    setFilters(next); setPage(1); setSelectedKeys([]); void load(1, pageSize, next);
  };

  const resetFilters = () => {
    filterForm.resetFields(); setFilters(emptyFilters); setPage(1); setSelectedKeys([]); void load(1, pageSize, emptyFilters);
  };

  const openDetail = async (row: ProductCategorySalesRow) => {
    setDetailOpen(true); setDetail(undefined); setDetailError(false); setDetailLoading(true);
    try {
      const response = await fetch(`/api/product-category-sales-ratios/${row.id}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "门店月度菜品销售明细加载失败，请稍后重试");
      setDetail(data);
    } catch (error) { setDetailError(true); message.error(error instanceof Error ? error.message : "门店月度菜品销售明细加载失败，请稍后重试"); }
    finally { setDetailLoading(false); }
  };

  const startImport = async () => {
    const file = fileList[0]?.originFileObj;
    if (!file) { message.warning("请选择.xlsx文件"); return; }
    setImporting(true);
    try {
      const form = new FormData(); form.append("file", file);
      const response = await fetch("/api/product-category-sales-ratios/import", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "菜品销售统计导入失败，请稍后重试");
      setImportResult(data); setImportOpen(false); setFileList([]); setPage(1); setSelectedKeys([]); void load(1, pageSize, filters);
    } catch (error) { message.error(error instanceof Error ? error.message : "菜品销售统计导入失败，请稍后重试"); }
    finally { setImporting(false); }
  };

  const exportRows = async () => {
    setExporting(true);
    try {
      const response = await fetch("/api/product-category-sales-ratios/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recordIds: selectedKeys.length ? selectedKeys.map(String) : undefined, filters }) });
      if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.message || "产品类别销售占比导出失败，请稍后重试"); }
      const href = URL.createObjectURL(await response.blob());
      const link = document.createElement("a"); link.href = href; link.download = responseFileName(response); document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(href);
      message.success("产品类别销售占比导出成功");
    } catch (error) { message.error(error instanceof Error ? error.message : "产品类别销售占比导出失败，请稍后重试"); }
    finally { setExporting(false); }
  };

  const confirmDelete = async () => {
    if (!deleteRow) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/product-category-sales-ratios/${deleteRow.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "产品类别销售占比记录删除失败，请稍后重试");
      message.success("产品类别销售占比记录删除成功");
      setSelectedKeys(keys => keys.filter(key => String(key) !== deleteRow.id)); setDeleteRow(undefined);
      const nextPage = rows.length === 1 && page > 1 ? page - 1 : page; setPage(nextPage); void load(nextPage, pageSize, filters);
    } catch (error) { message.error(error instanceof Error ? error.message : "产品类别销售占比记录删除失败，请稍后重试"); }
    finally { setDeleting(false); }
  };

  const columns: ColumnsType<ProductCategorySalesRow> = useMemo(() => [
    { title: "记录编号", dataIndex: "recordNo", width: 150, fixed: "left" },
    { title: "所属月份", key: "statMonth", width: 120, align: "center", render: (_, row) => `${row.year}年${row.month}月` },
    { title: "门店名称", dataIndex: "storeName", width: 210, ellipsis: true },
    { title: "门店（别名）", dataIndex: "storeAlias", width: 200, ellipsis: true },
    { title: "品牌", dataIndex: "brandName", width: 130, ellipsis: true },
    { title: "累计销售数量", dataIndex: "totalSalesQuantity", width: 150, align: "right", render: formatQuantity },
    { title: "累计销售金额", dataIndex: "totalSalesAmount", width: 160, align: "right", render: formatMoney },
    { title: "创建时间", dataIndex: "createdAt", width: 180 },
    { title: "操作", key: "actions", width: 125, fixed: "right", render: (_, row) => <Space size={0} className="table-actions">
      {canView && <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => void openDetail(row)}>查看</Button>}
      {canDelete && <Button danger type="link" size="small" icon={<DeleteOutlined />} onClick={() => setDeleteRow(row)}>删除</Button>}
    </Space> },
  ], [canDelete, canView]);

  const detailColumns: ColumnsType<DetailRow> = [
    { title: "菜品大类", dataIndex: "categoryName", width: 140, fixed: "left", ellipsis: true },
    { title: "销售数量", dataIndex: "salesQuantity", width: 120, align: "right", render: formatQuantity },
    { title: "销售数量占比", dataIndex: "salesQuantityRatio", width: 135, align: "right", render: formatRatio },
    { title: "销售额（元）", dataIndex: "salesAmount", width: 135, align: "right", render: formatMoney },
    { title: "销售额占比", dataIndex: "salesAmountRatio", width: 120, align: "right", render: formatRatio },
    { title: "菜品收入（元）", dataIndex: "dishIncome", width: 145, align: "right", render: formatMoney },
    { title: "菜品收入占比", dataIndex: "dishIncomeRatio", width: 135, align: "right", render: formatRatio },
    { title: "菜品优惠（元）", dataIndex: "dishDiscount", width: 145, align: "right", render: formatMoney },
    { title: "菜品优惠占比", dataIndex: "dishDiscountRatio", width: 135, align: "right", render: formatRatio },
  ];
  const rowSelection: TableRowSelection<ProductCategorySalesRow> = { selectedRowKeys: selectedKeys, preserveSelectedRowKeys: true, onChange: setSelectedKeys, columnWidth: 48 };
  const hasFilters = Boolean(filters.brandCode || filters.storeNameKeyword || filters.month);
  const failureText = importResult?.failedStores.map(item => `${item.storeAlias || `Excel第${item.excelRows.join("、")}行`} —— ${item.reason}`).join("\n") || "";

  const copyFailures = async () => {
    try { await navigator.clipboard.writeText(failureText); message.success("未导入门店名单已复制"); }
    catch { message.error("复制失败，请手工选择并复制"); }
  };

  return <>
    {dictionaryError && <Alert className="product-category-sales-alert" type="warning" showIcon message="品牌数据加载失败，请稍后重试" action={<Button size="small" onClick={() => void reloadDictionaries()}>重试</Button>} />}
    <Card className="product-category-sales-filter-card">
      <Form form={filterForm} layout="vertical" initialValues={{ brandCode: "ALL", month: null }}>
        <div className="product-category-sales-filter-grid">
          <Form.Item label="品牌" name="brandCode"><Select loading={brandsLoading} disabled={Boolean(dictionaryError)} options={[{ value: "ALL", label: "全部品牌" }, ...(dictionaries.BRAND || [])]} /></Form.Item>
          <Form.Item label="门店名称" name="storeNameKeyword"><Input allowClear maxLength={100} placeholder="请输入门店名称" onPressEnter={() => void applyFilters()} /></Form.Item>
          <Form.Item label="所属月份" name="month"><DatePicker picker="month" allowClear format="YYYY年M月" placeholder="请选择月份" /></Form.Item>
          <div className="product-category-sales-filter-actions"><Space><Button onClick={resetFilters}>重置</Button><Button type="primary" icon={<SearchOutlined />} onClick={() => void applyFilters()}>筛选</Button></Space></div>
        </div>
      </Form>
    </Card>

    <Card className="product-category-sales-list-card">
      <div className="product-category-sales-toolbar">
        <Space wrap>{canImport && <Button type="primary" icon={<UploadOutlined />} onClick={() => setImportOpen(true)}>批量导入</Button>}<span>已选择 <strong>{selectedKeys.length}</strong> 条</span></Space>
        {canExport && <Button icon={<DownloadOutlined />} loading={exporting} onClick={() => void exportRows()}>批量导出</Button>}
      </div>
      {loadError && <Alert className="product-category-sales-table-error" type="error" showIcon message="产品类别销售占比数据加载失败，请稍后重试" action={<Button size="small" onClick={() => void load(page, pageSize, filters)}>重试</Button>} />}
      <Table<ProductCategorySalesRow>
        rowKey="id" rowSelection={rowSelection} columns={columns} dataSource={rows} loading={loading} scroll={{ x: 1430 }}
        locale={{ emptyText: <Empty description={hasFilters ? "没有找到符合当前条件的产品类别销售占比记录" : "当前还没有导入门店菜品销售统计数据"}>{hasFilters ? <Button onClick={resetFilters}>重置筛选</Button> : canImport ? <Button type="primary" onClick={() => setImportOpen(true)}>批量导入</Button> : null}</Empty> }}
        pagination={{ current: page, pageSize, total, showSizeChanger: true, pageSizeOptions: [20, 50, 100], showTotal: count => `共 ${count} 条`, onChange: (nextPage, nextSize) => { const normalizedPage = nextSize !== pageSize ? 1 : nextPage; setPage(normalizedPage); setPageSize(nextSize); setSelectedKeys([]); void load(normalizedPage, nextSize, filters); } }}
      />
    </Card>

    <Modal title="导入门店菜品销售统计" open={importOpen} onCancel={() => { if (!importing) { setImportOpen(false); setFileList([]); } }} okText={importing ? "导入中..." : "立即导入"} cancelText="取消" confirmLoading={importing} okButtonProps={{ disabled: !fileList.length }} cancelButtonProps={{ disabled: importing }} onOk={() => void startImport()} destroyOnHidden>
      <Upload.Dragger accept=".xlsx" maxCount={1} fileList={fileList} beforeUpload={file => {
        if (!file.name.toLowerCase().endsWith(".xlsx")) { message.error("仅支持导入.xlsx格式文件"); return Upload.LIST_IGNORE; }
        return false;
      }} onChange={({ fileList: next }) => setFileList(next.slice(-1))} onRemove={() => !importing} disabled={importing}>
        <p className="ant-upload-drag-icon"><InboxOutlined /></p><p className="ant-upload-text">点击或拖拽“菜品销售统计”文件到此区域</p><p className="ant-upload-hint">仅支持单个 .xlsx 文件</p>
      </Upload.Dragger>
    </Modal>

    <Modal title="温馨提示" open={Boolean(importResult)} onCancel={() => setImportResult(undefined)} footer={<Button type="primary" onClick={() => setImportResult(undefined)}>我知道了</Button>} width={760}>
      {importResult && <>
        <Alert showIcon type={importResult.failedCount ? "warning" : "success"} message={`本次识别门店 ${importResult.storeCount} 家，成功导入 ${importResult.successCount} 家，导入失败 ${importResult.failedCount} 家`} description={`统计周期：${importResult.periodStart} 至 ${importResult.periodEnd}；共读取 ${importResult.rawRowCount} 行业务数据`} />
        <div className="product-category-sales-import-stats">
          <Statistic title="新增" value={importResult.insertedCount} suffix="家" /><Statistic title="覆盖更新" value={importResult.updatedCount} suffix="家" /><Statistic title="一致跳过" value={importResult.skippedCount} suffix="家" /><Statistic title="失败" value={importResult.failedCount} suffix="家" />
        </div>
        {importResult.failedCount > 0 && <div><div className="product-category-sales-failures-title"><strong>未导入门店及原因</strong><Button size="small" icon={<CopyOutlined />} onClick={() => void copyFailures()}>复制</Button></div><Input.TextArea readOnly autoSize={{ minRows: 4, maxRows: 10 }} value={failureText} /></div>}
      </>}
    </Modal>

    <Modal title="查看-门店月度菜品销售大类明细" open={detailOpen} onCancel={() => { setDetailOpen(false); setDetail(undefined); }} footer={<Button onClick={() => { setDetailOpen(false); setDetail(undefined); }}>关闭</Button>} width={1240}>
      {detailLoading ? <Skeleton active paragraph={{ rows: 8 }} /> : detailError ? <Alert showIcon type="error" message="门店月度菜品销售明细加载失败，请稍后重试" /> : detail ? <>
        <Descriptions bordered size="small" column={3} className="product-category-sales-descriptions" items={[
          { key: "recordNo", label: "记录编号", children: detail.summary.recordNo },
          { key: "storeAlias", label: "门店（别名）", children: detail.summary.storeAlias },
          { key: "storeName", label: "门店名称", children: detail.summary.storeName },
          { key: "brandName", label: "品牌", children: detail.summary.brandName },
          { key: "year", label: "所属年份", children: detail.summary.year },
          { key: "month", label: "所属月份", children: `${detail.summary.month}月` },
          { key: "city", label: "城市", children: detail.summary.city },
          { key: "createdBy", label: "创建人", children: detail.summary.createdByName },
          { key: "createdAt", label: "创建时间", children: detail.summary.createdAt },
        ]} />
        <h3 className="product-category-sales-detail-title">菜品大类销售统计表</h3>
        <Table<DetailRow> rowKey="id" size="small" columns={detailColumns} dataSource={detail.details} pagination={false} scroll={{ x: 1175 }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无菜品大类销售明细" /> }} />
      </> : null}
    </Modal>

    <Modal title="温馨提示" open={Boolean(deleteRow)} onCancel={() => !deleting && setDeleteRow(undefined)} okText={deleting ? "删除中..." : "我知道了，继续删除"} cancelText="我再想想" okButtonProps={{ danger: true }} cancelButtonProps={{ disabled: deleting }} confirmLoading={deleting} onOk={() => void confirmDelete()}>
      <p>删除操作不可逆，删除成功后当前门店该月份的菜品大类销售统计及全部明细将被永久删除，原始数据无法恢复，请谨慎操作。</p>
      {deleteRow && <Alert type="warning" showIcon message={`${deleteRow.storeName} / ${deleteRow.year}年${deleteRow.month}月`} description={`记录编号：${deleteRow.recordNo}`} />}
    </Modal>
  </>;
}

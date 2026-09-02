"use client";

import {
  AimOutlined, DeleteOutlined, DownloadOutlined, EyeOutlined, FileExcelOutlined, ReloadOutlined,
  SearchOutlined, UploadOutlined, WarningOutlined,
} from "@ant-design/icons";
import {
  Alert, Button, Card, DatePicker, Descriptions, Empty, Form, Input, InputNumber, message,
  Modal, Select, Skeleton, Space, Table, Tag, Tooltip, Upload,
} from "antd";
import type { ColumnsType, TableRowSelection } from "antd/es/table/interface";
import type { UploadFile } from "antd/es/upload/interface";
import dayjs, { type Dayjs } from "dayjs";
import { useCallback, useEffect, useRef, useState } from "react";
import { useBusinessDictionaries } from "@/hooks/use-business-dictionaries";

export type ActualRevenueRow = {
  id: string;
  recordNo: string;
  statMonth: string;
  brandName: string;
  storeName: string;
  regionName: string;
  monthlyRevenue: string;
  targetMonth: string | null;
  monthlyTarget: string | null;
  dailyTargetStatus: string;
  locked: boolean;
};

type Filters = { brand: string; storeKeyword: string; startMonth: string; endMonth: string };
type FilterForm = { brand?: string; storeKeyword?: string; startMonth?: Dayjs | null; endMonth?: Dayjs | null };
type DailyDetail = { id: string; businessDate: string; revenueAmount: string; discountAmount: string | null; operatingIncome: string | null; orderCount: number | null; dinerCount: number | null; tableCount: number | null };
type Detail = {
  overview: { id: string; recordNo: string; statMonth: string; brandName: string; storeName: string; regionName: string; storeManagerName: string; supervisorName: string; cooperationType: string; monthlyRevenue: string; targetMonth: string | null; monthlyTarget: string | null };
  dailyDetails: DailyDetail[];
};
type ImportFailure = { excelRow: number; storeName: string; businessDate: string; reason: string };
type ImportResult = { added: number; overwritten: number; skipped: number; failed: number; failures: ImportFailure[]; warnings: string[] };
const emptyFilters: Filters = { brand: "", storeKeyword: "", startMonth: "", endMonth: "" };
const maxFileSize = 200 * 1024 * 1024;
const templateRules = [
  "导入的Excel文件中，前五行为表头部分，第六行起为正式的数据记录。",
  "B3:B5为“门店”；C3:C5为“营业日”；F3:F5为“营业额(元)”；G3:G5为“优惠金额(元)”；H3:H5为“营业收入(元)”；",
  "I3:I5为“订单量”；J3:J5为“用餐人数”；K3:K5为“消费桌数”；L3:L5为“折前人均(元)”；M3:M5为“折后人均(元)”；",
  "N3:N5为“折前单均(元)”；O3:O5为“折后单均(元)”；P3:P5为“开台率”；Q3:Q5为“翻台率”；R3:R5为“上座率”；S3:S5为“平均用餐时长(分钟)”。",
  "门店字段兼容“门店名称”和“门店”；其他标题兼容中文/英文括号、全角/半角符号，以及历史标题“折前人家(元)”。",
];

function money(value: string | null | undefined) {
  return value === null || value === undefined ? "-" : `¥ ${Number(value).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

export function ActualRevenueList({ permissions, initialRows = [], initialTotal = 0 }: { permissions: string[]; initialRows?: ActualRevenueRow[]; initialTotal?: number }) {
  const all = permissions.includes("*");
  const can = (action: string) => all || permissions.includes(`actual-revenue:${action}`) || (["query", "view"].includes(action) && permissions.includes("operations:view"));
  const [form] = Form.useForm<FilterForm>();
  const [targetForm] = Form.useForm<{ targetAmount: number }>();
  const { options: dictionaries, loading: dictionaryLoading, error: dictionaryError, reload: reloadDictionaries } = useBusinessDictionaries(["BRAND"]);
  const [rows, setRows] = useState<ActualRevenueRow[]>(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);
  const [exporting, setExporting] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [ruleOpen, setRuleOpen] = useState(false);
  const [importFile, setImportFile] = useState<File>();
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult>();
  const [importError, setImportError] = useState<string>();
  const [detailId, setDetailId] = useState<string>();
  const [detail, setDetail] = useState<Detail>();
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const [targetRow, setTargetRow] = useState<ActualRevenueRow>();
  const [targetSaving, setTargetSaving] = useState(false);
  const [deleteRow, setDeleteRow] = useState<ActualRevenueRow>();
  const [deleting, setDeleting] = useState(false);
  const requestSequence = useRef(0);

  const load = useCallback(async (nextPage = page, nextSize = pageSize, nextFilters = filters, background = false) => {
    const sequence = ++requestSequence.current;
    if (!background) { setLoading(true); setLoadError(false); }
    try {
      const query = new URLSearchParams({ page: String(nextPage), pageSize: String(nextSize) });
      Object.entries(nextFilters).forEach(([key, value]) => value && query.set(key, value));
      if (background) query.set("_background", "1");
      const response = await fetch(`/api/actual-revenue?${query}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "实际营业额数据加载失败，请稍后重试");
      if (sequence !== requestSequence.current) return;
      setRows(data.rows);
      setTotal(data.total);
      setPage(data.page);
      setPageSize(data.pageSize);
    } catch (error) {
      if (!background && sequence === requestSequence.current) {
        setLoadError(true);
        message.error(error instanceof Error ? error.message : "实际营业额数据加载失败，请稍后重试");
      }
    } finally {
      if (!background && sequence === requestSequence.current) setLoading(false);
    }
  }, [filters, page, pageSize]);

  useEffect(() => {
    const refresh = () => document.visibilityState === "visible" && void load(page, pageSize, filters, true);
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [filters, load, page, pageSize]);

  const applyFilters = () => {
    const values = form.getFieldsValue();
    const next: Filters = { brand: values.brand || "", storeKeyword: values.storeKeyword?.trim() || "", startMonth: values.startMonth?.format("YYYY-MM") || "", endMonth: values.endMonth?.format("YYYY-MM") || "" };
    if (next.startMonth && next.endMonth && next.startMonth > next.endMonth) { message.warning("统计开始月份不能晚于统计截止月份"); return; }
    setFilters(next); setSelectedKeys([]); setPage(1); void load(1, pageSize, next);
  };
  const resetFilters = () => { form.resetFields(); setFilters(emptyFilters); setSelectedKeys([]); setPage(1); void load(1, pageSize, emptyFilters); };

  const exportRows = async () => {
    if (!selectedKeys.length) return;
    setExporting(true);
    try {
      const response = await fetch("/api/actual-revenue/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recordIds: selectedKeys }) });
      if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.message || "营业额数据导出失败，请稍后重试"); }
      downloadBlob(await response.blob(), responseFileName(response, `实际营业额_${dayjs().format("YYYYMMDD_HHmmss")}.xlsx`));
      message.success(`导出成功，共导出 ${selectedKeys.length} 条月度记录`);
    } catch (error) { message.error(error instanceof Error ? error.message : "营业额数据导出失败，请稍后重试"); }
    finally { setExporting(false); }
  };

  const selectImportFile = (file: File) => {
    if (!file.name.toLowerCase().endsWith(".xlsx")) { message.error("仅支持.xlsx格式文件"); return Upload.LIST_IGNORE; }
    if (file.size > maxFileSize) { message.error("导入文件不能超过200MB"); return Upload.LIST_IGNORE; }
    setImportFile(file);
    setImportResult(undefined);
    setImportError(undefined);
    return false;
  };

  const importNow = async () => {
    const file = importFile;
    if (!file) { setImportError("请先选择需要导入的.xlsx文件"); return; }
    setImporting(true); setImportResult(undefined); setImportError(undefined);
    try {
      const body = new FormData(); body.append("file", file);
      const response = await fetch("/api/actual-revenue/import", { method: "POST", body });
      const responseText = await response.text();
      const data = responseText ? JSON.parse(responseText) : {};
      if (!response.ok) throw new Error(data.message || "营业额数据导入失败，请稍后重试");
      setImportResult(data);
      message.success("月营业额导入完成");
      setSelectedKeys([]);
      setPage(1);
      await load(1, pageSize, filters);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "营业额数据导入失败，请稍后重试";
      setImportError(errorMessage);
      message.error("导入失败，请查看弹窗内的错误说明");
    }
    finally { setImporting(false); }
  };

  const downloadFailures = () => {
    if (!importResult?.failures.length) return;
    const quote = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const csv = ["Excel行号,门店,营业日,失败原因", ...importResult.failures.map(item => [item.excelRow, item.storeName, item.businessDate, item.reason].map(quote).join(","))].join("\r\n");
    downloadBlob(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }), `实际营业额导入失败明细_${dayjs().format("YYYYMMDD_HHmmss")}.csv`);
  };

  const openDetail = async (row: ActualRevenueRow) => {
    setDetailId(row.id); setDetail(undefined); setDetailError(false); setDetailLoading(true);
    try {
      const response = await fetch(`/api/actual-revenue/${row.id}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "实际营业额详情加载失败，请稍后重试");
      setDetail(data);
    } catch (error) { setDetailError(true); message.error(error instanceof Error ? error.message : "实际营业额详情加载失败，请稍后重试"); }
    finally { setDetailLoading(false); }
  };

  const saveTarget = async () => {
    if (!targetRow) return;
    try {
      const values = await targetForm.validateFields();
      setTargetSaving(true);
      const targetMonth = dayjs(`${targetRow.statMonth}-01`).add(1, "month").format("YYYY-MM");
      const response = await fetch(`/api/actual-revenue/${targetRow.id}/monthly-target`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetMonth, targetAmount: values.targetAmount }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "月目标保存失败，请稍后重试");
      message.success("月目标设置成功");
      setTargetRow(undefined); targetForm.resetFields(); await load();
    } catch (error) { if (error instanceof Error) message.error(error.message); }
    finally { setTargetSaving(false); }
  };

  const performDelete = async () => {
    if (!deleteRow) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/actual-revenue/${deleteRow.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "实际营业额记录删除失败，请稍后重试");
      message.success(data.message || "实际营业额记录删除成功");
      setSelectedKeys(keys => keys.filter(key => key !== deleteRow.id)); setDeleteRow(undefined);
      const nextPage = rows.length === 1 && page > 1 ? page - 1 : page; await load(nextPage, pageSize, filters);
    } catch (error) { message.error(error instanceof Error ? error.message : "实际营业额记录删除失败，请稍后重试"); }
    finally { setDeleting(false); }
  };

  const columns: ColumnsType<ActualRevenueRow> = [
    { title: "记录编号", dataIndex: "recordNo", width: 140, fixed: "left" },
    { title: "统计月份", dataIndex: "statMonth", width: 110 },
    { title: "品牌", dataIndex: "brandName", width: 120, ellipsis: true },
    { title: "门店名称", dataIndex: "storeName", width: 200, ellipsis: true },
    { title: "所属区域", dataIndex: "regionName", width: 130, ellipsis: true },
    { title: "（月）营业额", dataIndex: "monthlyRevenue", width: 150, align: "right", render: money },
    { title: "月目标", dataIndex: "monthlyTarget", width: 150, align: "right", render: (value: string | null, row) => value ? <Tooltip title={`目标月份：${row.targetMonth}`}>{money(value)}</Tooltip> : "-" },
    { title: "日目标", dataIndex: "dailyTargetStatus", width: 100, align: "center", render: (value: string) => value === "GENERATED" ? <Tag color="success">已生成</Tag> : "-" },
    { title: "操作", key: "actions", width: 320, fixed: "right", render: (_, row) => <Space size={2} className="table-actions">
      {can("view") && <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => void openDetail(row)}>查看</Button>}
      {can("set-monthly-target") && <Tooltip title={row.monthlyTarget ? "下一月份月目标已设置" : undefined}><span><Button type="link" size="small" disabled={!!row.monthlyTarget} icon={<AimOutlined />} onClick={() => { targetForm.resetFields(); setTargetRow(row); }}>设置月目标</Button></span></Tooltip>}
      {can("delete") && <Tooltip title={row.locked ? "当前记录已生成目标，不支持删除" : undefined}><span><Button type="link" danger size="small" disabled={row.locked} icon={<DeleteOutlined />} onClick={() => setDeleteRow(row)}>删除</Button></span></Tooltip>}
    </Space> },
  ];
  const rowSelection: TableRowSelection<ActualRevenueRow> = { selectedRowKeys: selectedKeys, preserveSelectedRowKeys: true, onChange: setSelectedKeys, columnWidth: 48, selections: true };
  const importFileList: UploadFile[] = importFile ? [{
    uid: `${importFile.name}-${importFile.lastModified}`,
    name: importFile.name,
    size: importFile.size,
    type: importFile.type,
    originFileObj: importFile as UploadFile["originFileObj"],
    status: "done",
  }] : [];

  return <>
    {dictionaryError && <Alert className="actual-revenue-alert" type="warning" showIcon message="品牌数据字典加载失败" description={dictionaryError} action={<Button size="small" icon={<ReloadOutlined />} onClick={() => void reloadDictionaries()}>重试</Button>} />}
    <Card className="actual-revenue-filter-card">
      <Form form={form} layout="vertical">
        <div className="actual-revenue-filter-grid">
          <Form.Item label="品牌" name="brand"><Select allowClear loading={dictionaryLoading} placeholder="全部" options={dictionaries.BRAND} /></Form.Item>
          <Form.Item label="门店名称" name="storeKeyword"><Input allowClear maxLength={100} placeholder="请输入门店名称" onPressEnter={applyFilters} /></Form.Item>
          <Form.Item label="开始月份" name="startMonth"><DatePicker picker="month" format="YYYY-MM" placeholder="开始月份" /></Form.Item>
          <Form.Item label="截止月份" name="endMonth"><DatePicker picker="month" format="YYYY-MM" placeholder="截止月份" /></Form.Item>
          <div className="actual-revenue-filter-actions"><Space><Button onClick={resetFilters}>重置</Button><Button type="primary" icon={<SearchOutlined />} onClick={applyFilters}>筛选</Button></Space></div>
        </div>
      </Form>
    </Card>
    <Card className="actual-revenue-list-card">
      <div className="actual-revenue-toolbar">
        <Space>{can("import") && <Button type="primary" icon={<UploadOutlined />} onClick={() => { setImportFile(undefined); setImportResult(undefined); setImportError(undefined); setImportOpen(true); }}>批量导入</Button>}<span>已选择 <strong>{selectedKeys.length}</strong> 条</span></Space>
        <Space><Button icon={<ReloadOutlined />} disabled={loading || exporting} onClick={() => void load()}>刷新</Button>{can("export") && <Button icon={<DownloadOutlined />} disabled={!selectedKeys.length} loading={exporting} onClick={() => void exportRows()}>{exporting ? "导出中..." : "批量导出"}</Button>}</Space>
      </div>
      {loadError ? <Alert type="error" showIcon message="实际营业额数据加载失败，请稍后重试" action={<Button size="small" onClick={() => void load()}>重新加载</Button>} /> : <Table<ActualRevenueRow>
        rowKey="id" dataSource={rows} columns={columns} rowSelection={rowSelection} loading={loading} scroll={{ x: 1500 }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={Object.values(filters).some(Boolean) ? <><div>没有找到符合当前条件的实际营业额记录</div><small>请调整筛选条件后重试</small><div><Button type="link" onClick={resetFilters}>重置筛选</Button></div></> : "暂无实际营业额记录"} /> }}
        pagination={{ current: page, pageSize, total, showSizeChanger: true, pageSizeOptions: [20, 50, 100], showTotal: value => `共 ${value} 条`, onChange: (nextPage, nextSize) => { const targetPage = nextSize !== pageSize ? 1 : nextPage; setSelectedKeys([]); void load(targetPage, nextSize, filters); } }}
      />}
    </Card>

    <Modal width={720} title="月营业额批量导入" open={importOpen} closable={!importing} maskClosable={!importing} onCancel={() => !importing && setImportOpen(false)} footer={<Space><Button disabled={importing} onClick={() => setImportOpen(false)}>取消</Button><Button type="primary" disabled={!importFile || !!importResult} loading={importing} onClick={() => void importNow()}>{importing ? "数据导入中..." : "立即导入"}</Button></Space>} destroyOnHidden>
      <div className="actual-revenue-import-copy"><span>导入说明</span><Button type="link" onClick={() => setRuleOpen(true)}>查看导入模版规则</Button></div>
      <Upload accept=".xlsx" maxCount={1} fileList={importFileList} beforeUpload={selectImportFile} onRemove={() => { setImportFile(undefined); setImportResult(undefined); setImportError(undefined); }} disabled={importing}>
        <Button icon={<FileExcelOutlined />}>选择Excel文件</Button>
      </Upload>
      <p className="actual-revenue-upload-help">仅支持.xlsx格式，单文件不超过200MB。文件在服务端进行校验与解析。</p>
      {importFile && !importing && !importResult && !importError && <Alert showIcon type="info" message="文件已选择" description="请点击弹窗右下角“立即导入”开始处理。" />}
      {importing && <Alert showIcon type="info" message="文件校验中并正在导入数据，请勿重复提交或关闭页面" />}
      {importError && <Alert showIcon type="error" message="导入失败" description={importError} />}
      {importResult && <div className="actual-revenue-import-result">
        <Alert type={importResult.failed ? "warning" : "success"} showIcon message="导入完成" description={<Space wrap size="large"><span>新增：<b>{importResult.added}</b>条</span><span>覆盖：<b>{importResult.overwritten}</b>条</span><span>跳过：<b>{importResult.skipped}</b>条</span><span>失败：<b>{importResult.failed}</b>条</span></Space>} />
        {!!importResult.warnings.length && <Alert type="info" showIcon message="导入提示" description={importResult.warnings.slice(0, 5).join("；")} />}
        {!!importResult.failures.length && <Button icon={<DownloadOutlined />} onClick={downloadFailures}>下载失败明细</Button>}
      </div>}
    </Modal>

    <Modal width={760} title="查看导入模版规则" open={ruleOpen} onCancel={() => setRuleOpen(false)} footer={<Button type="primary" onClick={() => setRuleOpen(false)}>我知道了</Button>}>
      <div className="actual-revenue-rules">{templateRules.map((rule, index) => <p key={index}>{rule}</p>)}</div>
    </Modal>

    <Modal className="actual-revenue-detail-modal" width={1120} title="查看详情" open={!!detailId} onCancel={() => setDetailId(undefined)} footer={<Button onClick={() => setDetailId(undefined)}>关闭</Button>}>
      {detailLoading ? <Skeleton active paragraph={{ rows: 9 }} /> : detailError ? <Alert type="error" showIcon message="实际营业额详情加载失败，请稍后重试" action={<Button size="small" onClick={() => { const row = rows.find(item => item.id === detailId); if (row) void openDetail(row); }}>重新加载</Button>} /> : detail && <div className="actual-revenue-detail">
        <h3>数据概览</h3>
        <Descriptions bordered size="small" column={4}>
          <Descriptions.Item label="记录编号">{detail.overview.recordNo}</Descriptions.Item><Descriptions.Item label="统计月份">{detail.overview.statMonth}</Descriptions.Item><Descriptions.Item label="品牌">{detail.overview.brandName}</Descriptions.Item><Descriptions.Item label="门店名称">{detail.overview.storeName}</Descriptions.Item>
          <Descriptions.Item label="所属区域">{detail.overview.regionName}</Descriptions.Item><Descriptions.Item label="店长">{detail.overview.storeManagerName}</Descriptions.Item><Descriptions.Item label="负责督导">{detail.overview.supervisorName}</Descriptions.Item><Descriptions.Item label="合作类型">{detail.overview.cooperationType}</Descriptions.Item>
        </Descriptions>
        <h3>月度明细</h3>
        <Table<DailyDetail> rowKey="id" size="small" pagination={false} dataSource={detail.dailyDetails} scroll={{ x: 860, y: 420 }} columns={[
          { title: "营业日", dataIndex: "businessDate", width: 120, fixed: "left" }, { title: "营业额（元）", dataIndex: "revenueAmount", width: 140, align: "right", render: money }, { title: "优惠金额（元）", dataIndex: "discountAmount", width: 150, align: "right", render: money }, { title: "营业收入（元）", dataIndex: "operatingIncome", width: 150, align: "right", render: money }, { title: "订单量", dataIndex: "orderCount", width: 100, align: "right", render: value => value ?? "-" }, { title: "用餐人数", dataIndex: "dinerCount", width: 100, align: "right", render: value => value ?? "-" }, { title: "消费桌数", dataIndex: "tableCount", width: 100, align: "right", render: value => value ?? "-" },
        ]} locale={{ emptyText: "暂无营业日明细" }} />
      </div>}
    </Modal>

    <Modal title="设置月目标" open={!!targetRow} confirmLoading={targetSaving} okText={targetSaving ? "保存中..." : "保存"} cancelText="取消" onCancel={() => !targetSaving && setTargetRow(undefined)} onOk={() => void saveTarget()} destroyOnHidden>
      {targetRow && <Form form={targetForm} layout="vertical" style={{ paddingTop: 8 }}>
        <Form.Item label="月份"><Input readOnly value={dayjs(`${targetRow.statMonth}-01`).add(1, "month").format("YYYY-MM")} /></Form.Item>
        <Form.Item label="门店名称"><Input readOnly value={targetRow.storeName} /></Form.Item>
        <Form.Item label="月目标（元）" name="targetAmount" rules={[{ required: true, message: "请输入月目标" }, { validator: (_, value) => Number.isInteger(value) && value > 0 ? Promise.resolve() : Promise.reject(new Error("月目标仅支持输入大于0的整数")) }]}><InputNumber min={1} precision={0} controls={false} placeholder="请输入大于0的整数" style={{ width: "100%" }} /></Form.Item>
      </Form>}
    </Modal>

    <Modal open={!!deleteRow} title={<Space><WarningOutlined style={{ color: "#ff4d4f" }} />温馨提示</Space>} closable={!deleting} maskClosable={!deleting} onCancel={() => !deleting && setDeleteRow(undefined)} footer={<Space><Button disabled={deleting} onClick={() => setDeleteRow(undefined)}>我再想想</Button><Button danger type="primary" loading={deleting} onClick={() => void performDelete()}>{deleting ? "删除中..." : "我知道了，继续删除"}</Button></Space>}>
      <Alert type="error" showIcon message="删除操作不可逆" description={deleteRow ? `${deleteRow.storeName} · ${deleteRow.statMonth} · ${deleteRow.recordNo}` : undefined} />
      <div className="actual-revenue-delete-copy">删除成功后，当前门店该统计月份的实际营业额数据及每日营业明细将无法恢复，请谨慎操作。用户本地原始Excel文件不会受到影响。</div>
    </Modal>
  </>;
}

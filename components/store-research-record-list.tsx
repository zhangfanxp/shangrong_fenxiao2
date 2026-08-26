"use client";

import { DeleteOutlined, DownloadOutlined, EyeOutlined, ReloadOutlined, SearchOutlined, WarningOutlined } from "@ant-design/icons";
import { Alert, Button, Card, DatePicker, Descriptions, Empty, Form, Input, message, Modal, Select, Skeleton, Space, Table, Tag } from "antd";
import type { TableColumnsType, TableProps } from "antd";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBusinessDictionaries } from "@/hooks/use-business-dictionaries";

type ResearchRow = {
  id: string; recordNo: string; brandNameSnapshot: string; storeNameSnapshot: string; templateType: string;
  researchMonth: string; storeManagerNameSnapshot: string; supervisorRealName: string; submittedAt: string;
};
type Filters = { brand: string; storeId: string; researchStartMonth: string; researchEndMonth: string; creatorKeyword: string };
type FormValues = { brand?: string; storeId?: string; researchStartMonth?: Dayjs | null; researchEndMonth?: Dayjs | null; creatorKeyword?: string };
type StoreOption = { storeId: string; storeName: string; brandId: string; brandName: string };
type DetailItem = { id: string; section: string; subSection: string; label: string; component: string; required: boolean; value: string; sortOrder: number };
type ResearchDetail = {
  id: string; recordNo: string; researchMonth: string; brandName: string; storeName: string; templateType: string;
  storeManagerName: string; creatorRealName: string; creatorUsername: string; submittedAt: string;
  configVersion: number; configSnapshot?: unknown; items: DetailItem[];
};

const emptyFilters: Filters = { brand: "", storeId: "", researchStartMonth: "", researchEndMonth: "", creatorKeyword: "" };
const monthText = (value: string) => value ? `${value.slice(0, 4)}年${value.slice(5)}月` : "-";

function groupedItems(items: DetailItem[]) {
  const sections = new Map<string, Map<string, DetailItem[]>>();
  for (const item of items) {
    if (!sections.has(item.section)) sections.set(item.section, new Map());
    const subsections = sections.get(item.section)!;
    if (!subsections.has(item.subSection)) subsections.set(item.subSection, []);
    subsections.get(item.subSection)!.push(item);
  }
  return sections;
}

export function StoreResearchRecordList({ permissions, initialRows = [], initialTotal = 0 }: { permissions: string[]; initialRows?: ResearchRow[]; initialTotal?: number }) {
  const hasAll = permissions.includes("*");
  const canView = hasAll || permissions.includes("store-research-records:view");
  const canExport = hasAll || permissions.includes("store-research-records:export");
  const canDelete = hasAll || permissions.includes("store-research-records:delete");
  const [form] = Form.useForm<FormValues>();
  const { options: dictionaries, loading: dictionariesLoading, error: dictionariesError, reload: reloadDictionaries } = useBusinessDictionaries(["BRAND"]);
  const [rows, setRows] = useState<ResearchRow[]>(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [storeOptions, setStoreOptions] = useState<StoreOption[]>([]);
  const [storeLoading, setStoreLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [detailId, setDetailId] = useState<string>();
  const [detail, setDetail] = useState<ResearchDetail>();
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const [deleteRow, setDeleteRow] = useState<ResearchRow>();
  const [deleting, setDeleting] = useState(false);
  const storeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRequestSequence = useRef(0);

  const load = useCallback(async (nextPage = page, nextPageSize = pageSize, nextFilters = filters, background = false) => {
    const requestSequence = ++listRequestSequence.current;
    if (!background) { setLoading(true); setLoadError(false); }
    try {
      const query = new URLSearchParams({ page: String(nextPage), pageSize: String(nextPageSize) });
      Object.entries(nextFilters).forEach(([key, value]) => { if (value) query.set(key, value); });
      if (background) query.set("_background", "1");
      const response = await fetch(`/api/store-research-records?${query}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "巡店调研表数据加载失败，请稍后重试");
      if (requestSequence !== listRequestSequence.current) return;
      setRows(data.rows); setTotal(data.total);
    } catch (reason) {
      if (!background && requestSequence === listRequestSequence.current) {
        setLoadError(true);
        message.error(reason instanceof Error ? reason.message : "巡店调研表数据加载失败，请稍后重试");
      }
    } finally { if (!background && requestSequence === listRequestSequence.current) setLoading(false); }
  }, [filters, page, pageSize]);

  useEffect(() => {
    const refreshWhenVisible = () => { if (document.visibilityState === "visible") void load(page, pageSize, filters, true); };
    const timer = window.setInterval(refreshWhenVisible, 30_000);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refreshWhenVisible); document.removeEventListener("visibilitychange", refreshWhenVisible); };
  }, [filters, load, page, pageSize]);
  useEffect(() => () => { if (storeTimer.current) clearTimeout(storeTimer.current); }, []);

  const searchStores = useCallback(async (keyword = "") => {
    setStoreLoading(true);
    try {
      const query = new URLSearchParams();
      const brand = form.getFieldValue("brand") || "";
      if (keyword.trim()) query.set("keyword", keyword.trim());
      if (brand) query.set("brand", brand);
      const response = await fetch(`/api/store-research-records/stores?${query}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "门店数据加载失败，请稍后重试");
      setStoreOptions(data);
    } catch (reason) { message.error(reason instanceof Error ? reason.message : "门店数据加载失败，请稍后重试"); }
    finally { setStoreLoading(false); }
  }, [form]);

  const delayedStoreSearch = (keyword: string) => {
    if (storeTimer.current) clearTimeout(storeTimer.current);
    storeTimer.current = setTimeout(() => void searchStores(keyword), 250);
  };
  const readFilters = (): Filters | null => {
    const values = form.getFieldsValue();
    const next = {
      brand: values.brand || "", storeId: values.storeId || "",
      researchStartMonth: values.researchStartMonth?.format("YYYY-MM") || "",
      researchEndMonth: values.researchEndMonth?.format("YYYY-MM") || "",
      creatorKeyword: values.creatorKeyword?.trim() || "",
    };
    if (next.researchStartMonth && next.researchEndMonth && next.researchStartMonth > next.researchEndMonth) {
      message.warning("调研开始月份不能晚于调研截止月份"); return null;
    }
    return next;
  };
  const applyFilters = () => {
    const next = readFilters(); if (!next) return;
    setFilters(next); setPage(1); setSelectedRowKeys([]); void load(1, pageSize, next);
  };
  const resetFilters = () => {
    form.resetFields(); setStoreOptions([]); setFilters(emptyFilters); setPage(1); setSelectedRowKeys([]); void load(1, pageSize, emptyFilters);
  };

  const exportRows = async () => {
    setExporting(true);
    try {
      const response = await fetch("/api/store-research-records/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recordIds: selectedRowKeys.length ? selectedRowKeys : undefined, filters }) });
      if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.message || "调研记录导出失败，请稍后重试"); }
      const blob = await response.blob();
      const encodedName = response.headers.get("Content-Disposition")?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
      const href = URL.createObjectURL(blob); const link = document.createElement("a");
      link.href = href; link.download = encodedName ? decodeURIComponent(encodedName) : `巡店调研表_${dayjs().format("YYYYMMDD_HHmmss")}.xlsx`;
      document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(href);
      message.success(`导出成功，共导出 ${selectedRowKeys.length || total} 条调研记录`);
    } catch (reason) { message.error(reason instanceof Error ? reason.message : "调研记录导出失败，请稍后重试"); }
    finally { setExporting(false); }
  };

  const openDetail = async (id: string) => {
    setDetailId(id); setDetail(undefined); setDetailError(false); setDetailLoading(true);
    try {
      const response = await fetch(`/api/store-research-records/${id}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "调研详情加载失败，请稍后重试");
      setDetail(data);
    } catch (reason) { setDetailError(true); message.error(reason instanceof Error ? reason.message : "调研详情加载失败，请稍后重试"); }
    finally { setDetailLoading(false); }
  };

  const performDelete = async () => {
    if (!deleteRow) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/store-research-records/${deleteRow.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "调研记录删除失败，请稍后重试");
      message.success(data.message || "巡店调研记录删除成功");
      setDeleteRow(undefined); setSelectedRowKeys(keys => keys.filter(key => key !== deleteRow.id));
      const nextPage = rows.length === 1 && page > 1 ? page - 1 : page;
      setPage(nextPage); void load(nextPage, pageSize, filters);
    } catch (reason) { message.error(reason instanceof Error ? reason.message : "调研记录删除失败，请稍后重试"); }
    finally { setDeleting(false); }
  };

  const columns: TableColumnsType<ResearchRow> = [
    { title: "记录编号", dataIndex: "recordNo", width: 140, fixed: "left" },
    { title: "品牌｜调研门店", key: "store", width: 280, ellipsis: true, render: (_, row) => `${row.brandNameSnapshot}｜${row.storeNameSnapshot}` },
    { title: "调研表类型", dataIndex: "templateType", width: 150, ellipsis: true },
    { title: "调研月份", dataIndex: "researchMonth", width: 120, render: monthText },
    { title: "店长", dataIndex: "storeManagerNameSnapshot", width: 110, ellipsis: true },
    { title: "创建人", dataIndex: "supervisorRealName", width: 110, ellipsis: true },
    { title: "创建时间", dataIndex: "submittedAt", width: 180 },
    { title: "操作", key: "actions", width: canDelete ? 120 : 72, fixed: "right", render: (_, row) => <Space size={4} className="table-actions">{canView && <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => void openDetail(row.id)}>查看</Button>}{canDelete && <Button type="link" danger size="small" icon={<DeleteOutlined />} onClick={() => setDeleteRow(row)}>删除</Button>}</Space> },
  ];
  const rowSelection: TableProps<ResearchRow>["rowSelection"] = { selectedRowKeys, preserveSelectedRowKeys: true, onChange: setSelectedRowKeys, columnWidth: 48, selections: true };
  const detailGroups = useMemo(() => groupedItems(detail?.items || []), [detail]);

  return <>
    {dictionariesError && <Alert className="store-research-alert" type="warning" showIcon message="品牌数据加载失败，请稍后重试" action={<Button size="small" icon={<ReloadOutlined />} onClick={() => void reloadDictionaries()}>重试</Button>} />}
    <Card className="store-research-filter-card">
      <Form form={form} layout="vertical">
        <div className="store-research-filter-grid">
          <Form.Item label="品牌" name="brand"><Select allowClear loading={dictionariesLoading} placeholder="全部" options={dictionaries.BRAND} onChange={() => { form.setFieldValue("storeId", undefined); setStoreOptions([]); }} /></Form.Item>
          <Form.Item label="门店" name="storeId"><Select showSearch allowClear filterOption={false} placeholder="请输入门店名称" loading={storeLoading} options={storeOptions.map(store => ({ value: store.storeId, label: `${store.storeName}（${store.brandName}）` }))} onFocus={() => { if (!storeOptions.length) void searchStores(); }} onSearch={delayedStoreSearch} notFoundContent={storeLoading ? "搜索中..." : "未找到匹配门店"} /></Form.Item>
          <Form.Item label="调研开始月" name="researchStartMonth"><DatePicker picker="month" format="YYYY年MM月" placeholder="开始月份" /></Form.Item>
          <Form.Item label="调研截止月" name="researchEndMonth"><DatePicker picker="month" format="YYYY年MM月" placeholder="截止月份" /></Form.Item>
          <Form.Item label="创建人" name="creatorKeyword"><Input allowClear maxLength={50} placeholder="请输入创建人" onPressEnter={applyFilters} /></Form.Item>
          <div className="store-research-filter-actions"><Space><Button onClick={resetFilters}>重置</Button><Button type="primary" icon={<SearchOutlined />} onClick={applyFilters}>筛选</Button></Space></div>
        </div>
      </Form>
    </Card>
    <Card className="store-research-list-card">
      <div className="store-research-toolbar"><span>已选择 <strong>{selectedRowKeys.length}</strong> 条</span><Space><Button icon={<ReloadOutlined />} disabled={exporting} onClick={() => void load()}>刷新</Button>{canExport && <Button icon={<DownloadOutlined />} loading={exporting} onClick={() => void exportRows()}>{exporting ? "导出中..." : "批量导出"}</Button>}</Space></div>
      {loadError ? <Alert type="error" showIcon message="巡店调研表数据加载失败，请稍后重试" action={<Button size="small" icon={<ReloadOutlined />} onClick={() => void load()}>重新加载</Button>} /> : <Table<ResearchRow>
        rowKey="id" dataSource={rows} loading={loading} columns={columns} rowSelection={rowSelection} scroll={{ x: 1220 }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={Object.values(filters).some(Boolean) ? <><div>没有找到符合当前条件的巡店调研记录</div><small>请调整筛选条件后重试</small><div><Button type="link" onClick={resetFilters}>重置筛选</Button></div></> : "暂无巡店调研记录"} /> }}
        pagination={{ current: page, pageSize, total, showSizeChanger: true, pageSizeOptions: [20, 50, 100], showTotal: value => `共 ${value} 条`, onChange: (nextPage, nextSize) => { const targetPage = nextSize !== pageSize ? 1 : nextPage; setPage(targetPage); setPageSize(nextSize); void load(targetPage, nextSize, filters); } }}
      />}
    </Card>

    <Modal className="store-research-detail-modal" width={1100} open={!!detailId} title="查看-门店调研表" onCancel={() => setDetailId(undefined)} footer={<Button onClick={() => setDetailId(undefined)}>关闭</Button>}>
      {detailLoading ? <Skeleton active paragraph={{ rows: 12 }} /> : detailError ? <Alert type="error" showIcon message="调研详情加载失败，请稍后重试" action={<Button size="small" onClick={() => detailId && void openDetail(detailId)}>重新加载</Button>} /> : detail && <div className="store-research-detail">
        <div className="store-research-detail-summary"><div><span>调研月份</span><strong>{monthText(detail.researchMonth)}</strong></div><Tag color="blue">配置版本 V{detail.configVersion}</Tag></div>
        <h3>基本信息</h3>
        <Descriptions bordered size="small" column={4}>
          <Descriptions.Item label="记录编号">{detail.recordNo}</Descriptions.Item><Descriptions.Item label="调研月份">{monthText(detail.researchMonth)}</Descriptions.Item><Descriptions.Item label="品牌">{detail.brandName}</Descriptions.Item><Descriptions.Item label="调研门店">{detail.storeName}</Descriptions.Item>
          <Descriptions.Item label="调研表类型">{detail.templateType}</Descriptions.Item><Descriptions.Item label="店长">{detail.storeManagerName}</Descriptions.Item><Descriptions.Item label="创建人">{detail.creatorRealName}</Descriptions.Item><Descriptions.Item label="创建时间">{detail.submittedAt}</Descriptions.Item>
        </Descriptions>
        <h3>调研内容</h3>
        {!detail.configSnapshot && <Alert type="warning" showIcon message="历史调研配置快照缺失，以下内容来自已保存的提交结果" />}
        {!detail.items.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="该记录没有可展示的调研明细" /> : Array.from(detailGroups.entries()).map(([section, subsections], sectionIndex) => <section className="store-research-detail-section" key={`${section}-${sectionIndex}`}><h4>{section}</h4>{Array.from(subsections.entries()).map(([subsection, items], subsectionIndex) => <div className="store-research-detail-subsection" key={`${subsection}-${subsectionIndex}`}><h5>{subsection}</h5>{items.map((item, index) => <div className="store-research-detail-item" key={`${item.id}-${index}`}><div className="store-research-detail-index">{index + 1}</div><div className="store-research-detail-copy"><div><strong>{item.label}</strong>{item.required && <Tag color="red">必填</Tag>}</div><p>{item.value || <span className="store-research-empty-value">未填写</span>}</p></div></div>)}</div>)}</section>)}
      </div>}
    </Modal>

    <Modal open={!!deleteRow} title={<Space><WarningOutlined style={{ color: "#ff4d4f" }} />温馨提示</Space>} onCancel={() => !deleting && setDeleteRow(undefined)} closable={!deleting} maskClosable={!deleting} footer={<Space><Button disabled={deleting} onClick={() => setDeleteRow(undefined)}>我再想想</Button><Button danger type="primary" loading={deleting} onClick={() => void performDelete()}>{deleting ? "删除中..." : "我知道了，继续删除"}</Button></Space>}>
      <Alert type="error" showIcon message="删除操作不可逆" description={deleteRow ? `${deleteRow.storeNameSnapshot} · ${monthText(deleteRow.researchMonth)} · ${deleteRow.templateType}` : undefined} />
      <div className="store-research-delete-copy"><p>一旦删除成功，当前门店调研表的原始数据将无法恢复。</p><p>删除后，该门店对应的调研月份将恢复为“未调研”状态，可在运营 H5 移动端重新进行该月份的调研填写和提交。</p><p>请谨慎操作。</p></div>
    </Modal>
  </>;
}

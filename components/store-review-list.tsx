"use client";

import { DeleteOutlined, DownloadOutlined, EyeOutlined, ReloadOutlined, SearchOutlined, WarningOutlined } from "@ant-design/icons";
import { Alert, Button, Card, DatePicker, Descriptions, Empty, Form, message, Modal, Select, Skeleton, Space, Table, Tag, Tooltip } from "antd";
import type { ColumnsType, TableRowSelection } from "antd/es/table/interface";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBusinessDictionaries } from "@/hooks/use-business-dictionaries";

type ReviewRow = {
  id: string; recordNo: string; brandNameSnapshot: string; storeNameSnapshot: string; assessmentName: string;
  responsiblePersonNameSnapshot: string; assessmentDate: string; actualScore: number; maxScore: number;
  reviewerRealName: string; reviewMonth: string;
};
type Filters = { brand: string; storeId: string; assessmentType: string; startDate: string; endDate: string; reviewerUserId: string };
type FormValues = { brand?: string; storeId?: string; assessmentType?: string; startDate?: Dayjs | null; endDate?: Dayjs | null; reviewerUserId?: string };
type StoreOption = { storeId: string; storeName: string; brandId: string; brandName: string };
type Supervisor = { userId: string; username: string; realName: string };
type DetailItem = { id: string; sectionName: string; subsectionName: string; itemDescription: string; maxScore: number; result: string; actualScore: number; sortOrder: number };
type ReviewDetail = {
  id: string; recordNo: string; reviewMonth: string; brandName: string; storeName: string; assessmentName: string;
  responsiblePersonName: string; reviewerRealName: string; assessmentDate: string; actualScore: number; maxScore: number;
  assessmentVersion: number; configSnapshot?: unknown; items: DetailItem[];
};

const emptyFilters: Filters = { brand: "", storeId: "", assessmentType: "", startDate: "", endDate: "", reviewerUserId: "" };
const resultLabels: Record<string, { text: string; color: string }> = {
  PASS: { text: "合格", color: "success" }, PARTIAL: { text: "部分合格", color: "warning" }, FAIL: { text: "不合格", color: "error" },
};

function score(value: number) { return Number.isInteger(value) ? String(value) : value.toFixed(1); }

function groupedItems(items: DetailItem[]) {
  const sections = new Map<string, Map<string, DetailItem[]>>();
  for (const item of items) {
    if (!sections.has(item.sectionName)) sections.set(item.sectionName, new Map());
    const subsections = sections.get(item.sectionName)!;
    if (!subsections.has(item.subsectionName)) subsections.set(item.subsectionName, []);
    subsections.get(item.subsectionName)!.push(item);
  }
  return sections;
}

export function StoreReviewList({ permissions, initialRows = [], initialTotal = 0 }: { permissions: string[]; initialRows?: ReviewRow[]; initialTotal?: number }) {
  const hasAll = permissions.includes("*");
  const canView = hasAll || permissions.includes("store-reviews:view") || permissions.includes("inspection:view");
  const canExport = hasAll || permissions.includes("store-reviews:export");
  const canDelete = hasAll || permissions.includes("store-reviews:delete");
  const [form] = Form.useForm<FormValues>();
  const { options: dictionaries, loading: dictionariesLoading, error: dictionariesError, reload: reloadDictionaries } = useBusinessDictionaries(["BRAND", "ASSESSMENT_TYPE"]);
  const [rows, setRows] = useState<ReviewRow[]>(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [storeOptions, setStoreOptions] = useState<StoreOption[]>([]);
  const [storeLoading, setStoreLoading] = useState(false);
  const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
  const [supervisorError, setSupervisorError] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [detailId, setDetailId] = useState<string>();
  const [detail, setDetail] = useState<ReviewDetail>();
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const [deleteRow, setDeleteRow] = useState<ReviewRow>();
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
      const response = await fetch(`/api/store-reviews?${query}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "门店稽核评分数据加载失败，请稍后重试");
      if (requestSequence !== listRequestSequence.current) return;
      setRows(data.rows); setTotal(data.total);
    } catch (reason) {
      if (!background && requestSequence === listRequestSequence.current) {
        setLoadError(true);
        if (reason instanceof Error) message.error(reason.message);
      }
    } finally { if (!background && requestSequence === listRequestSequence.current) setLoading(false); }
  }, [filters, page, pageSize]);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void load(page, pageSize, filters, true);
    };
    const timer = window.setInterval(refreshWhenVisible, 30_000);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [filters, load, page, pageSize]);
  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/store-reviews/supervisors", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message);
        setSupervisors(data); setSupervisorError(false);
      } catch { setSupervisorError(true); }
    })();
  }, []);

  const searchStores = useCallback(async (keyword = "") => {
    setStoreLoading(true);
    try {
      const brand = form.getFieldValue("brand") || "";
      const query = new URLSearchParams();
      if (keyword.trim()) query.set("keyword", keyword.trim());
      if (brand) query.set("brand", brand);
      const response = await fetch(`/api/store-reviews/stores?${query}`, { cache: "no-store" });
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
      brand: values.brand || "", storeId: values.storeId || "", assessmentType: values.assessmentType || "",
      startDate: values.startDate?.format("YYYY-MM-DD") || "", endDate: values.endDate?.format("YYYY-MM-DD") || "",
      reviewerUserId: values.reviewerUserId || "",
    };
    if (next.startDate && next.endDate && next.startDate > next.endDate) { message.warning("考核开始日期不能晚于考核截止日期"); return null; }
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
      const response = await fetch("/api/store-reviews/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recordIds: selectedRowKeys.length ? selectedRowKeys : undefined, filters }) });
      if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.message || "门店稽核评分导出失败，请稍后重试"); }
      const blob = await response.blob();
      const encodedName = response.headers.get("Content-Disposition")?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
      const href = URL.createObjectURL(blob); const link = document.createElement("a");
      link.href = href; link.download = encodedName ? decodeURIComponent(encodedName) : `门店稽核评分_${dayjs().format("YYYYMMDD_HHmmss")}.xlsx`;
      document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(href);
      message.success(`导出成功，共导出 ${selectedRowKeys.length || total} 条评分记录`);
    } catch (reason) { message.error(reason instanceof Error ? reason.message : "门店稽核评分导出失败，请稍后重试"); }
    finally { setExporting(false); }
  };

  const openDetail = async (id: string) => {
    setDetailId(id); setDetail(undefined); setDetailError(false); setDetailLoading(true);
    try {
      const response = await fetch(`/api/store-reviews/${id}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "评分详情加载失败，请稍后重试");
      setDetail(data);
    } catch (reason) { setDetailError(true); message.error(reason instanceof Error ? reason.message : "评分详情加载失败，请稍后重试"); }
    finally { setDetailLoading(false); }
  };

  const performDelete = async () => {
    if (!deleteRow) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/store-reviews/${deleteRow.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "评分删除失败，请稍后重试");
      message.success(data.message || "门店稽核评分删除成功");
      setDeleteRow(undefined); setSelectedRowKeys(keys => keys.filter(key => key !== deleteRow.id));
      const nextPage = rows.length === 1 && page > 1 ? page - 1 : page; setPage(nextPage); void load(nextPage, pageSize, filters);
    } catch (reason) { message.error(reason instanceof Error ? reason.message : "评分删除失败，请稍后重试"); }
    finally { setDeleting(false); }
  };

  const columns: ColumnsType<ReviewRow> = [
    { title: "记录编号", dataIndex: "recordNo", width: 140, fixed: "left" },
    { title: "品牌", dataIndex: "brandNameSnapshot", width: 130, ellipsis: true },
    { title: "考核门店", dataIndex: "storeNameSnapshot", width: 210, ellipsis: true },
    { title: "考核月份", dataIndex: "reviewMonth", width: 120, render: (value: string) => value.replace("-", "年") + "月" },
    { title: "考核表类型", dataIndex: "assessmentName", width: 160 },
    { title: "负责人", dataIndex: "responsiblePersonNameSnapshot", width: 110 },
    { title: "考核日期", dataIndex: "assessmentDate", width: 120 },
    { title: "考核得分", dataIndex: "actualScore", width: 110, align: "right", render: (value: number, row) => <Tooltip title={`${score(value)} / ${score(row.maxScore)}`}><strong>{score(value)}</strong></Tooltip> },
    { title: "考核督导", dataIndex: "reviewerRealName", width: 110 },
    { title: "操作", key: "actions", width: canDelete ? 120 : 72, fixed: "right", render: (_, row) => <Space size={4} className="table-actions">{canView && <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => void openDetail(row.id)}>查看</Button>}{canDelete && <Button type="link" danger size="small" icon={<DeleteOutlined />} onClick={() => setDeleteRow(row)}>删除</Button>}</Space> },
  ];
  const rowSelection: TableRowSelection<ReviewRow> = { selectedRowKeys, preserveSelectedRowKeys: true, onChange: setSelectedRowKeys, columnWidth: 48, selections: true };
  const detailGroups = useMemo(() => groupedItems(detail?.items || []), [detail]);

  return <>
    {(dictionariesError || supervisorError) && <Alert className="store-review-alert" type="warning" showIcon message="部分筛选项加载失败" description={[dictionariesError, supervisorError ? "考核督导数据加载失败，请稍后重试" : ""].filter(Boolean).join("；")} action={dictionariesError ? <Button size="small" icon={<ReloadOutlined />} onClick={() => void reloadDictionaries()}>重试</Button> : undefined} />}
    <Card className="store-review-filter-card">
      <Form form={form} layout="vertical" initialValues={{ brand: undefined, assessmentType: undefined, reviewerUserId: undefined }}>
        <div className="store-review-filter-grid">
          <Form.Item label="品牌" name="brand"><Select allowClear loading={dictionariesLoading} placeholder="全部" options={dictionaries.BRAND} onChange={() => { form.setFieldValue("storeId", undefined); setStoreOptions([]); }} /></Form.Item>
          <Form.Item label="考核门店" name="storeId"><Select showSearch allowClear filterOption={false} placeholder="请输入门店名称" loading={storeLoading} options={storeOptions.map(store => ({ value: store.storeId, label: `${store.storeName}（${store.brandName}）` }))} onFocus={() => { if (!storeOptions.length) void searchStores(); }} onSearch={delayedStoreSearch} notFoundContent={storeLoading ? "加载中..." : "未找到匹配门店"} /></Form.Item>
          <Form.Item label="考核表类型" name="assessmentType"><Select allowClear loading={dictionariesLoading} placeholder="全部" options={dictionaries.ASSESSMENT_TYPE} /></Form.Item>
          <Form.Item label="开始日期" name="startDate"><DatePicker format="YYYY-MM-DD" placeholder="开始日期" /></Form.Item>
          <Form.Item label="截止日期" name="endDate"><DatePicker format="YYYY-MM-DD" placeholder="截止日期" /></Form.Item>
          <Form.Item label="考核督导" name="reviewerUserId"><Select allowClear showSearch optionFilterProp="label" placeholder="全部" options={supervisors.map(user => ({ value: user.userId, label: `${user.realName}（${user.username}）` }))} /></Form.Item>
          <div className="store-review-filter-actions"><Space><Button onClick={resetFilters}>重置</Button><Button type="primary" icon={<SearchOutlined />} onClick={applyFilters}>筛选</Button></Space></div>
        </div>
      </Form>
    </Card>
    <Card className="store-review-list-card">
      <div className="store-review-toolbar"><span>已选择 <strong>{selectedRowKeys.length}</strong> 条</span><Space><Button icon={<ReloadOutlined />} disabled={exporting} onClick={() => void load()}>刷新</Button>{canExport && <Button icon={<DownloadOutlined />} loading={exporting} onClick={() => void exportRows()}>{exporting ? "导出中..." : "批量导出"}</Button>}</Space></div>
      {loadError ? <Alert type="error" showIcon message="门店稽核评分数据加载失败，请稍后重试" action={<Button size="small" icon={<ReloadOutlined />} onClick={() => void load()}>重新加载</Button>} /> : <Table<ReviewRow>
        rowKey="id" dataSource={rows} loading={loading} columns={columns} rowSelection={rowSelection} scroll={{ x: 1340 }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={Object.values(filters).some(Boolean) ? <><div>没有找到符合当前条件的门店稽核评分</div><small>请调整筛选条件后重试</small><div><Button type="link" onClick={resetFilters}>重置筛选</Button></div></> : "暂无门店稽核评分记录"} /> }}
        pagination={{ current: page, pageSize, total, showSizeChanger: true, pageSizeOptions: [20, 50, 100], showTotal: value => `共 ${value} 条`, onChange: (nextPage, nextSize) => { const targetPage = nextSize !== pageSize ? 1 : nextPage; setPage(targetPage); setPageSize(nextSize); void load(targetPage, nextSize, filters); } }}
      />}
    </Card>

    <Modal className="store-review-detail-modal" width={1180} open={!!detailId} title="查看门店稽核评分" onCancel={() => setDetailId(undefined)} footer={<Button onClick={() => setDetailId(undefined)}>关闭</Button>}>
      {detailLoading ? <Skeleton active paragraph={{ rows: 10 }} /> : detailError ? <Alert type="error" showIcon message="评分详情加载失败，请稍后重试" action={<Button size="small" onClick={() => detailId && void openDetail(detailId)}>重新加载</Button>} /> : detail && <div className="store-review-detail">
        <div className="store-review-detail-summary"><div><span>考核得分</span><strong>{score(detail.actualScore)}</strong><small>/ {score(detail.maxScore)}</small></div><Tag color="blue">配置版本 V{detail.assessmentVersion}</Tag></div>
        <h3>评分信息</h3>
        <Descriptions bordered size="small" column={4}>
          <Descriptions.Item label="记录编号">{detail.recordNo}</Descriptions.Item><Descriptions.Item label="考核月份">{detail.reviewMonth.replace("-", "年")}月</Descriptions.Item><Descriptions.Item label="品牌">{detail.brandName}</Descriptions.Item><Descriptions.Item label="考核门店">{detail.storeName}</Descriptions.Item>
          <Descriptions.Item label="考核表类型">{detail.assessmentName}</Descriptions.Item><Descriptions.Item label="负责人">{detail.responsiblePersonName}</Descriptions.Item><Descriptions.Item label="考核督导">{detail.reviewerRealName}</Descriptions.Item><Descriptions.Item label="考核日期">{detail.assessmentDate}</Descriptions.Item>
        </Descriptions>
        <h3>评分明细</h3>
        {!detail.configSnapshot && <Alert type="warning" showIcon message="历史评分配置快照缺失，以下内容来自已保存的评分明细" />}
        {Array.from(detailGroups.entries()).map(([section, subsections], sectionIndex) => <section className="store-review-detail-section" key={`${section}-${sectionIndex}`}><h4>{section}</h4>{Array.from(subsections.entries()).map(([subsection, items], subsectionIndex) => <div className="store-review-detail-subsection" key={`${subsection}-${subsectionIndex}`}><h5>{subsection}</h5>{items.map((item, index) => { const result = resultLabels[item.result] || { text: item.result, color: "default" }; return <div className="store-review-detail-item" key={item.id}><div className="store-review-detail-index">{index + 1}</div><div className="store-review-detail-copy"><strong>{item.itemDescription}</strong><Space size={[8, 6]} wrap><span>满分：{score(item.maxScore)}</span><span>评分结果：<Tag color={result.color}>{result.text}</Tag></span><span>实际得分：<b>{score(item.actualScore)}</b></span></Space></div></div>; })}</div>)}</section>)}
      </div>}
    </Modal>

    <Modal open={!!deleteRow} title={<Space><WarningOutlined style={{ color: "#ff4d4f" }} />温馨提示</Space>} onCancel={() => !deleting && setDeleteRow(undefined)} closable={!deleting} maskClosable={!deleting} footer={<Space><Button disabled={deleting} onClick={() => setDeleteRow(undefined)}>我再想想</Button><Button danger type="primary" loading={deleting} onClick={() => void performDelete()}>{deleting ? "删除中..." : "我知道了，继续删除"}</Button></Space>}>
      <Alert type="error" showIcon message="删除操作不可逆" description={deleteRow ? `${deleteRow.storeNameSnapshot} · ${deleteRow.reviewMonth} · ${deleteRow.assessmentName}` : undefined} />
      <div className="store-review-delete-copy"><p>一旦删除成功，原始门店稽核评分数据将无法恢复。</p><p>删除后，该门店对应的考核月份及考核表类型将恢复为未稽核评分状态，可在运营 H5 移动端重新进行评分。</p><p>请谨慎操作。</p></div>
    </Modal>
  </>;
}

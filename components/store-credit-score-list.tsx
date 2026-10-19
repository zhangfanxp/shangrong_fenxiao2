"use client";

import { DeleteOutlined, DownloadOutlined, EyeOutlined, ReloadOutlined, SearchOutlined, WarningOutlined } from "@ant-design/icons";
import { Alert, Button, Card, DatePicker, Descriptions, Empty, Form, Image, message, Modal, Select, Skeleton, Space, Table, Tag, Tooltip } from "antd";
import type { ColumnsType, TableRowSelection } from "antd/es/table/interface";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBusinessDictionaries } from "@/hooks/use-business-dictionaries";

type CreditScoreRow = {
  id: string; recordNo: string; brandName: string; storeName: string; assessmentType: string; managerName: string;
  assessmentDate: string; totalScore: number; maxScore: number; supervisorName: string; supervisorUserId: string;
  assessmentMonth: string; createdAt: string;
};
type Filters = { brand: string; storeId: string; assessmentStartDate: string; assessmentEndDate: string; supervisorUserId: string };
type FormValues = { brand?: string; storeId?: string; assessmentStartDate?: Dayjs | null; assessmentEndDate?: Dayjs | null; supervisorUserId?: string };
type StoreOption = { storeId: string; storeName: string; brandCode: string; brandId: string; brandName: string };
type SupervisorOption = { userId: string; realName: string };
type DetailItem = {
  id: string; itemKey: string; sectionName: string; subsectionName: string; itemDescription: string; problemDescription?: string | null; breachAmount: string;
  maxScore: number; result: string; actualScore: number; sortOrder: number;
  photos: { id: string; name: string; size: number; mimeType: string; url: string | null }[];
};
type CreditScoreDetail = {
  id: string; recordNo: string; assessmentMonth: string; brandName: string; storeName: string; assessmentType: string;
  managerName: string; supervisorName: string; supervisorUserId: string; assessmentDate: string; totalScore: number; maxScore: number;
  assessmentTemplateId: string; assessmentTemplateVersion: number; scoreMode: string; scoreModeLabel: string; snapshotValid: boolean;
  createdByName: string; createdAt: string; items: DetailItem[];
};

const emptyFilters: Filters = { brand: "", storeId: "", assessmentStartDate: "", assessmentEndDate: "", supervisorUserId: "" };
const resultLabels: Record<string, { text: string; color: string }> = {
  PASS: { text: "合格", color: "success" }, PARTIAL: { text: "部分合格", color: "warning" }, FAIL: { text: "不合格", color: "error" },
};

function score(value: number) { return Number.isInteger(value) ? String(value) : value.toFixed(1); }

function groupedItems(items: DetailItem[]) {
  const sections = new Map<string, Map<string, DetailItem[]>>();
  for (const item of items) {
    const sectionName = item.sectionName || "未命名总项";
    const subsectionName = item.subsectionName || "未命名子项";
    if (!sections.has(sectionName)) sections.set(sectionName, new Map());
    const subsections = sections.get(sectionName)!;
    if (!subsections.has(subsectionName)) subsections.set(subsectionName, []);
    subsections.get(subsectionName)!.push(item);
  }
  return sections;
}

export function StoreCreditScoreList({ permissions, initialRows = [], initialTotal = 0 }: { permissions: string[]; initialRows?: CreditScoreRow[]; initialTotal?: number }) {
  const hasAll = permissions.includes("*");
  const canView = hasAll || permissions.includes("store-credit-scores:view") || permissions.includes("inspection:view");
  const canExport = hasAll || permissions.includes("store-credit-scores:export");
  const canDelete = hasAll || permissions.includes("store-credit-scores:delete");
  const [form] = Form.useForm<FormValues>();
  const { options: dictionaries, loading: brandsLoading, error: brandsError, reload: reloadBrands } = useBusinessDictionaries(["BRAND"]);
  const [rows, setRows] = useState<CreditScoreRow[]>(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [storeOptions, setStoreOptions] = useState<StoreOption[]>([]);
  const [storeLoading, setStoreLoading] = useState(false);
  const [supervisors, setSupervisors] = useState<SupervisorOption[]>([]);
  const [supervisorsLoading, setSupervisorsLoading] = useState(false);
  const [supervisorsError, setSupervisorsError] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [detailId, setDetailId] = useState<string>();
  const [detail, setDetail] = useState<CreditScoreDetail>();
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const [deleteRow, setDeleteRow] = useState<CreditScoreRow>();
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
      const response = await fetch(`/api/store-credit-scores?${query}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "门店信用得分数据加载失败，请稍后重试");
      if (requestSequence !== listRequestSequence.current) return;
      setRows(data.rows); setTotal(data.total);
    } catch (reason) {
      if (!background && requestSequence === listRequestSequence.current) {
        setLoadError(true);
        message.error(reason instanceof Error ? reason.message : "门店信用得分数据加载失败，请稍后重试");
      }
    } finally {
      if (!background && requestSequence === listRequestSequence.current) setLoading(false);
    }
  }, [filters, page, pageSize]);

  const loadSupervisors = useCallback(async () => {
    setSupervisorsLoading(true); setSupervisorsError(false);
    try {
      const response = await fetch("/api/store-credit-scores/supervisors", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "考核督导数据加载失败，请稍后重试");
      setSupervisors(data);
    } catch (reason) {
      setSupervisorsError(true);
      message.error(reason instanceof Error ? reason.message : "考核督导数据加载失败，请稍后重试");
    } finally { setSupervisorsLoading(false); }
  }, []);

  useEffect(() => { void loadSupervisors(); }, [loadSupervisors]);
  useEffect(() => {
    const refreshWhenVisible = () => { if (document.visibilityState === "visible") void load(page, pageSize, filters, true); };
    const timer = window.setInterval(refreshWhenVisible, 30_000);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      if (storeTimer.current) clearTimeout(storeTimer.current);
    };
  }, [filters, load, page, pageSize]);

  const searchStores = useCallback(async (keyword = "") => {
    setStoreLoading(true);
    try {
      const brand = form.getFieldValue("brand") || "";
      const query = new URLSearchParams();
      if (keyword.trim()) query.set("keyword", keyword.trim());
      if (brand) query.set("brand", brand);
      const response = await fetch(`/api/store-credit-scores/stores?${query}`, { cache: "no-store" });
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
      brand: values.brand || "",
      storeId: values.storeId || "",
      assessmentStartDate: values.assessmentStartDate?.format("YYYY-MM-DD") || "",
      assessmentEndDate: values.assessmentEndDate?.format("YYYY-MM-DD") || "",
      supervisorUserId: values.supervisorUserId || "",
    };
    if (next.assessmentStartDate && next.assessmentEndDate && next.assessmentStartDate > next.assessmentEndDate) {
      message.warning("考核开始日期不能晚于考核截止日期");
      return null;
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
      const response = await fetch("/api/store-credit-scores/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recordIds: selectedRowKeys.length ? selectedRowKeys : undefined, filters }) });
      if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.message || "门店信用评分导出失败，请稍后重试"); }
      const blob = await response.blob();
      const encodedName = response.headers.get("Content-Disposition")?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
      const href = URL.createObjectURL(blob); const link = document.createElement("a");
      link.href = href; link.download = encodedName ? decodeURIComponent(encodedName) : `门店信用得分_${dayjs().format("YYYYMMDD_HHmmss")}.xlsx`;
      document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(href);
      message.success("导出成功，文件包含评分概览和完整评分明细");
    } catch (reason) { message.error(reason instanceof Error ? reason.message : "门店信用评分导出失败，请稍后重试"); }
    finally { setExporting(false); }
  };

  const openDetail = async (id: string) => {
    setDetailId(id); setDetail(undefined); setDetailError(false); setDetailLoading(true);
    try {
      const response = await fetch(`/api/store-credit-scores/${id}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "门店信用评分详情加载失败，请稍后重试");
      setDetail(data);
    } catch (reason) { setDetailError(true); message.error(reason instanceof Error ? reason.message : "门店信用评分详情加载失败，请稍后重试"); }
    finally { setDetailLoading(false); }
  };

  const performDelete = async () => {
    if (!deleteRow) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/store-credit-scores/${deleteRow.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "门店信用评分删除失败，请稍后重试");
      message.success(data.message || "门店信用评分删除成功");
      setDeleteRow(undefined); setSelectedRowKeys(keys => keys.filter(key => key !== deleteRow.id));
      const nextPage = rows.length === 1 && page > 1 ? page - 1 : page;
      setPage(nextPage); void load(nextPage, pageSize, filters);
    } catch (reason) { message.error(reason instanceof Error ? reason.message : "门店信用评分删除失败，请稍后重试"); }
    finally { setDeleting(false); }
  };

  const columns: ColumnsType<CreditScoreRow> = [
    { title: "记录编号", dataIndex: "recordNo", width: 140, fixed: "left" },
    { title: "品牌", dataIndex: "brandName", width: 130, ellipsis: true, render: value => value || "-" },
    { title: "考核门店", dataIndex: "storeName", width: 220, ellipsis: true, render: value => value || "-" },
    { title: "考核表类型", dataIndex: "assessmentType", width: 160, render: value => value || "-" },
    { title: "负责人", dataIndex: "managerName", width: 110, render: value => value || "-" },
    { title: "考核日期", dataIndex: "assessmentDate", width: 120 },
    { title: "考核得分", dataIndex: "totalScore", width: 110, align: "right", render: (value: number, row) => <Tooltip title={`${score(value)} / ${score(row.maxScore)}`}><strong>{score(value)}</strong></Tooltip> },
    { title: "考核督导", dataIndex: "supervisorName", width: 110, ellipsis: true, render: value => value || "-" },
    { title: "操作", key: "actions", width: canDelete ? 120 : 72, fixed: "right", render: (_, row) => <Space size={4} className="table-actions">{canView && <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => void openDetail(row.id)}>查看</Button>}{canDelete && <Button type="link" danger size="small" icon={<DeleteOutlined />} onClick={() => setDeleteRow(row)}>删除</Button>}</Space> },
  ];
  const rowSelection: TableRowSelection<CreditScoreRow> = { selectedRowKeys, preserveSelectedRowKeys: true, onChange: setSelectedRowKeys, columnWidth: 48, selections: true };
  const detailGroups = useMemo(() => groupedItems(detail?.items || []), [detail]);

  return <>
    {brandsError && <Alert className="store-review-alert" type="error" showIcon message="品牌数据加载失败，请稍后重试" description={brandsError} action={<Button size="small" icon={<ReloadOutlined />} onClick={() => void reloadBrands()}>重试</Button>} />}
    {supervisorsError && <Alert className="store-review-alert" type="error" showIcon message="考核督导数据加载失败，请稍后重试" action={<Button size="small" icon={<ReloadOutlined />} onClick={() => void loadSupervisors()}>重试</Button>} />}
    <Card className="store-review-filter-card">
      <Form form={form} layout="vertical">
        <div className="store-credit-filter-grid">
          <Form.Item label="品牌" name="brand"><Select allowClear loading={brandsLoading} placeholder="全部" options={dictionaries.BRAND} onChange={() => { form.setFieldValue("storeId", undefined); setStoreOptions([]); }} /></Form.Item>
          <Form.Item label="考核门店" name="storeId"><Select showSearch allowClear filterOption={false} placeholder="请输入考核门店名称" loading={storeLoading} options={storeOptions.map(store => ({ value: store.storeId, label: `${store.storeName}（${store.brandName}）` }))} onFocus={() => { if (!storeOptions.length) void searchStores(); }} onSearch={delayedStoreSearch} notFoundContent={storeLoading ? "搜索中..." : "未找到匹配门店"} /></Form.Item>
          <Form.Item label="考核开始日期" name="assessmentStartDate"><DatePicker format="YYYY-MM-DD" placeholder="开始日期" /></Form.Item>
          <Form.Item label="考核截止日期" name="assessmentEndDate"><DatePicker format="YYYY-MM-DD" placeholder="截止日期" /></Form.Item>
          <Form.Item label="考核督导" name="supervisorUserId"><Select showSearch allowClear optionFilterProp="label" loading={supervisorsLoading} placeholder="全部" options={supervisors.map(supervisor => ({ value: supervisor.userId, label: supervisor.realName }))} notFoundContent={supervisorsLoading ? "加载中..." : "暂无已启用督导"} /></Form.Item>
          <div className="store-review-filter-actions"><Space><Button onClick={resetFilters}>重置</Button><Button type="primary" icon={<SearchOutlined />} onClick={applyFilters}>筛选</Button></Space></div>
        </div>
      </Form>
    </Card>
    <Card className="store-review-list-card">
      <div className="store-review-toolbar"><span>已选择 <strong>{selectedRowKeys.length}</strong> 条</span><Space><Button icon={<ReloadOutlined />} disabled={exporting} onClick={() => void load()}>刷新</Button>{canExport && <Button icon={<DownloadOutlined />} loading={exporting} onClick={() => void exportRows()}>{exporting ? "导出中..." : "批量导出"}</Button>}</Space></div>
      {loadError ? <Alert type="error" showIcon message="门店信用得分数据加载失败，请稍后重试" action={<Button size="small" icon={<ReloadOutlined />} onClick={() => void load()}>重新加载</Button>} /> : <Table<CreditScoreRow>
        rowKey="id" dataSource={rows} loading={loading} columns={columns} rowSelection={rowSelection} scroll={{ x: 1160 }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={Object.values(filters).some(Boolean) ? <><div>没有找到符合当前条件的门店信用评分记录</div><small>请调整筛选条件后重试</small><div><Button type="link" onClick={resetFilters}>重置筛选</Button></div></> : "暂无门店信用评分记录"} /> }}
        pagination={{ current: page, pageSize, total, showSizeChanger: true, pageSizeOptions: [20, 50, 100], showTotal: value => `共 ${value} 条`, onChange: (nextPage, nextSize) => { const targetPage = nextSize !== pageSize ? 1 : nextPage; setPage(targetPage); setPageSize(nextSize); void load(targetPage, nextSize, filters); } }}
      />}
    </Card>

    <Modal className="store-review-detail-modal" width={1180} open={!!detailId} title="查看门店信用得分" onCancel={() => setDetailId(undefined)} footer={<Button onClick={() => setDetailId(undefined)}>关闭</Button>}>
      {detailLoading ? <Skeleton active paragraph={{ rows: 10 }} /> : detailError ? <Alert type="error" showIcon message="门店信用评分详情加载失败，请稍后重试" action={<Button size="small" onClick={() => detailId && void openDetail(detailId)}>重新加载</Button>} /> : detail && <div className="store-review-detail">
        <div className="store-review-detail-summary"><div><span>考核得分</span><strong>{score(detail.totalScore)}</strong><small>/ {score(detail.maxScore)}</small></div><Space wrap><Tag color="blue">配置版本 V{detail.assessmentTemplateVersion}</Tag>{detail.scoreModeLabel && <Tag color="geekblue">{detail.scoreModeLabel}</Tag>}</Space></div>
        <h3>基本信息</h3>
        <Descriptions bordered size="small" column={3}>
          <Descriptions.Item label="记录编号">{detail.recordNo}</Descriptions.Item><Descriptions.Item label="考核月份">{detail.assessmentMonth}</Descriptions.Item><Descriptions.Item label="品牌">{detail.brandName}</Descriptions.Item>
          <Descriptions.Item label="考核门店">{detail.storeName}</Descriptions.Item><Descriptions.Item label="考核表类型">{detail.assessmentType}</Descriptions.Item><Descriptions.Item label="负责人">{detail.managerName}</Descriptions.Item>
          <Descriptions.Item label="考核督导">{detail.supervisorName}</Descriptions.Item><Descriptions.Item label="考核日期">{detail.assessmentDate}</Descriptions.Item><Descriptions.Item label="考核得分">{score(detail.totalScore)}</Descriptions.Item>
          <Descriptions.Item label="创建人">{detail.createdByName}</Descriptions.Item><Descriptions.Item label="创建时间" span={2}>{detail.createdAt}</Descriptions.Item>
        </Descriptions>
        <h3>评分详情</h3>
        {!detail.snapshotValid && <Alert type="warning" showIcon message="历史评分配置数据异常，请联系系统管理员处理" description="系统字段和已经保存的评分结果仍可只读查看；系统不会使用最新评分表冒充历史配置。" />}
        {!detail.items.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无已保存的评分明细" />}
        {Array.from(detailGroups.entries()).map(([section, subsections], sectionIndex) => <section className="store-review-detail-section" key={`${section}-${sectionIndex}`}><h4>{section}</h4>{Array.from(subsections.entries()).map(([subsection, items], subsectionIndex) => <div className="store-review-detail-subsection" key={`${subsection}-${subsectionIndex}`}><h5>{subsection}</h5>{items.map((item, index) => { const result = resultLabels[item.result] || { text: item.result, color: "default" }; return <div className="store-review-detail-item" key={item.id}><div className="store-review-detail-index">{index + 1}</div><div className="store-review-detail-copy"><strong>{item.itemDescription}</strong><Space size={[8, 6]} wrap>{item.breachAmount !== "-" && <span>违约金额：{item.breachAmount}</span>}<span>标准分值：{score(item.maxScore)}</span><span>评分结果：<Tag color={result.color}>{result.text}</Tag></span><span>实际得分：<b>{score(item.actualScore)}</b></span></Space>{item.problemDescription && <div className="store-review-detail-problem-description"><b>问题描述：</b>{item.problemDescription}</div>}{!!item.photos?.length && <div className="store-review-detail-photos"><Image.PreviewGroup>{item.photos.map(photo => photo.url ? <Image key={photo.id} src={photo.url} alt={photo.name} width={88} height={88} /> : <span key={photo.id}>{photo.name}（暂不可访问）</span>)}</Image.PreviewGroup></div>}</div></div>; })}</div>)}</section>)}
      </div>}
    </Modal>

    <Modal open={!!deleteRow} title={<Space><WarningOutlined style={{ color: "#ff4d4f" }} />温馨提示</Space>} onCancel={() => !deleting && setDeleteRow(undefined)} closable={!deleting} maskClosable={!deleting} footer={<Space><Button disabled={deleting} onClick={() => setDeleteRow(undefined)}>我再想想</Button><Button danger type="primary" loading={deleting} onClick={() => void performDelete()}>{deleting ? "删除中..." : "我知道了，继续删除"}</Button></Space>}>
      <Alert type="error" showIcon message="删除操作不可逆" description={deleteRow ? `${deleteRow.storeName} · ${deleteRow.assessmentMonth} · ${deleteRow.assessmentType}` : undefined} />
      <div className="store-review-delete-copy"><p>删除操作不可逆，一旦删除成功，当前门店信用评分的原始数据将无法恢复。</p><p>删除后，该门店对应考核月份的门店信用评分将恢复为“未稽核打分”状态，运营移动端可以重新对该月份进行信用评分。</p><p>请谨慎操作。</p></div>
    </Modal>
  </>;
}

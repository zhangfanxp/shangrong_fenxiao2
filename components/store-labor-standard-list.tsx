"use client";

import { DeleteOutlined, DownloadOutlined, EditOutlined, EyeOutlined, PlusOutlined, SearchOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Descriptions, Empty, Form, Input, InputNumber, message, Modal, Select, Skeleton, Space, Table } from "antd";
import type { ColumnsType, TableRowSelection } from "antd/es/table/interface";
import dayjs from "dayjs";
import { useCallback, useEffect, useRef, useState } from "react";

type Metric = "RECEIVED_AMOUNT" | "ACTUAL_SALES_AMOUNT";
type Option = { value: string; label: string; disabled?: boolean };
type StoreLaborStandardRow = {
  id: string;
  recordNo: string;
  brandValue: string;
  assessmentMetric: Metric;
  assessmentMetricLabel: string;
  lowerAmount: string | null;
  upperAmount: string | null;
  standardHeadcount: number;
  remark: string;
  version: number;
};
type Filters = { brandValue: string };
type RecordFormValues = {
  brandValue?: string;
  assessmentMetric?: Metric;
  lowerAmount?: string | null;
  upperAmount?: string | null;
  standardHeadcount?: number | null;
  remark?: string;
};
type ModalMode = "create" | "view" | "edit";

const emptyFilters: Filters = { brandValue: "" };

function hasPermission(permissions: string[], action: string) {
  return permissions.includes("*") || permissions.includes("settings:store-labor-standards") || permissions.includes(`store-labor-standards:${action}`);
}

function responseFileName(response: Response) {
  const encoded = response.headers.get("Content-Disposition")?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  return encoded ? decodeURIComponent(encoded) : `门店用工标准_${dayjs().format("YYYYMMDD_HHmmss")}.xlsx`;
}

function formatMoney(value: string | null) {
  if (value === null) return "-";
  const [integer, decimal = "00"] = value.split(".");
  return `${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${decimal.padEnd(2, "0")}`;
}

function cents(value?: string | null) {
  if (!value) return null;
  const [integer, decimal = ""] = String(value).split(".");
  if (!/^\d+$/.test(integer) || !/^\d*$/.test(decimal)) return null;
  return BigInt(integer) * 100n + BigInt(decimal.padEnd(2, "0").slice(0, 2));
}

export function StoreLaborStandardList({ permissions }: { permissions: string[] }) {
  const canCreate = hasPermission(permissions, "create");
  const canView = hasPermission(permissions, "view");
  const canEdit = hasPermission(permissions, "edit");
  const canExport = hasPermission(permissions, "export");
  const canDelete = hasPermission(permissions, "delete");
  const [filterForm] = Form.useForm<{ brandValue?: string }>();
  const [recordForm] = Form.useForm<RecordFormValues>();
  const [rows, setRows] = useState<StoreLaborStandardRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [brandOptions, setBrandOptions] = useState<Option[]>([]);
  const [metricOptions, setMetricOptions] = useState<Option[]>([]);
  const [configuredMetrics, setConfiguredMetrics] = useState<Record<string, Metric>>({});
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [optionsError, setOptionsError] = useState("");
  const [modalMode, setModalMode] = useState<ModalMode>();
  const [activeRow, setActiveRow] = useState<StoreLaborStandardRow>();
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleteRow, setDeleteRow] = useState<StoreLaborStandardRow>();
  const [deleting, setDeleting] = useState(false);
  const requestSequence = useRef(0);
  const selectedBrand = Form.useWatch("brandValue", recordForm);
  const lockedMetric = selectedBrand ? configuredMetrics[selectedBrand] : undefined;

  const loadOptions = useCallback(async (excludeId?: string) => {
    setOptionsLoading(true);
    setOptionsError("");
    try {
      const query = excludeId ? `?excludeId=${encodeURIComponent(excludeId)}` : "";
      const response = await fetch(`/api/store-labor-standards/options${query}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "品牌数据加载失败，请稍后重试");
      setBrandOptions(data.brands || []);
      setMetricOptions(data.metrics || []);
      setConfiguredMetrics(data.configuredMetrics || {});
    } catch (reason) {
      setOptionsError(reason instanceof Error ? reason.message : "品牌数据加载失败，请稍后重试");
    } finally {
      setOptionsLoading(false);
    }
  }, []);

  const load = useCallback(async (nextPage: number, nextPageSize: number, nextFilters: Filters) => {
    const sequence = ++requestSequence.current;
    setLoading(true);
    setLoadError(false);
    try {
      const query = new URLSearchParams({ page: String(nextPage), pageSize: String(nextPageSize) });
      if (nextFilters.brandValue) query.set("brandValue", nextFilters.brandValue);
      const response = await fetch(`/api/store-labor-standards?${query}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "门店用工标准数据加载失败，请稍后重试");
      if (sequence !== requestSequence.current) return;
      setRows(data.rows || []);
      setTotal(data.total || 0);
    } catch (reason) {
      if (sequence === requestSequence.current) {
        setLoadError(true);
        message.error(reason instanceof Error ? reason.message : "门店用工标准数据加载失败，请稍后重试");
      }
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, []);

  useEffect(() => { void Promise.all([load(1, 20, emptyFilters), loadOptions()]); }, [load, loadOptions]);

  const applyFilters = async () => {
    const values = await filterForm.validateFields();
    const next = { brandValue: values.brandValue === "ALL" ? "" : values.brandValue || "" };
    setFilters(next); setPage(1); setSelectedRowKeys([]); void load(1, pageSize, next);
  };
  const resetFilters = () => {
    filterForm.setFieldsValue({ brandValue: "ALL" });
    setFilters(emptyFilters); setPage(1); setSelectedRowKeys([]); void load(1, pageSize, emptyFilters);
  };

  const closeModal = () => {
    if (saving) return;
    setModalMode(undefined); setActiveRow(undefined); setDetailError(false); recordForm.resetFields(); void loadOptions();
  };
  const openCreate = () => {
    setActiveRow(undefined); setModalMode("create"); recordForm.resetFields();
    recordForm.setFieldsValue({ brandValue: undefined, assessmentMetric: undefined, lowerAmount: null, upperAmount: null, standardHeadcount: null, remark: "" });
    void loadOptions();
  };
  const openEdit = (row: StoreLaborStandardRow) => {
    setActiveRow(row); setModalMode("edit");
    recordForm.setFieldsValue({ brandValue: row.brandValue, assessmentMetric: row.assessmentMetric, lowerAmount: row.lowerAmount, upperAmount: row.upperAmount, standardHeadcount: row.standardHeadcount, remark: row.remark });
    void loadOptions(row.id).then(() => recordForm.setFieldsValue({ brandValue: row.brandValue, assessmentMetric: row.assessmentMetric }));
  };
  const openView = async (id: string) => {
    setModalMode("view"); setActiveRow(undefined); setDetailLoading(true); setDetailError(false);
    try {
      const response = await fetch(`/api/store-labor-standards/${id}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "门店用工标准详情加载失败，请稍后重试");
      setActiveRow(data);
    } catch (reason) {
      setDetailError(true); message.error(reason instanceof Error ? reason.message : "门店用工标准详情加载失败，请稍后重试");
    } finally { setDetailLoading(false); }
  };

  const saveRecord = async () => {
    try {
      const values = await recordForm.validateFields();
      if (!values.brandValue || !values.assessmentMetric || !values.standardHeadcount) return;
      setSaving(true);
      const editing = modalMode === "edit" && activeRow;
      const response = await fetch(editing ? `/api/store-labor-standards/${activeRow.id}` : "/api/store-labor-standards", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, lowerAmount: values.lowerAmount || null, upperAmount: values.upperAmount || null, remark: values.remark || "", ...(editing ? { version: activeRow.version } : {}) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "门店用工标准保存失败，请稍后重试");
      message.success(editing ? "门店用工标准保存成功" : "门店用工标准新增成功");
      setModalMode(undefined); setActiveRow(undefined); recordForm.resetFields();
      const targetPage = editing ? page : 1;
      if (!editing) setPage(1);
      await Promise.all([load(targetPage, pageSize, filters), loadOptions()]);
    } catch (reason) {
      if (reason instanceof Error) message.error(reason.message);
    } finally { setSaving(false); }
  };

  const exportRows = async () => {
    setExporting(true);
    try {
      const response = await fetch("/api/store-labor-standards/export", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordIds: selectedRowKeys.length ? selectedRowKeys.map(String) : undefined, filters }),
      });
      if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.message || "门店用工标准导出失败，请稍后重试"); }
      const href = URL.createObjectURL(await response.blob());
      const link = document.createElement("a"); link.href = href; link.download = responseFileName(response); document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(href);
      message.success("门店用工标准导出成功");
    } catch (reason) { message.error(reason instanceof Error ? reason.message : "门店用工标准导出失败，请稍后重试"); }
    finally { setExporting(false); }
  };

  const confirmDelete = async () => {
    if (!deleteRow) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/store-labor-standards/${deleteRow.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "门店用工标准删除失败，请稍后重试");
      message.success("门店用工标准删除成功");
      setSelectedRowKeys(current => current.filter(key => String(key) !== deleteRow.id)); setDeleteRow(undefined);
      const targetPage = rows.length === 1 && page > 1 ? page - 1 : page;
      if (targetPage !== page) setPage(targetPage);
      await Promise.all([load(targetPage, pageSize, filters), loadOptions()]);
    } catch (reason) { message.error(reason instanceof Error ? reason.message : "门店用工标准删除失败，请稍后重试"); }
    finally { setDeleting(false); }
  };

  const columns: ColumnsType<StoreLaborStandardRow> = [
    { title: "记录编号", dataIndex: "recordNo", width: 155, fixed: "left" },
    { title: "品牌", dataIndex: "brandValue", width: 180, ellipsis: true },
    { title: "下限", dataIndex: "lowerAmount", width: 160, align: "right", render: value => formatMoney(value) },
    { title: "上限", dataIndex: "upperAmount", width: 160, align: "right", render: value => formatMoney(value) },
    { title: "标准用工", dataIndex: "standardHeadcount", width: 135, align: "center", render: value => `${value} 人` },
    { title: "操作", key: "actions", width: 210, fixed: "right", render: (_, row) => <Space size={0} className="table-actions">
      {canView && <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => void openView(row.id)}>查看</Button>}
      {canEdit && <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(row)}>编辑</Button>}
      {canDelete && <Button danger type="link" size="small" icon={<DeleteOutlined />} onClick={() => setDeleteRow(row)}>删除</Button>}
    </Space> },
  ];
  const rowSelection: TableRowSelection<StoreLaborStandardRow> = { selectedRowKeys, preserveSelectedRowKeys: true, onChange: setSelectedRowKeys, columnWidth: 48 };
  const visibleBrandOptions = activeRow && !brandOptions.some(option => option.value === activeRow.brandValue)
    ? [...brandOptions, { value: activeRow.brandValue, label: `${activeRow.brandValue}（已停用）`, disabled: true }]
    : brandOptions;
  const boundValidator = (_: unknown, value: string | null | undefined) => {
    const lower = cents(recordForm.getFieldValue("lowerAmount"));
    const upper = cents(recordForm.getFieldValue("upperAmount"));
    if (lower === null && upper === null) return Promise.reject(new Error("下限与上限不允许同时为空"));
    if (lower !== null && upper !== null && lower >= upper) return Promise.reject(new Error("上限必须大于下限"));
    return Promise.resolve(value);
  };

  return <>
    <Card className="store-labor-filter-card">
      <Form form={filterForm} layout="vertical" initialValues={{ brandValue: "ALL" }}>
        <div className="store-labor-filter-grid">
          <Form.Item label="品牌" name="brandValue"><Select showSearch optionFilterProp="label" loading={optionsLoading} options={[{ value: "ALL", label: "全部" }, ...brandOptions]} /></Form.Item>
          <div className="store-labor-filter-actions"><Space><Button onClick={resetFilters}>重置</Button><Button type="primary" icon={<SearchOutlined />} onClick={() => void applyFilters()}>筛选</Button></Space></div>
        </div>
      </Form>
      {optionsError && <Alert className="store-labor-options-alert" type="warning" showIcon message="品牌数据加载失败" description={optionsError} action={<Button size="small" onClick={() => void loadOptions()}>重试</Button>} />}
    </Card>

    <Card className="store-labor-list-card">
      <div className="store-labor-toolbar">
        <Space>{canCreate && <Button type="primary" icon={<PlusOutlined />} disabled={optionsLoading || Boolean(optionsError) || !brandOptions.length} onClick={openCreate}>新增</Button>}<span>已选择 <strong>{selectedRowKeys.length}</strong> 条</span></Space>
        {canExport && <Button icon={<DownloadOutlined />} loading={exporting} disabled={loading} onClick={() => void exportRows()}>{exporting ? "导出中..." : "批量导出"}</Button>}
      </div>
      {loadError ? <Alert type="error" showIcon message="门店用工标准数据加载失败，请稍后重试" action={<Button size="small" onClick={() => void load(page, pageSize, filters)}>重新加载</Button>} /> : <Table<StoreLaborStandardRow>
        rowKey="id" dataSource={rows} loading={loading} columns={columns} rowSelection={rowSelection} scroll={{ x: 1050 }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={filters.brandValue ? "没有找到符合当前品牌的门店用工标准" : "当前还没有门店用工标准记录"} /> }}
        pagination={{ current: page, pageSize, total, showSizeChanger: true, pageSizeOptions: [20, 50, 100], showTotal: value => `共 ${value} 条`, onChange: (nextPage, nextSize) => { const targetPage = nextSize !== pageSize ? 1 : nextPage; setPage(targetPage); setPageSize(nextSize); void load(targetPage, nextSize, filters); } }}
      />}
    </Card>

    <Modal width={760} className="store-labor-record-modal" open={Boolean(modalMode)} title={modalMode === "create" ? "新增门店用工标准" : modalMode === "edit" ? "编辑门店用工标准" : "查看门店用工标准"} onCancel={closeModal} maskClosable={false} closable={!saving}
      footer={modalMode === "view" ? <Button onClick={closeModal}>关闭</Button> : <Space><Button disabled={saving} onClick={closeModal}>取消</Button><Button type="primary" loading={saving} onClick={() => void saveRecord()}>{saving ? "保存中..." : "保存"}</Button></Space>}>
      {modalMode === "view" ? detailLoading ? <Skeleton active paragraph={{ rows: 7 }} /> : detailError ? <Alert type="error" showIcon message="门店用工标准详情加载失败，请稍后重试" /> : activeRow && <Descriptions bordered size="small" column={1}>
        <Descriptions.Item label="记录编号">{activeRow.recordNo}</Descriptions.Item><Descriptions.Item label="品牌">{activeRow.brandValue}</Descriptions.Item><Descriptions.Item label="考核指标">{activeRow.assessmentMetricLabel}</Descriptions.Item>
        <Descriptions.Item label="下限">{formatMoney(activeRow.lowerAmount)}</Descriptions.Item><Descriptions.Item label="上限">{formatMoney(activeRow.upperAmount)}</Descriptions.Item><Descriptions.Item label="标准用工人数">{activeRow.standardHeadcount} 人</Descriptions.Item><Descriptions.Item label="备注"><span className="store-labor-remark">{activeRow.remark || "-"}</span></Descriptions.Item>
      </Descriptions> : <Form form={recordForm} layout="vertical">
        <div className="store-labor-form-grid">
          <Form.Item label="记录编号"><Input readOnly value={activeRow?.recordNo || ""} placeholder="保存成功后由系统自动生成" /></Form.Item>
          <Form.Item label="品牌" name="brandValue" rules={[{ required: true, message: "请选择品牌" }]}><Select showSearch optionFilterProp="label" loading={optionsLoading} placeholder="请选择" options={visibleBrandOptions} onChange={(value: string) => recordForm.setFieldValue("assessmentMetric", configuredMetrics[value] || undefined)} /></Form.Item>
          <Form.Item label="考核指标" name="assessmentMetric" rules={[{ required: true, message: "请选择考核指标" }]} extra={lockedMetric ? "同一品牌统一使用已有记录的考核指标。" : undefined}><Select placeholder="请选择" disabled={Boolean(lockedMetric)} options={metricOptions} /></Form.Item>
          <Form.Item label="标准用工人数" name="standardHeadcount" rules={[{ required: true, message: "请输入标准用工人数" }, { type: "integer", min: 1, message: "请输入不包含零的正整数" }]}><InputNumber min={1} max={65535} precision={0} controls={false} addonAfter="人" placeholder="请输入" style={{ width: "100%" }} /></Form.Item>
          <Form.Item label="下限" name="lowerAmount" dependencies={["upperAmount"]} rules={[{ validator: boundValidator }]}><InputNumber<string> stringMode min="0" precision={2} controls={false} addonBefore="¥" placeholder="请输入（可留空）" style={{ width: "100%" }} /></Form.Item>
          <Form.Item label="上限" name="upperAmount" dependencies={["lowerAmount"]} rules={[{ validator: boundValidator }]}><InputNumber<string> stringMode min="0" precision={2} controls={false} addonBefore="¥" placeholder="请输入（可留空）" style={{ width: "100%" }} /></Form.Item>
          <Form.Item className="store-labor-form-span" label="备注" name="remark" rules={[{ max: 100, message: "备注不能超过100个字符" }]}><Input.TextArea rows={4} maxLength={100} showCount placeholder="请输入备注（选填）" /></Form.Item>
        </div>
      </Form>}
    </Modal>

    <Modal open={Boolean(deleteRow)} title="确认删除门店用工标准？" okText={deleting ? "删除中..." : "确认删除"} cancelText="取消" confirmLoading={deleting} okButtonProps={{ danger: true }} closable={!deleting} maskClosable={false} onCancel={() => !deleting && setDeleteRow(undefined)} onOk={() => void confirmDelete()}>
      <p>删除后该记录无法恢复，请确认是否继续。</p>{deleteRow && <div className="store-labor-delete-summary"><strong>{deleteRow.brandValue}</strong><span>{formatMoney(deleteRow.lowerAmount)} 至 {formatMoney(deleteRow.upperAmount)} · {deleteRow.standardHeadcount} 人</span></div>}
    </Modal>
  </>;
}

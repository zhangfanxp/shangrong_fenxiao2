"use client";

import {
  CheckCircleOutlined, DeleteOutlined, DownloadOutlined, EditOutlined, EyeOutlined, InboxOutlined,
  PlusOutlined, ReloadOutlined, SearchOutlined, StopOutlined,
} from "@ant-design/icons";
import {
  Alert, Button, Card, Checkbox, Descriptions, Empty, Form, Input, InputNumber, message as antdMessage, Modal,
  Select, Space, Tag, Tooltip,
} from "antd";
import type { ColumnsType, TablePaginationConfig } from "antd/es/table";
import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DataTable } from "@/components/data-table";
import { StatusTag } from "@/components/status-tag";
import { UnsavedChangesModal } from "@/components/unsaved-changes-modal";

type ManageStock = "MANAGED" | "UNMANAGED";
type InventoryStatus = "ENABLED" | "DISABLED";
type ItemTypeOption = { label: string; value: string };
type InventoryItem = {
  id: string; recordNo: string; itemName: string; itemTypeCode: string; itemTypeName: string;
  specification: string | null; unit: string; manageStock: ManageStock; stockQuantity: string | null;
  status: InventoryStatus; requiresReturnOnResignation: boolean; remark: string | null; version: number; createdByName: string; createdAt: string;
  updatedAt: string; transactionCount?: number;
};
type Filters = { itemName?: string; itemType?: string; status?: InventoryStatus };
type ItemForm = { itemName: string; itemTypeCode: string; specification?: string; unit: string; manageStock: ManageStock; requiresReturnOnResignation: boolean; remark?: string };
type InboundForm = { inboundType: "PURCHASE" | "INITIAL"; quantity: number };
type FormMode = "create" | "edit";
type StatusChange = { row: InventoryItem; status: InventoryStatus };

const pageSizes = [20, 50, 100];
const manageStockLabel = (value: ManageStock) => value === "MANAGED" ? "管理" : "不管理";
const displayDate = (value: string) => dayjs(value).format("YYYY-MM-DD HH:mm:ss");

function responseFileName(response: Response) {
  const encoded = response.headers.get("Content-Disposition")?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  return encoded ? decodeURIComponent(encoded) : `物品管理_${dayjs().format("YYYYMMDD_HHmmss")}.xlsx`;
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

async function requestJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || "操作失败，请稍后重试");
  return result as T;
}

export function WorkwearInventoryList({ permissions, currentUserName }: { permissions: string[]; currentUserName: string }) {
  const [message, messageContextHolder] = antdMessage.useMessage();
  const [filterForm] = Form.useForm<Filters>();
  const [itemForm] = Form.useForm<ItemForm>();
  const [inboundForm] = Form.useForm<InboundForm>();
  const all = permissions.includes("*");
  const can = (action: string) => all || permissions.includes(`workwear-inventory:${action}`);
  const [rows, setRows] = useState<InventoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filters, setFilters] = useState<Filters>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [itemTypes, setItemTypes] = useState<ItemTypeOption[]>([]);
  const [itemTypesLoading, setItemTypesLoading] = useState(true);
  const [itemTypesError, setItemTypesError] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);
  const [exporting, setExporting] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>();
  const [current, setCurrent] = useState<InventoryItem>();
  const [detail, setDetail] = useState<InventoryItem>();
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const [dirty, setDirty] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [inboundItem, setInboundItem] = useState<InventoryItem>();
  const [inboundSaving, setInboundSaving] = useState(false);
  const [inboundError, setInboundError] = useState<string>();
  const [deleteItem, setDeleteItem] = useState<InventoryItem>();
  const [deleting, setDeleting] = useState(false);
  const [statusChange, setStatusChange] = useState<StatusChange>();
  const [statusSaving, setStatusSaving] = useState(false);

  const load = useCallback(async (nextPage = page, nextPageSize = pageSize, nextFilters = filters) => {
    setLoading(true); setLoadError(false);
    try {
      const query = new URLSearchParams({ page: String(nextPage), pageSize: String(nextPageSize) });
      if (nextFilters.itemName?.trim()) query.set("itemName", nextFilters.itemName.trim());
      if (nextFilters.itemType) query.set("itemType", nextFilters.itemType);
      if (nextFilters.status) query.set("status", nextFilters.status);
      const result = await requestJson<{ rows: InventoryItem[]; total: number; page: number; pageSize: number }>(`/api/workwear-inventory?${query}`);
      setRows(result.rows); setTotal(result.total); setPage(result.page); setPageSize(result.pageSize);
    } catch (reason) {
      setLoadError(true);
      message.error(reason instanceof Error ? reason.message : "物品数据加载失败，请稍后重试");
    } finally { setLoading(false); }
  }, [filters, message, page, pageSize]);

  const loadItemTypes = useCallback(async () => {
    setItemTypesLoading(true); setItemTypesError(false);
    try {
      const result = await requestJson<{ itemTypes: ItemTypeOption[] }>("/api/workwear-inventory/options");
      setItemTypes(result.itemTypes);
    } catch {
      setItemTypesError(true); message.error("物品类型加载失败，请稍后重试");
    } finally { setItemTypesLoading(false); }
  }, [message]);

  useEffect(() => { void load(1, 20, {}); void loadItemTypes(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const visible = new Set(rows.map(row => row.id)); setSelectedKeys(keys => keys.filter(key => visible.has(String(key)))); }, [rows]);

  const applyFilters = (values: Filters) => {
    const normalized = { ...values, itemName: values.itemName?.trim() || undefined };
    setFilters(normalized); setPage(1); setSelectedKeys([]); void load(1, pageSize, normalized);
  };
  const resetFilters = () => {
    filterForm.resetFields(); setFilters({}); setPage(1); setSelectedKeys([]); void load(1, pageSize, {});
  };

  const openCreate = () => {
    setCurrent(undefined); setSaveError(undefined); setDirty(false); itemForm.resetFields();
    itemForm.setFieldsValue({ manageStock: "MANAGED", requiresReturnOnResignation: false }); setFormMode("create");
  };
  const loadDetail = async (row: InventoryItem, mode: "view" | "edit") => {
    setDetailLoading(true);
    try {
      const result = await requestJson<InventoryItem>(`/api/workwear-inventory/${row.id}${mode === "edit" ? "?mode=edit" : ""}`);
      if (mode === "view") setDetail(result);
      else {
        setCurrent(result); setSaveError(undefined); setDirty(false);
        itemForm.setFieldsValue({ itemName: result.itemName, itemTypeCode: result.itemTypeCode, specification: result.specification || undefined, unit: result.unit, manageStock: result.manageStock, requiresReturnOnResignation: result.requiresReturnOnResignation, remark: result.remark || undefined });
      }
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : "物品详情加载失败，请稍后重试");
      if (mode === "view") setDetail(undefined); else setFormMode(undefined);
    } finally { setDetailLoading(false); }
  };
  const openView = (row: InventoryItem) => { setDetail(row); void loadDetail(row, "view"); };
  const openEdit = (row: InventoryItem) => { setCurrent(row); setFormMode("edit"); void loadDetail(row, "edit"); };
  const closeFormNow = () => { setFormMode(undefined); setCurrent(undefined); setSaveError(undefined); setDirty(false); itemForm.resetFields(); };
  const requestCloseForm = () => { if (saving) return; if (dirty) setDiscardOpen(true); else closeFormNow(); };

  const saveItem = async () => {
    if (!formMode || saving || (formMode === "edit" && detailLoading)) return;
    setSaveError(undefined);
    try {
      const values = await itemForm.validateFields(); setSaving(true);
      const editing = formMode === "edit";
      await requestJson(editing ? `/api/workwear-inventory/${current?.id}` : "/api/workwear-inventory", {
        method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing ? { itemName: values.itemName, itemTypeCode: values.itemTypeCode, specification: values.specification || null, unit: values.unit, requiresReturnOnResignation: values.requiresReturnOnResignation, remark: values.remark || null, version: current?.version } : { ...values, specification: values.specification || null, remark: values.remark || null }),
      });
      message.success(editing ? "物品信息保存成功" : "物品新增成功"); closeFormNow(); await load(1, pageSize, filters); setPage(1);
    } catch (reason) {
      const error = reason instanceof Error ? reason.message : formMode === "create" ? "物品新增失败，请稍后重试" : "物品信息保存失败，请稍后重试";
      setSaveError(error); if (!(reason && typeof reason === "object" && "errorFields" in reason)) message.error(error);
    } finally { setSaving(false); }
  };

  const openInbound = (row: InventoryItem) => {
    if (row.manageStock !== "MANAGED" || row.status !== "ENABLED") return;
    setInboundError(undefined); setInboundItem(row);
  };
  useEffect(() => { if (inboundItem) inboundForm.resetFields(); }, [inboundForm, inboundItem]);
  const saveInbound = async () => {
    if (!inboundItem || inboundSaving) return;
    setInboundError(undefined);
    try {
      const values = await inboundForm.validateFields(); setInboundSaving(true);
      await requestJson(`/api/workwear-inventory/${inboundItem.id}/inbound`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
      message.success("物品入库成功"); setInboundItem(undefined); inboundForm.resetFields(); await load(page, pageSize, filters);
    } catch (reason) {
      const error = reason instanceof Error ? reason.message : "物品入库失败，请稍后重试";
      setInboundError(error); if (!(reason && typeof reason === "object" && "errorFields" in reason)) message.error(error);
    } finally { setInboundSaving(false); }
  };

  const confirmDelete = async () => {
    if (!deleteItem || deleting) return;
    setDeleting(true);
    try {
      await requestJson(`/api/workwear-inventory/${deleteItem.id}`, { method: "DELETE" });
      message.success("物品删除成功"); setDeleteItem(undefined); setSelectedKeys(keys => keys.filter(key => key !== deleteItem.id));
      const nextPage = rows.length === 1 && page > 1 ? page - 1 : page; setPage(nextPage); await load(nextPage, pageSize, filters);
    } catch (reason) { message.error(reason instanceof Error ? reason.message : "物品删除失败，请稍后重试"); }
    finally { setDeleting(false); }
  };

  const confirmStatusChange = async () => {
    if (!statusChange || statusSaving) return;
    const { row, status } = statusChange;
    const action = status === "ENABLED" ? "启用" : "禁用";
    setStatusSaving(true);
    try {
      await requestJson(`/api/workwear-inventory/${row.id}/status`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, version: row.version }),
      });
      message.success(`物品${action}成功`); setStatusChange(undefined);
      const leavesCurrentFilter = Boolean(filters.status && filters.status !== status);
      const nextPage = leavesCurrentFilter && rows.length === 1 && page > 1 ? page - 1 : page;
      setPage(nextPage); await load(nextPage, pageSize, filters);
    } catch (reason) { message.error(reason instanceof Error ? reason.message : `物品${action}失败，请稍后重试`); }
    finally { setStatusSaving(false); }
  };

  const exportRows = async () => {
    if (exporting || total === 0) return;
    setExporting(true);
    try {
      const response = await fetch("/api/workwear-inventory/export", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedKeys.length ? selectedKeys.map(String) : undefined, filters }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.message || "物品数据导出失败，请稍后重试");
      }
      downloadBlob(await response.blob(), responseFileName(response));
      message.success(`导出成功，共导出 ${selectedKeys.length || total} 条物品记录`);
    } catch (reason) { message.error(reason instanceof Error ? reason.message : "物品数据导出失败，请稍后重试"); }
    finally { setExporting(false); }
  };

  const actionColumns = useMemo<ColumnsType<InventoryItem>>(() => [{
    title: "操作", key: "actions", width: 300, fixed: "right", render: (_, row) => <Space size={2} className="table-actions">
      {can("view") && <Button type="link" icon={<EyeOutlined />} onClick={() => openView(row)}>查看</Button>}
      {can("edit") && <Button type="link" icon={<EditOutlined />} onClick={() => openEdit(row)}>编辑</Button>}
      {can("inbound") && <Tooltip title={row.manageStock === "UNMANAGED" ? "当前物品不管理库存，无需执行入库操作" : row.status === "DISABLED" ? "当前物品已禁用，不支持入库" : undefined}><span><Button type="link" icon={<InboxOutlined />} disabled={row.manageStock === "UNMANAGED" || row.status === "DISABLED"} onClick={() => openInbound(row)}>入库</Button></span></Tooltip>}
      {row.status === "ENABLED" && can("disable") && <Button type="link" danger icon={<StopOutlined />} onClick={() => setStatusChange({ row, status: "DISABLED" })}>禁用</Button>}
      {row.status === "DISABLED" && can("enable") && <Button type="link" icon={<CheckCircleOutlined />} onClick={() => setStatusChange({ row, status: "ENABLED" })}>启用</Button>}
      {can("delete") && <Button type="link" danger icon={<DeleteOutlined />} onClick={() => setDeleteItem(row)}>删除</Button>}
    </Space>,
  }], [permissions]); // eslint-disable-line react-hooks/exhaustive-deps

  const columns: ColumnsType<InventoryItem> = [
    { title: "记录编号", dataIndex: "recordNo", width: 135, fixed: "left" },
    { title: "物品名称", dataIndex: "itemName", width: 180, ellipsis: true },
    { title: "物品类型", dataIndex: "itemTypeName", width: 140, ellipsis: true },
    { title: "规格", dataIndex: "specification", width: 130, render: value => value || "-", ellipsis: true },
    { title: "单位", dataIndex: "unit", width: 80 },
    { title: "库存数量", dataIndex: "stockQuantity", width: 105, align: "right", render: (value, row) => row.manageStock === "MANAGED" ? <strong>{value ?? "0"}</strong> : <Tooltip title="当前物品不管理库存"><span>-</span></Tooltip> },
    { title: "物品状态", dataIndex: "status", width: 100, render: value => <StatusTag value={value} /> },
    { title: "创建人", dataIndex: "createdByName", width: 110, ellipsis: true },
    { title: "创建日期", dataIndex: "createdAt", width: 175, render: displayDate },
    ...actionColumns,
  ];
  const hasFilters = Boolean(filters.itemName || filters.itemType || filters.status);
  const pagination: TablePaginationConfig = { current: page, pageSize, total, showSizeChanger: true, pageSizeOptions: pageSizes, showTotal: value => `共 ${value} 条`, onChange: (nextPage, nextSize) => { setPage(nextPage); setPageSize(nextSize); setSelectedKeys([]); void load(nextPage, nextSize, filters); } };
  const modalItem = formMode === "edit" ? current : undefined;

  return <>
    {messageContextHolder}
    {itemTypesError && <Alert className="workwear-alert" type="error" showIcon message="物品类型加载失败，请稍后重试" action={<Button size="small" icon={<ReloadOutlined />} onClick={() => void loadItemTypes()}>重新加载</Button>} />}
    {!itemTypesError && !itemTypesLoading && itemTypes.length === 0 && <Alert className="workwear-alert" type="warning" showIcon message="尚未配置物品领用类型" description="请先前往“设置 → 数据字典 → 物品领用类型”维护有效枚举值。" />}
    <Card className="workwear-filter-card">
      <Form form={filterForm} layout="vertical" onFinish={applyFilters} className="workwear-filter-grid">
        <Form.Item label="物品名称" name="itemName"><Input allowClear maxLength={30} placeholder="请输入物品名称" onPressEnter={() => filterForm.submit()} /></Form.Item>
        <Form.Item label="物品类型" name="itemType"><Select allowClear showSearch optionFilterProp="label" loading={itemTypesLoading} placeholder="全部" options={itemTypes} /></Form.Item>
        <Form.Item label="物品状态" name="status"><Select allowClear placeholder="全部" options={[{ value: "ENABLED", label: "已启用" }, { value: "DISABLED", label: "已禁用" }]} /></Form.Item>
        <div className="workwear-filter-actions"><Space><Button onClick={resetFilters}>重置</Button><Button type="primary" htmlType="submit" icon={<SearchOutlined />}>筛选</Button></Space></div>
      </Form>
    </Card>
    <Card className="workwear-list-card">
      <div className="workwear-toolbar"><span>共 <strong>{total}</strong> 条物品记录{selectedKeys.length ? `，已选择 ${selectedKeys.length} 条` : ""}</span><Space>{can("create") && <Button type="primary" icon={<PlusOutlined />} disabled={itemTypesError || !itemTypes.length} onClick={openCreate}>新增</Button>}{can("export") && <Button icon={<DownloadOutlined />} loading={exporting} disabled={loading || total === 0} onClick={() => void exportRows()}>{exporting ? "导出中..." : "批量导出"}</Button>}</Space></div>
      <DataTable<InventoryItem>
        rowKey="id" columns={columns} dataSource={rows} loading={loading} error={loadError} onRetry={() => void load()}
        rowSelection={{ selectedRowKeys: selectedKeys, onChange: setSelectedKeys }} pagination={pagination} scroll={{ x: 1500 }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<><div>{hasFilters ? "没有找到符合当前条件的物品记录" : "暂无物品记录"}</div><small>{hasFilters ? "请调整筛选条件后重试" : "当前还没有创建工装或领用物品"}</small></>}>{hasFilters ? <Button onClick={resetFilters}>重置筛选</Button> : can("create") && <Button type="primary" icon={<PlusOutlined />} disabled={!itemTypes.length} onClick={openCreate}>新增</Button>}</Empty> }}
      />
    </Card>

    <Modal className="workwear-form-modal" title={formMode === "edit" ? "编辑物品" : "新增物品"} width={800} open={!!formMode} onCancel={requestCloseForm} onOk={() => void saveItem()} okText={saving ? "保存中..." : "保存"} cancelText="取消" confirmLoading={saving} maskClosable={false} forceRender destroyOnHidden>
      {saveError && <Alert type="error" showIcon message={saveError} style={{ marginBottom: 18 }} />}
      {detailLoading && formMode === "edit" && <Alert type="info" showIcon message="正在加载物品信息…" style={{ marginBottom: 18 }} />}
      <Form form={itemForm} layout="vertical" disabled={detailLoading && formMode === "edit"} onValuesChange={() => setDirty(true)} requiredMark>
        <div className="workwear-form-grid">
          <Form.Item label="记录编号"><Input readOnly disabled value={modalItem?.recordNo || ""} placeholder="保存成功后由系统生成" /></Form.Item>
          <Form.Item label="物品名称" name="itemName" rules={[{ required: true, whitespace: true, message: "请输入物品名称" }, { max: 30, message: "物品名称不能超过30个字符" }]}><Input maxLength={30} placeholder="请输入物品名称" /></Form.Item>
          <Form.Item label="物品类型" name="itemTypeCode" rules={[{ required: true, message: "请选择物品类型" }]}><Select showSearch optionFilterProp="label" placeholder="请选择" options={itemTypes} loading={itemTypesLoading} /></Form.Item>
          <Form.Item label="规格" name="specification" rules={[{ max: 50, message: "规格不能超过50个字符" }]}><Input maxLength={50} placeholder="例如：L、黑色/均码" /></Form.Item>
          <Form.Item label="单位" name="unit" rules={[{ required: true, whitespace: true, message: "请输入单位" }, { max: 5, message: "单位不能超过5个字符" }, { pattern: /^[\p{L}\p{N}]+$/u, message: "单位仅支持汉字、字母和数字" }]}><Input maxLength={5} placeholder="例如：件、套、PCS" /></Form.Item>
          {formMode === "create" ? <Form.Item label="管理库存" name="manageStock" rules={[{ required: true, message: "请选择是否管理库存" }]}><Select options={[{ value: "MANAGED", label: "管理" }, { value: "UNMANAGED", label: "不管理" }]} /></Form.Item> : <Form.Item label="管理库存"><Input disabled value={modalItem ? manageStockLabel(modalItem.manageStock) : ""} /></Form.Item>}
          <Form.Item name="requiresReturnOnResignation" valuePropName="checked"><Checkbox>离职需返还</Checkbox></Form.Item>
          <Form.Item className="workwear-form-span" label="备注" name="remark" rules={[{ max: 200, message: "备注不能超过200个字符" }]}><Input.TextArea rows={3} maxLength={200} showCount placeholder="请输入备注（选填）" /></Form.Item>
          <Form.Item label="创建人"><Input readOnly disabled value={modalItem?.createdByName || currentUserName} /></Form.Item>
          <Form.Item label="创建时间"><Input readOnly disabled value={modalItem ? displayDate(modalItem.createdAt) : ""} placeholder="保存成功后由系统生成" /></Form.Item>
        </div>
      </Form>
    </Modal>
    <UnsavedChangesModal open={discardOpen} title="当前物品信息尚未保存" content="当前物品信息尚未保存，关闭后填写内容将丢失，是否继续？" okText="继续关闭" cancelText="返回编辑" onKeep={() => setDiscardOpen(false)} onDiscard={() => { setDiscardOpen(false); closeFormNow(); }} />

    <Modal className="workwear-detail-modal" title="查看物品" width={800} open={!!detail} onCancel={() => setDetail(undefined)} footer={<Button onClick={() => setDetail(undefined)}>关闭</Button>} destroyOnHidden>
      {detail && <Descriptions bordered column={2} size="middle">
        <Descriptions.Item label="记录编号">{detail.recordNo}</Descriptions.Item><Descriptions.Item label="物品状态"><StatusTag value={detail.status} /></Descriptions.Item>
        <Descriptions.Item label="物品名称">{detail.itemName}</Descriptions.Item><Descriptions.Item label="物品类型">{detail.itemTypeName}</Descriptions.Item>
        <Descriptions.Item label="规格">{detail.specification || "-"}</Descriptions.Item><Descriptions.Item label="单位">{detail.unit}</Descriptions.Item>
        <Descriptions.Item label="管理库存"><Tag color={detail.manageStock === "MANAGED" ? "blue" : "default"}>{manageStockLabel(detail.manageStock)}</Tag></Descriptions.Item><Descriptions.Item label="库存数量">{detail.manageStock === "MANAGED" ? detail.stockQuantity ?? "0" : "-"}</Descriptions.Item>
        <Descriptions.Item label="离职需返还" span={2}><Checkbox disabled checked={detail.requiresReturnOnResignation}>{detail.requiresReturnOnResignation ? "是" : "否"}</Checkbox></Descriptions.Item>
        <Descriptions.Item label="备注" span={2}>{detail.remark || "-"}</Descriptions.Item>
        <Descriptions.Item label="创建人">{detail.createdByName}</Descriptions.Item><Descriptions.Item label="创建时间">{displayDate(detail.createdAt)}</Descriptions.Item>
      </Descriptions>}
    </Modal>

    <Modal className="workwear-inbound-modal" title="物品入库" width={680} open={!!inboundItem} onCancel={() => !inboundSaving && setInboundItem(undefined)} onOk={() => void saveInbound()} okText={inboundSaving ? "入库中..." : "保存"} cancelText="取消" confirmLoading={inboundSaving} maskClosable={false} destroyOnHidden>
      {inboundItem && <>
        <Descriptions bordered column={2} size="small" className="workwear-inbound-summary">
          <Descriptions.Item label="记录编号">{inboundItem.recordNo}</Descriptions.Item><Descriptions.Item label="物品名称">{inboundItem.itemName}</Descriptions.Item>
          <Descriptions.Item label="物品类型">{inboundItem.itemTypeName}</Descriptions.Item><Descriptions.Item label="规格">{inboundItem.specification || "-"}</Descriptions.Item>
          <Descriptions.Item label="单位">{inboundItem.unit}</Descriptions.Item><Descriptions.Item label="当前库存">{inboundItem.stockQuantity ?? "0"}</Descriptions.Item>
        </Descriptions>
        {inboundError && <Alert type="error" showIcon message={inboundError} style={{ marginBottom: 18 }} />}
        <Form form={inboundForm} layout="vertical">
          <div className="workwear-inbound-form">
            <Form.Item label="入库类型" name="inboundType" rules={[{ required: true, message: "请选择入库类型" }]}><Select placeholder="请选择" options={[{ value: "PURCHASE", label: "采购入库" }, { value: "INITIAL", label: "期初库存" }]} /></Form.Item>
            <Form.Item label="入库数量" name="quantity" rules={[{ required: true, message: "请输入入库数量" }, { type: "integer", min: 1, max: 999999, message: "请输入1至999999之间的正整数" }]}><InputNumber min={1} max={999999} precision={0} step={1} placeholder="请输入正整数" addonAfter={inboundItem.unit} style={{ width: "100%" }} /></Form.Item>
          </div>
        </Form>
      </>}
    </Modal>

    <Modal title="温馨提示" open={!!deleteItem} onCancel={() => !deleting && setDeleteItem(undefined)} onOk={() => void confirmDelete()} okText="我知道了，继续删除" cancelText="我再想想" okButtonProps={{ danger: true }} confirmLoading={deleting} maskClosable={false}>
      <Alert type="warning" showIcon message={`即将删除：${deleteItem?.itemName || ""}`} description="删除操作不可逆，一旦删除成功，当前物品档案将无法恢复，请谨慎操作。已有库存流水或库存数量大于0的物品将由系统拒绝删除。" />
    </Modal>

    <Modal title="温馨提示" open={!!statusChange} onCancel={() => !statusSaving && setStatusChange(undefined)} onOk={() => void confirmStatusChange()} okText="我知道了，继续操作" cancelText="我再想想" okButtonProps={{ danger: statusChange?.status === "DISABLED" }} confirmLoading={statusSaving} maskClosable={false}>
      <Alert
        type={statusChange?.status === "DISABLED" ? "warning" : "info"}
        showIcon
        message={`确认${statusChange?.status === "DISABLED" ? "禁用" : "启用"}：${statusChange?.row.itemName || ""}`}
        description={statusChange?.status === "DISABLED" ? "禁用后该物品将不能继续入库；已有物品档案、库存数量和库存流水不会被删除。" : "启用后该物品将恢复为可用状态，并可按库存管理规则继续入库。"}
      />
    </Modal>
  </>;
}

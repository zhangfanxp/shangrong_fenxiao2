"use client";

import {
  DownloadOutlined, EditOutlined, EyeOutlined, PlusOutlined, ReloadOutlined, SearchOutlined,
} from "@ant-design/icons";
import {
  Alert, Button, Card, DatePicker, Descriptions, Empty, Form, Input, InputNumber, message as antdMessage,
  Modal, Select, Skeleton, Space, Table, Tag, Tooltip, Tree,
} from "antd";
import type { ColumnsType, TablePaginationConfig } from "antd/es/table";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DataTable } from "@/components/data-table";
import { UnsavedChangesModal } from "@/components/unsaved-changes-modal";
import { createClientRequestId } from "@/lib/client-request-id";

type ManageStock = "MANAGED" | "UNMANAGED";
type RequisitionRow = {
  id: string; requisitionNo: string; requisitionDate: string; personnelName: string; itemName: string;
  unit: string; quantity: number; createdByName: string; createdAt: string;
};
type RequisitionDetail = {
  id: string; requisitionNo: string; requisitionDate: string; requisitionedAt: string;
  personnelId: string; personnelName: string; personnelBelonging: string; departmentStore: string | null;
  itemId: string; itemRecordNo: string; itemName: string; itemTypeCode: string; itemType: string;
  specification: string | null; unit: string; manageStock: ManageStock; quantity: number; remark: string | null;
  version: number; createdByName: string; createdAt: string; updatedByName: string | null; updatedAt: string;
};
type Filters = { startDate?: string; endDate?: string; itemNameKeyword?: string; specificationKeyword?: string; personnelKeyword?: string };
type FilterForm = { startDate?: Dayjs; endDate?: Dayjs; itemNameKeyword?: string; specificationKeyword?: string; personnelKeyword?: string };
type PersonnelOption = { personnelId: string; recordNo: string; name: string; personnelBelonging: string; departmentStore: string | null; brand?: string | null; status: "ACTIVE" };
type ItemOption = { itemId: string; recordNo: string; itemName: string; itemTypeCode: string; itemType: string; specification: string | null; unit: string; manageStock: ManageStock; stockQuantity: string | null; status: "ENABLED" };
type ItemTypeOption = { label: string; value: string };
type RequisitionForm = { personnelId: string; itemId?: string; quantity?: number; remark?: string };
type FormMode = "create" | "edit";

const pageSizes = [20, 50, 100];
const displayDateTime = (value: string) => dayjs(value).format("YYYY-MM-DD HH:mm:ss");
const manageStockLabel = (value: ManageStock) => value === "MANAGED" ? "管理" : "不管理";

async function requestJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || "操作失败，请稍后重试");
  return result as T;
}

function responseFileName(response: Response) {
  const encoded = response.headers.get("Content-Disposition")?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  return encoded ? decodeURIComponent(encoded) : `领用记录_${dayjs().format("YYYYMMDD_HHmmss")}.xlsx`;
}

function downloadBlob(blob: Blob, fileName: string) {
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href; link.download = fileName; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(href);
}

export function ItemRequisitionList({ permissions, currentUserName }: { permissions: string[]; currentUserName: string }) {
  const [message, messageContextHolder] = antdMessage.useMessage();
  const [filterForm] = Form.useForm<FilterForm>();
  const [requisitionForm] = Form.useForm<RequisitionForm>();
  const all = permissions.includes("*");
  const can = (action: string) => all || permissions.includes(`item-requisitions:${action}`) || (action === "query" && permissions.includes("staff:view"));
  const [rows, setRows] = useState<RequisitionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filters, setFilters] = useState<Filters>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);
  const [exporting, setExporting] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>();
  const [current, setCurrent] = useState<RequisitionDetail>();
  const [detail, setDetail] = useState<RequisitionDetail>();
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const [dirty, setDirty] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [requestId, setRequestId] = useState("");
  const [personnelRows, setPersonnelRows] = useState<PersonnelOption[]>([]);
  const [personnelLoading, setPersonnelLoading] = useState(false);
  const [personnelError, setPersonnelError] = useState(false);
  const personnelRequest = useRef(0);
  const personnelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedItem, setSelectedItem] = useState<ItemOption>();
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [itemRows, setItemRows] = useState<ItemOption[]>([]);
  const [itemTypes, setItemTypes] = useState<ItemTypeOption[]>([]);
  const [selectedItemType, setSelectedItemType] = useState("");
  const [itemPage, setItemPage] = useState(1);
  const [itemPageSize, setItemPageSize] = useState(10);
  const [itemTotal, setItemTotal] = useState(0);
  const [itemLoading, setItemLoading] = useState(false);
  const [itemError, setItemError] = useState(false);

  const load = useCallback(async (nextPage = page, nextPageSize = pageSize, nextFilters = filters) => {
    setLoading(true); setLoadError(false);
    try {
      const query = new URLSearchParams({ page: String(nextPage), pageSize: String(nextPageSize) });
      Object.entries(nextFilters).forEach(([key, value]) => { if (value) query.set(key, value); });
      const result = await requestJson<{ rows: RequisitionRow[]; total: number; page: number; pageSize: number }>(`/api/item-requisitions?${query}`);
      setRows(result.rows); setTotal(result.total); setPage(result.page); setPageSize(result.pageSize);
    } catch (reason) {
      setLoadError(true); message.error(reason instanceof Error ? reason.message : "领用记录加载失败，请稍后重试");
    } finally { setLoading(false); }
  }, [filters, message, page, pageSize]);

  useEffect(() => { void load(1, 20, {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (personnelTimer.current) clearTimeout(personnelTimer.current); }, []);

  const loadPersonnel = useCallback(async (keyword = "") => {
    const requestNumber = ++personnelRequest.current;
    setPersonnelLoading(true); setPersonnelError(false);
    try {
      const result = await requestJson<{ rows: PersonnelOption[] }>(`/api/item-requisitions/personnel-options?keyword=${encodeURIComponent(keyword.trim())}`);
      if (requestNumber === personnelRequest.current) {
        const selectedId = requisitionForm.getFieldValue("personnelId");
        setPersonnelRows(previous => {
          const selected = selectedId ? previous.find(item => item.personnelId === selectedId) : undefined;
          return selected && !result.rows.some(item => item.personnelId === selectedId) ? [selected, ...result.rows] : result.rows;
        });
      }
    } catch (reason) {
      if (requestNumber === personnelRequest.current) { setPersonnelError(true); message.error(reason instanceof Error ? reason.message : "人员数据加载失败，请稍后重试"); }
    } finally { if (requestNumber === personnelRequest.current) setPersonnelLoading(false); }
  }, [message, requisitionForm]);

  const searchPersonnel = (keyword: string) => {
    if (personnelTimer.current) clearTimeout(personnelTimer.current);
    personnelTimer.current = setTimeout(() => void loadPersonnel(keyword), 250);
  };

  const loadItems = useCallback(async (itemType = selectedItemType, nextPage = itemPage, nextPageSize = itemPageSize) => {
    setItemLoading(true); setItemError(false);
    try {
      const query = new URLSearchParams({ page: String(nextPage), pageSize: String(nextPageSize) });
      if (itemType) query.set("itemType", itemType);
      const result = await requestJson<{ rows: ItemOption[]; itemTypes: ItemTypeOption[]; total: number; page: number; pageSize: number }>(`/api/item-requisitions/item-options?${query}`);
      setItemRows(result.rows); setItemTypes(result.itemTypes); setItemTotal(result.total); setItemPage(result.page); setItemPageSize(result.pageSize);
    } catch (reason) {
      setItemError(true); message.error(reason instanceof Error ? reason.message : "物品数据加载失败，请稍后重试");
    } finally { setItemLoading(false); }
  }, [itemPage, itemPageSize, message, selectedItemType]);

  const applyFilters = (values: FilterForm) => {
    const startDate = values.startDate?.format("YYYY-MM-DD");
    const endDate = values.endDate?.format("YYYY-MM-DD");
    if (startDate && endDate && startDate > endDate) { message.error("领用开始日期不能晚于领用截止日期"); return; }
    const normalized: Filters = {
      startDate, endDate,
      itemNameKeyword: values.itemNameKeyword?.trim() || undefined,
      specificationKeyword: values.specificationKeyword?.trim() || undefined,
      personnelKeyword: values.personnelKeyword?.trim() || undefined,
    };
    setFilters(normalized); setPage(1); setSelectedKeys([]); void load(1, pageSize, normalized);
  };
  const resetFilters = () => { filterForm.resetFields(); setFilters({}); setPage(1); setSelectedKeys([]); void load(1, pageSize, {}); };

  const openCreate = () => {
    setCurrent(undefined); setSelectedItem(undefined); setSaveError(undefined); setDirty(false);
    requisitionForm.resetFields(); setRequestId(createClientRequestId()); setFormMode("create"); void loadPersonnel();
  };
  const closeFormNow = () => {
    setFormMode(undefined); setCurrent(undefined); setSelectedItem(undefined); setSaveError(undefined); setDirty(false); setRequestId(""); requisitionForm.resetFields();
  };
  const requestCloseForm = () => { if (saving) return; if (dirty) setDiscardOpen(true); else closeFormNow(); };

  const loadDetail = async (row: RequisitionRow, mode: "edit" | "view") => {
    setDetailLoading(true);
    try {
      const result = await requestJson<RequisitionDetail>(`/api/item-requisitions/${row.id}${mode === "edit" ? "?mode=edit" : ""}`);
      if (mode === "view") setDetail(result);
      else {
        setCurrent(result);
        setSelectedItem({ itemId: result.itemId, recordNo: result.itemRecordNo, itemName: result.itemName, itemTypeCode: result.itemTypeCode, itemType: result.itemType, specification: result.specification, unit: result.unit, manageStock: result.manageStock, stockQuantity: null, status: "ENABLED" });
        setPersonnelRows(previous => previous.some(item => item.personnelId === result.personnelId) ? previous : [{ personnelId: result.personnelId, recordNo: "", name: result.personnelName, personnelBelonging: result.personnelBelonging, departmentStore: result.departmentStore, status: "ACTIVE" }, ...previous]);
        requisitionForm.setFieldsValue({ personnelId: result.personnelId, quantity: result.quantity, remark: result.remark || undefined }); setDirty(false);
      }
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : mode === "view" ? "领用记录加载失败，请稍后重试" : "领用人修改失败，请稍后重试");
      if (mode === "view") { setDetail(undefined); setDetailOpen(false); } else closeFormNow();
    } finally { setDetailLoading(false); }
  };
  const openEdit = (row: RequisitionRow) => { setCurrent(undefined); setFormMode("edit"); setSaveError(undefined); setDirty(false); void loadPersonnel(); void loadDetail(row, "edit"); };
  const openView = (row: RequisitionRow) => { setDetail(undefined); setDetailOpen(true); void loadDetail(row, "view"); };

  const openItemModal = () => {
    setSelectedItemType(""); setItemPage(1); setItemPageSize(10); setItemModalOpen(true); void loadItems("", 1, 10);
  };
  const chooseItem = (item: ItemOption) => {
    const changed = selectedItem?.itemId !== item.itemId;
    setSelectedItem(item); requisitionForm.setFieldsValue({ itemId: item.itemId, ...(changed ? { quantity: undefined } : {}) });
    setDirty(true); setItemModalOpen(false);
  };

  const save = async () => {
    if (!formMode || saving || (formMode === "edit" && detailLoading)) return;
    setSaveError(undefined);
    try {
      const values = await requisitionForm.validateFields(); setSaving(true);
      if (formMode === "create") {
        if (!selectedItem || !values.itemId) throw new Error("请选择领用物品");
        await requestJson("/api/item-requisitions", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requestId, personnelId: values.personnelId, itemId: values.itemId, quantity: values.quantity, remark: values.remark?.trim() || null }),
        });
        message.success("领用记录新增成功"); closeFormNow(); setPage(1); await load(1, pageSize, filters);
      } else {
        if (!current) return;
        await requestJson(`/api/item-requisitions/${current.id}/personnel`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ personnelId: values.personnelId, version: current.version }),
        });
        message.success("领用人修改成功"); closeFormNow(); await load(page, pageSize, filters);
      }
    } catch (reason) {
      const error = reason instanceof Error ? reason.message : formMode === "create" ? "领用记录保存失败，请稍后重试" : "领用人修改失败，请稍后重试";
      setSaveError(error); if (!(reason && typeof reason === "object" && "errorFields" in reason)) message.error(error);
    } finally { setSaving(false); }
  };

  const exportRows = async () => {
    if (exporting || total === 0) return;
    setExporting(true);
    try {
      const response = await fetch("/api/item-requisitions/export", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordIds: selectedKeys.length ? selectedKeys.map(String) : undefined, filters }),
      });
      if (!response.ok) { const result = await response.json().catch(() => ({})); throw new Error(result.message || "领用记录导出失败，请稍后重试"); }
      downloadBlob(await response.blob(), responseFileName(response));
      message.success(`导出成功，共导出 ${selectedKeys.length || total} 条领用记录`);
    } catch (reason) { message.error(reason instanceof Error ? reason.message : "领用记录导出失败，请稍后重试"); }
    finally { setExporting(false); }
  };

  const actionColumns = useMemo<ColumnsType<RequisitionRow>>(() => [{
    title: "操作", key: "actions", fixed: "right", width: 150,
    render: (_, row) => <Space size={0}>
      {can("edit") && <Button type="link" icon={<EditOutlined />} onClick={() => openEdit(row)}>编辑</Button>}
      {can("view") && <Button type="link" icon={<EyeOutlined />} onClick={() => openView(row)}>查看</Button>}
    </Space>,
  }], [permissions]); // eslint-disable-line react-hooks/exhaustive-deps
  const columns: ColumnsType<RequisitionRow> = [
    { title: "领用单号", dataIndex: "requisitionNo", width: 135, fixed: "left" },
    { title: "领用日期", dataIndex: "requisitionDate", width: 115 },
    { title: "领用人", dataIndex: "personnelName", width: 120, ellipsis: true },
    { title: "领用物品", dataIndex: "itemName", width: 180, ellipsis: true },
    { title: "领用数量", dataIndex: "quantity", width: 105, align: "right", render: (value, row) => <Tooltip title={`${value}${row.unit}`}><strong>{value}</strong></Tooltip> },
    { title: "创建人", dataIndex: "createdByName", width: 120, ellipsis: true },
    { title: "创建时间", dataIndex: "createdAt", width: 175, render: displayDateTime },
    ...actionColumns,
  ];
  const hasFilters = Object.values(filters).some(Boolean);
  const pagination: TablePaginationConfig = { current: page, pageSize, total, showSizeChanger: true, pageSizeOptions: pageSizes, showTotal: value => `共 ${value} 条`, onChange: (nextPage, nextSize) => { setPage(nextPage); setPageSize(nextSize); void load(nextPage, nextSize, filters); } };
  const personnelSelectOptions = personnelRows.map(personnel => ({ value: personnel.personnelId, label: `${personnel.name}${personnel.departmentStore ? ` · ${personnel.departmentStore}` : ""}${personnel.recordNo ? ` · ${personnel.recordNo}` : ""}` }));

  const itemColumns: ColumnsType<ItemOption> = [
    { title: "记录编号", dataIndex: "recordNo", width: 135 },
    { title: "物品名称", dataIndex: "itemName", width: 170, ellipsis: true },
    { title: "规格", dataIndex: "specification", width: 120, render: value => value || "-", ellipsis: true },
    { title: "单位", dataIndex: "unit", width: 70 },
    { title: "库存数量", dataIndex: "stockQuantity", width: 100, align: "right", render: (value, row) => row.manageStock === "MANAGED" ? value ?? "0" : <Tooltip title="当前物品不管理库存"><span>-</span></Tooltip> },
    { title: "操作", key: "action", width: 85, fixed: "right", render: (_, item) => {
      const noStock = item.manageStock === "MANAGED" && BigInt(item.stockQuantity || "0") <= 0n;
      return <Tooltip title={noStock ? "当前库存不足，无法领用" : ""}><span><Button type="link" disabled={noStock} onClick={() => chooseItem(item)}>选择</Button></span></Tooltip>;
    } },
  ];

  return <>
    {messageContextHolder}
    <Card className="requisition-filter-card">
      <Form form={filterForm} layout="vertical" className="requisition-filter-grid" onFinish={applyFilters}>
        <Form.Item label="领用开始日期" name="startDate"><DatePicker format="YYYY-MM-DD" placeholder="开始日期" allowClear /></Form.Item>
        <Form.Item label="领用截止日期" name="endDate"><DatePicker format="YYYY-MM-DD" placeholder="截止日期" allowClear /></Form.Item>
        <Form.Item label="物品名称" name="itemNameKeyword"><Input allowClear maxLength={30} placeholder="请输入物品名称" onPressEnter={() => filterForm.submit()} /></Form.Item>
        <Form.Item label="规格" name="specificationKeyword"><Input allowClear maxLength={50} placeholder="请输入规格" onPressEnter={() => filterForm.submit()} /></Form.Item>
        <Form.Item label="领用人" name="personnelKeyword"><Input allowClear maxLength={50} placeholder="请输入领用人" onPressEnter={() => filterForm.submit()} /></Form.Item>
        <div className="requisition-filter-actions"><Space><Button onClick={resetFilters}>重置</Button><Button type="primary" htmlType="submit" icon={<SearchOutlined />}>筛选</Button></Space></div>
      </Form>
    </Card>
    <Card className="requisition-list-card">
      <div className="requisition-toolbar">
        <Space>{can("create") && <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增</Button>}<span>已选择 <strong>{selectedKeys.length}</strong> 条</span></Space>
        {can("export") && <Button icon={<DownloadOutlined />} loading={exporting} disabled={loading || total === 0} onClick={() => void exportRows()}>{exporting ? "导出中..." : "批量导出"}</Button>}
      </div>
      <DataTable<RequisitionRow>
        rowKey="id" columns={columns} dataSource={rows} loading={loading} error={loadError} onRetry={() => void load()}
        rowSelection={{ selectedRowKeys: selectedKeys, onChange: setSelectedKeys, preserveSelectedRowKeys: true }} pagination={pagination} scroll={{ x: 1120 }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<><div>{hasFilters ? "没有找到符合当前条件的领用记录" : "暂无领用记录"}</div><small>{hasFilters ? "请调整筛选条件后重试" : "当前还没有员工物品领用记录"}</small></>}>{hasFilters ? <Button onClick={resetFilters}>重置筛选</Button> : can("create") && <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增</Button>}</Empty> }}
      />
    </Card>

    <Modal className="requisition-form-modal" title={formMode === "edit" ? "编辑-领用记录" : "新增领用"} width={820} open={!!formMode} onCancel={requestCloseForm} onOk={() => void save()} okText={saving ? "保存中..." : "保存"} cancelText="取消" confirmLoading={saving} maskClosable={false} forceRender destroyOnHidden>
      {saveError && <Alert type="error" showIcon message={saveError} style={{ marginBottom: 18 }} />}
      {detailLoading && formMode === "edit" && <Alert type="info" showIcon message="正在加载领用记录…" style={{ marginBottom: 18 }} />}
      <Form form={requisitionForm} layout="vertical" requiredMark onValuesChange={() => setDirty(true)} disabled={detailLoading && formMode === "edit"}>
        <div className="requisition-form-grid">
          <Form.Item label="领用单号"><Input disabled value={current?.requisitionNo || ""} placeholder="保存成功后由系统生成" /></Form.Item>
          <Form.Item label="领用人" name="personnelId" rules={[{ required: true, message: "请选择领用人" }]} validateStatus={personnelError ? "error" : undefined} help={personnelError ? "人员数据加载失败，请稍后重试" : undefined}>
            <Select showSearch allowClear filterOption={false} loading={personnelLoading} onSearch={searchPersonnel} onFocus={() => { if (!personnelRows.length) void loadPersonnel(); }} placeholder="请输入领用人姓名" options={personnelSelectOptions} notFoundContent={personnelLoading ? "搜索中..." : "未找到符合条件的在职人员"} />
          </Form.Item>
          {formMode === "create" ? <Form.Item label="领用物品" name="itemId" rules={[{ required: true, message: "请选择领用物品" }]}>
            <div className={`requisition-item-picker ${selectedItem ? "selected" : ""}`}><span>{selectedItem ? selectedItem.itemName : "未选择"}</span><Button onClick={openItemModal}>选择</Button></div>
          </Form.Item> : <Form.Item label="领用物品"><Input disabled value={current?.itemName || ""} /></Form.Item>}
          <Form.Item label="规格"><Input disabled value={(selectedItem || current)?.specification || "-"} /></Form.Item>
          <Form.Item label="单位"><Input disabled value={(selectedItem || current)?.unit || ""} /></Form.Item>
          <Form.Item label="领用数量" name="quantity" rules={formMode === "create" ? [
            { required: true, message: "请输入领用数量" },
            { type: "integer", min: 1, max: 999999, message: "请输入1至999999之间的正整数" },
            { validator: (_, value) => !value || !selectedItem || selectedItem.manageStock !== "MANAGED" || BigInt(value) <= BigInt(selectedItem.stockQuantity || "0") ? Promise.resolve() : Promise.reject(new Error(`当前库存不足，可用库存为${selectedItem.stockQuantity || "0"}`)) },
          ] : []}>
            <InputNumber disabled={formMode === "edit"} min={1} max={999999} precision={0} step={1} placeholder="请输入正整数" addonAfter={(selectedItem || current)?.unit || undefined} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item className="requisition-form-span" label="备注" name="remark" rules={formMode === "create" ? [{ max: 100, message: "备注不能超过100个字符" }] : []}>
            <Input.TextArea disabled={formMode === "edit"} rows={3} maxLength={100} showCount={formMode === "create"} placeholder="请输入备注（选填）" />
          </Form.Item>
          <Form.Item label="创建人"><Input disabled value={current?.createdByName || currentUserName} /></Form.Item>
          <Form.Item label="创建时间"><Input disabled value={current ? displayDateTime(current.createdAt) : ""} placeholder="保存成功后由系统生成" /></Form.Item>
        </div>
      </Form>
    </Modal>
    <UnsavedChangesModal open={discardOpen} title="当前领用信息尚未保存" content="当前领用信息尚未保存，关闭后填写内容将丢失，是否继续？" okText="继续关闭" cancelText="返回编辑" onKeep={() => setDiscardOpen(false)} onDiscard={() => { setDiscardOpen(false); closeFormNow(); }} />

    <Modal className="requisition-item-modal" title="选择物品" width={1000} open={itemModalOpen} onCancel={() => setItemModalOpen(false)} footer={<Button onClick={() => setItemModalOpen(false)}>取消</Button>} destroyOnHidden>
      <div className="requisition-item-layout">
        <aside><strong>物品类型</strong><Tree blockNode selectedKeys={[selectedItemType || "__all"]} treeData={[{ key: "__all", title: "全部" }, ...itemTypes.map(type => ({ key: type.value, title: type.label }))]} onSelect={keys => { const type = keys[0] === "__all" ? "" : String(keys[0] || ""); setSelectedItemType(type); setItemPage(1); void loadItems(type, 1, itemPageSize); }} /></aside>
        <section>
          {itemError ? <Alert type="error" showIcon message="物品数据加载失败，请稍后重试" action={<Button size="small" icon={<ReloadOutlined />} onClick={() => void loadItems()}>重新加载</Button>} /> : <Table<ItemOption>
            rowKey="itemId" size="middle" columns={itemColumns} dataSource={itemRows} loading={itemLoading} scroll={{ x: 680 }}
            pagination={{ current: itemPage, pageSize: itemPageSize, total: itemTotal, showSizeChanger: true, pageSizeOptions: [10, 20, 50], showTotal: value => `共 ${value} 条`, onChange: (nextPage, nextSize) => { setItemPage(nextPage); setItemPageSize(nextSize); void loadItems(selectedItemType, nextPage, nextSize); } }}
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前物品类型下暂无可领用物品" /> }}
          />}
        </section>
      </div>
    </Modal>

    <Modal className="requisition-detail-modal" title="查看-领用记录" width={820} open={detailOpen} onCancel={() => { setDetailOpen(false); setDetail(undefined); }} footer={<Button onClick={() => { setDetailOpen(false); setDetail(undefined); }}>关闭</Button>} destroyOnHidden>
      {detailLoading && !detail ? <Skeleton active /> : detail && <Descriptions bordered column={2} size="middle">
        <Descriptions.Item label="领用单号">{detail.requisitionNo}</Descriptions.Item><Descriptions.Item label="领用人">{detail.personnelName}</Descriptions.Item>
        <Descriptions.Item label="领用物品">{detail.itemName}</Descriptions.Item><Descriptions.Item label="物品类型">{detail.itemType}</Descriptions.Item>
        <Descriptions.Item label="规格">{detail.specification || "-"}</Descriptions.Item><Descriptions.Item label="单位">{detail.unit}</Descriptions.Item>
        <Descriptions.Item label="领用数量">{detail.quantity}</Descriptions.Item><Descriptions.Item label="库存管理"><Tag color={detail.manageStock === "MANAGED" ? "blue" : "default"}>{manageStockLabel(detail.manageStock)}</Tag></Descriptions.Item>
        <Descriptions.Item label="备注" span={2}><span className="requisition-remark">{detail.remark || "-"}</span></Descriptions.Item>
        <Descriptions.Item label="创建人">{detail.createdByName}</Descriptions.Item><Descriptions.Item label="创建时间">{displayDateTime(detail.createdAt)}</Descriptions.Item>
      </Descriptions>}
    </Modal>
  </>;
}

"use client";

import { DownloadOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { Alert, Button, Card, DatePicker, Descriptions, Empty, Form, Input, message, Modal, Select, Skeleton, Space, Table, Tag, Tooltip } from "antd";
import type { ColumnsType, TableRowSelection } from "antd/es/table/interface";
import type { Dayjs } from "dayjs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PersonnelRosterRow } from "@/lib/personnel-roster";

type Option = { label: string; value: string };
type Options = { brands: Option[]; departments: Option[]; positionLevels: Option[]; personnelStatuses: Option[]; canViewHeadquarters: boolean };
type StoreOption = { storeId: string; storeName: string; brandCode: string; brandName: string };
type DateRange = [Dayjs | null, Dayjs | null] | null;
type FilterForm = {
  nameKeyword?: string;
  mobileKeyword?: string;
  idCardKeyword?: string;
  belongingValue?: string;
  storeId?: string;
  departmentCode?: string;
  positionLevel?: string;
  personnelStatus?: string;
  birthdayPeriod?: string;
  joinRange?: DateRange;
  leaveRange?: DateRange;
  contractExpireRange?: DateRange;
};
type Filters = Record<string, string>;
type RequisitionHistoryRow = {
  id: string;
  requisitionNo: string;
  itemName: string;
  itemType: string;
  specification: string | null;
  unit: string;
  quantity: number;
  manageStock: "MANAGED" | "UNMANAGED";
  createdByName: string;
  createdAt: string;
};
type RequisitionHistory = {
  personnel: { personnelId: string; name: string; departmentStore: string | null; positionLevel: string };
  rows: RequisitionHistoryRow[];
};

const emptyFilters: Filters = {};
const emptyOptions: Options = { brands: [], departments: [], positionLevels: [], personnelStatuses: [], canViewHeadquarters: false };

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

function responseFileName(response: Response) {
  const encoded = response.headers.get("Content-Disposition")?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  return encoded ? decodeURIComponent(encoded) : "花名册一览表.xlsx";
}

function display(value: string | null | undefined) {
  return value || "-";
}

function addressCell(value: string | null) {
  if (!value) return "-";
  return <Tooltip title={value}><span className="personnel-roster-address">{value}</span></Tooltip>;
}

export function PersonnelRosterList({ permissions, initialRows = [], initialTotal = 0 }: { permissions: string[]; initialRows?: PersonnelRosterRow[]; initialTotal?: number }) {
  const [messageApi, contextHolder] = message.useMessage();
  const [form] = Form.useForm<FilterForm>();
  const [rows, setRows] = useState<PersonnelRosterRow[]>(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);
  const [exporting, setExporting] = useState(false);
  const [options, setOptions] = useState<Options>(emptyOptions);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [optionsError, setOptionsError] = useState<string>();
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [storeSearching, setStoreSearching] = useState(false);
  const storeSearchSequence = useRef(0);
  const [historyPersonnelId, setHistoryPersonnelId] = useState<string>();
  const [history, setHistory] = useState<RequisitionHistory>();
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string>();
  const historyRequestSequence = useRef(0);
  const belongingValue = Form.useWatch("belongingValue", form) || "";
  const selectedBrandCode = belongingValue.startsWith("BRAND:") ? belongingValue.slice(6) : "";
  const isHeadquarters = belongingValue === "HEADQUARTERS";
  const isBrand = Boolean(selectedBrandCode);
  const all = permissions.includes("*");
  const canExport = all || permissions.includes("statistics:roster:export") || permissions.includes("personnel:export");

  const loadOptions = useCallback(async () => {
    setOptionsLoading(true); setOptionsError(undefined);
    try {
      const response = await fetch("/api/statistics/personnel-roster/options", { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || "花名册筛选项加载失败，请稍后重试");
      setOptions(data);
    } catch (error) {
      setOptions(emptyOptions);
      setOptionsError(error instanceof Error ? error.message : "花名册筛选项加载失败，请稍后重试");
    } finally { setOptionsLoading(false); }
  }, []);

  useEffect(() => { void loadOptions(); }, [loadOptions]);

  const load = async (nextPage = page, nextPageSize = pageSize, nextFilters = filters) => {
    setLoading(true); setLoadError(false);
    const search = new URLSearchParams({ ...nextFilters, page: String(nextPage), pageSize: String(nextPageSize) });
    try {
      const response = await fetch(`/api/statistics/personnel-roster?${search}`, { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || "花名册数据加载失败，请稍后重试");
      setRows(data.rows || []); setTotal(data.total || 0); setPage(data.page || nextPage); setPageSize(data.pageSize || nextPageSize);
    } catch (error) {
      setLoadError(true);
      messageApi.error(error instanceof Error ? error.message : "花名册数据加载失败，请稍后重试");
    } finally { setLoading(false); }
  };

  const searchStores = async (keyword = "", brandCode = selectedBrandCode) => {
    const sequence = ++storeSearchSequence.current;
    setStoreSearching(true);
    try {
      const search = new URLSearchParams();
      if (keyword.trim()) search.set("keyword", keyword.trim());
      if (brandCode) search.set("brandCode", brandCode);
      const response = await fetch(`/api/statistics/personnel-roster/store-options?${search}`, { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || "门店数据加载失败，请稍后重试");
      if (sequence === storeSearchSequence.current) {
        const selectedId = form.getFieldValue("storeId");
        setStores(current => {
          const selected = current.find(item => item.storeId === selectedId);
          const next = data as StoreOption[];
          return selected && !next.some(item => item.storeId === selected.storeId) ? [selected, ...next] : next;
        });
      }
    } catch (error) {
      if (sequence === storeSearchSequence.current) {
        setStores([]);
        messageApi.error(error instanceof Error ? error.message : "门店数据加载失败，请稍后重试");
      }
    } finally { if (sequence === storeSearchSequence.current) setStoreSearching(false); }
  };

  const filtersFromForm = () => {
    const values = form.getFieldsValue();
    const next: Filters = {};
    (["nameKeyword", "mobileKeyword", "idCardKeyword", "storeId", "departmentCode", "positionLevel", "personnelStatus", "birthdayPeriod"] as const).forEach(key => {
      const value = values[key];
      if (typeof value === "string" && value.trim()) next[key] = value.trim();
    });
    if (values.belongingValue === "HEADQUARTERS") next.belonging = "HEADQUARTERS";
    else if (values.belongingValue?.startsWith("BRAND:")) { next.belonging = "BRAND"; next.brandCode = values.belongingValue.slice(6); }
    const ranges: Array<[DateRange | undefined, string, string]> = [
      [values.joinRange, "joinStartDate", "joinEndDate"],
      [values.leaveRange, "leaveStartDate", "leaveEndDate"],
      [values.contractExpireRange, "contractExpireStartDate", "contractExpireEndDate"],
    ];
    for (const [range, startKey, endKey] of ranges) {
      if (range?.[0]) next[startKey] = range[0].format("YYYY-MM-DD");
      if (range?.[1]) next[endKey] = range[1].format("YYYY-MM-DD");
    }
    return next;
  };

  const applyFilters = () => {
    const next = filtersFromForm();
    setFilters(next); setSelectedKeys([]);
    void load(1, pageSize, next);
  };

  const resetFilters = () => {
    form.resetFields(); setFilters(emptyFilters); setSelectedKeys([]); setStores([]);
    void load(1, pageSize, emptyFilters);
  };

  const exportRows = async () => {
    setExporting(true);
    try {
      const response = await fetch("/api/statistics/personnel-roster/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personnelIds: selectedKeys.length ? selectedKeys : undefined, filters: selectedKeys.length ? undefined : filters }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.message || "花名册导出失败，请稍后重试");
      }
      downloadBlob(await response.blob(), responseFileName(response));
      messageApi.success(`已导出${selectedKeys.length ? `所选 ${selectedKeys.length} 条` : `当前筛选结果 ${total} 条`}`);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "花名册导出失败，请稍后重试");
    } finally { setExporting(false); }
  };

  const loadRequisitionHistory = async (personnelId: string) => {
    const sequence = ++historyRequestSequence.current;
    setHistoryLoading(true); setHistoryError(undefined);
    try {
      const response = await fetch(`/api/statistics/personnel-roster/${encodeURIComponent(personnelId)}/requisitions`, { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || "领用记录加载失败，请稍后重试");
      if (sequence === historyRequestSequence.current) setHistory(data);
    } catch (error) {
      if (sequence === historyRequestSequence.current) setHistoryError(error instanceof Error ? error.message : "领用记录加载失败，请稍后重试");
    } finally { if (sequence === historyRequestSequence.current) setHistoryLoading(false); }
  };

  const openRequisitionHistory = (row: PersonnelRosterRow) => {
    if (!row.requisitionCount) return;
    setHistoryPersonnelId(row.personnelId); setHistory(undefined); setHistoryError(undefined);
    void loadRequisitionHistory(row.personnelId);
  };

  const closeRequisitionHistory = () => {
    historyRequestSequence.current += 1;
    setHistoryPersonnelId(undefined); setHistory(undefined); setHistoryError(undefined); setHistoryLoading(false);
  };

  const statusLabels = useMemo(() => new Map(options.personnelStatuses.map(option => [option.value, option.label])), [options.personnelStatuses]);
  const columns: ColumnsType<PersonnelRosterRow> = [
    { title: "姓名", dataIndex: "name", width: 110, fixed: "left" },
    { title: "手机号", dataIndex: "mobile", width: 140 },
    { title: "身份证", dataIndex: "idCard", width: 210 },
    { title: "员工生日", dataIndex: "birthday", width: 110, render: display },
    { title: "人员状态", dataIndex: "personnelStatus", width: 110, render: value => <Tag color={value === "ACTIVE" ? "success" : "default"}>{statusLabels.get(value) || (value === "ACTIVE" ? "在职" : "已离职")}</Tag> },
    { title: "入职时间", dataIndex: "joinDate", width: 120, render: display },
    { title: "岗位星级", dataIndex: "positionLevel", width: 150, render: display },
    { title: "人员归属", key: "belonging", width: 140, render: (_, row) => row.belongingType === "HEADQUARTERS" ? "总部" : display(row.brandName) },
    { title: "部门/店面", key: "departmentStore", width: 210, render: (_, row) => row.belongingType === "HEADQUARTERS" ? display(row.departmentName) : display(row.storeName) },
    { title: "离职日期", dataIndex: "leaveDate", width: 120, render: display },
    { title: "合同签署日期", dataIndex: "contractSignedDate", width: 140, render: display },
    { title: "合同年限", dataIndex: "contractTerm", width: 130, render: display },
    { title: "合同到期日", key: "contractExpireDate", width: 140, render: (_, row) => row.contractIndefinite ? "无固定期限" : display(row.contractExpireDate) },
    { title: "家庭住址", dataIndex: "registeredAddress", width: 220, render: addressCell },
    { title: "现住址", dataIndex: "currentAddress", width: 220, render: addressCell },
    { title: "领用历史", key: "requisitionHistory", width: 110, fixed: "right", render: (_, row) => <Button type="link" size="small" disabled={!row.requisitionCount} onClick={() => openRequisitionHistory(row)}>领用历史</Button> },
  ];
  const historyColumns: ColumnsType<RequisitionHistoryRow> = [
    { title: "领用单号", dataIndex: "requisitionNo", width: 145, fixed: "left" },
    { title: "领用物品", dataIndex: "itemName", width: 170, ellipsis: true },
    { title: "物品类型", dataIndex: "itemType", width: 150, ellipsis: true },
    { title: "规格", dataIndex: "specification", width: 130, render: display, ellipsis: true },
    { title: "单位", dataIndex: "unit", width: 80, render: display },
    { title: "领用数量", dataIndex: "quantity", width: 100, align: "right" },
    { title: "是否库存管理", dataIndex: "manageStock", width: 140, render: value => <Tag color={value === "MANAGED" ? "blue" : "default"}>{value === "MANAGED" ? "是" : "否"}</Tag> },
    { title: "创建人", dataIndex: "createdByName", width: 120, ellipsis: true },
    { title: "创建时间", dataIndex: "createdAt", width: 175 },
  ];
  const rowSelection: TableRowSelection<PersonnelRosterRow> = { selectedRowKeys: selectedKeys, preserveSelectedRowKeys: true, onChange: setSelectedKeys, fixed: true };
  const hasFilters = Object.keys(filters).length > 0;
  const belongingOptions = [
    { label: "全部", value: "" },
    ...(options.canViewHeadquarters ? [{ label: "总部", value: "HEADQUARTERS" }] : []),
    ...options.brands.map(option => ({ label: option.label, value: `BRAND:${option.value}` })),
  ];

  return <>
    {contextHolder}
    {optionsError && <Alert className="personnel-roster-alert" type="error" showIcon message={optionsError} action={<Button size="small" icon={<ReloadOutlined />} onClick={() => void loadOptions()}>重新加载</Button>} />}
    <Card className="personnel-roster-filter-card">
      <Form form={form} layout="vertical" initialValues={{ belongingValue: "" }} onFinish={applyFilters}>
        <div className="personnel-roster-filter-grid">
          <Form.Item label="姓名" name="nameKeyword"><Input allowClear maxLength={50} placeholder="请输入姓名" /></Form.Item>
          <Form.Item label="手机" name="mobileKeyword"><Input allowClear maxLength={30} placeholder="请输入手机号" /></Form.Item>
          <Form.Item label="身份证" name="idCardKeyword"><Input allowClear maxLength={30} placeholder="请输入身份证号码" /></Form.Item>
          <Form.Item label="人员归属" name="belongingValue"><Select loading={optionsLoading} options={belongingOptions} onChange={(value: string) => { if (value === "HEADQUARTERS") form.setFieldValue("storeId", undefined); if (value.startsWith("BRAND:")) form.setFieldValue("departmentCode", undefined); form.setFieldValue("storeId", undefined); setStores([]); }} /></Form.Item>
          <Form.Item label="店面" name="storeId"><Select allowClear showSearch filterOption={false} disabled={isHeadquarters} loading={storeSearching} placeholder="请输入店面名称" notFoundContent={storeSearching ? "搜索中..." : "暂无匹配门店"} onDropdownVisibleChange={open => { if (open) void searchStores(); }} onSearch={value => void searchStores(value)} options={stores.map(store => ({ label: store.storeName, value: store.storeId }))} /></Form.Item>
          <Form.Item label="部门" name="departmentCode"><Select allowClear disabled={isBrand} loading={optionsLoading} placeholder="全部" options={options.departments} /></Form.Item>
          <Form.Item label="岗位星级" name="positionLevel"><Select allowClear loading={optionsLoading} placeholder="全部" options={options.positionLevels} /></Form.Item>
          <Form.Item label="人员状态" name="personnelStatus"><Select allowClear loading={optionsLoading} placeholder="全部" options={options.personnelStatuses} /></Form.Item>
          <Form.Item label="生日" name="birthdayPeriod"><Select allowClear placeholder="请选择" options={[{ label: "本周", value: "THIS_WEEK" }, { label: "本月", value: "THIS_MONTH" }, { label: "本季度", value: "THIS_QUARTER" }, { label: "上周", value: "LAST_WEEK" }, { label: "上月", value: "LAST_MONTH" }, { label: "上季度", value: "LAST_QUARTER" }]} /></Form.Item>
          <Form.Item label="入职日期" name="joinRange"><DatePicker.RangePicker allowEmpty={[true, true]} format="YYYY-MM-DD" placeholder={["开始日期", "截止日期"]} /></Form.Item>
          <Form.Item label="离职日期" name="leaveRange"><DatePicker.RangePicker allowEmpty={[true, true]} format="YYYY-MM-DD" placeholder={["开始日期", "截止日期"]} /></Form.Item>
          <Form.Item label="合同到期日" name="contractExpireRange"><DatePicker.RangePicker allowEmpty={[true, true]} format="YYYY-MM-DD" placeholder={["开始日期", "截止日期"]} /></Form.Item>
          <div className="personnel-roster-filter-actions"><Space><Button onClick={resetFilters}>重置</Button><Button type="primary" htmlType="submit" icon={<SearchOutlined />} loading={loading}>查询</Button></Space></div>
        </div>
      </Form>
    </Card>

    <Card className="personnel-roster-list-card" title="花名册一览表">
      <div className="personnel-roster-toolbar"><span>已选择 <strong>{selectedKeys.length}</strong> 条</span>{canExport && <Button icon={<DownloadOutlined />} loading={exporting} onClick={() => void exportRows()}>{exporting ? "导出中..." : "批量导出"}</Button>}</div>
      {loadError ? <Alert type="error" showIcon message="花名册数据加载失败，请稍后重试" action={<Button size="small" onClick={() => void load()}>重新加载</Button>} /> : <Table<PersonnelRosterRow>
        rowKey="personnelId" dataSource={rows} columns={columns} rowSelection={rowSelection} loading={loading} scroll={{ x: 2400 }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={hasFilters ? <><div>没有找到符合当前条件的人员记录</div><small>请调整筛选条件后重试</small><div><Button type="link" onClick={resetFilters}>重置筛选</Button></div></> : "暂无人员档案"} /> }}
        pagination={{ current: page, pageSize, total, showSizeChanger: true, pageSizeOptions: [20, 50, 100], showTotal: value => `共 ${value} 条`, onChange: (nextPage, nextSize) => { void load(nextSize !== pageSize ? 1 : nextPage, nextSize, filters); } }}
      />}
    </Card>

    <Modal className="personnel-roster-history-modal" title="查看领用记录" width={1180} open={!!historyPersonnelId} onCancel={closeRequisitionHistory} footer={<Button onClick={closeRequisitionHistory}>关闭</Button>} destroyOnHidden>
      {historyLoading && !history ? <Skeleton active paragraph={{ rows: 7 }} /> : historyError ? <Alert type="error" showIcon message={historyError} action={<Button size="small" icon={<ReloadOutlined />} onClick={() => historyPersonnelId && void loadRequisitionHistory(historyPersonnelId)}>重新加载</Button>} /> : history && <>
        <Descriptions className="personnel-roster-history-overview" bordered size="small" column={3}>
          <Descriptions.Item label="领用人">{history.personnel.name}</Descriptions.Item>
          <Descriptions.Item label="所属部门/门店">{display(history.personnel.departmentStore)}</Descriptions.Item>
          <Descriptions.Item label="岗位职级">{display(history.personnel.positionLevel)}</Descriptions.Item>
        </Descriptions>
        <Table<RequisitionHistoryRow> className="personnel-roster-history-table" rowKey="id" size="small" columns={historyColumns} dataSource={history.rows} scroll={{ x: 1210, y: 430 }} pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: [10, 20, 50], showTotal: count => `共 ${count} 条` }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无领用记录" /> }} />
      </>}
    </Modal>
  </>;
}

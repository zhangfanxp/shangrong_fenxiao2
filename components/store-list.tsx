"use client";

import { PlusOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Cascader, Col, DatePicker, Descriptions, Divider, Drawer, Form, Input, message, Modal, Row, Select, Space, Tag, type FormProps } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { type Dayjs } from "dayjs";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import districtData from "@/District/pca-code.json";
import { DataTable } from "@/components/data-table";
import { StatusTag } from "@/components/status-tag";
import { displayDate } from "@/lib/format";
import { useBusinessDictionaries } from "@/hooks/use-business-dictionaries";

type Brand = { id: string; name: string };
type Contract = {
  id: string; recordNo: string; status: string; brandId: string; storeName: string; cooperationType: string;
  province?: string | null; city?: string | null; district?: string | null; address?: string | null; trialOpenDate?: string | null;
  ownerName: string; ownerPhone?: string | null; ownerIdNumber?: string | null;
};
type Store = {
  id: string; recordNo: string; contractId?: string; brandId: string; name: string; operationStatus: string; cooperationType: string;
  region?: string; supervisorName?: string; province?: string; city?: string; district?: string; address?: string;
  startDate?: string; endDate?: string; businessDistrict?: string; locationType?: string; trialOpenDate?: string;
  formalOpenDate?: string; managerName?: string; chefName?: string; ownerName?: string; ownerPhone?: string;
  ownerIdNumber?: string; createdAt: string; brand: Brand; contract?: Contract;
};
type Filters = { keyword: string; status: string; brandId: string; cooperationType: string; city: string; dates: [Dayjs | null, Dayjs | null] | null };
type StoreForm = {
  contractId?: string; brandId: string; name: string; cooperationType: string; operationStatus: string; region?: string; supervisorName?: string;
  location?: string[]; address?: string; startDate?: Dayjs; endDate?: Dayjs; businessDistrict?: string; locationType?: string;
  trialOpenDate?: Dayjs; formalOpenDate?: Dayjs; managerName?: string; chefName?: string; ownerName?: string;
  ownerPhone?: string; ownerIdNumber?: string;
};
type StaffRole = "supervisor" | "manager" | "chef";
type StaffMember = { id: string; realName: string; phone?: string | null; tags?: string | null };
type StaffPicker = { role: StaffRole; title: string; field: "supervisorName" | "managerName" | "chefName" };
type DistrictNode = { code: string; name: string; children?: DistrictNode[] };

const storeDictionaryCodes = ["BRAND", "COOPERATION_TYPE", "STORE_OPERATION_STATUS", "STORE_AREA", "LOCATION_TYPE"];
const emptyFilters: Filters = { keyword: "", status: "", brandId: "", cooperationType: "", city: "", dates: null };
const districtOptions = districtData as DistrictNode[];

function text(value?: string | null) { return value || "-"; }
function locationLabel(store: Pick<Store, "province" | "city" | "district">) { return [store.province, store.city, store.district].filter(Boolean).join(" ") || "-"; }
function cooperationLabel(value: string) { return value === "DIRECT" ? "直营店" : "加盟店"; }

export function StoreList() {
  const [messageApi, messageContextHolder] = message.useMessage();
  const { options: dictionaries, loading: dictionariesLoading, error: dictionariesError, reload: reloadDictionaries } = useBusinessDictionaries(storeDictionaryCodes);
  const statusOptions = [{ value: "", label: "全部运营状态" }, ...(dictionaries.STORE_OPERATION_STATUS || [])];
  const cooperationOptions = [{ value: "", label: "全部合作类型" }, ...(dictionaries.COOPERATION_TYPE || [])];
  const areaOptions = dictionaries.STORE_AREA || [];
  const locationTypeOptions = dictionaries.LOCATION_TYPE || [];
  const [rows, setRows] = useState<Store[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editing, setEditing] = useState<Store | null>(null);
  const [selected, setSelected] = useState<Store | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [contractModalOpen, setContractModalOpen] = useState(false);
  const [contractRows, setContractRows] = useState<Contract[]>([]);
  const [contractsLoading, setContractsLoading] = useState(false);
  const [contractsError, setContractsError] = useState(false);
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [staffPicker, setStaffPicker] = useState<StaffPicker | null>(null);
  const [staffRows, setStaffRows] = useState<StaffMember[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffError, setStaffError] = useState(false);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [form] = Form.useForm<StoreForm>();
  const cityOptions = useMemo(() => Array.from(new Set(districtOptions.flatMap((province) => (province.children || []).map((city) => city.name)))).map((city) => ({ value: city, label: city })), []);

  const load = async (nextFilters = filters) => {
    setLoading(true); setError(false);
    const params = new URLSearchParams();
    if (nextFilters.keyword.trim()) params.set("keyword", nextFilters.keyword.trim());
    if (nextFilters.status) params.set("status", nextFilters.status);
    if (nextFilters.brandId) params.set("brandId", nextFilters.brandId);
    if (nextFilters.cooperationType) params.set("cooperationType", nextFilters.cooperationType);
    if (nextFilters.city) params.set("city", nextFilters.city);
    if (nextFilters.dates?.[0]) params.set("startDate", nextFilters.dates[0].format("YYYY-MM-DD"));
    if (nextFilters.dates?.[1]) params.set("endDate", nextFilters.dates[1].format("YYYY-MM-DD"));
    try {
      const response = await fetch(`/api/stores?${params.toString()}`);
      if (!response.ok) throw new Error();
      setRows(await response.json());
    } catch { setError(true); } finally { setLoading(false); }
  };

  useEffect(() => { void load(emptyFilters); }, []);
  useEffect(() => { fetch("/api/brands").then((response) => response.ok ? response.json() : []).then(setBrands).catch(() => setBrands([])); }, []);

  const loadAvailableContracts = async () => {
    setContractsLoading(true); setContractsError(false);
    try {
      const response = await fetch("/api/stores/contracts");
      if (!response.ok) throw new Error();
      setContractRows(await response.json());
    } catch { setContractsError(true); } finally { setContractsLoading(false); }
  };
  const openContractModal = () => { setContractModalOpen(true); void loadAvailableContracts(); };
  const loadStaff = async (role: StaffRole) => {
    setStaffLoading(true); setStaffError(false);
    try {
      const response = await fetch(`/api/stores/staff?role=${role}`);
      if (!response.ok) throw new Error();
      setStaffRows(await response.json());
    } catch { setStaffError(true); } finally { setStaffLoading(false); }
  };
  const openStaffPicker = (picker: StaffPicker) => { setStaffPicker(picker); void loadStaff(picker.role); };
  const chooseStaff = (staff: StaffMember) => {
    if (!staffPicker) return;
    form.setFieldValue(staffPicker.field, staff.realName);
    setStaffPicker(null);
  };
  const chooseContract = (contract: Contract) => {
    setSelectedContract(contract);
    setSaveError(null);
    form.setFieldsValue({
      contractId: contract.id,
      brandId: contract.brandId,
      name: contract.storeName,
      cooperationType: contract.cooperationType,
      location: contract.province && contract.city && contract.district ? [contract.province, contract.city, contract.district] : undefined,
      address: contract.address ?? "",
      trialOpenDate: contract.trialOpenDate ? dayjs(contract.trialOpenDate) : undefined,
      ownerName: contract.ownerName,
      ownerPhone: contract.ownerPhone ?? "",
      ownerIdNumber: contract.ownerIdNumber ?? "",
    });
    setContractModalOpen(false);
  };
  const closeForm = () => { if (!saving) { setFormOpen(false); setEditing(null); setSelectedContract(null); setStaffPicker(null); setSaveError(null); form.resetFields(); } };
  const openCreate = () => {
    setEditing(null); setSelectedContract(null); setSaveError(null); form.resetFields();
    form.setFieldsValue({ cooperationType: "FRANCHISE", operationStatus: "PREPARING" });
    setFormOpen(true);
  };
  const openEdit = (store: Store) => {
    setEditing(store); setSelectedContract(store.contract || null); setSaveError(null);
    const trialOpenDate = store.contract ? store.contract.trialOpenDate : store.trialOpenDate;
    form.resetFields();
    form.setFieldsValue({
      ...store,
      contractId: store.contractId ?? "",
      brandId: store.contract?.brandId || store.brandId,
      name: store.contract?.storeName || store.name,
      cooperationType: store.contract?.cooperationType || store.cooperationType,
      location: store.contract
        ? (store.contract.province && store.contract.city && store.contract.district ? [store.contract.province, store.contract.city, store.contract.district] : undefined)
        : (store.province && store.city && store.district ? [store.province, store.city, store.district] : undefined),
      address: (store.contract ? store.contract.address : store.address) ?? "",
      startDate: store.startDate ? dayjs(store.startDate) : undefined,
      endDate: store.endDate ? dayjs(store.endDate) : undefined,
      trialOpenDate: trialOpenDate ? dayjs(trialOpenDate) : undefined,
      formalOpenDate: store.formalOpenDate ? dayjs(store.formalOpenDate) : undefined,
      ownerName: store.contract?.ownerName || store.ownerName,
      ownerPhone: (store.contract ? store.contract.ownerPhone : store.ownerPhone) ?? "",
      ownerIdNumber: (store.contract ? store.contract.ownerIdNumber : store.ownerIdNumber) ?? "",
    });
    setFormOpen(true);
  };
  const save = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      const values = await form.validateFields();
      const { location, startDate, endDate, trialOpenDate, formalOpenDate, ...rest } = values;
      const [province, city, district] = location?.length ? location : selectedContract ? [selectedContract.province, selectedContract.city, selectedContract.district] : [editing?.province, editing?.city, editing?.district];
      const response = await fetch(editing ? `/api/stores/${editing.id}` : "/api/stores", {
        method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...rest, province, city, district, startDate: startDate?.format("YYYY-MM-DD"), endDate: endDate?.format("YYYY-MM-DD"), trialOpenDate: trialOpenDate?.format("YYYY-MM-DD"), formalOpenDate: formalOpenDate?.format("YYYY-MM-DD") }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || (response.status === 401 ? "登录状态已失效，请重新登录" : "保存失败，服务器暂时无法处理请求，请稍后重试"));
      if (!data?.id) throw new Error("未收到保存结果，请刷新门店列表确认后再试");
      messageApi.success(editing ? "门店档案已更新" : "门店档案已新增");
      setFormOpen(false); setEditing(null); setSelectedContract(null); form.resetFields(); await load();
    } catch (error) {
      const validationError = error as Parameters<NonNullable<FormProps<StoreForm>["onFinishFailed"]>>[0] | null;
      const firstInvalidField = validationError?.errorFields?.[0];
      const errorMessage = firstInvalidField
        ? firstInvalidField.errors[0] || "请检查并补全表单中的必填信息"
        : error instanceof Error ? error.message : "保存失败，请稍后重试";
      setSaveError(errorMessage);
      messageApi.error(errorMessage);
      if (firstInvalidField) form.scrollToField(firstInvalidField.name, { behavior: "smooth", block: "center" });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const columns: ColumnsType<Store> = [
    { title: "门店编号", dataIndex: "recordNo", width: 150 },
    { title: "品牌", dataIndex: ["brand", "name"], width: 105 },
    { title: "门店名称", dataIndex: "name", width: 180, ellipsis: true },
    { title: "运营状态", dataIndex: "operationStatus", width: 110, render: (value) => <StatusTag value={value} /> },
    { title: "合同状态", width: 110, render: (_, row) => row.contract ? <StatusTag value={row.contract.status} /> : "未关联" },
    { title: "合作类型", dataIndex: "cooperationType", width: 105, render: cooperationLabel },
    { title: "所属区域", width: 180, render: (_, row) => locationLabel(row) },
    { title: "店长", dataIndex: "managerName", width: 100, render: text },
    { title: "正式营业日期", dataIndex: "formalOpenDate", width: 130, render: displayDate },
    { title: "创建日期", dataIndex: "createdAt", width: 120, render: displayDate },
    { title: "操作", fixed: "right", width: 120, render: (_, row) => <Space className="table-actions" size={0}><Button type="link" size="small" onClick={() => { setSelected(row); setDetailOpen(true); }}>查看</Button><Button type="link" size="small" onClick={() => openEdit(row)}>编辑</Button></Space> },
  ];

  return <>
    {messageContextHolder}
    {dictionariesError && <Alert style={{ marginBottom: 16 }} type="error" showIcon message="门店数据字典加载失败" description={dictionariesError} action={<Button size="small" onClick={() => void reloadDictionaries()}>重新加载</Button>} />}
    <Card style={{ marginBottom: 16 }}>
      <Space wrap>
        <Input placeholder="门店编号、名称、店长或业主" style={{ width: 245 }} value={filters.keyword} onChange={(event) => setFilters({ ...filters, keyword: event.target.value })} onPressEnter={() => void load()} />
        <Select style={{ width: 145 }} options={[{ value: "", label: "全部品牌" }, ...brands.map((brand) => ({ value: brand.id, label: brand.name }))]} value={filters.brandId} onChange={(brandId) => setFilters({ ...filters, brandId })} />
        <Select style={{ width: 145 }} loading={dictionariesLoading} disabled={!!dictionariesError} options={statusOptions} value={filters.status} onChange={(status) => setFilters({ ...filters, status })} />
        <Select style={{ width: 145 }} loading={dictionariesLoading} disabled={!!dictionariesError} options={cooperationOptions} value={filters.cooperationType} onChange={(cooperationType) => setFilters({ ...filters, cooperationType })} />
        <Select showSearch optionFilterProp="label" style={{ width: 145 }} options={[{ value: "", label: "全部城市" }, ...cityOptions]} value={filters.city} onChange={(city) => setFilters({ ...filters, city })} />
        <DatePicker.RangePicker placeholder={["正式营业开始", "正式营业结束"]} value={filters.dates} onChange={(dates) => setFilters({ ...filters, dates: dates as Filters["dates"] })} />
        <Button onClick={() => { setFilters(emptyFilters); void load(emptyFilters); }}>重置</Button><Button type="primary" onClick={() => void load()}>筛选</Button>
      </Space>
    </Card>
    <Card extra={<Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增门店</Button>}>
      <DataTable rowKey="id" columns={columns} dataSource={rows} loading={loading} pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100], showTotal: (total) => `共 ${total} 条` }} error={error} onRetry={() => void load()} />
    </Card>
    <Drawer title={editing ? "编辑门店" : "新增门店"} width={920} open={formOpen} onClose={closeForm} destroyOnHidden maskClosable={!saving} footer={saveError ? <Alert type="error" showIcon message={saveError} /> : null} extra={<Space><Button onClick={closeForm} disabled={saving}>取消</Button><Button type="primary" loading={saving} onClick={() => void save()}>保存</Button></Space>}>
      <Form form={form} layout="vertical">
        <Form.Item name="contractId" hidden><Input /></Form.Item>
        <FormHeading title="基础信息" />
        <Row gutter={16}><Col span={24}><Form.Item label="关联合同"><Space wrap><Button onClick={openContractModal}>选择合同</Button>{selectedContract ? <span>当前关联合同：{selectedContract.recordNo}</span> : <span className="store-form-hint">未关联合同，可直接维护门店档案。</span>}</Space></Form.Item></Col></Row>
        <Row gutter={16}><FormItem span={8} label="品牌" name="brandId" required><Select loading={dictionariesLoading} disabled={!!dictionariesError || !!selectedContract} placeholder="请选择品牌" options={brands.map((brand) => ({ value: brand.id, label: brand.name }))} /></FormItem><FormItem span={8} label="门店名称" name="name" required><Input disabled={!!selectedContract} maxLength={60} placeholder="请输入门店名称" /></FormItem><FormItem span={8} label="合作类型" name="cooperationType" required><Select loading={dictionariesLoading} disabled={!!dictionariesError || !!selectedContract} options={cooperationOptions.filter((option) => option.value)} /></FormItem></Row>
        <Row gutter={16}><FormItem span={8} label="运营状态" name="operationStatus" required><Select loading={dictionariesLoading} disabled={!!dictionariesError} options={statusOptions.filter((option) => option.value)} /></FormItem><FormItem span={8} label="营运大区" name="region"><Select allowClear loading={dictionariesLoading} disabled={!!dictionariesError} placeholder="请选择营运大区" options={areaOptions} /></FormItem><FormItem span={8} label="负责督导" name="supervisorName"><Input readOnly placeholder="请选择督导" addonAfter={<Button type="link" size="small" onClick={() => openStaffPicker({ role: "supervisor", title: "督导", field: "supervisorName" })}>选择</Button>} /></FormItem></Row>
        <FormHeading title="门店地址与商圈" />
        <Row gutter={16}><FormItem span={12} label="省 / 市 / 区县" name="location"><Cascader disabled={!!selectedContract} options={districtOptions} fieldNames={{ label: "name", value: "name", children: "children" }} placeholder="请选择门店所在地区" showSearch /></FormItem><FormItem span={12} label="详细地址" name="address"><Input disabled={!!selectedContract} maxLength={200} placeholder="请输入街道、门牌号等" /></FormItem></Row>
        <Row gutter={16}><FormItem span={8} label="商圈" name="businessDistrict"><Input maxLength={60} placeholder="如：静安寺商圈" /></FormItem><FormItem span={8} label="选址类型" name="locationType"><Select allowClear loading={dictionariesLoading} disabled={!!dictionariesError} placeholder="请选择门店位置类型" options={locationTypeOptions} /></FormItem></Row>
        {editing && !(editing.province && editing.city && editing.district) && (editing.city || editing.district) ? <div className="store-form-hint">该门店的历史区域为“{[editing.city, editing.district].filter(Boolean).join(" ")}”，如需调整，请重新选择完整的省、市、区县。</div> : null}
        <FormHeading title="经营周期" />
        <Row gutter={16}><FormItem span={6} label="筹备开始日期" name="startDate"><DatePicker style={{ width: "100%" }} /></FormItem><FormItem span={6} label="筹备结束日期" name="endDate"><DatePicker style={{ width: "100%" }} /></FormItem><FormItem span={6} label="试营业日期" name="trialOpenDate"><DatePicker disabled={!!selectedContract} style={{ width: "100%" }} /></FormItem><FormItem span={6} label="正式营业日期" name="formalOpenDate"><DatePicker style={{ width: "100%" }} /></FormItem></Row>
        <FormHeading title="人员与业主信息" />
        <Row gutter={16}><FormItem span={8} label="店长" name="managerName"><Input readOnly placeholder="请选择店长" addonAfter={<Button type="link" size="small" onClick={() => openStaffPicker({ role: "manager", title: "店长", field: "managerName" })}>选择</Button>} /></FormItem><FormItem span={8} label="厨师长" name="chefName"><Input readOnly placeholder="请选择厨师长" addonAfter={<Button type="link" size="small" onClick={() => openStaffPicker({ role: "chef", title: "厨师长", field: "chefName" })}>选择</Button>} /></FormItem><FormItem span={8} label="业主姓名" name="ownerName"><Input disabled={!!selectedContract} maxLength={30} /></FormItem></Row>
        <Row gutter={16}><FormItem span={8} label="业主联系电话" name="ownerPhone" rules={[{ pattern: /^$|^1\d{10}$/, message: "请输入正确的 11 位手机号码" }]}><Input disabled={!!selectedContract} maxLength={11} /></FormItem><FormItem span={8} label="业主身份证号" name="ownerIdNumber"><Input disabled={!!selectedContract} maxLength={30} /></FormItem></Row>
      </Form>
    </Drawer>
    <Drawer title="门店详情" width={840} open={detailOpen} onClose={() => setDetailOpen(false)} extra={selected ? <Button type="primary" onClick={() => { setDetailOpen(false); openEdit(selected); }}>编辑门店</Button> : null}>
      {selected && <StoreDetails store={selected} />}
    </Drawer>
    <Modal title="选择合同" open={contractModalOpen} onCancel={() => setContractModalOpen(false)} footer={<Button onClick={() => setContractModalOpen(false)}>取消</Button>} width={680} destroyOnHidden>
      {contractsError ? <Alert type="error" showIcon message="合同记录加载失败，请稍后重试" action={<Button size="small" onClick={() => void loadAvailableContracts()}>重新加载</Button>} /> : <DataTable rowKey="id" scroll={{ x: 620 }} loading={contractsLoading} dataSource={contractRows} pagination={{ pageSize: 10, showSizeChanger: false, showTotal: (total) => `共 ${total} 条未关联合同` }} columns={[
        { title: "合同编号", dataIndex: "recordNo", width: 150 },
        { title: "门店名称", dataIndex: "storeName", width: 190, ellipsis: true },
        { title: "签约业主", dataIndex: "ownerName", width: 120, ellipsis: true },
        { title: "操作", width: 80, render: (_, contract: Contract) => <Button type="link" size="small" onClick={() => chooseContract(contract)}>选择</Button> },
      ]} />}
    </Modal>
    <Modal title={staffPicker ? `${staffPicker.title}列表` : "人员列表"} open={!!staffPicker} onCancel={() => setStaffPicker(null)} footer={<Button onClick={() => setStaffPicker(null)}>取消</Button>} width={680} destroyOnHidden>
      {staffError ? <Alert type="error" showIcon message="人员记录加载失败，请稍后重试" action={<Button size="small" onClick={() => staffPicker && void loadStaff(staffPicker.role)}>重新加载</Button>} /> : <DataTable rowKey="id" scroll={{ x: 620 }} loading={staffLoading} dataSource={staffRows} pagination={{ pageSize: 10, showSizeChanger: false, showTotal: (total) => `共 ${total} 条` }} columns={[
        { title: "真实姓名", dataIndex: "realName", width: 140 },
        { title: "手机号码", dataIndex: "phone", width: 160, render: (value: string | null) => value || "-" },
        { title: "标签", dataIndex: "tags", width: 220, render: (value: string | null) => value ? <Space size={[4, 4]} wrap>{value.split("|").filter(Boolean).map((tag) => <Tag key={tag}>{tag}</Tag>)}</Space> : "-" },
        { title: "操作", width: 80, render: (_, staff: StaffMember) => <Button type="link" size="small" onClick={() => chooseStaff(staff)}>选择</Button> },
      ]} />}
    </Modal>
  </>;
}

function FormHeading({ title }: { title: string }) { return <div className="contract-form-heading">{title}</div>; }
function FormItem({ span, label, name, required, rules, children }: { span: number; label: string; name: keyof StoreForm; required?: boolean; rules?: object[]; children: ReactNode }) {
  return <Col span={span}><Form.Item label={label} name={name} rules={rules || (required ? [{ required: true, message: `请${label.includes("选择") ? "选择" : "填写"}${label}` }] : undefined)}>{children}</Form.Item></Col>;
}
function StoreDetails({ store }: { store: Store }) {
  return <>
    <Descriptions column={2} bordered size="small" items={[
      { key: "recordNo", label: "门店编号", children: store.recordNo }, { key: "status", label: "运营状态", children: <StatusTag value={store.operationStatus} /> },
      { key: "brand", label: "品牌", children: store.brand.name }, { key: "name", label: "门店名称", children: store.name },
      { key: "cooperation", label: "合作类型", children: cooperationLabel(store.cooperationType) }, { key: "contract", label: "关联合同", children: store.contract ? <>{store.contract.recordNo} <StatusTag value={store.contract.status} /></> : "未关联" },
      { key: "region", label: "营运大区", children: text(store.region) }, { key: "supervisor", label: "负责督导", children: text(store.supervisorName) },
      { key: "location", label: "省 / 市 / 区县", children: locationLabel(store) }, { key: "address", label: "详细地址", children: text(store.address) },
      { key: "businessDistrict", label: "商圈", children: text(store.businessDistrict) }, { key: "locationType", label: "选址类型", children: text(store.locationType) },
    ]} />
    <Divider orientation="left">经营周期</Divider>
    <Descriptions column={2} bordered size="small" items={[
      { key: "start", label: "筹备开始日期", children: displayDate(store.startDate) }, { key: "end", label: "筹备结束日期", children: displayDate(store.endDate) },
      { key: "trial", label: "试营业日期", children: displayDate(store.trialOpenDate) }, { key: "formal", label: "正式营业日期", children: displayDate(store.formalOpenDate) },
    ]} />
    <Divider orientation="left">人员与业主信息</Divider>
    <Descriptions column={2} bordered size="small" items={[
      { key: "manager", label: "店长", children: text(store.managerName) }, { key: "chef", label: "厨师长", children: text(store.chefName) },
      { key: "owner", label: "业主姓名", children: text(store.ownerName) }, { key: "ownerPhone", label: "业主联系电话", children: text(store.ownerPhone) },
      { key: "ownerId", label: "业主身份证号", children: text(store.ownerIdNumber) }, { key: "created", label: "创建日期", children: displayDate(store.createdAt) },
    ]} />
  </>;
}

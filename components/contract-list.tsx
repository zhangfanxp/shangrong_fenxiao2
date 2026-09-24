"use client";

import { MinusCircleOutlined, PlusOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Cascader, Checkbox, Col, DatePicker, Descriptions, Divider, Drawer, Form, Input, InputNumber, message, Modal, Row, Select, Space } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { type Dayjs } from "dayjs";
import { useEffect, useState, type ReactNode } from "react";
import districtData from "@/District/pca-code.json";
import { DataTable } from "@/components/data-table";
import { StatusTag } from "@/components/status-tag";
import { useBusinessDictionaries } from "@/hooks/use-business-dictionaries";
import { displayDate, displayMoney } from "@/lib/format";

type Brand = { id: string; name: string };
type Rebate = { id?: string; type: string; person: string; amount: number | string };
type Contract = {
  id: string; recordNo: string; brandId: string; storeName: string; status: string; cooperationType: string;
  archiveBox?: string; trialOpenDate?: string; contactName?: string; contactPhone?: string; ownerName: string;
  ownerPhone?: string; ownerIdNumber?: string; province?: string; city?: string; district?: string; address?: string; cooperationFee: number | string; brandFee: number | string;
  financeServiceFee: number | string; designFee: number | string; deposit: number | string; depositRecipient?: string;
  refundedDeposit: number | string; rebateType?: string; rebatePerson?: string; rebateAmount: number | string;
  startDate: string; endDate: string; remark?: string; createdAt: string; brand: Brand; rebates: Rebate[]; isExpiring?: boolean;
};
type Filters = { keyword: string; status: string; brandId: string; cooperationType: string; dates: [Dayjs | null, Dayjs | null] | null; expiringOnly: boolean };
type ContractForm = Omit<Contract, "id" | "recordNo" | "status" | "createdAt" | "brand" | "startDate" | "endDate" | "trialOpenDate" | "province" | "city" | "district" | "rebates"> & { status?: string; startDate: Dayjs; endDate: Dayjs; trialOpenDate?: Dayjs; location?: string[]; rebates?: Rebate[] };
type DistrictNode = { code: string; name: string; children?: DistrictNode[] };

const contractDictionaryCodes = ["BRAND", "CONTRACT_STATUS", "COOPERATION_TYPE", "REBATE_TYPE"];

const moneyProps = { min: 0, precision: 2, style: { width: "100%" as const }, addonAfter: "元" };
const emptyFilters: Filters = { keyword: "", status: "", brandId: "", cooperationType: "", dates: null, expiringOnly: false };
const districtOptions = districtData as DistrictNode[];

export function ContractList() {
  const { options: dictionaries, loading: dictionariesLoading, error: dictionariesError, reload: reloadDictionaries } = useBusinessDictionaries(contractDictionaryCodes);
  const statusOptions = [{ value: "", label: "全部合同状态" }, ...(dictionaries.CONTRACT_STATUS || [])];
  const cooperationOptions = [{ value: "", label: "全部合作类型" }, ...(dictionaries.COOPERATION_TYPE || [])];
  const rebateOptions = dictionaries.REBATE_TYPE || [];
  const [rows, setRows] = useState<Contract[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editing, setEditing] = useState<Contract | null>(null);
  const [selected, setSelected] = useState<Contract | null>(null);
  const [saving, setSaving] = useState(false);
  const [terminationOpen, setTerminationOpen] = useState(false);
  const [terminating, setTerminating] = useState<Contract | null>(null);
  const [terminatingSaving, setTerminatingSaving] = useState(false);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [form] = Form.useForm<ContractForm>();
  const [refundForm] = Form.useForm<{ refundedDeposit: number }>();

  const load = async (nextFilters = filters) => {
    setLoading(true); setError(false);
    const params = new URLSearchParams();
    if (nextFilters.keyword.trim()) params.set("keyword", nextFilters.keyword.trim());
    if (nextFilters.status) params.set("status", nextFilters.status);
    if (nextFilters.brandId) params.set("brandId", nextFilters.brandId);
    if (nextFilters.cooperationType) params.set("cooperationType", nextFilters.cooperationType);
    if (nextFilters.dates?.[0]) params.set("startDate", nextFilters.dates[0].format("YYYY-MM-DD"));
    if (nextFilters.dates?.[1]) params.set("endDate", nextFilters.dates[1].format("YYYY-MM-DD"));
    if (nextFilters.expiringOnly) params.set("expiringOnly", "true");
    try {
      const response = await fetch(`/api/contracts?${params.toString()}`);
      if (!response.ok) throw new Error();
      setRows(await response.json());
    } catch { setError(true); } finally { setLoading(false); }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initialFilters: Filters = {
      ...emptyFilters,
      status: params.get("status") === "EXPIRED" ? "EXPIRED" : "",
      expiringOnly: params.get("expiringOnly") === "true",
    };
    setFilters(initialFilters);
    void load(initialFilters);
  }, []);
  useEffect(() => { fetch("/api/brands").then((response) => response.ok ? response.json() : []).then(setBrands).catch(() => setBrands([])); }, []);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ cooperationType: "FRANCHISE", cooperationFee: 0, brandFee: 0, financeServiceFee: 0, designFee: 0, deposit: 0, refundedDeposit: 0, rebates: [] } as Partial<ContractForm>);
    setFormOpen(true);
  };
  const openEdit = (contract: Contract) => {
    setEditing(contract);
    form.resetFields();
    form.setFieldsValue({
      ...contract,
      trialOpenDate: contract.trialOpenDate ? dayjs(contract.trialOpenDate) : undefined,
      startDate: dayjs(contract.startDate),
      endDate: dayjs(contract.endDate),
      location: contract.province && contract.city && contract.district ? [contract.province, contract.city, contract.district] : undefined,
    } as ContractForm);
    setFormOpen(true);
  };
  const save = async () => {
    try {
      const values = await form.validateFields();
      const { startDate, endDate, trialOpenDate, location, refundedDeposit, rebates, ...rest } = values;
      const [province, city, district] = location?.length ? location : [editing?.province, editing?.city, editing?.district];
      setSaving(true);
      const response = await fetch(editing ? `/api/contracts/${editing.id}` : "/api/contracts", {
        method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...rest, province, city, district, rebates: rebates || [], startDate: startDate.format("YYYY-MM-DD"), endDate: endDate.format("YYYY-MM-DD"), trialOpenDate: trialOpenDate?.format("YYYY-MM-DD") }),
      });
      const data = await response.json();
      if (!response.ok) { message.error(data.message || "保存失败，请稍后重试"); return; }
      message.success(editing ? "合同已更新" : "合同已新增");
      setFormOpen(false); form.resetFields(); await load();
    } finally { setSaving(false); }
  };
  const updateStatus = (contract: Contract, status: "ACTIVE" | "TERMINATED", label: string) => {
    if (status === "TERMINATED") {
      setTerminating(contract);
      refundForm.setFieldsValue({ refundedDeposit: Number(contract.refundedDeposit) || 0 });
      setTerminationOpen(true);
      return;
    }
    Modal.confirm({
      title: `确认${label}？`, content: "合同生效后将进入履约状态。",
      okText: "确认", cancelText: "取消",
      onOk: async () => {
        const response = await fetch(`/api/contracts/${contract.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
        const data = await response.json();
        if (!response.ok) { message.error(data.message || "操作失败，请稍后重试"); return Promise.reject(); }
        message.success(`合同已${label}`); await load();
      },
    });
  };
  const terminate = async () => {
    if (!terminating) return;
    try {
      const { refundedDeposit } = await refundForm.validateFields();
      setTerminatingSaving(true);
      const response = await fetch(`/api/contracts/${terminating.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "TERMINATED", refundedDeposit }) });
      const data = await response.json();
      if (!response.ok) { message.error(data.message || "解约失败，请稍后重试"); return; }
      message.success("合同已解约，退回保证金已同步更新");
      setTerminationOpen(false); setTerminating(null); refundForm.resetFields(); await load();
    } finally { setTerminatingSaving(false); }
  };

  const columns: ColumnsType<Contract> = [
    { title: "合同编号", dataIndex: "recordNo", width: 150 },
    { title: "品牌", dataIndex: ["brand", "name"], width: 100 },
    { title: "门店名称", dataIndex: "storeName", width: 170, ellipsis: true },
    { title: "合同状态", dataIndex: "status", width: 120, render: (value) => <StatusTag value={value} /> },
    { title: "合作类型", dataIndex: "cooperationType", width: 100, render: (value) => value === "DIRECT" ? "直营店" : "加盟店" },
    { title: "签约业主", dataIndex: "ownerName", width: 100 },
    { title: "联系人", width: 150, render: (_, row) => row.contactName ? `${row.contactName}${row.contactPhone ? ` / ${row.contactPhone}` : ""}` : "-" },
    { title: "合同期限", width: 210, render: (_, row) => `${displayDate(row.startDate)} 至 ${displayDate(row.endDate)}` },
    { title: "合作费", dataIndex: "cooperationFee", width: 120, render: displayMoney },
    { title: "保证金", dataIndex: "deposit", width: 120, render: displayMoney },
    { title: "试营业日期", dataIndex: "trialOpenDate", width: 125, render: displayDate },
    { title: "档案盒号", dataIndex: "archiveBox", width: 110, render: (value) => value || "-" },
    { title: "创建日期", dataIndex: "createdAt", width: 120, render: displayDate },
    { title: "操作", fixed: "right", width: 210, render: (_, row) => <Space className="table-actions" size={0}>
      <Button type="link" size="small" onClick={() => { setSelected(row); setDetailOpen(true); }}>查看</Button>
      {row.status !== "TERMINATED" && <Button type="link" size="small" onClick={() => openEdit(row)}>编辑</Button>}
      {row.status === "PENDING" && <Button type="link" size="small" onClick={() => updateStatus(row, "ACTIVE", "生效")}>生效</Button>}
      {!["TERMINATED", "EXPIRED"].includes(row.status) && <Button type="link" danger size="small" onClick={() => updateStatus(row, "TERMINATED", "解约")}>解约</Button>}
    </Space> },
  ];

  return <>
    {dictionariesError && <Alert style={{ marginBottom: 16 }} type="error" showIcon message="合同数据字典加载失败" description={dictionariesError} action={<Button size="small" onClick={() => void reloadDictionaries()}>重新加载</Button>} />}
    <Card style={{ marginBottom: 16 }}>
      <Space wrap>
        <Input placeholder="合同编号、门店、业主或联系人" style={{ width: 240 }} value={filters.keyword} onChange={(event) => setFilters({ ...filters, keyword: event.target.value })} onPressEnter={() => void load()} />
        <Select style={{ width: 145 }} options={[{ value: "", label: "全部品牌" }, ...brands.map((brand) => ({ value: brand.id, label: brand.name }))]} value={filters.brandId} onChange={(brandId) => setFilters({ ...filters, brandId })} />
        <Select style={{ width: 135 }} loading={dictionariesLoading} disabled={!!dictionariesError} options={statusOptions} value={filters.status} onChange={(status) => setFilters({ ...filters, status })} />
        <Select style={{ width: 145 }} loading={dictionariesLoading} disabled={!!dictionariesError} options={cooperationOptions} value={filters.cooperationType} onChange={(cooperationType) => setFilters({ ...filters, cooperationType })} />
        <DatePicker.RangePicker placeholder={["合同开始日", "合同结束日"]} value={filters.dates} onChange={(dates) => setFilters({ ...filters, dates: dates as Filters["dates"] })} />
        <Checkbox checked={filters.expiringOnly} onChange={(event) => setFilters({ ...filters, expiringOnly: event.target.checked })}>仅展示即将到期记录</Checkbox>
        <Button onClick={() => { setFilters(emptyFilters); void load(emptyFilters); }}>重置</Button><Button type="primary" onClick={() => void load()}>筛选</Button>
      </Space>
    </Card>
    <Card extra={<Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增合同</Button>}>
      <DataTable rowKey="id" columns={columns} dataSource={rows} loading={loading} pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total) => `共 ${total} 条` }} error={error} onRetry={() => void load()} />
    </Card>
    <Drawer title={editing ? "编辑合同" : "新增合同"} width={900} open={formOpen} onClose={() => setFormOpen(false)} destroyOnHidden extra={<Space><Button onClick={() => setFormOpen(false)}>取消</Button><Button type="primary" loading={saving} onClick={() => void save()}>保存</Button></Space>}>
      <Form form={form} layout="vertical">
        <FormHeading title="合同与门店信息" />
        <Row gutter={16}><FormItem span={8} label="品牌" name="brandId" required><Select loading={dictionariesLoading} disabled={!!dictionariesError} placeholder="请选择品牌" options={brands.map((brand) => ({ value: brand.id, label: brand.name }))} /></FormItem><FormItem span={8} label="门店名称" name="storeName" required><Input maxLength={60} /></FormItem><FormItem span={8} label="合作类型" name="cooperationType" required><Select loading={dictionariesLoading} disabled={!!dictionariesError} options={cooperationOptions.filter((item) => item.value)} /></FormItem></Row>
        <Row gutter={16}><FormItem span={8} label="合同状态" name="status" required><Select loading={dictionariesLoading} disabled={!!dictionariesError} placeholder="请选择" options={statusOptions.filter((item) => item.value).map((item) => ({ ...item, disabled: item.value === "TERMINATED" }))} /></FormItem><FormItem span={8} label="档案盒号" name="archiveBox" required><Input maxLength={60} /></FormItem><FormItem span={8} label="试营业日期" name="trialOpenDate"><DatePicker style={{ width: "100%" }} /></FormItem></Row>
        <Row gutter={16}>
          <FormItem span={12} label="合同开始日期" name="startDate" required><DatePicker style={{ width: "100%" }} onChange={(date) => form.setFieldValue("endDate", date ? date.add(5, "year").subtract(1, "day") : undefined)} /></FormItem>
          <Col span={12}><Form.Item noStyle shouldUpdate={(previous, current) => previous.startDate !== current.startDate}>{() => {
            const startDate = form.getFieldValue("startDate") as Dayjs | undefined;
            return <Form.Item label="合同截止日期" name="endDate" dependencies={["startDate"]} rules={[
              { required: true, message: "请选择合同截止日期" },
              { validator: (_, value?: Dayjs) => !value || !startDate || !value.isBefore(startDate, "day") ? Promise.resolve() : Promise.reject(new Error("截止日期不能早于开始日期")) },
            ]}><DatePicker style={{ width: "100%" }} disabledDate={(date) => !!startDate && date.isBefore(startDate, "day")} /></Form.Item>;
          }}</Form.Item></Col>
        </Row>
        <FormHeading title="签约人及联系信息" />
        <Row gutter={16}><FormItem span={8} label="签约业主" name="ownerName" required><Input maxLength={30} /></FormItem><FormItem span={8} label="业主联系电话" name="ownerPhone"><Input maxLength={30} /></FormItem><FormItem span={8} label="业主身份证号" name="ownerIdNumber"><Input maxLength={30} /></FormItem></Row>
        <Row gutter={16}><FormItem span={12} label="经办人" name="contactName" required><Input maxLength={30} /></FormItem><FormItem span={12} label="经办人电话" name="contactPhone" required><Input maxLength={30} /></FormItem></Row>
        <FormHeading title="门店地址" />
        <Row gutter={16}><FormItem span={12} label="省 / 市 / 区县" name="location"><Cascader options={districtOptions} fieldNames={{ label: "name", value: "name", children: "children" }} placeholder="请选择门店所在地区" showSearch /></FormItem><FormItem span={12} label="详细地址" name="address"><Input maxLength={200} placeholder="请输入街道、门牌号等" /></FormItem></Row>
        <FormHeading title="合同费用与返利" />
        <Row gutter={16}><FormItem span={8} label="合作费" name="cooperationFee"><InputNumber {...moneyProps} /></FormItem><FormItem span={8} label="品牌使用费" name="brandFee"><InputNumber {...moneyProps} /></FormItem><FormItem span={8} label="财务服务费" name="financeServiceFee"><InputNumber {...moneyProps} /></FormItem></Row>
        <Row gutter={16}><FormItem span={8} label="设计费" name="designFee"><InputNumber {...moneyProps} /></FormItem><FormItem span={8} label="保证金" name="deposit"><InputNumber {...moneyProps} /></FormItem><FormItem span={8} label="保证金收款人" name="depositRecipient"><Input maxLength={30} /></FormItem></Row>
        <Row gutter={16}><Col span={8}><Form.Item label="已退保证金" name="refundedDeposit" extra="仅在解约时录入"><InputNumber {...moneyProps} disabled /></Form.Item></Col></Row>
        <FormHeading title="返利信息" />
        <Form.List name="rebates">{(fields, { add, remove }) => <>
          {fields.map((field, index) => <Row gutter={16} key={field.key} align="middle"><Col span={8}><Form.Item label={index === 0 ? "返利类型" : undefined} name={[field.name, "type"]} rules={[{ required: true, message: "请选择返利类型" }]}><Select loading={dictionariesLoading} disabled={!!dictionariesError} placeholder="请选择返利类型" options={rebateOptions} /></Form.Item></Col><Col span={7}><Form.Item label={index === 0 ? "返利人" : undefined} name={[field.name, "person"]} rules={[{ required: true, message: "请输入返利人" }]}><Input maxLength={30} /></Form.Item></Col><Col span={7}><Form.Item label={index === 0 ? "返利金额" : undefined} name={[field.name, "amount"]} rules={[{ required: true, message: "请输入返利金额" }]}><InputNumber {...moneyProps} /></Form.Item></Col><Col span={2} style={{ paddingTop: index === 0 ? 31 : 0 }}><Button type="text" danger icon={<MinusCircleOutlined />} aria-label="删除返利记录" onClick={() => remove(field.name)} /></Col></Row>)}
          <Button type="dashed" onClick={() => add({ amount: 0 })} block icon={<PlusOutlined />}>新增返利记录</Button>
        </>}</Form.List>
        <FormHeading title="备注" /><Form.Item label="备注信息" name="remark"><Input.TextArea rows={3} maxLength={500} showCount /></Form.Item>
      </Form>
    </Drawer>
    <Drawer title="查看合同" width={820} open={detailOpen} onClose={() => setDetailOpen(false)} extra={selected?.status !== "TERMINATED" ? <Button type="primary" onClick={() => { if (!selected) return; setDetailOpen(false); openEdit(selected); }}>编辑合同</Button> : null}>
      {selected && <ContractDetails contract={selected} statusOptions={statusOptions.filter((item) => item.value)} />}
    </Drawer>
    <Modal title="确认解约" open={terminationOpen} onCancel={() => { if (!terminatingSaving) { setTerminationOpen(false); setTerminating(null); } }} onOk={() => void terminate()} okText="确认解约" cancelText="取消" okButtonProps={{ danger: true, loading: terminatingSaving }} cancelButtonProps={{ disabled: terminatingSaving }} destroyOnHidden>
      <p>请录入本次退回的保证金金额，保存后将同步更新合同中的“已退保证金”。</p>
      <Form form={refundForm} layout="vertical"><Form.Item label="退回保证金金额" name="refundedDeposit" rules={[{ required: true, message: "请输入退回保证金金额" }, { validator: (_, value) => Number(value) <= Number(terminating?.deposit || 0) ? Promise.resolve() : Promise.reject(new Error("退回保证金不能大于合同保证金")) }]}><InputNumber {...moneyProps} max={Number(terminating?.deposit || 0)} /></Form.Item></Form>
    </Modal>
  </>;
}

function FormHeading({ title }: { title: string }) { return <div className="contract-form-heading">{title}</div>; }
function FormItem({ span, label, name, required, children }: { span: number; label: string; name: string; required?: boolean; children: ReactNode }) { return <Col span={span}><Form.Item label={label} name={name} rules={required ? [{ required: true, message: `请${label.startsWith("选择") ? "选择" : "填写"}${label}` }] : undefined}>{children}</Form.Item></Col>; }
function ContractDetails({ contract, statusOptions }: { contract: Contract; statusOptions: { value: string; label: string }[] }) {
  const cooperativeLabel = contract.cooperationType === "DIRECT" ? "直营店" : "加盟店";
  return <>
    <Descriptions column={2} bordered size="small" items={[
      { key: "recordNo", label: "合同编号", children: contract.recordNo }, { key: "status", label: "合同状态", children: <Select value={contract.status} options={statusOptions} disabled style={{ width: "100%" }} /> },
      { key: "brand", label: "品牌", children: contract.brand.name }, { key: "store", label: "门店名称", children: contract.storeName },
      { key: "type", label: "合作类型", children: cooperativeLabel }, { key: "archive", label: "档案盒号", children: contract.archiveBox || "-" },
      { key: "trial", label: "试营业日期", children: displayDate(contract.trialOpenDate) }, { key: "period", label: "合同期限", children: `${displayDate(contract.startDate)} 至 ${displayDate(contract.endDate)}` },
      { key: "owner", label: "签约业主", children: contract.ownerName }, { key: "ownerPhone", label: "业主联系电话", children: contract.ownerPhone || "-" },
      { key: "ownerId", label: "业主身份证号", children: contract.ownerIdNumber || "-" }, { key: "contact", label: "经办人", children: contract.contactName || "-" },
      { key: "contactPhone", label: "经办人电话", children: contract.contactPhone || "-" }, { key: "location", label: "省 / 市 / 区县", children: [contract.province, contract.city, contract.district].filter(Boolean).join(" ") || "-" },
      { key: "address", label: "详细地址", children: contract.address || "-" },
    ]} />
    <Divider orientation="left">合同费用与返利</Divider>
    <Descriptions column={2} bordered size="small" items={[
      { key: "cooperationFee", label: "合作费", children: displayMoney(contract.cooperationFee) }, { key: "brandFee", label: "品牌使用费", children: displayMoney(contract.brandFee) },
      { key: "financeFee", label: "财务服务费", children: displayMoney(contract.financeServiceFee) }, { key: "designFee", label: "设计费", children: displayMoney(contract.designFee) },
      { key: "deposit", label: "保证金", children: displayMoney(contract.deposit) }, { key: "recipient", label: "保证金收款人", children: contract.depositRecipient || "-" },
      { key: "refunded", label: "已退保证金", children: displayMoney(contract.refundedDeposit) },
      { key: "remark", label: "备注", span: 2, children: contract.remark || "-" },
    ]} />
    <Divider orientation="left">返利信息</Divider>
    {contract.rebates.length ? <Descriptions column={3} bordered size="small" items={contract.rebates.flatMap((rebate, index) => [
      { key: `${index}-type`, label: `返利类型 ${index + 1}`, children: rebate.type }, { key: `${index}-person`, label: "返利人", children: rebate.person }, { key: `${index}-amount`, label: "返利金额", children: displayMoney(rebate.amount) },
    ])} /> : "暂无返利记录"}
  </>;
}

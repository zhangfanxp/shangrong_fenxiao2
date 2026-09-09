"use client";

import { DeleteOutlined, DownloadOutlined, ExclamationCircleOutlined, MoreOutlined, PlusOutlined, UploadOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Checkbox, Col, DatePicker, Drawer, Dropdown, Empty, Form, Input, InputNumber, message as antdMessage, Modal, Row, Select, Space, Tag, Upload } from "antd";
import type { FormInstance, FormProps } from "antd";
import type { ColumnsType, TablePaginationConfig } from "antd/es/table";
import type { UploadFile } from "antd/es/upload/interface";
import dayjs, { type Dayjs } from "dayjs";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DataTable } from "@/components/data-table";
import { PersonnelDetails, type PersonnelDetail } from "@/components/personnel-details";
import { StatusTag } from "@/components/status-tag";

type Store = { id: string; name: string; operationStatus: string; managerName?: string; brand: { id: string; name: string } };
type PlatformUser = { id: string; username: string; realName: string; role: { name: string } };
type Personnel = PersonnelDetail;
type SelectOption = { label: string; value: string };
type Options = { organizations: string[]; departments: SelectOption[]; stores: Store[]; positions: ({ id: string } & SelectOption)[]; personnelStatuses: SelectOption[]; socialSecurityStatuses: SelectOption[]; users: PlatformUser[]; brandDayHours: Record<string, number> };
type Filters = { name: string; phone: string; idNumber: string; startDate: Dayjs | null; endDate: Dayjs | null; organization: string; status: string };
type PersonnelForm = { name: string; phone: string; idNumber: string; birthday?: Dayjs; status: "ACTIVE"; hireDate: Dayjs; positionLevel: string; organization: string; department?: string | null; storeId?: string | null; resignationDate?: Dayjs; contractSignDate: Dayjs; contractYears?: number | null; contractExpiryDate: Dayjs; homeAddress: string; currentAddress: string; supplementaryMaterial?: string; baseSalary: number; laborCost: number; workdayHours?: number | null; socialSecurity: "INSURED" | "AGREEMENT"; platformAccess?: "YES" | "NO"; platformUserId?: string; remark?: string; version?: number };

const emptyFilters: Filters = { name: "", phone: "", idNumber: "", startDate: null, endDate: null, organization: "", status: "" };
const dateText = (value?: string | null) => value ? dayjs(value).format("YYYY-MM-DD") : "-";
const apiDate = (value?: Dayjs | null) => value ? value.format("YYYY-MM-DD") : undefined;

export function PersonnelList({ permissions }: { permissions: string[] }) {
  // Render notifications within the React tree (static message rendering does not support React 19).
  const [message, messageContextHolder] = antdMessage.useMessage();
  const [saveError, setSaveError] = useState<string | null>(null);
  const saveInFlight = useRef(false);
  const all = permissions.includes("*"); const can = (action: string) => all || permissions.includes(`personnel:${action}`); const sensitive = can("sensitive");
  const [rows, setRows] = useState<Personnel[]>([]); const [total, setTotal] = useState(0); const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(10);
  const [filters, setFilters] = useState<Filters>(emptyFilters); const [applied, setApplied] = useState<Filters>(emptyFilters); const [loading, setLoading] = useState(true); const [error, setError] = useState(false);
  const [options, setOptions] = useState<Options>({ organizations: ["总部"], departments: [], stores: [], positions: [], personnelStatuses: [], socialSecurityStatuses: [], users: [], brandDayHours: {} }); const [optionsError, setOptionsError] = useState(false); const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false); const [editing, setEditing] = useState<Personnel | null>(null); const [detail, setDetail] = useState<Personnel | null>(null); const [saving, setSaving] = useState(false); const [formDirty, setFormDirty] = useState(false); const [discardOpen, setDiscardOpen] = useState(false); const [form] = Form.useForm<PersonnelForm>();
  const [action, setAction] = useState<{ kind: "salary" | "position" | "resign" | "issues"; row: Personnel } | null>(null); const [actionForm] = Form.useForm(); const [actionSaving, setActionSaving] = useState(false);
  const [importOpen, setImportOpen] = useState(false); const [importFiles, setImportFiles] = useState<UploadFile[]>([]); const [importing, setImporting] = useState(false); const [importResult, setImportResult] = useState<{ success: number; failed: number; errors: string[] } | null>(null); const [exporting, setExporting] = useState(false);

  const paramsFor = useCallback((source: Filters, nextPage: number, nextSize: number) => { const p = new URLSearchParams({ page: String(nextPage), pageSize: String(nextSize) }); (["name", "phone", "idNumber", "organization", "status"] as const).forEach(key => source[key] && p.set(key, source[key].trim())); if (source.startDate) p.set("startDate", source.startDate.format("YYYY-MM-DD")); if (source.endDate) p.set("endDate", source.endDate.format("YYYY-MM-DD")); return p; }, []);
  const load = useCallback(async (source = applied, nextPage = page, nextSize = pageSize) => { setLoading(true); setError(false); try { const response = await fetch(`/api/personnel?${paramsFor(source, nextPage, nextSize)}`); const result = await response.json(); if (!response.ok) throw new Error(result.message); setRows(result.rows); setTotal(result.total); setPage(result.page); setPageSize(result.pageSize); } catch (e) { setError(true); message.error(e instanceof Error ? e.message : "人员档案加载失败，请稍后重试"); } finally { setLoading(false); } }, [applied, page, pageSize, paramsFor, message]);
  const loadOptions = useCallback(async () => { setOptionsError(false); try { const response = await fetch("/api/personnel/options"); const result = await response.json(); if (!response.ok) throw new Error(result.message); setOptions(result); } catch { setOptionsError(true); message.error("人员数据字典、门店或平台用户数据加载失败，请稍后重试"); } }, [message]);
  useEffect(() => { void load(emptyFilters, 1, 10); void loadOptions(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const applyFilter = () => { if (filters.startDate && filters.endDate && filters.startDate.isAfter(filters.endDate, "day")) { message.error("入职开始日期不能晚于入职截止日期"); return; } const next = { ...filters, name: filters.name.trim(), phone: filters.phone.trim(), idNumber: filters.idNumber.trim() }; setApplied(next); setSelectedKeys([]); void load(next, 1, pageSize); };
  const reset = () => { setFilters(emptyFilters); setApplied(emptyFilters); setSelectedKeys([]); void load(emptyFilters, 1, pageSize); };
  const watchedOrganization = Form.useWatch("organization", form);
  const watchedStoreId = Form.useWatch("storeId", form);
  const filteredStores = useMemo(() => watchedOrganization && watchedOrganization !== "总部" ? options.stores.filter(item => item.brand.name === watchedOrganization) : options.stores, [options.stores, watchedOrganization]);
  const selectedStoreBrand = options.stores.find(item => item.id === watchedStoreId)?.brand.name;
  const configuredWorkdayHours = selectedStoreBrand && Object.prototype.hasOwnProperty.call(options.brandDayHours, selectedStoreBrand) ? options.brandDayHours[selectedStoreBrand] : undefined;

  const openCreate = () => { setSaveError(null); setEditing(null); setFormDirty(false); setDiscardOpen(false); form.resetFields(); form.setFieldsValue({ status: "ACTIVE", contractYears: null }); setDrawerOpen(true); };
  const openEdit = async (summary: Personnel) => {
    try {
      const response = await fetch(`/api/personnel/${summary.id}?mode=edit`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      const row = result as Personnel;
      const brandName = row.store?.brand.name;
      const configuredHours = brandName ? options.brandDayHours[brandName] : undefined;
      setEditing(row);
      setFormDirty(false);
      setDiscardOpen(false);
      form.setFieldsValue({
        name: row.name,
        phone: row.phone,
        idNumber: row.idNumber,
        birthday: row.birthday ? dayjs(`2000-${row.birthday}`) : undefined,
        status: "ACTIVE",
        hireDate: dayjs(row.hireDate),
        positionLevel: row.positionLevel,
        organization: row.organization,
        department: row.department ?? undefined,
        storeId: row.storeId || undefined,
        resignationDate: row.resignationDate ? dayjs(row.resignationDate) : undefined,
        contractSignDate: dayjs(row.contractSignDate),
        contractYears: row.contractYears ?? null,
        contractExpiryDate: dayjs(row.contractExpiryDate),
        homeAddress: row.homeAddress,
        currentAddress: row.currentAddress,
        supplementaryMaterial: row.supplementaryMaterial ?? undefined,
        baseSalary: Number(row.baseSalary),
        laborCost: Number(row.laborCost),
        workdayHours: row.workdayHours === null || row.workdayHours === undefined ? configuredHours : Number(row.workdayHours),
        socialSecurity: row.socialSecurity,
        platformAccess: row.platformAccess ?? undefined,
        platformUserId: row.platformUserId ?? undefined,
        remark: row.remark ?? undefined,
        version: row.version,
      });
      setDrawerOpen(true);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "人员档案加载失败");
    }
  };
  const openDetail = async (summary: Personnel) => { try { const response = await fetch(`/api/personnel/${summary.id}`); const result = await response.json(); if (!response.ok) throw new Error(result.message); setDetail(result); } catch (e) { message.error(e instanceof Error ? e.message : "人员档案加载失败"); } };
  const discardAndClose = () => { setSaveError(null); setDiscardOpen(false); setDrawerOpen(false); setFormDirty(false); form.resetFields(); };
  const closeDrawer = () => { if (saveInFlight.current) return; if (formDirty) setDiscardOpen(true); else discardAndClose(); };
  const onSaveFailed: FormProps<PersonnelForm>["onFinishFailed"] = ({ errorFields }) => {
    if (saveInFlight.current) return;
    const reason = errorFields[0]?.errors[0] || "请检查表单内容后重新保存";
    setSaveError(reason);
    message.error({ key: "personnel-save", content: reason });
  };
  const save = async (values: PersonnelForm) => {
    if (saveInFlight.current) return;
    saveInFlight.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      const payload = { ...values, birthday: values.birthday?.format("MM-DD") || null, hireDate: apiDate(values.hireDate), contractSignDate: apiDate(values.contractSignDate), contractExpiryDate: apiDate(values.contractExpiryDate), contractYears: values.contractYears ?? null, version: editing?.version };
      const response = await fetch(editing ? `/api/personnel/${editing.id}` : "/api/personnel", { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(typeof result?.message === "string" && result.message ? result.message : "保存失败，请稍后重试");
      if (!result?.id) throw new Error("保存结果异常，请刷新列表确认是否已保存");
      message.success({ key: "personnel-save", content: editing ? "人员档案保存成功" : "人员档案新增成功" });
      setDrawerOpen(false);
      setFormDirty(false);
      form.resetFields();
      await load();
      await loadOptions();
    } catch (e) {
      const reason = e instanceof Error ? e.message : "保存失败，请检查网络后重试";
      setSaveError(reason);
      message.error({ key: "personnel-save", content: reason });
    } finally {
      saveInFlight.current = false;
      setSaving(false);
    }
  };
  const onFormChange = (changed: Partial<PersonnelForm>, values: PersonnelForm) => { setFormDirty(true); if (changed.contractYears && values.contractSignDate) form.setFieldValue("contractExpiryDate", values.contractSignDate.add(changed.contractYears, "year").subtract(1, "day")); if (changed.contractSignDate && values.contractYears) form.setFieldValue("contractExpiryDate", changed.contractSignDate.add(values.contractYears, "year").subtract(1, "day")); if (changed.platformAccess === "NO") form.setFieldValue("platformUserId", undefined); if (changed.organization) { form.setFieldValue("department", undefined); form.setFieldValue("storeId", undefined); form.setFieldValue("workdayHours", undefined); } if (changed.storeId) { const brand = options.stores.find(item => item.id === changed.storeId)?.brand.name; const configuredHours = brand && Object.prototype.hasOwnProperty.call(options.brandDayHours, brand) ? options.brandDayHours[brand] : undefined; form.setFieldValue("workdayHours", configuredHours); } };

  const openAction = (kind: "salary" | "position" | "resign" | "issues", row: Personnel) => { setAction({ kind, row }); actionForm.resetFields(); if (kind === "salary") actionForm.setFieldsValue({ effectiveDate: dayjs() }); if (kind === "position") actionForm.setFieldsValue({ organization: row.organization, department: row.department, storeId: row.storeId, positionLevel: row.positionLevel, effectiveDate: dayjs() }); if (kind === "resign") actionForm.setFieldsValue({ resignationDate: dayjs(), disablePlatformUser: true }); if (kind === "issues") void fetch(`/api/personnel/${row.id}/issue-records`); };
  const submitAction = async () => { if (!action || action.kind === "issues") return; try { const values = await actionForm.validateFields(); setActionSaving(true); const route = action.kind === "salary" ? "salary-adjustment" : action.kind === "position" ? "position-transfer" : "resign"; const payload = { ...values, effectiveDate: apiDate(values.effectiveDate), resignationDate: apiDate(values.resignationDate) }; const response = await fetch(`/api/personnel/${action.row.id}/${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); const result = await response.json(); if (!response.ok) throw new Error(result.message); message.success(action.kind === "salary" ? "调薪成功，历史记录已保存" : action.kind === "position" ? "调岗成功，历史记录已保存" : "员工离职办理成功"); setAction(null); await load(); await loadOptions(); } catch (e) { if (e instanceof Error) message.error(e.message); } finally { setActionSaving(false); } };
  const remove = (row: Personnel) => Modal.confirm({ title: "确认删除人员档案？", icon: <ExclamationCircleOutlined />, content: "删除后该人员档案将不再出现在正常人员列表中，请确认是否继续。实际任职人员应优先使用离职流程。", okText: "确认删除", okButtonProps: { danger: true }, cancelText: "取消", onOk: async () => { const response = await fetch(`/api/personnel/${row.id}`, { method: "DELETE" }); const result = await response.json(); if (!response.ok) throw new Error(result.message); message.success(result.message); await load(); } });
  const exportRows = async () => { setExporting(true); try { const payload = { ids: selectedKeys.length ? selectedKeys : undefined, filters: selectedKeys.length ? undefined : { ...applied, startDate: apiDate(applied.startDate), endDate: apiDate(applied.endDate) } }; const response = await fetch("/api/personnel/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); if (!response.ok) { const result = await response.json(); throw new Error(result.message); } const blob = await response.blob(); downloadBlob(blob, `人员档案_${dayjs().format("YYYY-MM-DD")}.xlsx`); message.success(`已导出${selectedKeys.length ? `选中的${selectedKeys.length}条` : "当前筛选条件下全部"}人员档案`); } catch (e) { message.error(e instanceof Error ? e.message : "导出失败，请稍后重试"); } finally { setExporting(false); } };
  const startImport = async () => { const raw = importFiles[0]?.originFileObj; if (!raw) { message.error("请选择.xlsx文件"); return; } setImporting(true); setImportResult(null); try { const body = new FormData(); body.append("file", raw); const response = await fetch("/api/personnel/import", { method: "POST", body }); const result = await response.json(); if (!response.ok) throw new Error(result.message); setImportResult(result); message.success(`导入成功${result.success}条，失败${result.failed}条`); await load(); await loadOptions(); } catch (e) { message.error(e instanceof Error ? e.message : "导入失败，请稍后重试"); } finally { setImporting(false); } };

  const columns: ColumnsType<Personnel> = [
    { title: "记录编号", dataIndex: "recordNo", width: 135 }, { title: "姓名", dataIndex: "name", width: 90 }, { title: "入职时间", dataIndex: "hireDate", width: 115, render: dateText }, { title: "人员归属", dataIndex: "organization", width: 100 }, { title: "部门/店面", width: 180, render: (_, row) => row.organization === "总部" ? row.department || "-" : row.store?.name || "未安排门店" }, { title: "平台账号", width: 140, ellipsis: true, render: (_, row) => row.platformUser?.username || "-" }, { title: "人员状态", dataIndex: "status", width: 90, render: value => <StatusTag value={value === "ACTIVE" ? "ACTIVE_PERSONNEL" : value} /> },
    { title: "操作", fixed: "right", width: 190, render: (_, row) => <Space size={0} className="table-actions"><Button type="link" size="small" disabled={!can("edit") || row.status === "RESIGNED"} onClick={() => void openEdit(row)}>编辑</Button><Button type="link" size="small" disabled={!can("view")} onClick={() => void openDetail(row)}>查看</Button><Dropdown trigger={["click"]} menu={{ items: [{ key: "salary", label: "调薪", disabled: !can("salary") || row.status !== "ACTIVE" }, { key: "position", label: "调岗", disabled: !can("position") || row.status !== "ACTIVE" }, { key: "issues", label: "领用记录", disabled: !can("issues") }, { key: "resign", label: "离职", disabled: !can("resign") || row.status !== "ACTIVE" }, { type: "divider" }, { key: "delete", label: "删除", danger: true, disabled: !can("delete") }], onClick: ({ key }) => key === "delete" ? remove(row) : openAction(key as "salary" | "position" | "resign" | "issues", row) }}><Button type="link" size="small">更多 <MoreOutlined /></Button></Dropdown></Space> },
  ];
  const pagination: TablePaginationConfig = { current: page, pageSize, total, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100], showTotal: count => `共 ${count} 条`, onChange: (nextPage, nextSize) => void load(applied, nextPage, nextSize) };

  return <>
    {messageContextHolder}
    {optionsError && <Alert style={{ marginBottom: 16 }} type="warning" showIcon message="部分选项加载失败" description="总部部门、人员状态、岗位星级、社保情况、门店或平台用户暂不可用，请重新加载后再新增或编辑。" action={<Button size="small" onClick={() => void loadOptions()}>重新加载</Button>} />}
    <Card className="personnel-filter-card" style={{ marginBottom: 16 }}><div className="personnel-filter-grid"><Input placeholder="请输入姓名" value={filters.name} onChange={e => setFilters({ ...filters, name: e.target.value })} onPressEnter={applyFilter} /><Input placeholder="请输入手机号" value={filters.phone} maxLength={11} onChange={e => setFilters({ ...filters, phone: e.target.value.replace(/\D/g, "") })} onPressEnter={applyFilter} /><Input placeholder="请输入身份证号码" value={filters.idNumber} maxLength={18} onChange={e => setFilters({ ...filters, idNumber: e.target.value.toUpperCase() })} onPressEnter={applyFilter} /><DatePicker placeholder="入职开始日期" value={filters.startDate} onChange={value => setFilters({ ...filters, startDate: value })} /><DatePicker placeholder="入职截止日期" value={filters.endDate} onChange={value => setFilters({ ...filters, endDate: value })} /><Select value={filters.organization} options={[{ value: "", label: "全部人员归属" }, ...options.organizations.map(value => ({ value, label: value }))]} onChange={organization => setFilters({ ...filters, organization })} /><Select value={filters.status} options={[{ value: "", label: "全部人员状态" }, ...options.personnelStatuses]} onChange={status => setFilters({ ...filters, status })} /><Space><Button onClick={reset}>重置</Button><Button type="primary" onClick={applyFilter}>筛选</Button></Space></div></Card>
    <Card title={selectedKeys.length ? <span>人员记录 <Tag color="blue">已选择 {selectedKeys.length} 条</Tag></span> : "人员记录"} extra={<Space><Button icon={<UploadOutlined />} disabled={!can("import")} onClick={() => { setImportOpen(true); setImportResult(null); }}>批量导入</Button><Button icon={<DownloadOutlined />} loading={exporting} disabled={!can("export")} onClick={() => void exportRows()}>批量导出</Button><Button type="primary" icon={<PlusOutlined />} disabled={!can("create") || optionsError} onClick={openCreate}>新增人员</Button></Space>}>
      <DataTable<Personnel> rowKey="id" columns={columns} dataSource={rows} loading={loading} error={error} onRetry={() => void load()} pagination={pagination} rowSelection={{ selectedRowKeys: selectedKeys, preserveSelectedRowKeys: true, onChange: setSelectedKeys }} scroll={{ x: 1050 }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={Object.values(applied).some(Boolean) ? "没有找到符合当前条件的人员档案" : "当前还没有人员档案记录"}>{Object.values(applied).some(Boolean) ? <Button onClick={reset}>重置筛选</Button> : can("create") ? <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增人员</Button> : null}</Empty> }} />
    </Card>

    <Drawer title={editing ? "编辑人员档案" : "新增人员档案"} width={1120} open={drawerOpen} onClose={closeDrawer} destroyOnHidden maskClosable={!saving} extra={<Space><Button onClick={closeDrawer} disabled={saving}>取消</Button><Button type="primary" loading={saving} onClick={() => form.submit()}>保存</Button></Space>} footer={saveError ? <Alert type="error" showIcon role="alert" message="人员档案未保存" description={saveError} /> : null}>
      <Form name="personnel-editor" form={form} layout="vertical" disabled={saving} onValuesChange={(changed, values) => { setSaveError(null); onFormChange(changed, values); }} onFinish={save} onFinishFailed={onSaveFailed} scrollToFirstError={{ behavior: "smooth", block: "center", focus: true }} requiredMark>
        <FormHeading title="基础信息" /><Row gutter={16}>{editing && <FormField span={6} label="记录编号" name="recordNo"><Input disabled value={editing.recordNo} /></FormField>}<FormField span={6} label="姓名" name="name" required rules={[{ required: true, message: "请输入姓名" }, { max: 8, message: "姓名不能超过8个汉字" }]}><Input maxLength={8} placeholder="请输入姓名" /></FormField><FormField span={6} label="手机号" name="phone" required rules={[{ required: true, message: "请输入手机号" }, { pattern: /^1\d{10}$/, message: "请输入正确的11位手机号" }]}><Input maxLength={11} placeholder="请输入11位手机号" /></FormField><FormField span={6} label="身份证" name="idNumber" required rules={[{ required: true, message: "请输入身份证号码" }, { pattern: /^\d{17}[\dXx]$/, message: "请输入正确的身份证号码" }]}><Input maxLength={18} placeholder="请输入身份证号码" /></FormField><FormField span={6} label="员工生日" name="birthday"><DatePicker picker="date" format="MM-DD" placeholder="选择月、日" style={{ width: "100%" }} /></FormField><FormField span={6} label="人员状态" name="status" required><Select disabled options={options.personnelStatuses} /></FormField></Row>
        <FormHeading title="任职信息" /><Row gutter={16}><FormField span={6} label="入职时间" name="hireDate" required><DatePicker style={{ width: "100%" }} /></FormField><FormField span={6} label="所属岗位星级" name="positionLevel" required><Select placeholder="请选择" options={options.positions.map(item => ({ value: item.label, label: item.label }))} /></FormField><FormField span={6} label="人员归属" name="organization" required><Select placeholder="请选择" options={options.organizations.map(value => ({ value, label: value }))} /></FormField>{watchedOrganization === "总部" ? <FormField span={6} label="部门/店面" name="department" required><Select showSearch optionFilterProp="label" placeholder="请选择总部部门" options={options.departments} /></FormField> : <FormField span={6} label="部门/店面" name="storeId" required><Select showSearch optionFilterProp="label" placeholder="请选择有效门店" options={filteredStores.map(item => ({ value: item.id, label: `${item.name}（${item.brand.name}）` }))} /></FormField>}<FormField span={6} label="离职日期" name="resignationDate"><DatePicker disabled placeholder="由离职流程产生" style={{ width: "100%" }} /></FormField></Row>
        <FormHeading title="合同信息" /><Row gutter={16}><FormField span={8} label="合同签署日期" name="contractSignDate" required><DatePicker style={{ width: "100%" }} /></FormField><FormField span={8} label="合同年限" name="contractYears"><InputNumber min={1} max={50} suffix="年" style={{ width: "100%" }} placeholder="选填，请使用增加/减少按钮调整" /></FormField><FormField span={8} label="合同到期日" name="contractExpiryDate" required rules={[{ required: true, message: "请选择合同到期日" }, ({ getFieldValue }: { getFieldValue: (name: string) => Dayjs | undefined }) => ({ validator(_: unknown, value?: Dayjs) { const start = getFieldValue("contractSignDate"); return !value || !start || !value.isBefore(start, "day") ? Promise.resolve() : Promise.reject(new Error("合同到期日不能早于合同签署日期")); } })]}><DatePicker style={{ width: "100%" }} onChange={() => form.setFieldValue("contractYears", null)} /></FormField></Row>
        <FormHeading title="联系信息" /><Row gutter={16}><FormField span={12} label="家庭住址" name="homeAddress" required><Input maxLength={50} showCount placeholder="请输入家庭住址" /></FormField><FormField span={12} label="现住址" name="currentAddress" required><Input maxLength={50} showCount placeholder="请输入现住址" /></FormField></Row>
        <FormHeading title="薪资社保" /><Row gutter={16}><FormField span={6} label="基本工资" name="baseSalary" required><InputNumber min={0} precision={2} prefix="¥" style={{ width: "100%" }} /></FormField><FormField span={6} label="用工成本（元/天）" name="laborCost" required><InputNumber min={0} precision={2} prefix="¥" style={{ width: "100%" }} placeholder="请输入用工成本（元/天）" /></FormField><FormField span={6} label="工作日小时" name="workdayHours"><InputNumber min={0.01} max={24} precision={2} suffix="小时" style={{ width: "100%" }} placeholder={configuredWorkdayHours !== undefined ? `默认读取${selectedStoreBrand}配置，可修改` : "请输入工作日小时"} /></FormField><FormField span={6} label="社保情况" name="socialSecurity" required><Select placeholder="请选择" options={options.socialSecurityStatuses} /></FormField><FormField span={8} label="调薪历史" name="salaryHistory"><Input disabled value={editing?.salaryHistory.length ? `已有${editing.salaryHistory.length}条调薪记录` : "暂无调薪记录"} /></FormField></Row>
        <FormHeading title="其他信息" /><Row gutter={16}><FormField span={8} label="需补充材料" name="supplementaryMaterial"><Input.TextArea maxLength={50} showCount rows={2} /></FormField><FormField span={8} label="平台权限" name="platformAccess"><Select allowClear placeholder="请选择" options={[{ value: "YES", label: "有" }, { value: "NO", label: "无" }]} /></FormField><Form.Item noStyle shouldUpdate={(prev, next) => prev.platformAccess !== next.platformAccess}>{({ getFieldValue }) => getFieldValue("platformAccess") === "YES" ? <FormField span={8} label="平台用户" name="platformUserId" required><Select showSearch optionFilterProp="label" placeholder="选择已启用且未绑定的用户" options={[...(editing?.platformUser ? [{ value: editing.platformUser.id, label: `${editing.platformUser.username} / ${editing.platformUser.realName} / ${editing.platformUser.role.name}` }] : []), ...options.users.filter(user => user.id !== editing?.platformUserId).map(user => ({ value: user.id, label: `${user.username} / ${user.realName} / ${user.role.name}` }))]} /></FormField> : <Col span={8} />}</Form.Item><FormField span={12} label="备注信息" name="remark"><Input.TextArea maxLength={50} showCount rows={2} /></FormField></Row>
      </Form>
    </Drawer>
    <Modal title="当前人员档案尚未保存" open={discardOpen} zIndex={1300} onCancel={() => setDiscardOpen(false)} onOk={discardAndClose} okText="继续关闭" cancelText="返回编辑" okButtonProps={{ danger: true }} maskClosable={false} destroyOnHidden>
      关闭后修改内容将丢失，是否继续？
    </Modal>

    <Drawer title="查看人员档案" width={1000} open={!!detail} onClose={() => setDetail(null)} extra={<Button onClick={() => setDetail(null)}>关闭</Button>}>{detail && <PersonnelDetails row={detail} sensitive={sensitive} />}</Drawer>
    <ActionModal action={action} form={actionForm} options={options} saving={actionSaving} onCancel={() => setAction(null)} onOk={() => void submitAction()} />
    <Modal title="批量导入人员档案" width={720} open={importOpen} onCancel={() => setImportOpen(false)} onOk={() => void startImport()} okText="开始导入" cancelText="取消" confirmLoading={importing} okButtonProps={{ disabled: !importFiles.length }}>
      <Alert type="info" showIcon message="逐条校验，合法数据导入，错误数据返回明细" description="记录编号、创建人和创建时间由系统自动生成。模板规则与新增人员档案完全一致，仅支持 .xlsx 文件。" style={{ marginBottom: 16 }} />
      <Space direction="vertical" style={{ width: "100%" }} size="middle"><Button icon={<DownloadOutlined />} href="/api/personnel/import">下载导入模板</Button><Upload.Dragger accept=".xlsx" maxCount={1} fileList={importFiles} beforeUpload={() => false} onChange={({ fileList }) => { setImportFiles(fileList.slice(-1)); setImportResult(null); }}><p className="ant-upload-drag-icon"><UploadOutlined /></p><p>点击或拖拽 .xlsx 文件到此处</p></Upload.Dragger>{importResult && <Alert type={importResult.failed ? "warning" : "success"} showIcon message={`导入成功 ${importResult.success} 条，导入失败 ${importResult.failed} 条`} description={importResult.errors.length ? <div className="personnel-import-errors">{importResult.errors.map(item => <div key={item}>{item}</div>)}</div> : "全部数据导入成功"} />}</Space>
    </Modal>
  </>;
}

function FormHeading({ title }: { title: string }) { return <div className="contract-form-heading">{title}</div>; }
function FormField({ span, label, name, required, rules, children }: { span: number; label: string; name: string; required?: boolean; rules?: object[]; children: ReactNode }) { return <Col span={span}><Form.Item label={label} name={name} rules={rules || (required ? [{ required: true, message: `请填写或选择${label}` }] : undefined)}>{children}</Form.Item></Col>; }
function downloadBlob(blob: Blob, name: string) { const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url); }

function ActionModal({ action, form, options, saving, onCancel, onOk }: { action: { kind: "salary" | "position" | "resign" | "issues"; row: Personnel } | null; form: FormInstance; options: Options; saving: boolean; onCancel: () => void; onOk: () => void }) {
  const org = Form.useWatch("organization", form); if (!action) return null; const titles = { salary: "员工调薪", position: "员工调岗", resign: "员工离职", issues: "领用记录" }; const stores = org && org !== "总部" ? options.stores.filter(item => item.brand.name === org) : options.stores;
  return <Modal title={titles[action.kind]} width={action.kind === "position" ? 760 : 560} open onCancel={onCancel} onOk={onOk} okText={action.kind === "resign" ? "确认离职" : "保存"} okButtonProps={action.kind === "resign" ? { danger: true } : undefined} cancelText="取消" confirmLoading={saving} footer={action.kind === "issues" ? <Button onClick={onCancel}>关闭</Button> : undefined}>
    {action.kind === "issues" ? <Empty description="暂无领用记录" /> : <Form form={form} layout="vertical"><Alert type={action.kind === "resign" ? "warning" : "info"} showIcon style={{ marginBottom: 16 }} message={`${action.row.name} · ${action.row.organization === "总部" ? action.row.department || "-" : action.row.store?.name || "未安排门店"}`} description={action.kind === "salary" ? `当前基本工资：¥ ${Number(action.row.baseSalary).toFixed(2)}` : action.kind === "resign" && action.row.platformUser ? `该人员已关联平台账号 ${action.row.platformUser.username}，请确认账号处理方式。` : undefined} />
      {action.kind === "salary" && <Row gutter={16}><FormField span={12} label="调整后工资" name="newSalary" required><InputNumber min={0} precision={2} prefix="¥" style={{ width: "100%" }} /></FormField><FormField span={12} label="调薪日期" name="effectiveDate" required><DatePicker style={{ width: "100%" }} /></FormField><FormField span={24} label="调薪原因" name="reason" required><Input.TextArea maxLength={200} showCount /></FormField></Row>}
      {action.kind === "position" && <Row gutter={16}><FormField span={8} label="人员归属" name="organization" required><Select options={options.organizations.map(value => ({ value, label: value }))} onChange={() => { form.setFieldValue("department", undefined); form.setFieldValue("storeId", undefined); }} /></FormField>{org === "总部" ? <FormField span={8} label="部门/店面" name="department" required><Select showSearch optionFilterProp="label" options={options.departments} /></FormField> : <FormField span={8} label="部门/店面" name="storeId" required><Select showSearch optionFilterProp="label" options={stores.map(item => ({ value: item.id, label: item.name }))} /></FormField>}<FormField span={8} label="所属岗位星级" name="positionLevel" required><Select options={options.positions.map(item => ({ value: item.label, label: item.label }))} /></FormField><FormField span={8} label="生效日期" name="effectiveDate" required><DatePicker style={{ width: "100%" }} /></FormField><FormField span={16} label="变动原因" name="reason" required><Input maxLength={200} /></FormField></Row>}
      {action.kind === "resign" && <><Form.Item label="离职日期" name="resignationDate" rules={[{ required: true, message: "请选择离职日期" }]}><DatePicker style={{ width: "100%" }} /></Form.Item><Form.Item label="离职原因" name="reason" rules={[{ required: true, message: "请输入离职原因" }]}><Input.TextArea maxLength={200} showCount /></Form.Item>{action.row.platformUser && <Form.Item name="disablePlatformUser" valuePropName="checked"><Checkbox>同时禁用对应平台用户（推荐）</Checkbox></Form.Item>}</>}
    </Form>}
  </Modal>;
}

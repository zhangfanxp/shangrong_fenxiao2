"use client";

import { DeleteOutlined, DownloadOutlined, ExclamationCircleOutlined, MoreOutlined, PlusOutlined, UploadOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Checkbox, Col, DatePicker, Drawer, Dropdown, Empty, Form, Input, InputNumber, message as antdMessage, Modal, Row, Segmented, Select, Space, Table, Tag, Upload } from "antd";
import type { FormInstance, FormProps } from "antd";
import type { ColumnsType, TablePaginationConfig } from "antd/es/table";
import type { UploadFile } from "antd/es/upload/interface";
import dayjs, { type Dayjs } from "dayjs";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DataTable } from "@/components/data-table";
import { PersonnelDetails, type PersonnelDetail } from "@/components/personnel-details";
import { PersonnelLaborCostModal, requestPersonnelLaborCosts, type PersonnelLaborCostRow, type PersonnelLaborCostSource } from "@/components/personnel-labor-cost-modal";
import { StatusTag } from "@/components/status-tag";
import { createClientRequestId } from "@/lib/client-request-id";

type Store = { id: string; name: string; operationStatus: string; managerName?: string; workdayHours?: number | string | null; brand: { id: string; name: string } };
type PlatformUser = { id: string; username: string; realName: string; role: { name: string } };
type Personnel = PersonnelDetail;
type SelectOption = { label: string; value: string };
type Options = { organizations: string[]; departments: SelectOption[]; stores: Store[]; positions: ({ id: string } & SelectOption)[]; personnelStatuses: SelectOption[]; socialSecurityStatuses: SelectOption[]; users: PlatformUser[] };
type Filters = { name: string; phone: string; idNumber: string; startDate: Dayjs | null; endDate: Dayjs | null; organization: string; status: string };
type PersonnelForm = { name: string; phone: string; idNumber: string; birthday?: Dayjs; birthdayCalendar: "LUNAR" | "SOLAR"; status: "ACTIVE"; hireDate: Dayjs; positionLevel: string; organization: string; department?: string | null; storeId?: string | null; resignationDate?: Dayjs; contractSignDate: Dayjs; contractYears?: number | null; contractExpiryDate: Dayjs; homeAddress: string; currentAddress: string; supplementaryMaterial?: string; baseSalary: number; workdayHours?: number | null; socialSecurity: "INSURED" | "AGREEMENT"; platformAccess?: "YES" | "NO"; platformUserId?: string; remark?: string; version?: number };
type IssueRecord = { id: string; requisitionNo: string; requisitionDate: string; personnelName: string; itemName: string; specification: string | null; unit: string; quantity: number; returnedQuantity: number; returnableQuantity: number; manageStock: "MANAGED" | "UNMANAGED"; status: "NORMAL" | "REVOKED"; operatorName: string; operatedAt: string };
type ReturnForm = { quantity: number };
type OutstandingReturn = { requisitionId: string; requisitionNo: string; requisitionDate: string; itemName: string; specification: string | null; unit: string; requisitionQuantity: number; returnedQuantity: number; outstandingQuantity: number };

const emptyFilters: Filters = { name: "", phone: "", idNumber: "", startDate: null, endDate: null, organization: "", status: "" };
const dateText = (value?: string | null) => value ? dayjs(value).format("YYYY-MM-DD") : "-";
const apiDate = (value?: Dayjs | null) => value ? value.format("YYYY-MM-DD") : undefined;

export function PersonnelList({ permissions, currentUserName }: { permissions: string[]; currentUserName: string }) {
  // Render notifications within the React tree (static message rendering does not support React 19).
  const [message, messageContextHolder] = antdMessage.useMessage();
  const [saveError, setSaveError] = useState<string | null>(null);
  const saveInFlight = useRef(false);
  const all = permissions.includes("*"); const can = (action: string) => all || permissions.includes(`personnel:${action}`); const sensitive = can("sensitive");
  const [rows, setRows] = useState<Personnel[]>([]); const [total, setTotal] = useState(0); const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(10);
  const [filters, setFilters] = useState<Filters>(emptyFilters); const [applied, setApplied] = useState<Filters>(emptyFilters); const [loading, setLoading] = useState(true); const [error, setError] = useState(false);
  const [options, setOptions] = useState<Options>({ organizations: ["总部"], departments: [], stores: [], positions: [], personnelStatuses: [], socialSecurityStatuses: [], users: [] }); const [optionsError, setOptionsError] = useState(false); const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false); const [editing, setEditing] = useState<Personnel | null>(null); const [detail, setDetail] = useState<Personnel | null>(null); const [saving, setSaving] = useState(false); const [formDirty, setFormDirty] = useState(false); const [discardOpen, setDiscardOpen] = useState(false); const [form] = Form.useForm<PersonnelForm>();
  const [action, setAction] = useState<{ kind: "salary" | "position" | "resign" | "issues"; row: Personnel } | null>(null); const [actionForm] = Form.useForm(); const [actionSaving, setActionSaving] = useState(false);
  const [issueRows, setIssueRows] = useState<IssueRecord[]>([]); const [issuesLoading, setIssuesLoading] = useState(false); const [issuesError, setIssuesError] = useState<string | null>(null); const issueRequest = useRef(0);
  const [returnForm] = Form.useForm<ReturnForm>(); const [returningRecord, setReturningRecord] = useState<IssueRecord | null>(null); const [returnSaving, setReturnSaving] = useState(false); const [returnError, setReturnError] = useState<string | null>(null); const [returnRequestId, setReturnRequestId] = useState(""); const [returnOperationTime, setReturnOperationTime] = useState("");
  const [resignationReturns, setResignationReturns] = useState<OutstandingReturn[]>([]); const [resignationCheckLoading, setResignationCheckLoading] = useState(false); const [resignationCheckError, setResignationCheckError] = useState<string | null>(null); const resignationCheckRequest = useRef(0);
  const [importOpen, setImportOpen] = useState(false); const [importFiles, setImportFiles] = useState<UploadFile[]>([]); const [importing, setImporting] = useState(false); const [importResult, setImportResult] = useState<{ success: number; failed: number; errors: string[] } | null>(null); const [exporting, setExporting] = useState(false);
  const [currentLaborCosts, setCurrentLaborCosts] = useState<PersonnelLaborCostRow | null>(null); const [laborCostPreviewLoading, setLaborCostPreviewLoading] = useState(false); const [laborCostSource, setLaborCostSource] = useState<PersonnelLaborCostSource | null>(null);

  const paramsFor = useCallback((source: Filters, nextPage: number, nextSize: number) => { const p = new URLSearchParams({ page: String(nextPage), pageSize: String(nextSize) }); (["name", "phone", "idNumber", "organization", "status"] as const).forEach(key => source[key] && p.set(key, source[key].trim())); if (source.startDate) p.set("startDate", source.startDate.format("YYYY-MM-DD")); if (source.endDate) p.set("endDate", source.endDate.format("YYYY-MM-DD")); return p; }, []);
  const load = useCallback(async (source = applied, nextPage = page, nextSize = pageSize) => { setLoading(true); setError(false); try { const response = await fetch(`/api/personnel?${paramsFor(source, nextPage, nextSize)}`); const result = await response.json(); if (!response.ok) throw new Error(result.message); setRows(result.rows); setTotal(result.total); setPage(result.page); setPageSize(result.pageSize); } catch (e) { setError(true); message.error(e instanceof Error ? e.message : "人员档案加载失败，请稍后重试"); } finally { setLoading(false); } }, [applied, page, pageSize, paramsFor, message]);
  const loadOptions = useCallback(async () => { setOptionsError(false); try { const response = await fetch("/api/personnel/options"); const result = await response.json(); if (!response.ok) throw new Error(result.message); setOptions(result); } catch { setOptionsError(true); message.error("人员数据字典、门店或平台用户数据加载失败，请稍后重试"); } }, [message]);
  useEffect(() => { void load(emptyFilters, 1, 10); void loadOptions(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const applyFilter = () => { if (filters.startDate && filters.endDate && filters.startDate.isAfter(filters.endDate, "day")) { message.error("入职开始日期不能晚于入职截止日期"); return; } const next = { ...filters, name: filters.name.trim(), phone: filters.phone.trim(), idNumber: filters.idNumber.trim() }; setApplied(next); setSelectedKeys([]); void load(next, 1, pageSize); };
  const reset = () => { setFilters(emptyFilters); setApplied(emptyFilters); setSelectedKeys([]); void load(emptyFilters, 1, pageSize); };
  const watchedOrganization = Form.useWatch("organization", form);
  const watchedStoreId = Form.useWatch("storeId", form);
  const watchedBaseSalary = Form.useWatch("baseSalary", form);
  const watchedHireDate = Form.useWatch("hireDate", form);
  const filteredStores = useMemo(() => watchedOrganization && watchedOrganization !== "总部" ? options.stores.filter(item => item.brand.name === watchedOrganization) : options.stores, [options.stores, watchedOrganization]);
  const selectedStore = options.stores.find(item => item.id === watchedStoreId);

  useEffect(() => {
    if (!drawerOpen || watchedBaseSalary === null || watchedBaseSalary === undefined) { setCurrentLaborCosts(null); setLaborCostPreviewLoading(false); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const values = form.getFieldsValue();
      setLaborCostPreviewLoading(true);
      void requestPersonnelLaborCosts({ personnelId: editing?.id, draft: { name: values.name, phone: values.phone, baseSalary: Number(values.baseSalary), positionLevel: values.positionLevel, organization: values.organization, storeId: values.storeId ?? null, hireDate: apiDate(values.hireDate) ?? null, resignationDate: apiDate(values.resignationDate) ?? null } }, dayjs().year(), controller.signal)
        .then(result => setCurrentLaborCosts(result.rows[dayjs().month()] || null))
        .catch(reason => { if (!(reason instanceof DOMException && reason.name === "AbortError")) setCurrentLaborCosts(null); })
        .finally(() => { if (!controller.signal.aborted) setLaborCostPreviewLoading(false); });
    }, 200);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [drawerOpen, editing?.id, form, watchedBaseSalary, watchedHireDate, watchedStoreId]);

  const openCreate = () => { setSaveError(null); setEditing(null); setFormDirty(false); setDiscardOpen(false); form.resetFields(); form.setFieldsValue({ status: "ACTIVE", contractYears: null, birthdayCalendar: "LUNAR" }); setDrawerOpen(true); };
  const openEdit = async (summary: Personnel) => {
    try {
      const response = await fetch(`/api/personnel/${summary.id}?mode=edit`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      const row = result as Personnel;
      setEditing(row);
      setFormDirty(false);
      setDiscardOpen(false);
      form.setFieldsValue({
        name: row.name,
        phone: row.phone,
        idNumber: row.idNumber,
        birthday: row.birthday ? dayjs(`2000-${row.birthday}`) : undefined,
        birthdayCalendar: row.birthdayCalendar || "LUNAR",
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
        workdayHours: row.store?.workdayHours === null || row.store?.workdayHours === undefined ? null : Number(row.store.workdayHours),
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
  const openDetail = async (summary: Personnel) => { try { const response = await fetch(`/api/personnel/${summary.id}`); const result = await response.json(); if (!response.ok) throw new Error(result.message); setDetail(result); const salaryVisible = sensitive || can("salary") || can("edit"); if (salaryVisible) { try { const report = await requestPersonnelLaborCosts({ personnelId: summary.id }, dayjs().year()); const current = report.rows[dayjs().month()]; setDetail({ ...result, baseSalary: report.baseSalary === null ? "0" : String(report.baseSalary), dailyLaborCost: current?.dailyLaborCost ?? null, hourlyLaborCost: current?.hourlyLaborCost ?? null }); } catch (reason) { message.warning(reason instanceof Error ? reason.message : "用工成本加载失败"); } } } catch (e) { message.error(e instanceof Error ? e.message : "人员档案加载失败"); } };
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
  const onFormChange = (changed: Partial<PersonnelForm>, values: PersonnelForm) => { setFormDirty(true); if (changed.contractYears && values.contractSignDate) form.setFieldValue("contractExpiryDate", values.contractSignDate.add(changed.contractYears, "year").subtract(1, "day")); if (changed.contractSignDate && values.contractYears) form.setFieldValue("contractExpiryDate", changed.contractSignDate.add(values.contractYears, "year").subtract(1, "day")); if (changed.platformAccess === "NO") form.setFieldValue("platformUserId", undefined); if (changed.organization) { form.setFieldValue("department", undefined); form.setFieldValue("storeId", undefined); form.setFieldValue("workdayHours", undefined); } if (changed.storeId) { const hours = options.stores.find(item => item.id === changed.storeId)?.workdayHours; form.setFieldValue("workdayHours", hours === null || hours === undefined ? null : Number(hours)); } };

  const loadIssueRecords = useCallback(async (row: Personnel) => {
    const requestNumber = ++issueRequest.current;
    setIssueRows([]); setIssuesError(null); setIssuesLoading(true);
    try {
      const response = await fetch(`/api/personnel/${row.id}/issue-records`);
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || "领用记录加载失败，请稍后重试");
      if (requestNumber === issueRequest.current) setIssueRows(Array.isArray(result.rows) ? result.rows : []);
    } catch (error) {
      if (requestNumber === issueRequest.current) {
        const reason = error instanceof Error ? error.message : "领用记录加载失败，请稍后重试";
        setIssuesError(reason); message.error(reason);
      }
    } finally {
      if (requestNumber === issueRequest.current) setIssuesLoading(false);
    }
  }, [message]);
  const loadResignationReturnCheck = useCallback(async (row: Personnel) => {
    const requestNumber = ++resignationCheckRequest.current;
    setResignationReturns([]); setResignationCheckError(null); setResignationCheckLoading(true);
    try {
      const response = await fetch(`/api/personnel/${row.id}/resign`);
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || "离职物品返还情况检查失败，请稍后重试");
      if (requestNumber === resignationCheckRequest.current) setResignationReturns(Array.isArray(result.rows) ? result.rows : []);
    } catch (error) {
      if (requestNumber === resignationCheckRequest.current) {
        const reason = error instanceof Error ? error.message : "离职物品返还情况检查失败，请稍后重试";
        setResignationCheckError(reason); message.error(reason);
      }
    } finally {
      if (requestNumber === resignationCheckRequest.current) setResignationCheckLoading(false);
    }
  }, [message]);
  const openAction = (kind: "salary" | "position" | "resign" | "issues", row: Personnel) => {
    setAction({ kind, row }); actionForm.resetFields();
    if (kind === "salary") actionForm.setFieldsValue({ effectiveDate: dayjs() });
    if (kind === "position") actionForm.setFieldsValue({ organization: row.organization, department: row.department, storeId: row.storeId, positionLevel: row.positionLevel, effectiveDate: dayjs() });
    if (kind === "resign") { actionForm.setFieldsValue({ resignationDate: dayjs(), disablePlatformUser: true }); void loadResignationReturnCheck(row); }
    if (kind === "issues") void loadIssueRecords(row);
  };
  const closeReturn = () => { if (returnSaving) return; setReturningRecord(null); setReturnError(null); setReturnRequestId(""); setReturnOperationTime(""); returnForm.resetFields(); };
  const openReturn = (row: IssueRecord) => { setReturnError(null); setReturnRequestId(createClientRequestId()); setReturnOperationTime(dayjs().format("YYYY-MM-DD HH:mm:ss")); returnForm.resetFields(); setReturningRecord(row); };
  const saveReturn = async (values: ReturnForm) => {
    if (!action || action.kind !== "issues" || !returningRecord || returnSaving) return;
    const personnel = action.row;
    setReturnSaving(true); setReturnError(null);
    try {
      const response = await fetch(`/api/personnel/${personnel.id}/issue-records/${returningRecord.id}/return`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: returnRequestId, quantity: values.quantity }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || "物品返还失败，请稍后重试");
      message.success(result.inventoryUpdated ? `物品返还成功，库存已增加 ${values.quantity}${returningRecord.unit}` : "物品返还成功");
      setReturningRecord(null); setReturnRequestId(""); setReturnOperationTime(""); returnForm.resetFields();
      await loadIssueRecords(personnel);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "物品返还失败，请稍后重试";
      setReturnError(reason); message.error(reason);
    } finally {
      setReturnSaving(false);
    }
  };
  const closeAction = () => { if (returnSaving) return; issueRequest.current += 1; resignationCheckRequest.current += 1; setReturningRecord(null); setReturnError(null); setReturnRequestId(""); setReturnOperationTime(""); returnForm.resetFields(); setAction(null); setIssueRows([]); setIssuesError(null); setIssuesLoading(false); setResignationReturns([]); setResignationCheckError(null); setResignationCheckLoading(false); };
  const submitAction = async () => {
    if (!action || action.kind === "issues") return;
    if (action.kind === "resign" && (resignationCheckLoading || resignationCheckError || resignationReturns.length)) {
      message.warning(resignationReturns.length ? "请先返还全部离职需返还物品" : "请等待离职物品返还检查完成");
      return;
    }
    try {
      const values = await actionForm.validateFields(); setActionSaving(true);
      const route = action.kind === "salary" ? "salary-adjustment" : action.kind === "position" ? "position-transfer" : "resign";
      const payload = { ...values, effectiveDate: apiDate(values.effectiveDate), resignationDate: apiDate(values.resignationDate) };
      const response = await fetch(`/api/personnel/${action.row.id}/${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (action.kind === "resign" && Array.isArray(result.outstandingReturns)) { setResignationReturns(result.outstandingReturns); setResignationCheckError(null); }
        throw new Error(result.message || "操作失败，请稍后重试");
      }
      message.success(action.kind === "salary" ? "调薪成功，历史记录已保存" : action.kind === "position" ? "调岗成功，历史记录已保存" : "员工离职办理成功");
      setAction(null); setResignationReturns([]); setResignationCheckError(null); await load(); await loadOptions();
    } catch (e) { if (e instanceof Error) message.error(e.message); } finally { setActionSaving(false); }
  };
  const remove = (row: Personnel) => Modal.confirm({ title: "确认删除人员档案？", icon: <ExclamationCircleOutlined />, content: "删除后该人员档案将不再出现在正常人员列表中，请确认是否继续。实际任职人员应优先使用离职流程。", okText: "确认删除", okButtonProps: { danger: true }, cancelText: "取消", onOk: async () => { const response = await fetch(`/api/personnel/${row.id}`, { method: "DELETE" }); const result = await response.json(); if (!response.ok) throw new Error(result.message); message.success(result.message); await load(); } });
  const exportRows = async () => { setExporting(true); try { const payload = { ids: selectedKeys.length ? selectedKeys : undefined, filters: selectedKeys.length ? undefined : { ...applied, startDate: apiDate(applied.startDate), endDate: apiDate(applied.endDate) } }; const response = await fetch("/api/personnel/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); if (!response.ok) { const result = await response.json(); throw new Error(result.message); } const blob = await response.blob(); downloadBlob(blob, `人员档案_${dayjs().format("YYYY-MM-DD")}.xlsx`); message.success(`已导出${selectedKeys.length ? `选中的${selectedKeys.length}条` : "当前筛选条件下全部"}人员档案`); } catch (e) { message.error(e instanceof Error ? e.message : "导出失败，请稍后重试"); } finally { setExporting(false); } };
  const startImport = async () => { const raw = importFiles[0]?.originFileObj; if (!raw) { message.error("请选择.xlsx文件"); return; } setImporting(true); setImportResult(null); try { const body = new FormData(); body.append("file", raw); const response = await fetch("/api/personnel/import", { method: "POST", body }); const result = await response.json(); if (!response.ok) throw new Error(result.message); setImportResult(result); message.success(`导入成功${result.success}条，失败${result.failed}条`); await load(); await loadOptions(); } catch (e) { message.error(e instanceof Error ? e.message : "导入失败，请稍后重试"); } finally { setImporting(false); } };

  const columns: ColumnsType<Personnel> = [
    { title: "记录编号", dataIndex: "recordNo", width: 135 }, { title: "姓名", dataIndex: "name", width: 90 }, { title: "入职时间", dataIndex: "hireDate", width: 115, render: dateText }, { title: "人员归属", dataIndex: "organization", width: 100 }, { title: "部门/店面", width: 180, render: (_, row) => row.organization === "总部" ? row.department || "-" : row.store?.name || "未安排门店" }, { title: "平台账号", width: 140, ellipsis: true, render: (_, row) => row.platformUser?.username || "-" }, { title: "人员状态", dataIndex: "status", width: 90, render: value => <StatusTag value={value === "ACTIVE" ? "ACTIVE_PERSONNEL" : value} /> },
    { title: "操作", fixed: "right", width: 190, render: (_, row) => <Space size={0} className="table-actions"><Button type="link" size="small" disabled={!can("edit") || row.status === "RESIGNED"} onClick={() => void openEdit(row)}>编辑</Button><Button type="link" size="small" disabled={!can("view")} onClick={() => void openDetail(row)}>查看</Button><Dropdown trigger={["click"]} menu={{ items: [{ key: "salary", label: "调薪", disabled: !can("salary") || row.status !== "ACTIVE" }, { key: "position", label: "调岗", disabled: !can("position") || row.status !== "ACTIVE" }, { key: "issues", label: "领用记录", disabled: !can("issues") }, { key: "resign", label: "离职", disabled: !can("resign") || row.status !== "ACTIVE" }, { type: "divider" }, { key: "delete", label: "删除", danger: true, disabled: !can("delete") }], onClick: ({ key }) => key === "delete" ? remove(row) : openAction(key as "salary" | "position" | "resign" | "issues", row) }}><Button type="link" size="small">更多 <MoreOutlined /></Button></Dropdown></Space> },
  ];
  const pagination: TablePaginationConfig = { current: page, pageSize, total, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100], showTotal: count => `共 ${count} 条`, onChange: (nextPage, nextSize) => void load(applied, nextPage, nextSize) };
  const editorLaborCostSource = (): PersonnelLaborCostSource => {
    const values = form.getFieldsValue();
    return { personnelId: editing?.id, draft: { name: values.name, phone: values.phone, baseSalary: values.baseSalary ?? null, positionLevel: values.positionLevel, storeId: values.storeId ?? null, hireDate: apiDate(values.hireDate) ?? null, resignationDate: apiDate(values.resignationDate) ?? null } };
  };

  return <>
    {messageContextHolder}
    {optionsError && <Alert style={{ marginBottom: 16 }} type="warning" showIcon message="部分选项加载失败" description="总部部门、人员状态、岗位星级、社保情况、门店或平台用户暂不可用，请重新加载后再新增或编辑。" action={<Button size="small" onClick={() => void loadOptions()}>重新加载</Button>} />}
    <Card className="personnel-filter-card" style={{ marginBottom: 16 }}><div className="personnel-filter-grid"><Input placeholder="请输入姓名" value={filters.name} onChange={e => setFilters({ ...filters, name: e.target.value })} onPressEnter={applyFilter} /><Input placeholder="请输入手机号" value={filters.phone} maxLength={11} onChange={e => setFilters({ ...filters, phone: e.target.value.replace(/\D/g, "") })} onPressEnter={applyFilter} /><Input placeholder="请输入身份证号码" value={filters.idNumber} maxLength={18} onChange={e => setFilters({ ...filters, idNumber: e.target.value.toUpperCase() })} onPressEnter={applyFilter} /><DatePicker placeholder="入职开始日期" value={filters.startDate} onChange={value => setFilters({ ...filters, startDate: value })} /><DatePicker placeholder="入职截止日期" value={filters.endDate} onChange={value => setFilters({ ...filters, endDate: value })} /><Select value={filters.organization} options={[{ value: "", label: "全部人员归属" }, ...options.organizations.map(value => ({ value, label: value }))]} onChange={organization => setFilters({ ...filters, organization })} /><Select value={filters.status} options={[{ value: "", label: "全部人员状态" }, ...options.personnelStatuses]} onChange={status => setFilters({ ...filters, status })} /><Space><Button onClick={reset}>重置</Button><Button type="primary" onClick={applyFilter}>筛选</Button></Space></div></Card>
    <Card title={selectedKeys.length ? <span>人员记录 <Tag color="blue">已选择 {selectedKeys.length} 条</Tag></span> : "人员记录"} extra={<Space><Button icon={<UploadOutlined />} disabled={!can("import")} onClick={() => { setImportOpen(true); setImportResult(null); }}>批量导入</Button><Button icon={<DownloadOutlined />} loading={exporting} disabled={!can("export")} onClick={() => void exportRows()}>批量导出</Button><Button type="primary" icon={<PlusOutlined />} disabled={!can("create") || optionsError} onClick={openCreate}>新增人员</Button></Space>}>
      <DataTable<Personnel> rowKey="id" columns={columns} dataSource={rows} loading={loading} error={error} onRetry={() => void load()} pagination={pagination} rowSelection={{ selectedRowKeys: selectedKeys, preserveSelectedRowKeys: true, onChange: setSelectedKeys }} scroll={{ x: 1050 }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={Object.values(applied).some(Boolean) ? "没有找到符合当前条件的人员档案" : "当前还没有人员档案记录"}>{Object.values(applied).some(Boolean) ? <Button onClick={reset}>重置筛选</Button> : can("create") ? <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增人员</Button> : null}</Empty> }} />
    </Card>

    <Drawer title={editing ? "编辑人员档案" : "新增人员档案"} width={1120} open={drawerOpen} onClose={closeDrawer} destroyOnHidden maskClosable={!saving} extra={<Space><Button onClick={closeDrawer} disabled={saving}>取消</Button><Button type="primary" loading={saving} onClick={() => form.submit()}>保存</Button></Space>} footer={saveError ? <Alert type="error" showIcon role="alert" message="人员档案未保存" description={saveError} /> : null}>
      <Form name="personnel-editor" form={form} layout="vertical" disabled={saving} onValuesChange={(changed, values) => { setSaveError(null); onFormChange(changed, values); }} onFinish={save} onFinishFailed={onSaveFailed} scrollToFirstError={{ behavior: "smooth", block: "center", focus: true }} requiredMark>
        <FormHeading title="基础信息" /><Row gutter={16}>{editing && <FormField span={6} label="记录编号" name="recordNo"><Input disabled value={editing.recordNo} /></FormField>}<FormField span={6} label="姓名" name="name" required rules={[{ required: true, message: "请输入姓名" }, { max: 8, message: "姓名不能超过8个汉字" }]}><Input maxLength={8} placeholder="请输入姓名" /></FormField><FormField span={6} label="手机号" name="phone" required rules={[{ required: true, message: "请输入手机号" }, { pattern: /^1\d{10}$/, message: "请输入正确的11位手机号" }]}><Input maxLength={11} placeholder="请输入11位手机号" /></FormField><FormField span={6} label="身份证" name="idNumber" required rules={[{ required: true, message: "请输入身份证号码" }, { pattern: /^\d{17}[\dXx]$/, message: "请输入正确的身份证号码" }]}><Input maxLength={18} placeholder="请输入身份证号码" /></FormField><Col span={8}><Form.Item label="员工生日"><Space.Compact block><Form.Item name="birthdayCalendar" noStyle><Segmented options={[{ label: "农历", value: "LUNAR" }, { label: "公历", value: "SOLAR" }]} /></Form.Item><Form.Item name="birthday" noStyle><DatePicker picker="date" format="MM-DD" placeholder="选择月、日" style={{ flex: 1, minWidth: 0 }} /></Form.Item></Space.Compact></Form.Item></Col><FormField span={6} label="人员状态" name="status" required><Select disabled options={options.personnelStatuses} /></FormField></Row>
        <FormHeading title="任职信息" /><Row gutter={16}><FormField span={6} label="入职时间" name="hireDate" required><DatePicker style={{ width: "100%" }} /></FormField><FormField span={6} label="所属岗位星级" name="positionLevel" required><Select placeholder="请选择" options={options.positions.map(item => ({ value: item.label, label: item.label }))} /></FormField><FormField span={6} label="人员归属" name="organization" required><Select placeholder="请选择" options={options.organizations.map(value => ({ value, label: value }))} /></FormField>{watchedOrganization === "总部" ? <FormField span={6} label="部门/店面" name="department" required><Select showSearch optionFilterProp="label" placeholder="请选择总部部门" options={options.departments} /></FormField> : <FormField span={6} label="部门/店面" name="storeId" required><Select showSearch optionFilterProp="label" placeholder="请选择有效门店" options={filteredStores.map(item => ({ value: item.id, label: `${item.name}（${item.brand.name}）` }))} /></FormField>}<FormField span={6} label="离职日期" name="resignationDate"><DatePicker disabled placeholder="由离职流程产生" style={{ width: "100%" }} /></FormField></Row>
        <FormHeading title="合同信息" /><Row gutter={16}><FormField span={8} label="合同签署日期" name="contractSignDate" required><DatePicker style={{ width: "100%" }} /></FormField><FormField span={8} label="合同年限" name="contractYears"><InputNumber min={1} max={50} suffix="年" style={{ width: "100%" }} placeholder="选填，请使用增加/减少按钮调整" /></FormField><FormField span={8} label="合同到期日" name="contractExpiryDate" required rules={[{ required: true, message: "请选择合同到期日" }, ({ getFieldValue }: { getFieldValue: (name: string) => Dayjs | undefined }) => ({ validator(_: unknown, value?: Dayjs) { const start = getFieldValue("contractSignDate"); return !value || !start || !value.isBefore(start, "day") ? Promise.resolve() : Promise.reject(new Error("合同到期日不能早于合同签署日期")); } })]}><DatePicker style={{ width: "100%" }} onChange={() => form.setFieldValue("contractYears", null)} /></FormField></Row>
        <FormHeading title="联系信息" /><Row gutter={16}><FormField span={12} label="家庭住址" name="homeAddress" required><Input maxLength={50} showCount placeholder="请输入家庭住址" /></FormField><FormField span={12} label="现住址" name="currentAddress" required><Input maxLength={50} showCount placeholder="请输入现住址" /></FormField></Row>
        <FormHeading title="薪资社保" /><Row gutter={16}><FormField span={6} label="基本工资" name="baseSalary" required><InputNumber min={0} precision={2} prefix="¥" readOnly={Boolean(editing)} controls={!editing} title={editing ? "基本工资仅允许通过调薪操作修改" : undefined} style={{ width: "100%" }} /></FormField><Col span={6}><Form.Item label="用工日成本"><InputNumber value={currentLaborCosts?.dailyLaborCost ?? undefined} precision={2} prefix="¥" suffix="元/天" readOnly controls={false} placeholder={laborCostPreviewLoading ? "计算中…" : "暂无"} addonAfter={<Button type="link" size="small" onClick={() => setLaborCostSource(editorLaborCostSource())}>查看</Button>} style={{ width: "100%" }} /></Form.Item></Col><Col span={6}><Form.Item label="用工小时成本"><InputNumber value={currentLaborCosts?.hourlyLaborCost ?? undefined} precision={2} prefix="¥" suffix="元/小时" readOnly controls={false} placeholder={laborCostPreviewLoading ? "计算中…" : "暂无"} addonAfter={<Button type="link" size="small" onClick={() => setLaborCostSource(editorLaborCostSource())}>查看</Button>} style={{ width: "100%" }} /></Form.Item></Col><FormField span={6} label="工作日小时" name="workdayHours"><InputNumber precision={2} suffix="小时/日" readOnly controls={false} style={{ width: "100%" }} placeholder={selectedStore ? "关联门店尚未配置" : "请先选择关联门店"} /></FormField><FormField span={6} label="社保情况" name="socialSecurity" required><Select placeholder="请选择" options={options.socialSecurityStatuses} /></FormField><FormField span={8} label="调薪历史" name="salaryHistory"><Input disabled value={editing?.salaryHistory.length ? `已有${editing.salaryHistory.length}条调薪记录` : "暂无调薪记录"} /></FormField></Row>
        <FormHeading title="其他信息" /><Row gutter={16}><FormField span={8} label="需补充材料" name="supplementaryMaterial"><Input.TextArea maxLength={50} showCount rows={2} /></FormField><FormField span={8} label="平台权限" name="platformAccess"><Select allowClear placeholder="请选择" options={[{ value: "YES", label: "有" }, { value: "NO", label: "无" }]} /></FormField><Form.Item noStyle shouldUpdate={(prev, next) => prev.platformAccess !== next.platformAccess}>{({ getFieldValue }) => getFieldValue("platformAccess") === "YES" ? <FormField span={8} label="本平台用户" name="platformUserId" required><Select showSearch optionFilterProp="label" placeholder="选择已启用且未绑定的用户" options={[...(editing?.platformUser ? [{ value: editing.platformUser.id, label: `${editing.platformUser.username} / ${editing.platformUser.realName} / ${editing.platformUser.role.name}` }] : []), ...options.users.filter(user => user.id !== editing?.platformUserId).map(user => ({ value: user.id, label: `${user.username} / ${user.realName} / ${user.role.name}` }))]} /></FormField> : <Col span={8} />}</Form.Item><FormField span={12} label="备注信息" name="remark"><Input.TextArea maxLength={50} showCount rows={2} /></FormField></Row>
      </Form>
    </Drawer>
    <Modal title="当前人员档案尚未保存" open={discardOpen} zIndex={1300} onCancel={() => setDiscardOpen(false)} onOk={discardAndClose} okText="继续关闭" cancelText="返回编辑" okButtonProps={{ danger: true }} maskClosable={false} destroyOnHidden>
      关闭后修改内容将丢失，是否继续？
    </Modal>

    <Drawer title="查看人员档案" width={1000} open={!!detail} onClose={() => setDetail(null)} extra={<Button onClick={() => setDetail(null)}>关闭</Button>}>{detail && <PersonnelDetails row={detail} sensitive={sensitive || can("salary") || can("edit")} onViewLaborCosts={sensitive || can("salary") || can("edit") ? () => setLaborCostSource({ personnelId: detail.id }) : undefined} />}</Drawer>
    <PersonnelLaborCostModal source={laborCostSource} onClose={() => setLaborCostSource(null)} />
    <ActionModal action={action} form={actionForm} options={options} saving={actionSaving} issueRows={issueRows} issuesLoading={issuesLoading} issuesError={issuesError} canReturn={can("return")} resignationReturns={resignationReturns} resignationCheckLoading={resignationCheckLoading} resignationCheckError={resignationCheckError} onReturn={openReturn} onRetryIssues={() => { if (action?.kind === "issues") void loadIssueRecords(action.row); }} onRetryResignationCheck={() => { if (action?.kind === "resign") void loadResignationReturnCheck(action.row); }} onCancel={closeAction} onOk={() => void submitAction()} />
    <Modal title="物品返还" width={760} zIndex={1200} open={!!returningRecord} onCancel={closeReturn} onOk={() => returnForm.submit()} okText="保存" cancelText="取消" confirmLoading={returnSaving} closable={!returnSaving} maskClosable={false} destroyOnHidden>
      {returningRecord && <Form form={returnForm} layout="vertical" requiredMark disabled={returnSaving} onFinish={values => void saveReturn(values)}>
        {returnError && <Alert type="error" showIcon role="alert" message="物品返还未保存" description={returnError} style={{ marginBottom: 16 }} />}
        <Alert type="info" showIcon style={{ marginBottom: 16 }} message={returningRecord.manageStock === "MANAGED" ? "该物品管理库存，返还成功后库存将同步增加。" : "该物品不管理库存，返还成功后只记录返还明细。"} />
        <Row gutter={16}>
          <ReadOnlyField span={12} label="领用单号" value={returningRecord.requisitionNo} />
          <ReadOnlyField span={12} label="领用日期" value={returningRecord.requisitionDate} />
          <ReadOnlyField span={12} label="领用人" value={returningRecord.personnelName} />
          <ReadOnlyField span={12} label="物品名称" value={returningRecord.itemName} />
          <ReadOnlyField span={12} label="规格" value={returningRecord.specification || "-"} />
          <ReadOnlyField span={12} label="单位" value={returningRecord.unit} />
          <ReadOnlyField span={12} label="领用数量" value={String(returningRecord.quantity)} />
          <Col span={12}><Form.Item label="返还数量" name="quantity" extra={returningRecord.returnedQuantity ? `此前已返还 ${returningRecord.returnedQuantity}${returningRecord.unit}，当前最多可返还 ${returningRecord.returnableQuantity}${returningRecord.unit}` : `最多可返还 ${returningRecord.returnableQuantity}${returningRecord.unit}`} rules={[{ required: true, message: "请输入返还数量" }, { type: "number", min: 1, message: "返还数量必须大于0" }, { type: "number", max: returningRecord.returnableQuantity, message: `返还数量不能超过${returningRecord.returnableQuantity}${returningRecord.unit}` }]}><InputNumber min={1} max={returningRecord.returnableQuantity} precision={0} suffix={returningRecord.unit} style={{ width: "100%" }} placeholder="请输入返还数量" /></Form.Item></Col>
          <ReadOnlyField span={12} label="操作人" value={currentUserName} />
          <ReadOnlyField span={12} label="操作时间" value={returnOperationTime} />
        </Row>
      </Form>}
    </Modal>
    <Modal title="批量导入人员档案" width={720} open={importOpen} onCancel={() => setImportOpen(false)} onOk={() => importResult ? setImportOpen(false) : void startImport()} okText={importResult ? "关闭" : "开始导入"} cancelText="取消" confirmLoading={importing} okButtonProps={{ disabled: !importResult && !importFiles.length }}>
      <Alert type="info" showIcon message="逐条校验，合法数据导入，错误数据返回明细" description="模板表头已标注必填、选填和条件必填字段，红色 * 表示必填或条件必填。记录编号、创建人和创建时间由系统自动生成，仅支持 .xlsx 文件。" style={{ marginBottom: 16 }} />
      <Space direction="vertical" style={{ width: "100%" }} size="middle"><Button icon={<DownloadOutlined />} href="/api/personnel/import">下载导入模板</Button><Upload.Dragger accept=".xlsx" maxCount={1} fileList={importFiles} beforeUpload={() => false} onChange={({ fileList }) => { setImportFiles(fileList.slice(-1)); setImportResult(null); }}><p className="ant-upload-drag-icon"><UploadOutlined /></p><p>点击或拖拽 .xlsx 文件到此处</p></Upload.Dragger>{importResult && <Alert type={importResult.failed ? "warning" : "success"} showIcon message={`导入成功 ${importResult.success} 条，导入失败 ${importResult.failed} 条`} description={importResult.errors.length ? <div className="personnel-import-errors">{importResult.errors.map(item => <div key={item}>{item}</div>)}</div> : "全部数据导入成功"} />}</Space>
    </Modal>
  </>;
}

function FormHeading({ title }: { title: string }) { return <div className="contract-form-heading">{title}</div>; }
function FormField({ span, label, name, required, rules, children }: { span: number; label: string; name: string; required?: boolean; rules?: object[]; children: ReactNode }) { return <Col span={span}><Form.Item label={label} name={name} rules={rules || (required ? [{ required: true, message: `请填写或选择${label}` }] : undefined)}>{children}</Form.Item></Col>; }
function ReadOnlyField({ span, label, value }: { span: number; label: string; value: string }) { return <Col span={span}><Form.Item label={label}><Input value={value} disabled /></Form.Item></Col>; }
function downloadBlob(blob: Blob, name: string) { const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url); }

function ActionModal({ action, form, options, saving, issueRows, issuesLoading, issuesError, canReturn, resignationReturns, resignationCheckLoading, resignationCheckError, onReturn, onRetryIssues, onRetryResignationCheck, onCancel, onOk }: { action: { kind: "salary" | "position" | "resign" | "issues"; row: Personnel } | null; form: FormInstance; options: Options; saving: boolean; issueRows: IssueRecord[]; issuesLoading: boolean; issuesError: string | null; canReturn: boolean; resignationReturns: OutstandingReturn[]; resignationCheckLoading: boolean; resignationCheckError: string | null; onReturn: (row: IssueRecord) => void; onRetryIssues: () => void; onRetryResignationCheck: () => void; onCancel: () => void; onOk: () => void }) {
  const org = Form.useWatch("organization", form); if (!action) return null; const titles = { salary: "员工调薪", position: "员工调岗", resign: "员工离职", issues: "领用记录" }; const stores = org && org !== "总部" ? options.stores.filter(item => item.brand.name === org) : options.stores;
  const issueColumns: ColumnsType<IssueRecord> = [
    { title: "领用单号", dataIndex: "requisitionNo", width: 150 },
    { title: "领用日期", dataIndex: "requisitionDate", width: 115 },
    { title: "物品名称", dataIndex: "itemName", width: 150 },
    { title: "规格", dataIndex: "specification", width: 120, render: value => value || "-" },
    { title: "单位", dataIndex: "unit", width: 75 },
    { title: "数量", dataIndex: "quantity", width: 80 },
    { title: "已返还（数量）", dataIndex: "returnedQuantity", width: 130 },
    { title: "操作人", dataIndex: "operatorName", width: 110 },
    { title: "操作时间", dataIndex: "operatedAt", width: 170, render: value => dayjs(value).format("YYYY-MM-DD HH:mm:ss") },
    { title: "操作", fixed: "right", width: 110, render: (_, row) => <Button type="link" size="small" disabled={!canReturn || row.status !== "NORMAL" || row.returnableQuantity <= 0} title={!canReturn ? "无人员物品返还权限" : row.status !== "NORMAL" ? "已撤销的领用记录不能返还" : row.returnableQuantity <= 0 ? "该领用记录已全部返还" : `当前可返还${row.returnableQuantity}${row.unit}`} onClick={() => onReturn(row)}>物品返还</Button> },
  ];
  const resignationColumns: ColumnsType<OutstandingReturn> = [
    { title: "领用单号", dataIndex: "requisitionNo", width: 145 },
    { title: "领用日期", dataIndex: "requisitionDate", width: 110 },
    { title: "物品名称", dataIndex: "itemName", width: 140 },
    { title: "规格", dataIndex: "specification", width: 110, render: value => value || "-" },
    { title: "领用数量", dataIndex: "requisitionQuantity", width: 100, render: (value, row) => `${value}${row.unit}` },
    { title: "已返还", dataIndex: "returnedQuantity", width: 90, render: (value, row) => `${value}${row.unit}` },
    { title: "尚未返还", dataIndex: "outstandingQuantity", width: 100, render: (value, row) => <strong style={{ color: "#cf1322" }}>{value}{row.unit}</strong> },
  ];
  const resignationBlocked = action.kind === "resign" && (resignationCheckLoading || Boolean(resignationCheckError) || resignationReturns.length > 0);
  return <Modal title={titles[action.kind]} width={action.kind === "issues" ? 1240 : action.kind === "resign" ? 880 : action.kind === "position" ? 760 : 560} open onCancel={onCancel} onOk={onOk} okText={action.kind === "resign" ? "确认离职" : "保存"} okButtonProps={action.kind === "resign" ? { danger: true, disabled: resignationBlocked } : undefined} cancelText="取消" confirmLoading={saving} footer={action.kind === "issues" ? <Button onClick={onCancel}>关闭</Button> : undefined}>
    {action.kind === "issues" ? <><Alert type="info" showIcon style={{ marginBottom: 16 }} message={`${action.row.name} · ${action.row.organization === "总部" ? action.row.department || "-" : action.row.store?.name || "未安排门店"}`} description={!issuesLoading && !issuesError ? `共 ${issueRows.length} 条领用记录` : undefined} />{issuesError && <Alert type="error" showIcon style={{ marginBottom: 16 }} message={issuesError} action={<Button size="small" onClick={onRetryIssues}>重新加载</Button>} />}<Table<IssueRecord> rowKey="id" size="small" loading={issuesLoading} columns={issueColumns} dataSource={issueRows} scroll={{ x: 1310 }} pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: [10, 20, 50], showTotal: count => `共 ${count} 条` }} locale={{ emptyText: <Empty description="暂无领用记录" /> }} /></> : <Form form={form} layout="vertical"><Alert type={action.kind === "resign" ? "warning" : "info"} showIcon style={{ marginBottom: 16 }} message={`${action.row.name} · ${action.row.organization === "总部" ? action.row.department || "-" : action.row.store?.name || "未安排门店"}`} description={action.kind === "salary" ? `当前基本工资：¥ ${Number(action.row.baseSalary).toFixed(2)}` : action.kind === "resign" && action.row.platformUser ? `该人员已关联平台账号 ${action.row.platformUser.username}，请确认账号处理方式。` : undefined} />
      {action.kind === "resign" && (resignationCheckLoading ? <Alert type="info" showIcon style={{ marginBottom: 16 }} message="正在检查离职需返还物品，请稍候……" /> : resignationCheckError ? <Alert type="error" showIcon style={{ marginBottom: 16 }} message="暂时无法确认物品返还情况，不能办理离职" description={resignationCheckError} action={<Button size="small" onClick={onRetryResignationCheck}>重新检查</Button>} /> : resignationReturns.length ? <><Alert type="error" showIcon style={{ marginBottom: 12 }} message={`当前有 ${resignationReturns.length} 项离职需返还物品尚未全部返还`} description="“确认离职”已禁用。请先取消本次操作，在该人员的“领用记录”中完成下列物品返还，然后重新办理离职。" /><Table<OutstandingReturn> rowKey="requisitionId" size="small" columns={resignationColumns} dataSource={resignationReturns} pagination={false} scroll={{ x: 795 }} style={{ marginBottom: 16 }} /></> : <Alert type="success" showIcon style={{ marginBottom: 16 }} message="未发现尚未返还的离职需返还物品，可以办理离职。" />)}
      {action.kind === "salary" && <Row gutter={16}><FormField span={12} label="调整后工资" name="newSalary" required><InputNumber min={0} precision={2} prefix="¥" style={{ width: "100%" }} /></FormField><FormField span={12} label="调薪日期" name="effectiveDate" required><DatePicker style={{ width: "100%" }} /></FormField><FormField span={24} label="调薪原因" name="reason" required><Input.TextArea maxLength={200} showCount /></FormField></Row>}
      {action.kind === "position" && <Row gutter={16}><FormField span={8} label="人员归属" name="organization" required><Select options={options.organizations.map(value => ({ value, label: value }))} onChange={() => { form.setFieldValue("department", undefined); form.setFieldValue("storeId", undefined); }} /></FormField>{org === "总部" ? <FormField span={8} label="部门/店面" name="department" required><Select showSearch optionFilterProp="label" options={options.departments} /></FormField> : <FormField span={8} label="部门/店面" name="storeId" required><Select showSearch optionFilterProp="label" options={stores.map(item => ({ value: item.id, label: item.name }))} /></FormField>}<FormField span={8} label="所属岗位星级" name="positionLevel" required><Select options={options.positions.map(item => ({ value: item.label, label: item.label }))} /></FormField><FormField span={8} label="生效日期" name="effectiveDate" required><DatePicker style={{ width: "100%" }} /></FormField><FormField span={16} label="变动原因" name="reason" required><Input maxLength={200} /></FormField></Row>}
      {action.kind === "resign" && <><Form.Item label="离职日期" name="resignationDate" rules={[{ required: true, message: "请选择离职日期" }]}><DatePicker style={{ width: "100%" }} /></Form.Item><Form.Item label="离职原因" name="reason" rules={[{ required: true, message: "请输入离职原因" }]}><Input.TextArea maxLength={200} showCount /></Form.Item>{action.row.platformUser && <Form.Item name="disablePlatformUser" valuePropName="checked"><Checkbox>同时禁用对应平台用户（推荐）</Checkbox></Form.Item>}</>}
    </Form>}
  </Modal>;
}

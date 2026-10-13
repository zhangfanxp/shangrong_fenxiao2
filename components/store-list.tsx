"use client";

import { PlusOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Cascader, Col, DatePicker, Descriptions, Divider, Drawer, Empty, Form, Input, InputNumber, message, Modal, Row, Select, Skeleton, Space, Table, Tag, type FormProps } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { type Dayjs } from "dayjs";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import districtData from "@/District/pca-code.json";
import { DataTable } from "@/components/data-table";
import { PersonnelDetails, type PersonnelDetail } from "@/components/personnel-details";
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
  region?: string; supervisorUserId?: string; supervisorName?: string; province?: string; city?: string; district?: string; address?: string;
  startDate?: string; endDate?: string; businessDistrict?: string; locationType?: string; trialOpenDate?: string;
  formalOpenDate?: string; workdayHours?: number | string | null; partTimeLaborCost?: number | string | null; managerUserId?: string; managerName?: string; chefUserId?: string; chefName?: string; ownerName?: string; ownerPhone?: string;
  ownerIdNumber?: string; douyinLaikeName?: string; kuaishouName?: string; meituanManagerName?: string; meituanBusinessName?: string;
  createdAt: string; brand: Brand; contract?: Contract;
};
type Filters = { keyword: string; status: string; brandId: string; cooperationType: string; city: string; dates: [Dayjs | null, Dayjs | null] | null };
type StoreForm = {
  contractId?: string; brandId: string; name: string; cooperationType: string; operationStatus: string; region?: string; supervisorUserId?: string; supervisorName?: string;
  location?: string[]; address?: string; startDate?: Dayjs; endDate?: Dayjs; businessDistrict?: string; locationType?: string;
  trialOpenDate?: Dayjs; formalOpenDate?: Dayjs; workdayHours?: number; partTimeLaborCost?: number; managerName?: string; chefName?: string; ownerName?: string;
  ownerPhone?: string; ownerIdNumber?: string;
};
type StaffRole = "supervisor";
type StaffMember = { id: string; realName: string; phone?: string | null; tags?: string | null };
type StaffPicker = { role: StaffRole; title: string; field: "supervisorName"; idField: "supervisorUserId" };
type AliasForm = { douyinLaikeName: string; kuaishouName: string; meituanManagerName: string; meituanBusinessName: string };
type AliasMode = "view" | "edit";
type CostForm = { storeRent: number; employeeWages: number; dormitoryRent: number; propertyFee: number; utilitiesFee: number; otherCost: number; ratioCoefficient: number };
type StoreCostData = { id: string; recordNo: string; name: string; storeRent: string; employeeWages: string; dormitoryRent: string; propertyFee: string; utilitiesFee: string; otherCost: string; ratioCoefficient: string; monthlyBreakEvenRevenue: string | null };
type CostMode = "view" | "edit";
type StoreEmployee = { id: string; recordNo: string; name: string; phone: string; phoneMasked?: string; positionLevel: string; laborCost: string; storeId: string | null; platformUserId?: string | null; platformUser?: { role: { name: string } } | null };
type StoreEmployeeData = { id: string; recordNo: string; name: string; managerName?: string | null; chefName?: string | null; employees: StoreEmployee[] };
type EmployeeMode = "view" | "edit";
type EmployeeFilters = { name: string; positionLevels: string[] };
type DistrictNode = { code: string; name: string; children?: DistrictNode[] };

const storeDictionaryCodes = ["BRAND", "COOPERATION_TYPE", "STORE_OPERATION_STATUS", "STORE_AREA", "LOCATION_TYPE", "POSITION_LEVEL"];
const emptyFilters: Filters = { keyword: "", status: "", brandId: "", cooperationType: "", city: "", dates: null };
const emptyEmployeeFilters: EmployeeFilters = { name: "", positionLevels: [] };
const districtOptions = districtData as DistrictNode[];

function text(value?: string | null) { return value || "-"; }
function money(value: string | number) { return `¥ ${Number(value).toFixed(2)}`; }
function calculateMonthlyBreakEvenRevenue(value: Partial<CostForm>) {
  const ratio = Number(value.ratioCoefficient);
  if (!Number.isFinite(ratio) || ratio <= 0) return null;
  const total = [value.storeRent, value.employeeWages, value.dormitoryRent, value.propertyFee, value.utilitiesFee, value.otherCost]
    .reduce<number>((sum, item) => sum + (Number.isFinite(Number(item)) ? Number(item) : 0), 0);
  return total / ratio;
}
function locationLabel(store: Pick<Store, "province" | "city" | "district">) { return [store.province, store.city, store.district].filter(Boolean).join(" ") || "-"; }
function cooperationLabel(value: string) { return value === "DIRECT" ? "直营店" : "加盟店"; }

export function StoreList({ permissions, brandDayHours }: { permissions: string[]; brandDayHours: Record<string, number> }) {
  const [messageApi, messageContextHolder] = message.useMessage();
  const canEditAliases = permissions.includes("*") || permissions.includes("stores:aliases:edit");
  const canEditEmployees = permissions.includes("*") || permissions.includes("stores:employees:edit");
  const canViewSensitivePersonnel = permissions.includes("*") || permissions.includes("personnel:sensitive");
  const { options: dictionaries, loading: dictionariesLoading, error: dictionariesError, reload: reloadDictionaries } = useBusinessDictionaries(storeDictionaryCodes);
  const statusOptions = [{ value: "", label: "全部运营状态" }, ...(dictionaries.STORE_OPERATION_STATUS || [])];
  const cooperationOptions = [{ value: "", label: "全部合作类型" }, ...(dictionaries.COOPERATION_TYPE || [])];
  const areaOptions = dictionaries.STORE_AREA || [];
  const locationTypeOptions = dictionaries.LOCATION_TYPE || [];
  const positionLevelOptions = dictionaries.POSITION_LEVEL || [];
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
  const [aliasMode, setAliasMode] = useState<AliasMode | null>(null);
  const [aliasStore, setAliasStore] = useState<Store | null>(null);
  const [aliasSaving, setAliasSaving] = useState(false);
  const [aliasSuccessOpen, setAliasSuccessOpen] = useState(false);
  const [costMode, setCostMode] = useState<CostMode | null>(null);
  const [costStore, setCostStore] = useState<Store | null>(null);
  const [costData, setCostData] = useState<StoreCostData | null>(null);
  const [costLoading, setCostLoading] = useState(false);
  const [costSaving, setCostSaving] = useState(false);
  const [costError, setCostError] = useState<string | null>(null);
  const [employeeMode, setEmployeeMode] = useState<EmployeeMode | null>(null);
  const [employeeData, setEmployeeData] = useState<StoreEmployeeData | null>(null);
  const [employeeDraft, setEmployeeDraft] = useState<StoreEmployee[]>([]);
  const [employeeLoading, setEmployeeLoading] = useState(false);
  const [employeeSaving, setEmployeeSaving] = useState(false);
  const [employeeDetail, setEmployeeDetail] = useState<PersonnelDetail | null>(null);
  const [employeeSelectorOpen, setEmployeeSelectorOpen] = useState(false);
  const [availableEmployees, setAvailableEmployees] = useState<StoreEmployee[]>([]);
  const [availableTotal, setAvailableTotal] = useState(0);
  const [availablePage, setAvailablePage] = useState(1);
  const [availablePageSize, setAvailablePageSize] = useState(20);
  const [availableLoading, setAvailableLoading] = useState(false);
  const [availableError, setAvailableError] = useState(false);
  const [employeeFilters, setEmployeeFilters] = useState<EmployeeFilters>(emptyEmployeeFilters);
  const [appliedEmployeeFilters, setAppliedEmployeeFilters] = useState<EmployeeFilters>(emptyEmployeeFilters);
  const [selectedAvailableEmployees, setSelectedAvailableEmployees] = useState<Map<string, StoreEmployee>>(new Map());
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [form] = Form.useForm<StoreForm>();
  const [aliasForm] = Form.useForm<AliasForm>();
  const [costForm] = Form.useForm<CostForm>();
  const cityOptions = useMemo(() => Array.from(new Set(districtOptions.flatMap((province) => (province.children || []).map((city) => city.name)))).map((city) => ({ value: city, label: city })), []);
  const configuredWorkdayHoursForBrand = (brandId?: string) => {
    const brandName = brands.find(brand => brand.id === brandId)?.name || rows.find(store => store.brandId === brandId)?.brand.name;
    return brandName && Object.prototype.hasOwnProperty.call(brandDayHours, brandName) ? brandDayHours[brandName] : undefined;
  };

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
    form.setFieldValue(staffPicker.idField, staff.id);
    setStaffPicker(null);
  };
  const chooseContract = (contract: Contract) => {
    const currentBrandId = form.getFieldValue("brandId");
    const currentWorkdayHours = form.getFieldValue("workdayHours");
    setSelectedContract(contract);
    setSaveError(null);
    form.setFieldsValue({
      contractId: contract.id,
      brandId: contract.brandId,
      name: contract.storeName,
      cooperationType: contract.cooperationType,
      workdayHours: currentBrandId === contract.brandId && currentWorkdayHours !== undefined ? currentWorkdayHours : configuredWorkdayHoursForBrand(contract.brandId),
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
      workdayHours: store.workdayHours === null || store.workdayHours === undefined ? brandDayHours[store.brand.name] : Number(store.workdayHours),
      partTimeLaborCost: store.partTimeLaborCost === null || store.partTimeLaborCost === undefined ? undefined : Number(store.partTimeLaborCost),
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
  const openAliases = (store: Store) => {
    setAliasStore(store);
    aliasForm.setFieldsValue({
      douyinLaikeName: store.douyinLaikeName || "",
      kuaishouName: store.kuaishouName || "",
      meituanManagerName: store.meituanManagerName || "",
      meituanBusinessName: store.meituanBusinessName || "",
    });
    setAliasMode("view");
  };
  const closeAliases = () => {
    if (aliasSaving) return;
    setAliasMode(null);
    setAliasStore(null);
    aliasForm.resetFields();
  };
  const saveAliases = async () => {
    if (!aliasStore || aliasSaving) return;
    try {
      const values = await aliasForm.validateFields();
      setAliasSaving(true);
      const response = await fetch(`/api/stores/${aliasStore.id}/aliases`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || "门店别名保存失败，请稍后重试");
      const updated = data as Store;
      setRows(current => current.map(store => store.id === aliasStore.id ? { ...store, ...updated } : store));
      setAliasStore(current => current ? { ...current, ...updated } : current);
      setAliasMode(null);
      setAliasSuccessOpen(true);
    } catch (error) {
      if (error instanceof Error) messageApi.error(error.message);
    } finally {
      setAliasSaving(false);
    }
  };

  const loadStoreCost = async (storeId: string) => {
    setCostLoading(true);
    setCostError(null);
    try {
      const response = await fetch(`/api/stores/${storeId}/cost`, { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || "门店成本加载失败，请稍后重试");
      setCostData(data as StoreCostData);
    } catch (loadError) {
      setCostError(loadError instanceof Error ? loadError.message : "门店成本加载失败，请稍后重试");
    } finally {
      setCostLoading(false);
    }
  };
  const openCost = (store: Store) => {
    setCostStore(store);
    setCostData(null);
    setCostMode("view");
    setCostError(null);
    costForm.resetFields();
    void loadStoreCost(store.id);
  };
  const closeCost = () => {
    if (costSaving) return;
    setCostMode(null);
    setCostStore(null);
    setCostData(null);
    setCostError(null);
    costForm.resetFields();
  };
  const startCostEdit = () => {
    if (!costData) return;
    costForm.setFieldsValue({
      storeRent: Number(costData.storeRent),
      employeeWages: Number(costData.employeeWages),
      dormitoryRent: Number(costData.dormitoryRent),
      propertyFee: Number(costData.propertyFee),
      utilitiesFee: Number(costData.utilitiesFee),
      otherCost: Number(costData.otherCost),
      ratioCoefficient: Number(costData.ratioCoefficient),
    });
    setCostMode("edit");
  };
  const saveCost = async () => {
    if (!costStore || costSaving) return;
    try {
      const values = await costForm.validateFields();
      setCostSaving(true);
      const response = await fetch(`/api/stores/${costStore.id}/cost`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || "门店成本保存失败，请稍后重试");
      setCostMode(null);
      setCostStore(null);
      setCostData(null);
      setCostError(null);
      costForm.resetFields();
      messageApi.success("门店保本成本已保存");
    } catch (saveCostError) {
      if (saveCostError instanceof Error) messageApi.error(saveCostError.message);
    } finally {
      setCostSaving(false);
    }
  };

  const loadStoreEmployees = async (storeId: string) => {
    setEmployeeLoading(true);
    try {
      const response = await fetch(`/api/stores/${storeId}/employees`, { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || "门店员工加载失败，请稍后重试");
      const snapshot = data as StoreEmployeeData;
      setEmployeeData(snapshot);
      setEmployeeDraft(snapshot.employees);
    } catch (loadError) {
      messageApi.error(loadError instanceof Error ? loadError.message : "门店员工加载失败，请稍后重试");
      setEmployeeMode(null);
      setEmployeeData(null);
    } finally {
      setEmployeeLoading(false);
    }
  };
  const openEmployees = (store: Store) => {
    setEmployeeData({ id: store.id, recordNo: store.recordNo, name: store.name, managerName: null, chefName: null, employees: [] });
    setEmployeeDraft([]);
    setEmployeeMode("view");
    void loadStoreEmployees(store.id);
  };
  const closeEmployees = () => {
    if (employeeSaving) return;
    setEmployeeMode(null);
    setEmployeeData(null);
    setEmployeeDraft([]);
    setEmployeeSelectorOpen(false);
    setEmployeeDetail(null);
  };
  const startEmployeeEdit = () => {
    if (!employeeData) return;
    setEmployeeDraft(employeeData.employees);
    setEmployeeMode("edit");
  };
  const cancelEmployeeEdit = () => {
    setEmployeeDraft(employeeData?.employees || []);
    setEmployeeSelectorOpen(false);
    setEmployeeMode("view");
  };
  const removeEmployee = (personnelId: string) => {
    setEmployeeDraft(current => current.filter(personnel => personnel.id !== personnelId));
  };
  const saveEmployees = async () => {
    if (!employeeData || employeeSaving) return;
    setEmployeeSaving(true);
    try {
      const response = await fetch(`/api/stores/${employeeData.id}/employees`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeIds: employeeDraft.map(personnel => personnel.id) }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || "门店员工保存失败，请稍后重试");
      const snapshot = data as StoreEmployeeData;
      setEmployeeData(snapshot);
      setEmployeeDraft(snapshot.employees);
      setEmployeeMode("view");
      messageApi.success("门店员工已保存");
    } catch (saveEmployeeError) {
      messageApi.error(saveEmployeeError instanceof Error ? saveEmployeeError.message : "门店员工保存失败，请稍后重试");
    } finally {
      setEmployeeSaving(false);
    }
  };
  const openEmployeeDetail = async (personnel: StoreEmployee) => {
    if (!employeeData) return;
    try {
      const response = await fetch(`/api/stores/${employeeData.id}/employees/${personnel.id}`, { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || "员工档案加载失败，请稍后重试");
      setEmployeeDetail(data as PersonnelDetail);
    } catch (detailError) {
      messageApi.error(detailError instanceof Error ? detailError.message : "员工档案加载失败，请稍后重试");
    }
  };
  const loadAvailableEmployees = async (nextPage: number, nextPageSize: number, nextFilters: EmployeeFilters) => {
    if (!employeeData) return;
    setAvailableLoading(true);
    setAvailableError(false);
    try {
      const query = new URLSearchParams({ name: nextFilters.name.trim(), page: String(nextPage), pageSize: String(nextPageSize) });
      nextFilters.positionLevels.forEach(positionLevel => query.append("positionLevels", positionLevel));
      const response = await fetch(`/api/stores/${employeeData.id}/employees/available?${query}`, { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || "待选择人员加载失败，请稍后重试");
      setAvailableEmployees(data?.rows || []);
      setAvailableTotal(data?.total || 0);
      setAvailablePage(data?.page || nextPage);
      setAvailablePageSize(data?.pageSize || nextPageSize);
    } catch {
      setAvailableError(true);
    } finally {
      setAvailableLoading(false);
    }
  };
  const openEmployeeSelector = () => {
    if (!employeeData || !canEditEmployees) return;
    setEmployeeFilters(emptyEmployeeFilters);
    setAppliedEmployeeFilters(emptyEmployeeFilters);
    setSelectedAvailableEmployees(new Map(employeeDraft.filter(personnel => !personnel.storeId).map(personnel => [personnel.id, personnel] as [string, StoreEmployee])));
    setAvailablePage(1);
    setEmployeeSelectorOpen(true);
    void loadAvailableEmployees(1, availablePageSize, emptyEmployeeFilters);
  };
  const applyEmployeeFilters = () => {
    const next = { name: employeeFilters.name.trim(), positionLevels: employeeFilters.positionLevels };
    setAppliedEmployeeFilters(next);
    setAvailablePage(1);
    void loadAvailableEmployees(1, availablePageSize, next);
  };
  const resetEmployeeFilters = () => {
    setEmployeeFilters(emptyEmployeeFilters);
    setAppliedEmployeeFilters(emptyEmployeeFilters);
    setAvailablePage(1);
    void loadAvailableEmployees(1, availablePageSize, emptyEmployeeFilters);
  };
  const confirmAvailableEmployees = () => {
    const currentAssignments = employeeDraft.filter(personnel => personnel.storeId === employeeData?.id);
    setEmployeeDraft([...currentAssignments, ...selectedAvailableEmployees.values()]);
    setEmployeeSelectorOpen(false);
  };

  const ordinaryEmployeeColumns: ColumnsType<StoreEmployee> = [
    { title: "所属岗位星级", dataIndex: "positionLevel", width: 180, render: text },
    { title: "姓名", dataIndex: "name", width: 140 },
    { title: "用工成本（元/天）", dataIndex: "laborCost", width: 180, render: value => `¥ ${Number(value).toFixed(2)}` },
    { title: "操作", width: employeeMode === "edit" ? 130 : 80, render: (_, personnel) => <Space className="table-actions" size={0}><Button type="link" size="small" onClick={() => void openEmployeeDetail(personnel)}>查看</Button>{employeeMode === "edit" && <Button type="link" danger size="small" onClick={() => removeEmployee(personnel.id)}>移除</Button>}</Space> },
  ];

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
    { title: "操作", fixed: "right", width: 265, render: (_, row) => <Space className="table-actions" size={0}><Button type="link" size="small" onClick={() => { setSelected(row); setDetailOpen(true); }}>查看</Button><Button type="link" size="small" onClick={() => openEdit(row)}>编辑</Button><Button type="link" size="small" onClick={() => openAliases(row)}>别名</Button><Button type="link" size="small" onClick={() => openEmployees(row)}>员工</Button><Button type="link" size="small" onClick={() => openCost(row)}>成本</Button></Space> },
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
        <Form.Item name="supervisorUserId" hidden><Input /></Form.Item>
        <FormHeading title="基础信息" />
        <Row gutter={16}><Col span={24}><Form.Item label="关联合同"><Space wrap><Button onClick={openContractModal}>选择合同</Button>{selectedContract ? <span>当前关联合同：{selectedContract.recordNo}</span> : <span className="store-form-hint">未关联合同，可直接维护门店档案。</span>}</Space></Form.Item></Col></Row>
        <Row gutter={16}><FormItem span={8} label="品牌" name="brandId" required><Select loading={dictionariesLoading} disabled={!!dictionariesError || !!selectedContract} placeholder="请选择品牌" options={brands.map((brand) => ({ value: brand.id, label: brand.name }))} onChange={(brandId) => form.setFieldValue("workdayHours", configuredWorkdayHoursForBrand(brandId))} /></FormItem><FormItem span={8} label="门店名称" name="name" required><Input disabled={!!selectedContract} maxLength={60} placeholder="请输入门店名称" /></FormItem><FormItem span={8} label="合作类型" name="cooperationType" required><Select loading={dictionariesLoading} disabled={!!dictionariesError || !!selectedContract} options={cooperationOptions.filter((option) => option.value)} /></FormItem></Row>
        <Row gutter={16}><FormItem span={8} label="运营状态" name="operationStatus" required><Select loading={dictionariesLoading} disabled={!!dictionariesError} options={statusOptions.filter((option) => option.value)} /></FormItem><FormItem span={8} label="营运大区" name="region"><Select allowClear loading={dictionariesLoading} disabled={!!dictionariesError} placeholder="请选择营运大区" options={areaOptions} /></FormItem><FormItem span={8} label="负责督导" name="supervisorName"><Input readOnly placeholder="请选择督导" addonAfter={<Button type="link" size="small" onClick={() => openStaffPicker({ role: "supervisor", title: "督导", field: "supervisorName", idField: "supervisorUserId" })}>选择</Button>} /></FormItem></Row>
        <Row gutter={16}><FormItem span={12} label="工作日小时" name="workdayHours" required rules={[{ required: true, message: "请输入工作日小时" }, { type: "number", min: 0.1, max: 24, message: "请输入0.1至24之间的工作日小时" }]}><InputNumber min={0.1} max={24} step={0.1} precision={1} suffix="小时/日" style={{ width: "100%" }} placeholder="读取品牌考勤参数，可修改" /></FormItem><FormItem span={12} label="兼职用工成本" name="partTimeLaborCost" rules={[{ type: "number", min: 0, max: 9999999999.99, message: "请输入不小于0的兼职用工成本" }]}><InputNumber min={0} max={9999999999.99} step={0.01} precision={2} suffix="元/小时" style={{ width: "100%" }} placeholder="选填，请输入兼职用工成本" /></FormItem></Row>
        <FormHeading title="门店地址与商圈" />
        <Row gutter={16}><FormItem span={12} label="省 / 市 / 区县" name="location"><Cascader disabled={!!selectedContract} options={districtOptions} fieldNames={{ label: "name", value: "name", children: "children" }} placeholder="请选择门店所在地区" showSearch /></FormItem><FormItem span={12} label="详细地址" name="address"><Input disabled={!!selectedContract} maxLength={200} placeholder="请输入街道、门牌号等" /></FormItem></Row>
        <Row gutter={16}><FormItem span={8} label="商圈" name="businessDistrict"><Input maxLength={60} placeholder="如：静安寺商圈" /></FormItem><FormItem span={8} label="选址类型" name="locationType"><Select allowClear loading={dictionariesLoading} disabled={!!dictionariesError} placeholder="请选择门店位置类型" options={locationTypeOptions} /></FormItem></Row>
        {editing && !(editing.province && editing.city && editing.district) && (editing.city || editing.district) ? <div className="store-form-hint">该门店的历史区域为“{[editing.city, editing.district].filter(Boolean).join(" ")}”，如需调整，请重新选择完整的省、市、区县。</div> : null}
        <FormHeading title="经营周期" />
        <Row gutter={16}><FormItem span={6} label="筹备开始日期" name="startDate"><DatePicker style={{ width: "100%" }} /></FormItem><FormItem span={6} label="筹备结束日期" name="endDate"><DatePicker style={{ width: "100%" }} /></FormItem><FormItem span={6} label="试营业日期" name="trialOpenDate"><DatePicker disabled={!!selectedContract} style={{ width: "100%" }} /></FormItem><FormItem span={6} label="正式营业日期" name="formalOpenDate"><DatePicker style={{ width: "100%" }} /></FormItem></Row>
        <FormHeading title="人员与业主信息" />
        <Row gutter={16}><FormItem span={8} label="店长" name="managerName"><Input readOnly placeholder="由运营H5店铺权限自动匹配" /></FormItem><FormItem span={8} label="厨师长" name="chefName"><Input readOnly placeholder="由运营H5店铺权限自动匹配" /></FormItem><FormItem span={8} label="业主姓名" name="ownerName"><Input disabled={!!selectedContract} maxLength={30} /></FormItem></Row>
        <div className="store-leadership-hint">店长、厨师长由“设置 / 用户列表”中的用户角色及“运营H5店铺权限”自动匹配，不支持在门店档案中手工修改。</div>
        <Row gutter={16}><FormItem span={8} label="业主联系电话" name="ownerPhone" rules={[{ pattern: /^$|^1\d{10}$/, message: "请输入正确的 11 位手机号码" }]}><Input disabled={!!selectedContract} maxLength={11} /></FormItem><FormItem span={8} label="业主身份证号" name="ownerIdNumber"><Input disabled={!!selectedContract} maxLength={30} /></FormItem></Row>
      </Form>
    </Drawer>
    <Drawer title="门店详情" width={840} open={detailOpen} onClose={() => setDetailOpen(false)} extra={selected ? <Button type="primary" onClick={() => { setDetailOpen(false); openEdit(selected); }}>编辑门店</Button> : null}>
      {selected && <StoreDetails store={selected} brandDayHours={brandDayHours} />}
    </Drawer>
    <Modal title={aliasMode === "edit" ? "编辑-门店别名" : "查看-门店别名"} open={!!aliasMode && !!aliasStore} onCancel={closeAliases} width={640} destroyOnHidden maskClosable={!aliasSaving} closable={!aliasSaving} footer={aliasMode === "edit" ? <Space><Button disabled={aliasSaving} onClick={closeAliases}>取消</Button><Button type="primary" loading={aliasSaving} onClick={() => void saveAliases()}>保存</Button></Space> : <Space>{canEditAliases && <Button type="primary" onClick={() => setAliasMode("edit")}>编辑</Button>}<Button onClick={closeAliases}>返回</Button></Space>}>
      {aliasStore && aliasMode === "view" && <Descriptions bordered size="middle" column={1} items={[
        { key: "name", label: "门店名称", children: aliasStore.name },
        { key: "recordNo", label: "门店编号", children: aliasStore.recordNo },
        { key: "douyinLaikeName", label: "抖音来客（店名）", children: text(aliasStore.douyinLaikeName) },
        { key: "kuaishouName", label: "快手（店名）", children: text(aliasStore.kuaishouName) },
        { key: "meituanManagerName", label: "美团管家（店名）", children: text(aliasStore.meituanManagerName) },
        { key: "meituanBusinessName", label: "美团经营宝（店名）", children: text(aliasStore.meituanBusinessName) },
      ]} />}
      {aliasStore && aliasMode === "edit" && <Form form={aliasForm} layout="vertical">
        <Form.Item label="门店名称"><Input value={aliasStore.name} readOnly /></Form.Item>
        <Form.Item label="门店编号"><Input value={aliasStore.recordNo} readOnly /></Form.Item>
        <Form.Item label="抖音来客（店名）" name="douyinLaikeName" rules={[{ max: 50, message: "抖音来客（店名）不能超过50个字符" }]}><Input maxLength={50} showCount placeholder="请输入抖音来客店名" /></Form.Item>
        <Form.Item label="快手（店名）" name="kuaishouName" rules={[{ max: 50, message: "快手（店名）不能超过50个字符" }]}><Input maxLength={50} showCount placeholder="请输入快手店名" /></Form.Item>
        <Form.Item label="美团管家（店名）" name="meituanManagerName" rules={[{ max: 50, message: "美团管家（店名）不能超过50个字符" }]}><Input maxLength={50} showCount placeholder="请输入美团管家店名" /></Form.Item>
        <Form.Item label="美团经营宝（店名）" name="meituanBusinessName" rules={[{ max: 50, message: "美团经营宝（店名）不能超过50个字符" }]}><Input maxLength={50} showCount placeholder="请输入美团经营宝店名" /></Form.Item>
      </Form>}
    </Modal>
    <Modal title="温馨提示" open={aliasSuccessOpen} centered closable={false} maskClosable={false} footer={<Button type="primary" onClick={() => { setAliasSuccessOpen(false); setAliasStore(null); aliasForm.resetFields(); }}>我知道了</Button>}>
      <p>门店别名已成功保存。</p>
    </Modal>
    <Modal
      title={costMode === "edit" ? "编辑成本" : "查看成本"}
      open={!!costMode && !!costStore}
      onCancel={closeCost}
      width={680}
      destroyOnHidden
      maskClosable={!costSaving}
      closable={!costSaving}
      footer={costMode === "edit"
        ? <Space><Button disabled={costSaving} onClick={() => setCostMode("view")}>取消</Button><Button type="primary" loading={costSaving} onClick={() => void saveCost()}>保存</Button></Space>
        : <Space><Button type="primary" disabled={costLoading || !costData} onClick={startCostEdit}>编辑</Button><Button onClick={closeCost}>返回</Button></Space>}
    >
      {costLoading && !costData ? <Skeleton active paragraph={{ rows: 7 }} /> : costError ? <Alert type="error" showIcon message="门店成本加载失败" description={costError} action={costStore ? <Button size="small" onClick={() => void loadStoreCost(costStore.id)}>重新加载</Button> : undefined} /> : costData && costMode === "view" ? <Descriptions bordered size="middle" column={2} items={[
        { key: "name", label: "门店名称", children: costData.name, span: 2 },
        { key: "recordNo", label: "门店编号", children: costData.recordNo, span: 2 },
        { key: "storeRent", label: "门店房租", children: money(costData.storeRent) },
        { key: "employeeWages", label: "员工工资", children: money(costData.employeeWages) },
        { key: "dormitoryRent", label: "宿舍房租", children: money(costData.dormitoryRent) },
        { key: "propertyFee", label: "物业费", children: money(costData.propertyFee) },
        { key: "utilitiesFee", label: "水电费", children: money(costData.utilitiesFee) },
        { key: "otherCost", label: "其他", children: money(costData.otherCost) },
        { key: "ratioCoefficient", label: "比例系数", children: Number(costData.ratioCoefficient), span: 2 },
        { key: "monthlyBreakEvenRevenue", label: "月保本营业额", children: costData.monthlyBreakEvenRevenue === null ? "比例系数须大于0" : money(costData.monthlyBreakEvenRevenue), span: 2 },
      ]} /> : costData && costMode === "edit" ? <Form form={costForm} layout="vertical">
        <Row gutter={16}><Col span={12}><Form.Item label="门店名称"><Input value={costData.name} readOnly /></Form.Item></Col><Col span={12}><Form.Item label="门店编号"><Input value={costData.recordNo} readOnly /></Form.Item></Col></Row>
        <Row gutter={16}><CostFormItem label="门店房租" name="storeRent" /><CostFormItem label="员工工资" name="employeeWages" /></Row>
        <Row gutter={16}><CostFormItem label="宿舍房租" name="dormitoryRent" /><CostFormItem label="物业费" name="propertyFee" /></Row>
        <Row gutter={16}><CostFormItem label="水电费" name="utilitiesFee" /><CostFormItem label="其他" name="otherCost" /></Row>
        <Row gutter={16}>
          <Col span={12}><Form.Item label="比例系数" name="ratioCoefficient" rules={[{ required: true, message: "请输入比例系数" }, { type: "number", min: 0.0001, max: 999999.9999, message: "比例系数须在0.0001至999999.9999之间" }]}><InputNumber min={0.0001} max={999999.9999} step={0.0001} precision={4} style={{ width: "100%" }} placeholder="请输入比例系数" /></Form.Item></Col>
          <Col span={12}><Form.Item noStyle shouldUpdate>{({ getFieldsValue }) => {
            const monthlyRevenue = calculateMonthlyBreakEvenRevenue(getFieldsValue());
            return <Form.Item label="月保本营业额"><Input value={monthlyRevenue === null ? "" : money(monthlyRevenue)} readOnly placeholder="根据成本和比例系数自动计算" /></Form.Item>;
          }}</Form.Item></Col>
        </Row>
      </Form> : null}
    </Modal>
    <Modal
      title={employeeMode === "edit" ? "编辑-员工列表" : "查看-员工列表"}
      open={!!employeeMode && !!employeeData}
      onCancel={closeEmployees}
      width={900}
      destroyOnHidden
      maskClosable={!employeeSaving}
      closable={!employeeSaving}
      footer={employeeMode === "edit"
        ? <Space><Button disabled={employeeSaving} onClick={cancelEmployeeEdit}>取消</Button><Button type="primary" loading={employeeSaving} onClick={() => void saveEmployees()}>保存</Button></Space>
        : <Space>{canEditEmployees && <Button type="primary" disabled={employeeLoading} onClick={startEmployeeEdit}>编辑</Button>}<Button onClick={closeEmployees}>返回</Button></Space>}
    >
      {employeeData && <>
        <Descriptions bordered size="small" column={2} items={[
          { key: "recordNo", label: "门店编号", children: employeeData.recordNo },
          { key: "name", label: "门店名称", children: employeeData.name },
          { key: "manager", label: "店长", children: text(employeeData.managerName) },
          { key: "chef", label: "厨师长", children: text(employeeData.chefName) },
        ]} />
        <div className="store-employee-table-heading"><strong>普通员工列表</strong>{employeeMode === "edit" && <Button type="primary" ghost icon={<PlusOutlined />} onClick={openEmployeeSelector}>添加</Button>}</div>
        <Table<StoreEmployee>
          rowKey="id"
          size="middle"
          loading={{ spinning: employeeLoading, tip: "员工数据加载中..." }}
          columns={ordinaryEmployeeColumns}
          dataSource={employeeMode === "edit" ? employeeDraft : employeeData.employees}
          pagination={false}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前门店暂无普通员工" /> }}
        />
      </>}
    </Modal>
    <Drawer title="查看员工" width={1000} open={!!employeeDetail} zIndex={1300} onClose={() => setEmployeeDetail(null)} extra={<Button onClick={() => setEmployeeDetail(null)}>返回</Button>}>
      {employeeDetail && <PersonnelDetails row={employeeDetail} sensitive={canViewSensitivePersonnel} />}
    </Drawer>
    <Modal
      rootClassName="notification-user-modal"
      title={<div><strong>选择人员</strong><span>仅展示尚未安排门店的在职人员，支持按姓名和岗位星级筛选并跨页保留已选项</span></div>}
      open={employeeSelectorOpen}
      onCancel={() => setEmployeeSelectorOpen(false)}
      width={960}
      zIndex={1200}
      maskClosable={false}
      destroyOnHidden
      footer={<div className="notification-user-footer"><span>已选择 <strong>{selectedAvailableEmployees.size}</strong> 人{selectedAvailableEmployees.size > 0 && <Button type="link" size="small" onClick={() => setSelectedAvailableEmployees(new Map())}>清空已选</Button>}</span><Space><Button onClick={() => setEmployeeSelectorOpen(false)}>取消</Button><Button type="primary" disabled={!selectedAvailableEmployees.size} onClick={confirmAvailableEmployees}>选择并返回</Button></Space></div>}
    >
      <div className="notification-user-filters">
        <Input value={employeeFilters.name} maxLength={8} allowClear placeholder="请输入姓名" onChange={event => setEmployeeFilters(previous => ({ ...previous, name: event.target.value }))} onPressEnter={applyEmployeeFilters} />
        <Select mode="multiple" maxTagCount="responsive" loading={dictionariesLoading} value={employeeFilters.positionLevels} onChange={positionLevels => setEmployeeFilters(previous => ({ ...previous, positionLevels }))} options={positionLevelOptions.map(option => ({ value: option.label, label: option.label }))} placeholder="全部岗位星级" />
        <Space><Button onClick={resetEmployeeFilters}>重置筛选</Button><Button type="primary" onClick={applyEmployeeFilters}>查询</Button></Space>
      </div>
      {availableError ? <Alert type="error" showIcon message="待选择人员加载失败，请稍后重试" action={<Button size="small" onClick={() => void loadAvailableEmployees(availablePage, availablePageSize, appliedEmployeeFilters)}>重新加载</Button>} /> : <Table<StoreEmployee>
        rowKey="id"
        size="middle"
        loading={{ spinning: availableLoading, tip: "人员数据加载中..." }}
        rowSelection={{
          selectedRowKeys: [...selectedAvailableEmployees.keys()],
          preserveSelectedRowKeys: true,
          onSelect: (record, checked) => setSelectedAvailableEmployees(previous => {
            const next = new Map(previous);
            if (checked) next.set(record.id, record); else next.delete(record.id);
            return next;
          }),
          onSelectAll: (checked, _selectedRows, changedRows) => setSelectedAvailableEmployees(previous => {
            const next = new Map(previous);
            changedRows.forEach(record => { if (checked) next.set(record.id, record); else next.delete(record.id); });
            return next;
          }),
        }}
        columns={[
          { title: "所属岗位星级", dataIndex: "positionLevel", width: 240, render: text },
          { title: "姓名", dataIndex: "name", width: 180 },
          { title: "手机号码", dataIndex: "phoneMasked", width: 200, render: (value: string | undefined, row: StoreEmployee) => value || row.phone || "-" },
        ]}
        dataSource={availableEmployees}
        scroll={{ x: 720, y: 390 }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<><div>没有找到符合当前条件的未分配人员</div><Button type="link" onClick={resetEmployeeFilters}>重置筛选</Button></>} /> }}
        pagination={{
          current: availablePage,
          pageSize: availablePageSize,
          total: availableTotal,
          showSizeChanger: true,
          pageSizeOptions: [20, 50, 100],
          showTotal: count => `共 ${count} 人`,
          onChange: (nextPage, nextPageSize) => void loadAvailableEmployees(nextPage, nextPageSize, appliedEmployeeFilters),
        }}
      />}
    </Modal>
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
function CostFormItem({ label, name }: { label: string; name: keyof Omit<CostForm, "ratioCoefficient"> }) {
  return <Col span={12}><Form.Item label={label} name={name} rules={[{ required: true, message: `请输入${label}` }, { type: "number", min: 0, max: 999999999999.99, message: `${label}不能小于0` }]}><InputNumber min={0} max={999999999999.99} step={0.01} precision={2} prefix="¥" style={{ width: "100%" }} placeholder={`请输入${label}`} /></Form.Item></Col>;
}
function StoreDetails({ store, brandDayHours }: { store: Store; brandDayHours: Record<string, number> }) {
  const workdayHours = store.workdayHours === null || store.workdayHours === undefined ? brandDayHours[store.brand.name] : Number(store.workdayHours);
  return <>
    <Descriptions column={2} bordered size="small" items={[
      { key: "recordNo", label: "门店编号", children: store.recordNo }, { key: "status", label: "运营状态", children: <StatusTag value={store.operationStatus} /> },
      { key: "brand", label: "品牌", children: store.brand.name }, { key: "name", label: "门店名称", children: store.name },
      { key: "cooperation", label: "合作类型", children: cooperationLabel(store.cooperationType) }, { key: "contract", label: "关联合同", children: store.contract ? <>{store.contract.recordNo} <StatusTag value={store.contract.status} /></> : "未关联" },
      { key: "workdayHours", label: "工作日小时", children: workdayHours === undefined ? "-" : `${Number(workdayHours)}小时/日` },
      { key: "partTimeLaborCost", label: "兼职用工成本", children: store.partTimeLaborCost === null || store.partTimeLaborCost === undefined ? "-" : `${Number(store.partTimeLaborCost).toFixed(2)}元/小时` },
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

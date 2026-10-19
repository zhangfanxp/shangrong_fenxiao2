"use client";

import { LoadingOutlined, PlusOutlined, UploadOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Checkbox, Empty, Form, Input, InputNumber, message, Modal, Result, Select, Space, Table, Upload } from "antd";
import type { UploadProps } from "antd";
import { useEffect, useState } from "react";
import { AI_MODEL_OPTIONS, aiEndpointExample, aiModelLabel, aiModelSupportsService, normalizeAiServiceApiConfig, type AiModelId, type AiServiceApiConfig } from "@/lib/ai-model-adapters";
import type { LaborCostPolicy } from "@/lib/personnel-labor-costs";
import type { PlatformAssetUrls, PlatformSettings } from "@/lib/platform-config";

type BrandOption = { label: string; value: string };
type R2StorageOption = { label: string; value: string };
type AttendanceParameter = { brand: string; workdayHours: number; attendanceStartDayOffset: 0 | 1; attendanceStartTime: string; attendanceDeadlineDayOffset: 0 | 1; attendanceDeadlineTime: string; allowPostSubmitEdit: boolean };
type PlatformValues = { platformName: string; automaticTaskExecutionTime: string; defaultTaskDeadlineDayOffset: 0 | 1; defaultTaskDeadlineTime: string };
type TrainingValues = { dailyLearningR2StorageId: string | null; trainingVideoR2StorageId: string | null; trainingAudioR2StorageId: string | null; trainingDocumentR2StorageId: string | null };
type AiApiValues = { services: Record<string, AiServiceApiConfig> };
type OtherValues = { contractExpiringWarningDays: number; birthdayReminderDays: number; birthdayReminderCalculationTime: string; laborCostPolicy: LaborCostPolicy };
type InitialLaborCostPolicy = { effectiveMonth: string; sourceEffectiveMonth: string | null; policy: LaborCostPolicy };
type AiApiTestResult = { service: string; model: AiModelId; modelLabel: string; label: string; ok: boolean; message: string; elapsedMilliseconds: number };
type AiApiTestDialog = { open: boolean; phase: "testing" | "success" | "error"; message: string; results: AiApiTestResult[] };
type AttendanceParameterValues = AttendanceParameter;
type SchedulerStatus = {
  scheduledTime: string;
  today: string;
  dueToday: boolean;
  todayStatus: "SUCCESS" | "RUNNING" | "FAILED" | "WAITING" | "NOT_DUE";
  lastRun: null | {
    executionDate: string;
    status: "SUCCESS" | "RUNNING" | "FAILED";
    startedAt: string;
    completedAt: string | null;
    result: null | { created?: number; covered?: number; notGenerated?: number; ignoredTasks?: number };
    error: string | null;
  };
};

const loginAddresses = [
  { title: "运营PC端", path: "/lead_pc/login" },
  { title: "运营H5移动端", path: "/lead_h5/login" },
  { title: "门店H5移动端", path: "/store_h5/login" },
];

const monthlyRestRuleOptions = [
  { value: "SATURDAY_AND_SUNDAY", label: "周六+周日数" },
  { value: "SUNDAY", label: "周日数" },
  { value: "SATURDAY", label: "周六数" },
  { value: "MONDAY", label: "周一数" },
  { value: "TUESDAY", label: "周二数" },
  { value: "WEDNESDAY", label: "周三数" },
  { value: "THURSDAY", label: "周四数" },
  { value: "FRIDAY", label: "周五数" },
  { value: "FIXED_DAYS", label: "固定天数" },
];

const legalHolidayRuleOptions = [
  { value: "ACTUAL_DATES", label: "法定放假日期" },
  { value: "EACH_HOLIDAY_ONE_DAY", label: "当月每个法定假期+1天" },
  { value: "ANY_HOLIDAY_ONE_DAY", label: "当月N个法定假期+1天" },
  { value: "NONE", label: "+0天" },
];

function monthLabel(value: string) {
  const [year, month] = value.split("-");
  return `${year}年${Number(month)}月`;
}

export function SystemParameters({ initialPlatform, initialAssetUrls, r2StorageOptions, aiServiceOptions, aiServiceLoadError, initialLaborCostPolicy }: { initialPlatform: PlatformSettings; initialAssetUrls: PlatformAssetUrls; r2StorageOptions: R2StorageOption[]; aiServiceOptions: R2StorageOption[]; aiServiceLoadError: boolean; initialLaborCostPolicy: InitialLaborCostPolicy }) {
  const initialAiApiServices = Object.fromEntries(aiServiceOptions.map(service => [service.value, normalizeAiServiceApiConfig(initialPlatform.aiApiServices[service.value], service.value)]));
  const [platformForm] = Form.useForm<PlatformValues>();
  const [trainingForm] = Form.useForm<TrainingValues>();
  const [aiApiForm] = Form.useForm<AiApiValues>();
  const [otherForm] = Form.useForm<OtherValues>();
  const headquartersMonthlyRestRule = Form.useWatch(["laborCostPolicy", "headquartersMonthlyRestRule"], otherForm) || initialLaborCostPolicy.policy.headquartersMonthlyRestRule;
  const storeMonthlyRestRule = Form.useWatch(["laborCostPolicy", "storeMonthlyRestRule"], otherForm) || initialLaborCostPolicy.policy.storeMonthlyRestRule;
  const [brandHourForm] = Form.useForm<AttendanceParameterValues>();
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(initialAssetUrls.logo);
  const [loginBackgroundDataUrl, setLoginBackgroundDataUrl] = useState<string | null>(initialAssetUrls.loginBackground);
  const [courseCoverDataUrl, setCourseCoverDataUrl] = useState<string | null>(initialAssetUrls.courseCover);
  const [lessonCoverDataUrl, setLessonCoverDataUrl] = useState<string | null>(initialAssetUrls.lessonCover);
  const [logoChanged, setLogoChanged] = useState(false);
  const [loginBackgroundChanged, setLoginBackgroundChanged] = useState(false);
  const [courseCoverChanged, setCourseCoverChanged] = useState(false);
  const [lessonCoverChanged, setLessonCoverChanged] = useState(false);
  const [platformSaving, setPlatformSaving] = useState(false);
  const [trainingSaving, setTrainingSaving] = useState(false);
  const [aiApiSaving, setAiApiSaving] = useState(false);
  const [otherSaving, setOtherSaving] = useState(false);
  const [laborPolicyEffectiveMonth, setLaborPolicyEffectiveMonth] = useState(initialLaborCostPolicy.effectiveMonth);
  const [aiApiTesting, setAiApiTesting] = useState(false);
  const [aiApiTestDialog, setAiApiTestDialog] = useState<AiApiTestDialog>({ open: false, phase: "testing", message: "", results: [] });
  const [siteOrigin, setSiteOrigin] = useState("");
  const [rows, setRows] = useState<AttendanceParameter[]>([]);
  const [brandOptions, setBrandOptions] = useState<BrandOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingBrand, setEditingBrand] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [schedulerStatus, setSchedulerStatus] = useState<SchedulerStatus | null>(null);

  useEffect(() => {
    otherForm.setFieldsValue({
      contractExpiringWarningDays: initialPlatform.contractExpiringWarningDays,
      birthdayReminderDays: initialPlatform.birthdayReminderDays,
      birthdayReminderCalculationTime: initialPlatform.birthdayReminderCalculationTime,
      laborCostPolicy: initialLaborCostPolicy.policy,
    });
    setLaborPolicyEffectiveMonth(initialLaborCostPolicy.effectiveMonth);
  }, [initialLaborCostPolicy, initialPlatform.birthdayReminderCalculationTime, initialPlatform.birthdayReminderDays, initialPlatform.contractExpiringWarningDays, otherForm]);

  const loadSchedulerStatus = async () => {
    try {
      const response = await fetch("/api/settings/task-scheduler/status", { cache: "no-store" });
      if (response.ok) setSchedulerStatus(await response.json());
    } catch {
      // 状态展示不影响系统参数和考勤参数的正常维护。
    }
  };

  const loadBrandHours = async () => {
    setLoading(true); setLoadError("");
    try {
      const response = await fetch("/api/settings/brand-day-hours", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "考勤参数加载失败，请稍后重试");
      setRows(data.rows); setBrandOptions(data.brandOptions);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "考勤参数加载失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { setSiteOrigin(window.location.origin); void loadBrandHours(); void loadSchedulerStatus(); }, []);

  const beforeLogoUpload: UploadProps["beforeUpload"] = file => {
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      message.error("后台LOGO仅支持PNG、JPG或WEBP格式");
      return Upload.LIST_IGNORE;
    }
    if (file.size > 2 * 1024 * 1024) {
      message.error("后台LOGO文件不能超过2MB");
      return Upload.LIST_IGNORE;
    }
    const reader = new FileReader();
    reader.onload = () => { setLogoDataUrl(typeof reader.result === "string" ? reader.result : null); setLogoChanged(true); };
    reader.onerror = () => message.error("后台LOGO读取失败，请重新选择");
    reader.readAsDataURL(file);
    return false;
  };

  const beforeBackgroundUpload: UploadProps["beforeUpload"] = file => {
    const supportedType = ["image/png", "image/jpeg"].includes(file.type) || /\.(png|jpe?g)$/i.test(file.name);
    if (!supportedType) {
      message.error("登录页背景图片仅支持PNG、JPG或JPEG格式");
      return Upload.LIST_IGNORE;
    }
    if (file.size > 5 * 1024 * 1024) {
      message.error("登录页背景图片文件不能超过5MB");
      return Upload.LIST_IGNORE;
    }
    const reader = new FileReader();
    reader.onload = () => { setLoginBackgroundDataUrl(typeof reader.result === "string" ? reader.result : null); setLoginBackgroundChanged(true); };
    reader.onerror = () => message.error("登录页背景图片读取失败，请重新选择");
    reader.readAsDataURL(file);
    return false;
  };

  const readCoverImage = (file: Parameters<NonNullable<UploadProps["beforeUpload"]>>[0], label: string, setDataUrl: (value: string | null) => void, setChanged: (value: boolean) => void) => {
    const supportedType = ["image/png", "image/jpeg", "image/webp"].includes(file.type) || /\.(png|jpe?g|webp)$/i.test(file.name);
    if (!supportedType) {
      message.error(`${label}仅支持PNG、JPG、JPEG或WEBP格式`);
      return Upload.LIST_IGNORE;
    }
    if (file.size > 5 * 1024 * 1024) {
      message.error(`${label}文件不能超过5MB`);
      return Upload.LIST_IGNORE;
    }
    const reader = new FileReader();
    reader.onload = () => { setDataUrl(typeof reader.result === "string" ? reader.result : null); setChanged(true); };
    reader.onerror = () => message.error(`${label}读取失败，请重新选择`);
    reader.readAsDataURL(file);
    return false;
  };

  const beforeCourseCoverUpload: UploadProps["beforeUpload"] = file => readCoverImage(file, "课程封面图片", setCourseCoverDataUrl, setCourseCoverChanged);
  const beforeLessonCoverUpload: UploadProps["beforeUpload"] = file => readCoverImage(file, "课时封面图片", setLessonCoverDataUrl, setLessonCoverChanged);

  const savePlatform = async () => {
    if (platformSaving) return;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 60_000);
    try {
      const values = await platformForm.validateFields();
      setPlatformSaving(true);
      const imageChanges = {
        ...(logoChanged && logoDataUrl ? { logoDataUrl } : {}),
        ...(loginBackgroundChanged && loginBackgroundDataUrl ? { loginBackgroundDataUrl } : {}),
        removeLogo: logoChanged && logoDataUrl === null,
        removeLoginBackground: loginBackgroundChanged && loginBackgroundDataUrl === null,
      };
      const response = await fetch("/api/settings/parameters", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ section: "platform", ...values, ...imageChanges }), signal: controller.signal });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return void message.error(data.message || "平台信息保存失败，请稍后重试");
      setLogoChanged(false); setLoginBackgroundChanged(false);
      void loadSchedulerStatus();
      Modal.success({ title: "温馨提示", content: data.message || "平台信息已保存成功。", okText: "我知道了", centered: true });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") message.warning("保存等待超时，请刷新页面确认保存结果后再试");
      else if (error instanceof Error) message.error(error.message);
    } finally {
      window.clearTimeout(timeoutId);
      setPlatformSaving(false);
    }
  };

  const saveTraining = async () => {
    if (trainingSaving) return;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 60_000);
    try {
      const values = await trainingForm.validateFields();
      setTrainingSaving(true);
      const imageChanges = {
        ...(courseCoverChanged && courseCoverDataUrl ? { courseCoverDataUrl } : {}),
        ...(lessonCoverChanged && lessonCoverDataUrl ? { lessonCoverDataUrl } : {}),
        removeCourseCover: courseCoverChanged && courseCoverDataUrl === null,
        removeLessonCover: lessonCoverChanged && lessonCoverDataUrl === null,
      };
      const storageValues = {
        dailyLearningR2StorageId: values.dailyLearningR2StorageId || null,
        trainingVideoR2StorageId: values.trainingVideoR2StorageId || null,
        trainingAudioR2StorageId: values.trainingAudioR2StorageId || null,
        trainingDocumentR2StorageId: values.trainingDocumentR2StorageId || null,
      };
      const response = await fetch("/api/settings/parameters", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ section: "training", ...storageValues, ...imageChanges }), signal: controller.signal });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return void message.error(data.message || "课程培训配置保存失败，请稍后重试");
      setCourseCoverChanged(false); setLessonCoverChanged(false);
      Modal.success({ title: "温馨提示", content: data.message || "课程培训配置已保存成功。", okText: "我知道了", centered: true });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") message.warning("保存等待超时，请刷新页面确认保存结果后再试");
      else if (error instanceof Error) message.error(error.message);
    } finally {
      window.clearTimeout(timeoutId);
      setTrainingSaving(false);
    }
  };

  const saveAiApi = async () => {
    if (aiApiSaving) return;
    try {
      await aiApiForm.validateFields();
      setAiApiSaving(true);
      const values = aiApiForm.getFieldsValue(true);
      const services = aiServiceOptions.map(service => ({ service: service.value, ...normalizeAiServiceApiConfig(values.services?.[service.value], service.value) }));
      const response = await fetch("/api/settings/parameters", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ section: "aiApi", services }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return void message.error(data.message || "Ai API配置保存失败，请稍后重试");
      Modal.success({ title: "温馨提示", content: data.message || "Ai API配置已保存成功。", okText: "我知道了", centered: true });
    } catch (error) {
      if (error instanceof Error) message.error(error.message);
    } finally {
      setAiApiSaving(false);
    }
  };

  const saveOther = async () => {
    if (otherSaving) return;
    try {
      const values = await otherForm.validateFields();
      setOtherSaving(true);
      const response = await fetch("/api/settings/parameters", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ section: "other", ...values }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return void message.error(data.message || "其他参数保存失败，请稍后重试");
      if (typeof data.laborCostPolicyEffectiveMonth === "string") setLaborPolicyEffectiveMonth(data.laborCostPolicyEffectiveMonth);
      if (data.laborCostPolicy && typeof data.laborCostPolicy === "object") otherForm.setFieldValue("laborCostPolicy", data.laborCostPolicy);
      Modal.success({ title: "温馨提示", content: data.message || "其他参数已保存成功。", okText: "我知道了", centered: true });
    } catch (error) {
      if (error instanceof Error) message.error(error.message);
    } finally {
      setOtherSaving(false);
    }
  };

  const testAiApi = async (targetService?: string) => {
    if (aiApiTesting) return;
    try {
      if (targetService) {
        const current = normalizeAiServiceApiConfig(aiApiForm.getFieldValue(["services", targetService]), targetService);
        await aiApiForm.validateFields([
          ["services", targetService, "selectedModel"],
          ["services", targetService, "endpoints", current.selectedModel],
        ]);
      } else {
        await aiApiForm.validateFields();
      }
      const values = aiApiForm.getFieldsValue(true);
      const services = aiServiceOptions.map(service => ({ service: service.value, ...normalizeAiServiceApiConfig(values.services?.[service.value], service.value) }));
      const servicesToTest = targetService ? services.filter(service => service.service === targetService) : services;
      const missingServices = servicesToTest.filter(service => !service.endpoints[service.selectedModel]).map(service => `【${service.service}】`);
      if (missingServices.length) {
        Modal.warning({ title: "温馨提示", content: `请先填写${missingServices.join("、")}接口，再进行接口测试。`, okText: "我知道了", centered: true });
        return;
      }
      setAiApiTesting(true);
      setAiApiTestDialog({ open: true, phase: "testing", message: targetService ? `系统正在测试【${targetService}】接口并等待模型返回结果。` : "系统正在提交内置测试内容并等待各项服务返回分析结果，首次加载模型可能需要较长时间。", results: [] });
      const response = await fetch("/api/settings/ai-api/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ services, targetService }) });
      const data = await response.json().catch(() => ({})) as { success?: boolean; message?: string; results?: AiApiTestResult[] };
      const success = response.ok && data.success === true;
      setAiApiTestDialog({
        open: true,
        phase: success ? "success" : "error",
        message: data.message || (success ? "全部Ai API接口均连接正常，配置有效，可正常使用。" : "Ai API接口测试失败，请检查配置后重试。"),
        results: Array.isArray(data.results) ? data.results : [],
      });
    } catch (error) {
      if (error instanceof Error) setAiApiTestDialog({ open: true, phase: "error", message: "Ai API接口测试失败，请检查网络连接后重试。", results: [] });
    } finally {
      setAiApiTesting(false);
    }
  };

  const openCreate = () => {
    setEditingBrand(null);
    brandHourForm.resetFields();
    brandHourForm.setFieldsValue({ attendanceStartDayOffset: 0, attendanceStartTime: "20:00", attendanceDeadlineDayOffset: 0, attendanceDeadlineTime: "23:59", allowPostSubmitEdit: false });
    setModalOpen(true);
  };

  const openEditAttendanceParameter = (row: AttendanceParameter) => {
    setEditingBrand(row.brand);
    brandHourForm.resetFields();
    brandHourForm.setFieldsValue(row);
    setModalOpen(true);
  };

  const saveBrandHour = async () => {
    try {
      const values = await brandHourForm.validateFields();
      const minutes = (dayOffset: 0 | 1, time: string) => dayOffset * 24 * 60 + Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
      if (minutes(values.attendanceStartDayOffset, values.attendanceStartTime) >= minutes(values.attendanceDeadlineDayOffset, values.attendanceDeadlineTime)) {
        brandHourForm.setFields([{ name: "attendanceDeadlineTime", errors: ["考勤截止时间必须晚于考勤开始时间"] }]);
        return;
      }
      setSaving(true);
      const response = await fetch("/api/settings/brand-day-hours", { method: editingBrand ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
      const data = await response.json();
      if (!response.ok) return void message.error(data.message || "考勤参数保存失败，请稍后重试");
      message.success(editingBrand ? "考勤参数修改成功" : "考勤参数新增成功");
      setModalOpen(false);
      setEditingBrand(null);
      await loadBrandHours();
    } catch (error) {
      if (error instanceof Error) message.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const configuredBrands = new Set(rows.map(row => row.brand));
  const selectOptions = brandOptions.map(option => ({ ...option, disabled: configuredBrands.has(option.value), label: configuredBrands.has(option.value) ? `${option.label}（已添加）` : option.label }));
  const schedulerStatusView = (() => {
    if (!schedulerStatus) return null;
    const formatTime = (value: string | null) => value ? new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(value)) : "—";
    const last = schedulerStatus.lastRun;
    if (schedulerStatus.todayStatus === "SUCCESS") return { type: "success" as const, message: `今日自动任务已执行（${schedulerStatus.today}）`, description: `完成时间：${formatTime(last?.completedAt ?? null)}；新生成 ${last?.result?.created ?? 0} 条，已存在未覆盖 ${last?.result?.notGenerated ?? 0} 条。` };
    if (schedulerStatus.todayStatus === "RUNNING") return { type: "info" as const, message: "今日自动任务正在执行", description: `开始时间：${formatTime(last?.startedAt ?? null)}。系统采用单日唯一执行锁，不会重复生成。` };
    if (schedulerStatus.todayStatus === "FAILED") return { type: "error" as const, message: "今日自动任务执行失败，将在下一次检查时重试", description: last?.error || "请检查定时任务错误日志。" };
    if (schedulerStatus.todayStatus === "WAITING") return { type: "warning" as const, message: `已到今日自动执行时间 ${schedulerStatus.scheduledTime}，正在等待 Mac 定时服务检查`, description: last ? `最近一次成功执行日期：${last.executionDate}。` : "当前还没有自动执行记录。" };
    return { type: "info" as const, message: `今日计划于 ${schedulerStatus.scheduledTime} 自动执行`, description: last ? `最近执行日期：${last.executionDate}，完成时间：${formatTime(last.completedAt)}。` : "当前还没有自动执行记录。" };
  })();

  return <>
    <Card title="平台信息" className="system-parameter-card" style={{ marginBottom: 16 }} extra={<Button type="primary" loading={platformSaving} onClick={() => void savePlatform()}>保存</Button>}>
      <Form form={platformForm} layout="vertical" initialValues={{ platformName: initialPlatform.platformName, automaticTaskExecutionTime: initialPlatform.automaticTaskExecutionTime, defaultTaskDeadlineDayOffset: initialPlatform.defaultTaskDeadlineDayOffset, defaultTaskDeadlineTime: initialPlatform.defaultTaskDeadlineTime }}>
        <div className="platform-parameter-grid">
          <Form.Item label="平台名称" name="platformName" rules={[{ required: true, whitespace: true, message: "请输入平台名称" }, { max: 30, message: "平台名称不能超过30个字符" }]} extra="将显示在运营端登录页“欢迎登录”下方及登录后的页面左上角">
            <Input maxLength={30} showCount placeholder="请输入平台名称" />
          </Form.Item>
          <Form.Item label="后台LOGO" extra="将显示在登录后的页面左上角；支持PNG、JPG、WEBP，文件不超过2MB">
            <div className="platform-logo-editor">
              <div className="platform-logo-preview">{logoDataUrl ? <img src={logoDataUrl} alt="后台LOGO预览" /> : <span>餐</span>}</div>
              <Space wrap>
                <Upload accept="image/png,image/jpeg,image/webp" showUploadList={false} beforeUpload={beforeLogoUpload}><Button icon={<UploadOutlined />}>选择图片</Button></Upload>
                {logoDataUrl && <Button onClick={() => { setLogoDataUrl(null); setLogoChanged(true); }}>恢复默认图标</Button>}
              </Space>
            </div>
          </Form.Item>
          <Form.Item className="platform-background-item" label="登录页背景图片" extra="建议尺寸：1920×1080像素（16:9）；支持PNG、JPG、JPEG，文件不超过5MB。系统会根据显示区域自动缩放并居中裁切。">
            <div className="platform-background-editor">
              <div className="platform-background-preview">{loginBackgroundDataUrl ? <img src={loginBackgroundDataUrl} alt="登录页背景图片预览" loading="lazy" decoding="async" /> : <span>暂无背景图片</span>}</div>
              <Space wrap>
                <Upload accept=".png,.jpg,.jpeg,image/png,image/jpeg" showUploadList={false} beforeUpload={beforeBackgroundUpload}><Button icon={<UploadOutlined />}>选择图片</Button></Upload>
                {loginBackgroundDataUrl && <Button onClick={() => { setLoginBackgroundDataUrl(null); setLoginBackgroundChanged(true); }}>恢复默认背景</Button>}
              </Space>
            </div>
          </Form.Item>
          <section className="platform-login-addresses">
            <div className="platform-login-addresses-heading"><strong>登录地址</strong><span>地址随当前访问域名自动生成，仅展示，不支持编辑</span></div>
            <div className="platform-login-address-list">
              {loginAddresses.map(item => <div className="platform-login-address-card" key={item.path}>
                <strong>{item.title}</strong>
                <Form.Item label="登录地址" style={{ marginBottom: 0 }} extra="端口及页面访问范围由《角色管理》的权限配置决定"><Input readOnly value={`${siteOrigin || "当前域名"}${item.path}`} /></Form.Item>
              </div>)}
            </div>
          </section>
          <section className="platform-scheduler-settings">
            <div className="platform-login-addresses-heading"><strong>定时任务自动执行</strong><span>系统按北京时间每天自动生成一次应执行的日、周、月任务</span></div>
            <div className="platform-scheduler-grid">
              <Form.Item label="自动执行时间" name="automaticTaskExecutionTime" rules={[{ required: true, message: "请选择自动执行时间" }, { pattern: /^([01]\d|2[0-3]):[0-5]\d$/, message: "请选择正确的自动执行时间" }]} extra="管理员可修改；Mac恢复运行后只补执行当天，不补历史日期">
                <Input type="time" step={60} />
              </Form.Item>
              <Form.Item label="默认任务截止日期" name="defaultTaskDeadlineDayOffset" rules={[{ required: true, message: "请选择默认任务截止日期" }]} extra="新增任务时自动带出，任务仍可单独修改">
                <Select options={[{ value: 0, label: "当日" }, { value: 1, label: "次日" }]} />
              </Form.Item>
              <Form.Item label="默认任务截止时间" name="defaultTaskDeadlineTime" rules={[{ required: true, message: "请选择默认任务截止时间" }, { pattern: /^([01]\d|2[0-3]):[0-5]\d$/, message: "请选择正确的默认截止时间" }]} extra="例如闭店任务可在任务设置中改为次日05:00">
                <Input type="time" step={60} />
              </Form.Item>
            </div>
            {schedulerStatusView && <Alert showIcon type={schedulerStatusView.type} message={schedulerStatusView.message} description={schedulerStatusView.description} />}
          </section>
        </div>
      </Form>
    </Card>

    <Card title="课程培训" className="system-parameter-card" style={{ marginBottom: 16 }} extra={<Button type="primary" loading={trainingSaving} onClick={() => void saveTraining()}>保存</Button>}>
      <Form form={trainingForm} layout="vertical" initialValues={{ dailyLearningR2StorageId: initialPlatform.dailyLearningR2StorageId, trainingVideoR2StorageId: initialPlatform.trainingVideoR2StorageId, trainingAudioR2StorageId: initialPlatform.trainingAudioR2StorageId, trainingDocumentR2StorageId: initialPlatform.trainingDocumentR2StorageId }}>
        <div className="platform-parameter-grid">
          <Form.Item label="课程封面图片" extra="建议尺寸：1280×720像素（16:9）；支持PNG、JPG、JPEG、WEBP，文件不超过5MB。">
            <div className="platform-cover-editor">
              <div className="platform-cover-preview">{courseCoverDataUrl ? <img src={courseCoverDataUrl} alt="课程封面图片预览" loading="lazy" decoding="async" /> : <span>暂无课程封面</span>}</div>
              <Space wrap>
                <Upload accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" showUploadList={false} beforeUpload={beforeCourseCoverUpload}><Button icon={<UploadOutlined />}>选择图片</Button></Upload>
                {courseCoverDataUrl && <Button onClick={() => { setCourseCoverDataUrl(null); setCourseCoverChanged(true); }}>恢复默认封面</Button>}
              </Space>
            </div>
          </Form.Item>
          <Form.Item label="课时封面图片" extra="建议尺寸：1280×720像素（16:9）；支持PNG、JPG、JPEG、WEBP，文件不超过5MB。">
            <div className="platform-cover-editor">
              <div className="platform-cover-preview">{lessonCoverDataUrl ? <img src={lessonCoverDataUrl} alt="课时封面图片预览" loading="lazy" decoding="async" /> : <span>暂无课时封面</span>}</div>
              <Space wrap>
                <Upload accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" showUploadList={false} beforeUpload={beforeLessonCoverUpload}><Button icon={<UploadOutlined />}>选择图片</Button></Upload>
                {lessonCoverDataUrl && <Button onClick={() => { setLessonCoverDataUrl(null); setLessonCoverChanged(true); }}>恢复默认封面</Button>}
              </Space>
            </div>
          </Form.Item>
          <Form.Item label="《每日学习》R2存储空间" name="dailyLearningR2StorageId" extra="选项读取自《R2存储空间》中处于“已启用”状态的记录；暂不配置时可保持为空。">
            <Select allowClear showSearch optionFilterProp="label" placeholder="请选择" options={r2StorageOptions} notFoundContent="暂无已启用的R2存储空间" />
          </Form.Item>
          <section className="platform-training-storage-settings">
            <div className="platform-login-addresses-heading"><strong>培训资料R2存储空间</strong><span>不同类型的培训课件可分别选择存储空间</span></div>
            <div className="platform-r2-storage-grid">
              <Form.Item label="课件视频" name="trainingVideoR2StorageId">
                <Select allowClear showSearch optionFilterProp="label" placeholder="请选择" options={r2StorageOptions} notFoundContent="暂无已启用的R2存储空间" />
              </Form.Item>
              <Form.Item label="课件音频" name="trainingAudioR2StorageId">
                <Select allowClear showSearch optionFilterProp="label" placeholder="请选择" options={r2StorageOptions} notFoundContent="暂无已启用的R2存储空间" />
              </Form.Item>
              <Form.Item label="课件文档（含Word、PPT等）" name="trainingDocumentR2StorageId">
                <Select allowClear showSearch optionFilterProp="label" placeholder="请选择" options={r2StorageOptions} notFoundContent="暂无已启用的R2存储空间" />
              </Form.Item>
            </div>
          </section>
        </div>
      </Form>
    </Card>

    <Card title="考勤参数" className="system-parameter-card" style={{ marginBottom: 16 }} extra={<Button type="primary" icon={<PlusOutlined />} disabled={Boolean(loadError)} onClick={openCreate}>新增</Button>}>
      {loadError ? <Alert type="error" showIcon message={loadError} action={<Button size="small" onClick={() => void loadBrandHours()}>重新加载</Button>} /> : <Table<AttendanceParameter>
        rowKey="brand"
        columns={[
          { title: "品牌", dataIndex: "brand" },
          { title: "工作日小时（小时/日）", dataIndex: "workdayHours", render: value => Number(value).toFixed(Number.isInteger(value) ? 0 : 1) },
          { title: "考勤开始时间", key: "attendanceStart", render: (_, row) => `${row.attendanceStartDayOffset === 1 ? "次日" : "当日"} ${row.attendanceStartTime}` },
          { title: "考勤截止时间", key: "attendanceDeadline", render: (_, row) => `${row.attendanceDeadlineDayOffset === 1 ? "次日" : "当日"} ${row.attendanceDeadlineTime}` },
          { title: "提交后允许修改", dataIndex: "allowPostSubmitEdit", width: 140, render: value => value ? "是" : "否" },
          { title: "操作", key: "action", width: 90, render: (_, row) => <Button type="link" size="small" onClick={() => openEditAttendanceParameter(row)}>编辑</Button> },
        ]}
        dataSource={rows}
        loading={loading}
        pagination={false}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无考勤参数配置" /> }}
      />}
    </Card>

    <Card title="Ai API" className="system-parameter-card" style={{ marginBottom: 16 }} extra={<Space><Button loading={aiApiTesting} disabled={aiApiSaving || aiServiceLoadError || !aiServiceOptions.length} onClick={() => void testAiApi()}>接口测试</Button><Button type="primary" loading={aiApiSaving} disabled={aiApiTesting || aiServiceLoadError || !aiServiceOptions.length} onClick={() => void saveAiApi()}>保存</Button></Space>}>
      <Form form={aiApiForm} layout="vertical" disabled={aiApiTesting} initialValues={{ services: initialAiApiServices }}>
        <div className="platform-ai-api-grid">
          {aiServiceLoadError
            ? <Alert type="error" showIcon message="Ai服务字典读取失败" description="请检查《数据字典》中的Ai服务（Ai_Service）记录是否存在、已启用且枚举值文件可正常读取。" />
            : !aiServiceOptions.length
              ? <Alert type="warning" showIcon message="Ai服务字典暂无枚举值" description="请先在《数据字典》的Ai服务（Ai_Service）记录中添加枚举值。" />
              : aiServiceOptions.map(service => <section className="platform-ai-service-card" key={service.value}>
                <div className="platform-ai-service-heading"><strong>【{service.label}】</strong><span>模型与接口独立配置</span></div>
                <Form.Item label="调用模型" name={["services", service.value, "selectedModel"]} rules={[{ required: true, message: `请选择【${service.label}】调用模型` }]}>
                  <Select options={AI_MODEL_OPTIONS.map(option => ({ ...option, disabled: !aiModelSupportsService(option.value, service.value), label: !aiModelSupportsService(option.value, service.value) ? `${option.label}（当前服务不支持）` : option.label }))} />
                </Form.Item>
                <Form.Item noStyle shouldUpdate={(previous, current) => previous.services?.[service.value]?.selectedModel !== current.services?.[service.value]?.selectedModel}>
                  {({ getFieldValue }) => {
                    const selectedModel = (getFieldValue(["services", service.value, "selectedModel"]) || "MAGE_VL") as AiModelId;
                    const example = aiEndpointExample(selectedModel, service.value);
                    return <Form.Item label={<Space size={10}><span>{`【${service.label}】接口`}</span><Button size="small" loading={aiApiTesting} disabled={aiApiSaving} onClick={() => void testAiApi(service.value)}>测试此接口</Button></Space>} name={["services", service.value, "endpoints", selectedModel]} rules={[{ max: 500, message: `【${service.label}】接口不能超过500个字符` }, { type: "url", message: "请输入以http://或https://开头的有效接口地址" }]} extra={`当前使用${aiModelLabel(selectedModel)}；切换模型时会保留已填写的接口地址`}>
                      <Input allowClear maxLength={500} placeholder={example ? `例如：${example}` : `请填写【${service.label}】服务的完整接口地址`} />
                    </Form.Item>;
                  }}
                </Form.Item>
              </section>)}
        </div>
      </Form>
    </Card>

    <Card title="其他参数" className="system-parameter-card" extra={<Button type="primary" loading={otherSaving} onClick={() => void saveOther()}>保存</Button>}>
      <Form form={otherForm} layout="vertical" initialValues={{ contractExpiringWarningDays: initialPlatform.contractExpiringWarningDays, birthdayReminderDays: initialPlatform.birthdayReminderDays, birthdayReminderCalculationTime: initialPlatform.birthdayReminderCalculationTime, laborCostPolicy: initialLaborCostPolicy.policy }}>
        <div className="platform-other-parameter">
          <span>合同记录距离“合同截止日期”不足</span>
          <Form.Item name="contractExpiringWarningDays" className="platform-other-parameter-input" rules={[{ required: true, message: "请输入合同即将到期天数" }, { type: "number", min: 1, max: 3650, message: "请输入1至3650之间的整数" }]}>
            <InputNumber min={1} max={3650} step={1} precision={0} addonAfter="天" aria-label="合同即将到期天数" />
          </Form.Item>
          <span>时，自动标为「即将到期」记录。</span>
        </div>
        <div className="platform-other-parameter-tip">系统统一调度器按北京时间每日凌晨 02:00 自动检查当前处于「正常」状态的合同；达到条件后更新合同状态，同一天不会重复处理。</div>
        <div className="platform-other-parameter">
          <span>仪表板生日提醒为</span>
          <Form.Item name="birthdayReminderDays" className="platform-other-parameter-input" rules={[{ required: true, message: "请输入生日提醒天数" }, { type: "number", min: 1, max: 365, message: "请输入1至365之间的整数" }]}>
            <InputNumber min={1} max={365} step={1} precision={0} addonAfter="天" aria-label="仪表板生日提醒天数" />
          </Form.Item>
          <span>内的员工数量，系统自动计算生日提醒任务的时间为每日</span>
          <Form.Item name="birthdayReminderCalculationTime" className="platform-other-parameter-time-input" rules={[{ required: true, message: "请选择生日提醒计算时间" }, { pattern: /^([01]\d|2[0-3]):[0-5]\d$/, message: "请选择正确的生日提醒计算时间" }]}>
            <Input type="time" step={60} aria-label="生日提醒每日计算时间" />
          </Form.Item>
          <span>。</span>
        </div>
        <div className="platform-other-parameter-tip">系统只统计处于「在职」状态且已维护生日的员工；农历生日会先换算为对应公历日期后再纳入提醒人数。</div>
        <section className="labor-cost-policy-settings">
          <Alert
            showIcon
            type="info"
            message={`员工成本参数将于${monthLabel(laborPolicyEffectiveMonth)}生效`}
            description="本月可多次修改，最后一次成功保存的参数覆盖此前设置；当前月及历史月份不会重新计算。"
          />
          <div className="labor-cost-policy-grid">
            <div className="labor-cost-policy-card">
              <div className="labor-cost-policy-heading"><strong>公司员工</strong><span>适用于人员归属为“总部”的员工</span></div>
              <Form.Item label="公司员工每月公休数" name={["laborCostPolicy", "headquartersMonthlyRestRule"]} rules={[{ required: true, message: "请选择公司员工每月公休数" }]}>
                <Select options={monthlyRestRuleOptions} />
              </Form.Item>
              {headquartersMonthlyRestRule === "FIXED_DAYS" && <Form.Item label="固定天数" name={["laborCostPolicy", "headquartersFixedRestDays"]} rules={[{ required: true, message: "请输入公司员工固定公休数" }, { type: "number", min: 0, max: 31, message: "请输入0至31之间的整数" }]} extra="固定公休天数与法定假期数直接相加，不进行日期去重。">
                <InputNumber min={0} max={31} step={1} precision={0} addonAfter="天/月" style={{ width: "100%" }} />
              </Form.Item>}
              <Form.Item label="总部员工法定假期数" name={["laborCostPolicy", "headquartersLegalHolidayRule"]} rules={[{ required: true, message: "请选择总部员工法定假期数" }]}>
                <Select options={legalHolidayRuleOptions} />
              </Form.Item>
            </div>
            <div className="labor-cost-policy-card">
              <div className="labor-cost-policy-heading"><strong>门店员工</strong><span>适用于人员归属非“总部”且关联门店的员工</span></div>
              <Form.Item label="门店员工每月公休数" name={["laborCostPolicy", "storeMonthlyRestRule"]} rules={[{ required: true, message: "请选择门店员工每月公休数" }]}>
                <Select options={monthlyRestRuleOptions} />
              </Form.Item>
              {storeMonthlyRestRule === "FIXED_DAYS" && <Form.Item label="固定天数" name={["laborCostPolicy", "storeFixedRestDays"]} rules={[{ required: true, message: "请输入门店员工固定公休数" }, { type: "number", min: 0, max: 31, message: "请输入0至31之间的整数" }]} extra="固定公休天数与法定假期数直接相加，不进行日期去重。">
                <InputNumber min={0} max={31} step={1} precision={0} addonAfter="天/月" style={{ width: "100%" }} />
              </Form.Item>}
              <Form.Item label="门店员工法定假期数" name={["laborCostPolicy", "storeLegalHolidayRule"]} rules={[{ required: true, message: "请选择门店员工法定假期数" }]}>
                <Select options={legalHolidayRuleOptions} />
              </Form.Item>
            </div>
          </div>
          <div className="platform-other-parameter-tip">“法定放假日期”读取《设置 / 休息日管理》的日期；与按星期计算的公休日重合时自动去重。“当月每个法定假期+1天”按节日个数计算，每个节日计1天；“当月N个法定假期+1天”表示当月只要有法定节日就统一计1天。</div>
        </section>
      </Form>
    </Card>

    <Modal
      title="温馨提示"
      open={aiApiTestDialog.open}
      centered
      closable={aiApiTestDialog.phase !== "testing"}
      maskClosable={aiApiTestDialog.phase !== "testing"}
      keyboard={aiApiTestDialog.phase !== "testing"}
      onCancel={() => { if (aiApiTestDialog.phase !== "testing") setAiApiTestDialog(dialog => ({ ...dialog, open: false })); }}
      footer={aiApiTestDialog.phase === "testing" ? null : <Button type="primary" onClick={() => setAiApiTestDialog(dialog => ({ ...dialog, open: false }))}>我知道了</Button>}
      destroyOnHidden
    >
      {aiApiTestDialog.phase === "testing"
        ? <Result icon={<LoadingOutlined spin />} title="正在测试Ai API接口" subTitle={aiApiTestDialog.message} />
        : <>
          <Result status={aiApiTestDialog.phase === "success" ? "success" : "error"} title={aiApiTestDialog.phase === "success" ? "Ai API接口连接正常" : "Ai API接口测试未通过"} subTitle={aiApiTestDialog.message} />
          {aiApiTestDialog.results.length > 0 && <Space direction="vertical" size={12} style={{ width: "100%" }}>
            {aiApiTestDialog.results.map(result => <Alert key={result.service} showIcon type={result.ok ? "success" : "error"} message={`${result.label} · ${result.modelLabel}：${result.ok ? "正常" : "异常"}`} description={`${result.message}（耗时 ${(result.elapsedMilliseconds / 1000).toFixed(1)} 秒）`} />)}
          </Space>}
        </>}
    </Modal>

    <Modal title={editingBrand ? "编辑考勤参数" : "新增考勤参数"} open={modalOpen} onCancel={() => { setModalOpen(false); setEditingBrand(null); }} maskClosable={false} destroyOnHidden footer={<Space><Button onClick={() => { setModalOpen(false); setEditingBrand(null); }}>取消</Button><Button type="primary" loading={saving} onClick={() => void saveBrandHour()}>保存</Button></Space>}>
      <Form form={brandHourForm} layout="vertical" style={{ paddingTop: 8 }}>
        <Form.Item label="品牌" name="brand" rules={[{ required: true, message: "请选择品牌" }]}>
          <Select disabled={Boolean(editingBrand)} placeholder="请选择" options={selectOptions} showSearch optionFilterProp="label" />
        </Form.Item>
        <Form.Item label="工作日小时" name="workdayHours" rules={[{ required: true, message: "请输入工作日小时" }, { type: "number", min: 0.1, max: 24, message: "请输入0.1至24之间的数字" }]} extra="最多支持小数点后一位，例如1.5、8.6">
          <InputNumber min={0.1} max={24} step={0.1} precision={1} style={{ width: "100%" }} placeholder="请输入工作日小时" addonAfter="小时/日" />
        </Form.Item>
        <Form.Item label="考勤开始时间" required extra="可设置为当日或次日的具体时间，例如当日20:00">
          <Space.Compact block>
            <Form.Item name="attendanceStartDayOffset" noStyle rules={[{ required: true, message: "请选择考勤开始日期" }]}>
              <Select style={{ width: 110 }} options={[{ value: 0, label: "当日" }, { value: 1, label: "次日" }]} />
            </Form.Item>
            <Form.Item name="attendanceStartTime" noStyle rules={[{ required: true, message: "请选择考勤开始时间" }, { pattern: /^([01]\d|2[0-3]):[0-5]\d$/, message: "请选择正确的考勤开始时间" }]}>
              <Input type="time" step={60} style={{ width: "calc(100% - 110px)" }} />
            </Form.Item>
          </Space.Compact>
        </Form.Item>
        <Form.Item label="考勤截止时间" required extra="可设置为当日或次日的具体时间，例如次日05:00">
          <Space.Compact block>
            <Form.Item name="attendanceDeadlineDayOffset" noStyle rules={[{ required: true, message: "请选择考勤截止日期" }]}>
              <Select style={{ width: 110 }} options={[{ value: 0, label: "当日" }, { value: 1, label: "次日" }]} />
            </Form.Item>
            <Form.Item name="attendanceDeadlineTime" noStyle rules={[{ required: true, message: "请选择考勤截止时间" }, { pattern: /^([01]\d|2[0-3]):[0-5]\d$/, message: "请选择正确的考勤截止时间" }]}>
              <Input type="time" step={60} style={{ width: "calc(100% - 110px)" }} />
            </Form.Item>
          </Space.Compact>
        </Form.Item>
        <Form.Item name="allowPostSubmitEdit" valuePropName="checked" extra="勾选后，已提交的考勤可在原截止时间前修改并重新提交；系统将保留修改版本和操作记录。">
          <Checkbox>提交后允许修改</Checkbox>
        </Form.Item>
      </Form>
    </Modal>
  </>;
}

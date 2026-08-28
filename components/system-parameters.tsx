"use client";

import { PlusOutlined, UploadOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Empty, Form, Input, InputNumber, message, Modal, Select, Space, Table, Upload } from "antd";
import type { UploadProps } from "antd";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { PlatformConfig } from "@/lib/platform-config";

type BrandOption = { label: string; value: string };
type R2StorageOption = { label: string; value: string };
type BrandDayHour = { brand: string; workdayHours: number };
type PlatformValues = { platformName: string; leadPcLoginTags: string; leadH5LoginTags: string; storeH5LoginTags: string; automaticTaskExecutionTime: string; defaultTaskDeadlineDayOffset: 0 | 1; defaultTaskDeadlineTime: string; dailyLearningR2StorageId: string | null; trainingVideoR2StorageId: string | null; trainingAudioR2StorageId: string | null; trainingDocumentR2StorageId: string | null };
type BrandHourValues = { brand: string; workdayHours: number };
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

const loginAddresses: Array<{ title: string; path: string; field: "leadPcLoginTags" | "leadH5LoginTags" | "storeH5LoginTags"; adminBypass?: boolean }> = [
  { title: "运营PC端", path: "/lead_pc/login", field: "leadPcLoginTags", adminBypass: true },
  { title: "运营H5移动端", path: "/lead_h5/login", field: "leadH5LoginTags" },
  { title: "门店H5移动端", path: "/store_h5/login", field: "storeH5LoginTags" },
];

export function SystemParameters({ initialPlatform, r2StorageOptions }: { initialPlatform: PlatformConfig; r2StorageOptions: R2StorageOption[] }) {
  const router = useRouter();
  const [platformForm] = Form.useForm<PlatformValues>();
  const [brandHourForm] = Form.useForm<BrandHourValues>();
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(initialPlatform.logoDataUrl);
  const [loginBackgroundDataUrl, setLoginBackgroundDataUrl] = useState<string | null>(initialPlatform.loginBackgroundDataUrl);
  const [logoChanged, setLogoChanged] = useState(false);
  const [loginBackgroundChanged, setLoginBackgroundChanged] = useState(false);
  const [platformSaving, setPlatformSaving] = useState(false);
  const [siteOrigin, setSiteOrigin] = useState("");
  const [rows, setRows] = useState<BrandDayHour[]>([]);
  const [brandOptions, setBrandOptions] = useState<BrandOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [schedulerStatus, setSchedulerStatus] = useState<SchedulerStatus | null>(null);

  const loadSchedulerStatus = async () => {
    try {
      const response = await fetch("/api/settings/task-scheduler/status", { cache: "no-store" });
      if (response.ok) setSchedulerStatus(await response.json());
    } catch {
      // 状态展示不影响系统参数和品牌工时的正常维护。
    }
  };

  const loadBrandHours = async () => {
    setLoading(true); setLoadError("");
    try {
      const response = await fetch("/api/settings/brand-day-hours", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "品牌工作日小时加载失败，请稍后重试");
      setRows(data.rows); setBrandOptions(data.brandOptions);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "品牌工作日小时加载失败，请稍后重试");
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

  const savePlatform = async () => {
    try {
      const values = await platformForm.validateFields();
      setPlatformSaving(true);
      const imageChanges = {
        ...(logoChanged && logoDataUrl ? { logoDataUrl } : {}),
        ...(loginBackgroundChanged && loginBackgroundDataUrl ? { loginBackgroundDataUrl } : {}),
        removeLogo: logoChanged && logoDataUrl === null,
        removeLoginBackground: loginBackgroundChanged && loginBackgroundDataUrl === null,
      };
      const response = await fetch("/api/settings/parameters", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...values, ...imageChanges }) });
      const data = await response.json();
      if (!response.ok) return void message.error(data.message || "平台信息保存失败，请稍后重试");
      message.success("平台信息保存成功");
      setLogoChanged(false); setLoginBackgroundChanged(false);
      await loadSchedulerStatus();
      router.refresh();
    } catch (error) {
      if (error instanceof Error) message.error(error.message);
    } finally {
      setPlatformSaving(false);
    }
  };

  const openCreate = () => {
    brandHourForm.resetFields();
    setModalOpen(true);
  };

  const saveBrandHour = async () => {
    try {
      const values = await brandHourForm.validateFields();
      setSaving(true);
      const response = await fetch("/api/settings/brand-day-hours", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
      const data = await response.json();
      if (!response.ok) return void message.error(data.message || "品牌工作日小时保存失败，请稍后重试");
      message.success("品牌工作日小时新增成功");
      setModalOpen(false);
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
      <Form form={platformForm} layout="vertical" initialValues={{ platformName: initialPlatform.platformName, leadPcLoginTags: initialPlatform.leadPcLoginTags, leadH5LoginTags: initialPlatform.leadH5LoginTags, storeH5LoginTags: initialPlatform.storeH5LoginTags, automaticTaskExecutionTime: initialPlatform.automaticTaskExecutionTime, defaultTaskDeadlineDayOffset: initialPlatform.defaultTaskDeadlineDayOffset, defaultTaskDeadlineTime: initialPlatform.defaultTaskDeadlineTime, dailyLearningR2StorageId: initialPlatform.dailyLearningR2StorageId, trainingVideoR2StorageId: initialPlatform.trainingVideoR2StorageId, trainingAudioR2StorageId: initialPlatform.trainingAudioR2StorageId, trainingDocumentR2StorageId: initialPlatform.trainingDocumentR2StorageId }}>
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
              <div className="platform-background-preview">{loginBackgroundDataUrl ? <img src={loginBackgroundDataUrl} alt="登录页背景图片预览" /> : <span>暂无背景图片</span>}</div>
              <Space wrap>
                <Upload accept=".png,.jpg,.jpeg,image/png,image/jpeg" showUploadList={false} beforeUpload={beforeBackgroundUpload}><Button icon={<UploadOutlined />}>选择图片</Button></Upload>
                {loginBackgroundDataUrl && <Button onClick={() => { setLoginBackgroundDataUrl(null); setLoginBackgroundChanged(true); }}>恢复默认背景</Button>}
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
          <section className="platform-login-addresses">
            <div className="platform-login-addresses-heading"><strong>登录地址</strong><span>地址随当前访问域名自动生成，仅展示，不支持编辑</span></div>
            <div className="platform-login-address-list">
              {loginAddresses.map(item => <div className="platform-login-address-card" key={item.path}>
                <strong>{item.title}</strong>
                <Form.Item label="登录地址" style={{ marginBottom: 14 }}><Input readOnly value={`${siteOrigin || "当前域名"}${item.path}`} /></Form.Item>
                <Form.Item label="登录用户标签" name={item.field} rules={[{ max: 200, message: `${item.title}登录用户标签不能超过200个字符` }]} extra={item.adminBypass ? "多个标签之间用｜分割；系统管理员角色无需设置标签也可以登录" : "多个标签之间用｜分割"}>
                  <Input maxLength={200} placeholder="例如：运营人员｜区域经理" />
                </Form.Item>
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

    <Card title="品牌工作日小时" className="system-parameter-card" extra={<Button type="primary" icon={<PlusOutlined />} disabled={Boolean(loadError)} onClick={openCreate}>新增</Button>}>
      {loadError ? <Alert type="error" showIcon message={loadError} action={<Button size="small" onClick={() => void loadBrandHours()}>重新加载</Button>} /> : <Table<BrandDayHour>
        rowKey="brand"
        columns={[{ title: "品牌", dataIndex: "brand" }, { title: "工作日小时（小时/日）", dataIndex: "workdayHours", render: value => Number(value).toFixed(Number.isInteger(value) ? 0 : 1) }]}
        dataSource={rows}
        loading={loading}
        pagination={false}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无品牌工作日小时配置" /> }}
      />}
    </Card>

    <Modal title="新增品牌工作日小时" open={modalOpen} onCancel={() => setModalOpen(false)} maskClosable={false} destroyOnHidden footer={<Space><Button onClick={() => setModalOpen(false)}>取消</Button><Button type="primary" loading={saving} onClick={() => void saveBrandHour()}>保存</Button></Space>}>
      <Form form={brandHourForm} layout="vertical" style={{ paddingTop: 8 }}>
        <Form.Item label="品牌" name="brand" rules={[{ required: true, message: "请选择品牌" }]}>
          <Select placeholder="请选择" options={selectOptions} showSearch optionFilterProp="label" />
        </Form.Item>
        <Form.Item label="工作日小时" name="workdayHours" rules={[{ required: true, message: "请输入工作日小时" }, { type: "number", min: 0.1, max: 24, message: "请输入0.1至24之间的数字" }]} extra="最多支持小数点后一位，例如1.5、8.6">
          <InputNumber min={0.1} max={24} step={0.1} precision={1} style={{ width: "100%" }} placeholder="请输入工作日小时" addonAfter="小时/日" />
        </Form.Item>
      </Form>
    </Modal>
  </>;
}

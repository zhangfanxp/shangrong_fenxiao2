"use client";

import { PlusOutlined, UploadOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Empty, Form, Input, InputNumber, message, Modal, Select, Space, Table, Upload } from "antd";
import type { UploadProps } from "antd";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { PlatformConfig } from "@/lib/platform-config";

type BrandOption = { label: string; value: string };
type BrandDayHour = { brand: string; workdayHours: number };
type PlatformValues = { platformName: string };
type BrandHourValues = { brand: string; workdayHours: number };

export function SystemParameters({ initialPlatform }: { initialPlatform: PlatformConfig }) {
  const router = useRouter();
  const [platformForm] = Form.useForm<PlatformValues>();
  const [brandHourForm] = Form.useForm<BrandHourValues>();
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(initialPlatform.logoDataUrl);
  const [loginBackgroundDataUrl, setLoginBackgroundDataUrl] = useState<string | null>(initialPlatform.loginBackgroundDataUrl);
  const [platformSaving, setPlatformSaving] = useState(false);
  const [rows, setRows] = useState<BrandDayHour[]>([]);
  const [brandOptions, setBrandOptions] = useState<BrandOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

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

  useEffect(() => { void loadBrandHours(); }, []);

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
    reader.onload = () => setLogoDataUrl(typeof reader.result === "string" ? reader.result : null);
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
    reader.onload = () => setLoginBackgroundDataUrl(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => message.error("登录页背景图片读取失败，请重新选择");
    reader.readAsDataURL(file);
    return false;
  };

  const savePlatform = async () => {
    try {
      const values = await platformForm.validateFields();
      setPlatformSaving(true);
      const response = await fetch("/api/settings/parameters", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ platformName: values.platformName, logoDataUrl, loginBackgroundDataUrl }) });
      const data = await response.json();
      if (!response.ok) return void message.error(data.message || "平台信息保存失败，请稍后重试");
      message.success("平台信息保存成功");
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

  return <>
    <Card title="平台信息" className="system-parameter-card" style={{ marginBottom: 16 }} extra={<Button type="primary" loading={platformSaving} onClick={() => void savePlatform()}>保存</Button>}>
      <Form form={platformForm} layout="vertical" initialValues={{ platformName: initialPlatform.platformName }}>
        <div className="platform-parameter-grid">
          <Form.Item label="平台名称" name="platformName" rules={[{ required: true, whitespace: true, message: "请输入平台名称" }, { max: 30, message: "平台名称不能超过30个字符" }]} extra="将显示在运营端登录页“欢迎登录”下方及登录后的页面左上角">
            <Input maxLength={30} showCount placeholder="请输入平台名称" />
          </Form.Item>
          <Form.Item label="后台LOGO" extra="将显示在登录后的页面左上角；支持PNG、JPG、WEBP，文件不超过2MB">
            <div className="platform-logo-editor">
              <div className="platform-logo-preview">{logoDataUrl ? <img src={logoDataUrl} alt="后台LOGO预览" /> : <span>餐</span>}</div>
              <Space wrap>
                <Upload accept="image/png,image/jpeg,image/webp" showUploadList={false} beforeUpload={beforeLogoUpload}><Button icon={<UploadOutlined />}>选择图片</Button></Upload>
                {logoDataUrl && <Button onClick={() => setLogoDataUrl(null)}>恢复默认图标</Button>}
              </Space>
            </div>
          </Form.Item>
          <Form.Item className="platform-background-item" label="登录页背景图片" extra="建议尺寸：1920×1080像素（16:9）；支持PNG、JPG、JPEG，文件不超过5MB。系统会根据显示区域自动缩放并居中裁切。">
            <div className="platform-background-editor">
              <div className="platform-background-preview">{loginBackgroundDataUrl ? <img src={loginBackgroundDataUrl} alt="登录页背景图片预览" /> : <span>暂无背景图片</span>}</div>
              <Space wrap>
                <Upload accept=".png,.jpg,.jpeg,image/png,image/jpeg" showUploadList={false} beforeUpload={beforeBackgroundUpload}><Button icon={<UploadOutlined />}>选择图片</Button></Upload>
                {loginBackgroundDataUrl && <Button onClick={() => setLoginBackgroundDataUrl(null)}>恢复默认背景</Button>}
              </Space>
            </div>
          </Form.Item>
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

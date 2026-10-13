"use client";

import { ArrowLeftOutlined, SaveOutlined, UserAddOutlined } from "@ant-design/icons";
import { Alert, Button, DatePicker, Form, Input, InputNumber, Segmented, Select, Skeleton, message } from "antd";
import type { Dayjs } from "dayjs";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

type Option = { value: string; label: string };
type PlatformUser = { id: string; username: string; realName: string; role: { name: string } };
type CreateOptions = {
  store: { id: string; name: string; brand: { id: string; name: string }; workdayHours: number | null };
  positions: Option[];
  socialSecurityStatuses: Option[];
  users: PlatformUser[];
};
type EmployeeForm = {
  name: string;
  phone: string;
  idNumber: string;
  birthdayCalendar: "LUNAR" | "SOLAR";
  birthday?: Dayjs;
  hireDate: Dayjs;
  positionLevel: string;
  contractSignDate: Dayjs;
  contractYears?: number | null;
  contractExpiryDate: Dayjs;
  homeAddress: string;
  currentAddress: string;
  baseSalary: number;
  socialSecurity: string;
  supplementaryMaterial?: string;
  platformAccess?: "YES" | "NO";
  platformUserId?: string;
  remark?: string;
};

const apiDate = (value?: Dayjs) => value?.format("YYYY-MM-DD") || null;

export function StoreH5EmployeeCreate() {
  const router = useRouter();
  const [form] = Form.useForm<EmployeeForm>();
  const [options, setOptions] = useState<CreateOptions>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const savingRef = useRef(false);
  const platformAccess = Form.useWatch("platformAccess", form);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/store-h5/my-store/employees/options", { cache: "no-store" });
      const result = await response.json().catch(() => null);
      if (response.status === 401) { router.replace("/store_h5/login"); return; }
      if (!response.ok) throw new Error(result?.message || "新增员工选项加载失败，请稍后重试");
      setOptions(result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "新增员工选项加载失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { void load(); }, [load]);

  const save = async (values: EmployeeForm) => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      const payload = {
        ...values,
        birthday: values.birthday?.format("MM-DD") || null,
        hireDate: apiDate(values.hireDate),
        contractSignDate: apiDate(values.contractSignDate),
        contractExpiryDate: apiDate(values.contractExpiryDate),
        contractYears: values.contractYears ?? null,
        supplementaryMaterial: values.supplementaryMaterial?.trim() || null,
        platformAccess: values.platformAccess || null,
        platformUserId: values.platformAccess === "YES" ? values.platformUserId : null,
        remark: values.remark?.trim() || null,
      };
      const response = await fetch("/api/store-h5/my-store/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => null);
      if (response.status === 401) { router.replace("/store_h5/login"); return; }
      if (!response.ok) throw new Error(result?.message || "员工新增失败，请稍后重试");
      message.success("员工档案新增成功");
      router.replace("/store_h5/my-store/employees");
      router.refresh();
    } catch (reason) {
      const text = reason instanceof Error ? reason.message : "员工新增失败，请稍后重试";
      setError(text);
      message.error(text);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const onValuesChange = (changed: Partial<EmployeeForm>, values: EmployeeForm) => {
    setError("");
    if (changed.contractYears && values.contractSignDate) {
      form.setFieldValue("contractExpiryDate", values.contractSignDate.add(changed.contractYears, "year").subtract(1, "day"));
    }
    if (changed.contractSignDate && values.contractYears) {
      form.setFieldValue("contractExpiryDate", changed.contractSignDate.add(values.contractYears, "year").subtract(1, "day"));
    }
    if (changed.platformAccess === "NO") form.setFieldValue("platformUserId", undefined);
  };

  return <main className="store-h5-page store-h5-task-page store-h5-my-store-page store-h5-employee-create-page">
    <header className="store-h5-subheader"><Button type="text" aria-label="返回员工列表" icon={<ArrowLeftOutlined />} onClick={() => router.push("/store_h5/my-store/employees")} /><div><strong>新增员工</strong><small>{options?.store.name || "新增人员档案"}</small></div><span /></header>
    {loading ? <section className="store-h5-task-content"><Skeleton active paragraph={{ rows: 12 }} /></section> : error && !options ? <section className="store-h5-task-content"><Alert type="error" showIcon message={error} action={<Button size="small" onClick={() => void load()}>重新加载</Button>} /></section> : options ? <>
      <section className="store-h5-my-store-summary"><span><UserAddOutlined /></span><div><small>新增至当前门店</small><strong>{options.store.name}</strong></div></section>
      {error && <Alert className="store-h5-inline-alert" type="error" showIcon message="员工档案未保存" description={error} closable onClose={() => setError("")} />}
      <Form<EmployeeForm>
        form={form}
        layout="vertical"
        className="store-h5-employee-create-form"
        initialValues={{ birthdayCalendar: "LUNAR", contractYears: null }}
        disabled={saving}
        requiredMark
        scrollToFirstError={{ behavior: "smooth", block: "center", focus: true }}
        onValuesChange={onValuesChange}
        onFinish={values => void save(values)}
        onFinishFailed={({ errorFields }) => message.error(errorFields[0]?.errors[0] || "请检查必填内容")}
      >
        <FormSection title="基础信息">
          <Form.Item label="姓名" name="name" rules={[{ required: true, message: "请输入姓名" }, { max: 8, message: "姓名不能超过8个汉字" }]}><Input maxLength={8} placeholder="请输入姓名" autoComplete="name" /></Form.Item>
          <Form.Item label="手机号" name="phone" rules={[{ required: true, message: "请输入手机号" }, { pattern: /^1\d{10}$/, message: "请输入正确的11位手机号" }]}><Input maxLength={11} inputMode="numeric" placeholder="请输入11位手机号" autoComplete="tel" onChange={event => form.setFieldValue("phone", event.target.value.replace(/\D/g, ""))} /></Form.Item>
          <Form.Item label="身份证" name="idNumber" rules={[{ required: true, message: "请输入身份证号码" }, { pattern: /^\d{17}[\dXx]$/, message: "请输入正确的身份证号码" }]}><Input maxLength={18} placeholder="请输入身份证号码" onChange={event => form.setFieldValue("idNumber", event.target.value.toUpperCase())} /></Form.Item>
          <Form.Item label="员工生日"><div className="store-h5-birthday-row"><Form.Item name="birthdayCalendar" noStyle><Segmented block options={[{ label: "农历", value: "LUNAR" }, { label: "公历", value: "SOLAR" }]} /></Form.Item><Form.Item name="birthday" noStyle><DatePicker format="MM-DD" placeholder="选择月、日" /></Form.Item></div></Form.Item>
          <ReadOnlyField label="人员状态" value="在职" />
        </FormSection>

        <FormSection title="任职信息">
          <Form.Item label="入职时间" name="hireDate" rules={[{ required: true, message: "请选择入职时间" }]}><DatePicker format="YYYY-MM-DD" placeholder="请选择入职时间" /></Form.Item>
          <Form.Item label="所属岗位星级" name="positionLevel" rules={[{ required: true, message: "请选择所属岗位星级" }]}><Select placeholder="请选择" options={options.positions} /></Form.Item>
          <ReadOnlyField label="人员归属" value={options.store.brand.name} />
          <ReadOnlyField label="部门/店面" value={options.store.name} />
          <ReadOnlyField label="离职日期" value="由离职流程产生" />
        </FormSection>

        <FormSection title="合同信息">
          <Form.Item label="合同签署日期" name="contractSignDate" rules={[{ required: true, message: "请选择合同签署日期" }]}><DatePicker format="YYYY-MM-DD" placeholder="请选择合同签署日期" /></Form.Item>
          <Form.Item label="合同年限" name="contractYears"><InputNumber min={1} max={50} precision={0} suffix="年" placeholder="选填" /></Form.Item>
          <Form.Item label="合同到期日" name="contractExpiryDate" rules={[{ required: true, message: "请选择合同到期日" }, ({ getFieldValue }) => ({ validator(_, value?: Dayjs) { const start = getFieldValue("contractSignDate") as Dayjs | undefined; return !value || !start || !value.isBefore(start, "day") ? Promise.resolve() : Promise.reject(new Error("合同到期日不能早于合同签署日期")); } })]}><DatePicker format="YYYY-MM-DD" placeholder="请选择合同到期日" onChange={() => form.setFieldValue("contractYears", null)} /></Form.Item>
        </FormSection>

        <FormSection title="联系信息">
          <Form.Item label="家庭住址" name="homeAddress" rules={[{ required: true, message: "请输入家庭住址" }, { max: 50, message: "家庭住址不能超过50个字符" }]}><Input.TextArea maxLength={50} showCount autoSize={{ minRows: 2, maxRows: 4 }} placeholder="请输入家庭住址" /></Form.Item>
          <Form.Item label="现住址" name="currentAddress" rules={[{ required: true, message: "请输入现住址" }, { max: 50, message: "现住址不能超过50个字符" }]}><Input.TextArea maxLength={50} showCount autoSize={{ minRows: 2, maxRows: 4 }} placeholder="请输入现住址" /></Form.Item>
        </FormSection>

        <FormSection title="薪资社保">
          <Form.Item label="基本工资" name="baseSalary" rules={[{ required: true, message: "请输入基本工资" }, { type: "number", min: 0, message: "基本工资不能小于0" }]}><InputNumber min={0} max={9999999999} precision={2} prefix="¥" controls={false} inputMode="decimal" placeholder="请输入基本工资" /></Form.Item>
          <ReadOnlyField label="用工日成本" value="保存后由系统自动计算" />
          <ReadOnlyField label="用工小时成本" value="保存后由系统自动计算" />
          <ReadOnlyField label="工作日小时" value={options.store.workdayHours === null ? "门店尚未配置" : `${options.store.workdayHours} 小时/日`} />
          <Form.Item label="社保情况" name="socialSecurity" rules={[{ required: true, message: "请选择社保情况" }]}><Select placeholder="请选择" options={options.socialSecurityStatuses} /></Form.Item>
          <ReadOnlyField label="调薪历史" value="暂无调薪记录" />
        </FormSection>

        <FormSection title="其他信息">
          <Form.Item label="需补充材料" name="supplementaryMaterial"><Input.TextArea maxLength={50} showCount autoSize={{ minRows: 2, maxRows: 4 }} /></Form.Item>
          <Form.Item label="平台权限" name="platformAccess"><Select allowClear placeholder="请选择" options={[{ value: "YES", label: "有" }, { value: "NO", label: "无" }]} /></Form.Item>
          {platformAccess === "YES" && <Form.Item label="本平台用户" name="platformUserId" rules={[{ required: true, message: "请选择本平台用户" }]}><Select showSearch optionFilterProp="label" placeholder="选择已启用且未绑定的用户" options={options.users.map(user => ({ value: user.id, label: `${user.username} / ${user.realName} / ${user.role.name}` }))} /></Form.Item>}
          <Form.Item label="备注信息" name="remark"><Input.TextArea maxLength={50} showCount autoSize={{ minRows: 2, maxRows: 4 }} /></Form.Item>
        </FormSection>
        <div className="store-h5-submit-space" />
        <div className="store-h5-submit-bar"><Button block type="primary" htmlType="submit" size="large" icon={<SaveOutlined />} loading={saving}>保存</Button></div>
      </Form>
    </> : null}
  </main>;
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="store-h5-detail-section store-h5-employee-form-section"><h2>{title}</h2>{children}</section>;
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return <div className="store-h5-readonly-row"><span>{label}</span><strong>{value}</strong></div>;
}

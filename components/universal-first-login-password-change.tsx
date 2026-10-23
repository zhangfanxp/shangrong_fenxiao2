"use client";

import { Alert, Button, Form, Input, message } from "antd";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Values = { oldPassword: string; newPassword: string; confirmPassword: string };

export function UniversalFirstLoginPasswordChange({ realName }: { realName: string }) {
  const router = useRouter();
  const [form] = Form.useForm<Values>();
  const [saving, setSaving] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();

  const submit = async (values: Values) => {
    setSaving(true);
    try {
      const response = await fetch("/api/auth/first-login-change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldPassword: values.oldPassword, newPassword: values.newPassword }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        messageApi.error(result.message || "修改密码失败，请重试");
        return;
      }
      messageApi.success("密码已修改，可以继续使用系统");
      router.replace(result.redirectTo || "/lead_pc/dashboard");
      router.refresh();
    } catch {
      messageApi.error("网络连接异常，请重试");
    } finally {
      setSaving(false);
    }
  };

  return <>{contextHolder}<main className="login-page">
    <section className="login-brand"><div><h1>完成首次安全设置</h1><p>首次登录必须先修改初始密码，修改完成后即可继续使用系统。</p></div></section>
    <section className="login-panel"><div className="login-card">
      <h2>修改初始密码</h2>
      <div className="sub">欢迎，{realName}</div>
      <Alert type="warning" showIcon message="请设置新的个人密码" style={{ marginBottom: 20 }} />
      <Form form={form} layout="vertical" onFinish={submit} requiredMark={false}>
        <Form.Item label="当前密码" name="oldPassword" rules={[{ required: true, message: "请输入当前密码" }]}><Input.Password autoComplete="current-password" autoFocus /></Form.Item>
        <Form.Item label="新密码" name="newPassword" rules={[{ required: true, message: "请输入新密码" }, { min: 8, message: "新密码至少需要 8 位" }]} extra="至少 8 位，且不能与当前密码相同"><Input.Password autoComplete="new-password" /></Form.Item>
        <Form.Item label="确认新密码" name="confirmPassword" dependencies={["newPassword"]} rules={[
          { required: true, message: "请再次输入新密码" },
          ({ getFieldValue }) => ({ validator(_, value) { return !value || getFieldValue("newPassword") === value ? Promise.resolve() : Promise.reject(new Error("两次输入的新密码不一致")); } }),
        ]}><Input.Password autoComplete="new-password" /></Form.Item>
        <Button type="primary" htmlType="submit" block loading={saving}>保存新密码并继续</Button>
      </Form>
    </div></section>
  </main></>;
}

"use client";

import { EyeInvisibleOutlined, EyeTwoTone, LockOutlined, UserOutlined } from "@ant-design/icons";
import { Alert, Button, Form, Input } from "antd";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Values = { username: string; password: string };

export function LeadH5Login({ platformName, logoDataUrl }: { platformName: string; logoDataUrl: string | null }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const login = async (values: Values) => {
    setLoading(true); setError(undefined);
    try {
      const response = await fetch("/api/lead-h5/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
      const data = await response.json();
      if (!response.ok) return void setError(data.message || "登录失败，请稍后重试");
      router.replace(data.redirectTo || "/lead_h5"); router.refresh();
    } catch { setError("网络连接异常，请稍后重试"); }
    finally { setLoading(false); }
  };
  return <main className="lead-h5-login-page">
    <section className="lead-h5-login-card">
      <div className="lead-h5-brand-mark">{logoDataUrl ? <img src={logoDataUrl} alt="系统Logo" /> : <span>运</span>}</div>
      <h1>运营H5移动端</h1><p>{platformName}</p>
      {error && <Alert type="error" showIcon message={error} />}
      <Form layout="vertical" requiredMark={false} onFinish={login} autoComplete="off" size="large">
        <Form.Item label="账号" name="username" normalize={value => typeof value === "string" ? value.trim() : value} rules={[{ required: true, message: "请输入账号" }]}>
          <Input prefix={<UserOutlined />} placeholder="请输入账号" autoCapitalize="none" autoCorrect="off" autoFocus />
        </Form.Item>
        <Form.Item label="密码" name="password" rules={[{ required: true, message: "请输入密码" }]}>
          <Input.Password prefix={<LockOutlined />} placeholder="请输入密码" autoComplete="current-password" iconRender={visible => visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />} />
        </Form.Item>
        <Form.Item noStyle shouldUpdate>{({ getFieldValue }) => <Button block type="primary" htmlType="submit" loading={loading} disabled={loading || !getFieldValue("username")?.trim() || !getFieldValue("password")}>{loading ? "登录中..." : "登录"}</Button>}</Form.Item>
      </Form>
    </section>
  </main>;
}


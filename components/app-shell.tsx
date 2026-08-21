"use client";

import { KeyOutlined, LogoutOutlined, QuestionCircleOutlined, UserOutlined } from "@ant-design/icons";
import { Avatar, Button, Dropdown, Form, Input, Layout, Menu, Modal, Tooltip, message } from "antd";
import type { MenuProps } from "antd";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { firstAccessiblePath } from "@/lib/access-control";
import { findNavigation, navigationForPermissions } from "@/lib/navigation";
import type { PlatformConfig } from "@/lib/platform-config";

const { Header, Content } = Layout;

export function AppShell({ children, realName, permissions, platform }: { children: React.ReactNode; realName: string; permissions: string[]; platform: PlatformConfig }) {
  const pathname = usePathname(); const router = useRouter();
  const [passwordOpen, setPasswordOpen] = useState(false); const [passwordSaving, setPasswordSaving] = useState(false); const [logoutOpen, setLogoutOpen] = useState(false); const [logoutSaving, setLogoutSaving] = useState(false); const [passwordForm] = Form.useForm<{ oldPassword: string; newPassword: string; confirmPassword: string }>();
  const allowedNavigation = useMemo(() => navigationForPermissions(permissions), [permissions]);
  const current = useMemo(() => findNavigation(pathname, allowedNavigation), [pathname, allowedNavigation]);
  const landingPath = firstAccessiblePath(permissions);
  const [activeGroupKey, setActiveGroupKey] = useState(current?.group.key ?? allowedNavigation[0]?.key ?? "");
  const [optimisticPath, setOptimisticPath] = useState(pathname);
  const activeGroup = allowedNavigation.find(group => group.key === activeGroupKey) ?? current?.group ?? null;
  const menuItems: MenuProps["items"] = allowedNavigation.map(group => ({ key: group.key, label: group.label }));

  useEffect(() => {
    if (current?.group.key) setActiveGroupKey(current.group.key);
    setOptimisticPath(pathname);
  }, [pathname, current?.group.key]);

  useEffect(() => {
    allowedNavigation.forEach(group => {
      const href = group.href ?? group.children?.[0]?.href;
      if (href) router.prefetch(href);
    });
  }, [allowedNavigation, router]);

  useEffect(() => {
    activeGroup?.children?.forEach(item => router.prefetch(item.href));
  }, [activeGroup, router]);

  const handlePrimaryMenuClick: MenuProps["onClick"] = ({ key }) => {
    const group = allowedNavigation.find(item => item.key === key);
    if (!group) return;
    const href = group.href ?? group.children?.[0]?.href;
    setActiveGroupKey(key);
    if (href) {
      setOptimisticPath(href);
      router.push(href);
    }
  };
  const logout = async () => { setLogoutSaving(true); try { const response = await fetch("/api/auth/logout", { method: "POST" }); if (!response.ok) { message.error("退出登录失败，请稍后重试"); return; } setLogoutOpen(false); router.replace("/lead_pc/login"); router.refresh(); } catch { message.error("退出登录失败，请稍后重试"); } finally { setLogoutSaving(false); } };
  const changePassword = async () => { try { const values = await passwordForm.validateFields(); setPasswordSaving(true); const response = await fetch("/api/auth/change-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ oldPassword: values.oldPassword, newPassword: values.newPassword }) }); const result = await response.json(); if (!response.ok) { message.error(result.message || "修改密码失败，请稍后重试"); return; } message.success("密码修改成功"); passwordForm.resetFields(); setPasswordOpen(false); } catch { /* Form displays field-level validation errors. */ } finally { setPasswordSaving(false); } };
  const userItems: MenuProps["items"] = [{ key: "profile", icon: <UserOutlined />, label: "个人信息" }, { key: "password", icon: <KeyOutlined />, label: "修改密码" }, { type: "divider" }, { key: "logout", danger: true, icon: <LogoutOutlined />, label: "退出登录" }];
  const handleUserMenuClick: MenuProps["onClick"] = ({ key }) => {
    if (key === "password") setPasswordOpen(true);
    if (key === "logout") setLogoutOpen(true);
  };
  return <Layout className="content-shell">
      <Header style={{ background: "#fff", padding: "0 24px", height: 64, display: "flex", alignItems: "center", borderBottom: "1px solid #f0f0f0", gap: 18 }}>
        <Link href={landingPath} className="header-brand"><span className="header-brand-mark">{platform.logoDataUrl ? <img src={platform.logoDataUrl} alt="后台LOGO" /> : "餐"}</span><span>{platform.platformName}</span></Link>
        <div style={{ flex: 1, minWidth: 0 }} className="top-nav"><Menu mode="horizontal" selectedKeys={activeGroup ? [activeGroup.key] : []} items={menuItems} onClick={handlePrimaryMenuClick} style={{ borderBottom: 0, lineHeight: "63px" }} /></div>
        <Tooltip title="帮助"><Button type="text" icon={<QuestionCircleOutlined />} aria-label="帮助" /></Tooltip>
        <Dropdown menu={{ items: userItems, onClick: handleUserMenuClick }} placement="bottomRight" trigger={["hover", "click"]}><Button type="text" style={{ height: 40 }} icon={<Avatar size="small" icon={<UserOutlined />} />}>{realName}</Button></Dropdown>
      </Header>
      {activeGroup?.children && <div className="subnav"><div className="subnav-inner">{activeGroup.children.map(item => <Link className={`subnav-link ${optimisticPath === item.href ? "active" : ""}`} href={item.href} onClick={() => setOptimisticPath(item.href)} key={item.key}>{item.label}</Link>)}</div></div>}
      <Content>{children}</Content>
      <Modal title="修改密码" open={passwordOpen} onCancel={() => { passwordForm.resetFields(); setPasswordOpen(false); }} onOk={changePassword} okText="确定修改" cancelText="取消" confirmLoading={passwordSaving} destroyOnHidden>
        <Form form={passwordForm} layout="vertical" requiredMark="optional" style={{ paddingTop: 8 }}>
          <Form.Item label="旧密码" name="oldPassword" rules={[{ required: true, message: "请输入旧密码" }]}><Input.Password placeholder="请输入旧密码" autoComplete="current-password" /></Form.Item>
          <Form.Item label="新密码" name="newPassword" rules={[{ required: true, message: "请输入新密码" }, { min: 8, message: "新密码至少需要 8 位" }]} extra="请设置至少 8 位的新密码"><Input.Password placeholder="请输入新密码" autoComplete="new-password" /></Form.Item>
          <Form.Item label="确认新密码" name="confirmPassword" dependencies={["newPassword"]} rules={[{ required: true, message: "请再次输入新密码" }, ({ getFieldValue }) => ({ validator(_, value) { return !value || getFieldValue("newPassword") === value ? Promise.resolve() : Promise.reject(new Error("两次输入的新密码不一致")); } })]}><Input.Password placeholder="请再次输入新密码" autoComplete="new-password" /></Form.Item>
        </Form>
      </Modal>
      <Modal title="确认退出当前账号？" open={logoutOpen} onCancel={() => setLogoutOpen(false)} onOk={logout} okText="退出登录" cancelText="取消" okButtonProps={{ danger: true }} confirmLoading={logoutSaving} destroyOnHidden>
        退出后需要重新登录才能访问系统。
      </Modal>
  </Layout>;
}

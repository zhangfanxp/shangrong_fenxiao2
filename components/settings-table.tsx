"use client";

import { Card, Empty, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";

type Row = Record<string, unknown> & { id: string };
type SettingsTableProps = { kind: "roles" | "users" | "dictionaries" | "logs"; rows: Row[] };

const date = (value: unknown) => value ? new Date(String(value)).toLocaleString("zh-CN", { hour12: false }) : "-";
const status = (value: unknown) => <Tag color={value === "ENABLED" ? "success" : "default"}>{value === "ENABLED" ? "已启用" : "已禁用"}</Tag>;

export function SettingsTable({ kind, rows }: SettingsTableProps) {
  const columnsByKind: Record<SettingsTableProps["kind"], ColumnsType<Row>> = {
    roles: [{ title: "角色名称", dataIndex: "name" }, { title: "英文名称", dataIndex: "code" }, { title: "类型", dataIndex: "type", render: value => value === "SYSTEM" ? "系统内置" : "自定义" }, { title: "状态", dataIndex: "status", render: status }, { title: "创建时间", dataIndex: "createdAt", render: date }],
    users: [{ title: "账号", dataIndex: "username" }, { title: "真实姓名", dataIndex: "realName" }, { title: "角色", dataIndex: "roleName" }, { title: "手机号", dataIndex: "phone", render: value => value || "-" }, { title: "状态", dataIndex: "status", render: status }, { title: "最后登录", dataIndex: "lastLoginAt", render: date }],
    dictionaries: [{ title: "字典类型", dataIndex: "type" }, { title: "字典标签", dataIndex: "label" }, { title: "字典值", dataIndex: "value" }, { title: "排序", dataIndex: "sort" }, { title: "状态", dataIndex: "status", render: status }],
    logs: [{ title: "操作用户", dataIndex: "userName", render: value => value || "系统" }, { title: "页面", dataIndex: "page" }, { title: "功能", dataIndex: "action" }, { title: "结果", dataIndex: "result", render: value => <Tag color={value === "成功" ? "success" : "error"}>{String(value)}</Tag> }, { title: "操作时间", dataIndex: "createdAt", render: date }, { title: "详情", dataIndex: "detail", ellipsis: true }],
  };
  return <Card><Table<Row> rowKey="id" size="middle" scroll={{ x: 800 }} columns={columnsByKind[kind]} dataSource={rows} pagination={kind === "roles" ? false : { pageSize: kind === "logs" ? 20 : 10 }} locale={{ emptyText: <Empty description={kind === "dictionaries" ? "暂无数据字典，可通过新增功能维护" : "暂无数据"} /> }} /></Card>;
}

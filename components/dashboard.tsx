"use client";

import { CheckCircleOutlined, ClockCircleOutlined, FileTextOutlined, GiftOutlined, IdcardOutlined, ShopOutlined, TeamOutlined } from "@ant-design/icons";
import { Card, Col, Empty, Modal, Progress, Row, Skeleton, Statistic, Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import Link from "next/link";
import { useEffect, useState } from "react";
import { displayDate } from "@/lib/format";

type ReminderEmployee = { id: string; name: string; phone: string; positionLevel: string; workplace: string };
type ExpiringEmployeeContract = ReminderEmployee & { contractSignDate: string | null; contractExpiryDate: string | null };
type BirthdayReminderEmployee = ReminderEmployee & { birthdayCalendar: "LUNAR" | "SOLAR"; birthday: string | null };
type Stats = {
  contracts: number;
  stores: number;
  expiringContracts: number;
  contractExpiringWarningDays: number;
  expiringEmployeeContracts: number;
  employeeContractExpiringDays: number;
  expiringEmployeeContractRows: ExpiringEmployeeContract[];
  birthdayReminderCount: number;
  birthdayReminderDays: number;
  birthdayReminderRows: BirthdayReminderEmployee[];
  overdueContracts: number;
  todayLogins: number;
  taskCount: number;
  taskRecordCount: number;
  completedTaskCount: number;
  taskByType: Record<string, { total: number; completed: number }>;
};

const metrics = [
  { key: "contracts", title: "合同总数", icon: <FileTextOutlined />, href: "/lead_pc/stores/contracts", helper: "全部合同档案" },
  { key: "stores", title: "门店总数", icon: <ShopOutlined />, href: "/lead_pc/stores/list", helper: "已建立门店档案" },
  { key: "expiringContracts", title: "即将到期门店合同", icon: <ClockCircleOutlined />, href: "/lead_pc/stores/contracts?expiringOnly=true", helper: "即将到期记录" },
  { key: "overdueContracts", title: "逾期合同", icon: <ClockCircleOutlined />, href: "/lead_pc/stores/contracts?status=EXPIRED", helper: "需尽快处理" },
  { key: "expiringEmployeeContracts", title: "即将到期员工合同", icon: <IdcardOutlined />, href: "/lead_pc/staff/0", helper: "员工合同到期提醒" },
  { key: "birthdayReminderCount", title: "生日提醒", icon: <GiftOutlined />, href: "/lead_pc/staff/0", helper: "近期生日员工" },
  { key: "todayLogins", title: "今日登录用户", icon: <TeamOutlined />, href: "/lead_pc/settings/operation-logs", helper: "今日已登录人数" },
] as const;

const taskLabel: Record<string, string> = { DAILY: "日任务", WEEKLY: "周任务", MONTHLY: "月度任务", TEMPORARY: "临时任务", CALENDAR: "日历任务" };

const contractColumns: ColumnsType<ExpiringEmployeeContract> = [
  { title: "姓名", dataIndex: "name", width: 100 },
  { title: "手机号", dataIndex: "phone", width: 145 },
  { title: "岗位职级", dataIndex: "positionLevel", width: 140 },
  { title: "所属门店/部门", dataIndex: "workplace", width: 190 },
  { title: "合同开始日期", dataIndex: "contractSignDate", width: 130, render: displayDate },
  { title: "合同到期日", dataIndex: "contractExpiryDate", width: 130, render: displayDate },
];

const birthdayColumns: ColumnsType<BirthdayReminderEmployee> = [
  { title: "姓名", dataIndex: "name", width: 100 },
  { title: "手机号", dataIndex: "phone", width: 145 },
  { title: "岗位职级", dataIndex: "positionLevel", width: 140 },
  { title: "所属门店/部门", dataIndex: "workplace", width: 190 },
  { title: "阳历/阴历", dataIndex: "birthdayCalendar", width: 100, render: value => value === "SOLAR" ? "阳历" : "阴历" },
  { title: "生日", dataIndex: "birthday", width: 110, render: value => value ? `${Number(value.slice(0, 2))}月${Number(value.slice(3))}日` : "-" },
];

export function Dashboard() {
  const [stats, setStats] = useState<Stats>();
  const [error, setError] = useState(false);
  const [reminderModal, setReminderModal] = useState<"employee-contract" | "birthday" | null>(null);
  const load = () => { setError(false); fetch("/api/dashboard").then(response => response.ok ? response.json() : Promise.reject()).then(setStats).catch(() => setError(true)); };

  useEffect(load, []);

  if (error) return <Card><Empty description="数据加载失败，请稍后重试"><a onClick={load}>重新加载</a></Empty></Card>;
  if (!stats) return <Skeleton active paragraph={{ rows: 10 }} />;

  const completionRate = stats.taskRecordCount ? Math.min(100, Math.round(stats.completedTaskCount / stats.taskRecordCount * 100)) : 0;

  const helper = (key: typeof metrics[number]["key"], fallback: string) => key === "expiringContracts"
    ? `不足${stats.contractExpiringWarningDays}天到期`
    : key === "expiringEmployeeContracts"
      ? `不足${stats.employeeContractExpiringDays}天到期`
      : key === "birthdayReminderCount"
        ? `${stats.birthdayReminderDays}天内生日员工`
        : fallback;

  return <>
    <Row gutter={[16, 16]}>
      {metrics.map(metric => {
        const reminder = metric.key === "expiringEmployeeContracts" ? "employee-contract" : metric.key === "birthdayReminderCount" ? "birthday" : null;
        const card = <Card
          className="metric-card"
          size="small"
          role={reminder ? "button" : undefined}
          tabIndex={reminder ? 0 : undefined}
          aria-label={reminder ? `查看${metric.title}` : undefined}
          onClick={reminder ? () => setReminderModal(reminder) : undefined}
          onKeyDown={reminder ? event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setReminderModal(reminder); } } : undefined}
        >
          <Statistic title={<span className="metric-label">{metric.icon}　{metric.title}</span>} value={stats[metric.key]} valueStyle={{ fontSize: 30, fontWeight: 600 }} />
          <div className="metric-helper">{helper(metric.key, metric.helper)}</div>
        </Card>;
        return <Col xs={24} sm={12} xl={4} key={metric.key}>{reminder ? card : <Link href={metric.href}>{card}</Link>}</Col>;
      })}
    </Row>

    <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
      <Col xs={24} xl={14}>
        <Card className="section-card" title="平台已发布任务" extra={<Link href="/lead_pc/tasks/settings">查看任务设置</Link>}>
          <Statistic title="已发布任务总数" value={stats.taskCount} prefix={<FileTextOutlined />} />
          <Row gutter={[24, 24]} style={{ marginTop: 24 }}>
            {Object.entries(stats.taskByType).map(([type, value]) => <Col span={12} sm={6} key={type}><div className="metric-label">{taskLabel[type]}</div><div style={{ fontSize: 22, fontWeight: 600, marginTop: 8 }}>{value.total}</div><div className="metric-helper">已完成 {value.completed} 项</div></Col>)}
          </Row>
        </Card>
      </Col>
      <Col xs={24} xl={10}>
        <Card className="section-card" title="平台已完成任务" extra={<CheckCircleOutlined style={{ color: "#52c41a" }} />}>
          <Statistic title="已完成任务总数" value={stats.completedTaskCount} />
          <div style={{ marginTop: 28 }}><div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}><span className="metric-label">整体完成率</span><span>{completionRate}%</span></div><Progress percent={completionRate} strokeColor="#52C41A" /></div>
        </Card>
      </Col>
    </Row>

    <Modal title="即将到期劳动合同" open={reminderModal === "employee-contract"} onCancel={() => setReminderModal(null)} footer={null} width={1050} centered destroyOnHidden>
      <Table rowKey="id" size="small" columns={contractColumns} dataSource={stats.expiringEmployeeContractRows} scroll={{ x: 805 }} pagination={{ pageSize: 10, hideOnSinglePage: true, showTotal: total => `共 ${total} 人` }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无即将到期的员工合同" /> }} />
    </Modal>

    <Modal title="生日提醒" open={reminderModal === "birthday"} onCancel={() => setReminderModal(null)} footer={null} width={1050} centered destroyOnHidden>
      <Table rowKey="id" size="small" columns={birthdayColumns} dataSource={stats.birthdayReminderRows} scroll={{ x: 785 }} pagination={{ pageSize: 10, hideOnSinglePage: true, showTotal: total => `共 ${total} 人` }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无符合提醒规则的生日员工" /> }} />
    </Modal>
  </>;
}

"use client";
import { CheckCircleOutlined, ClockCircleOutlined, FileTextOutlined, ShopOutlined, TeamOutlined } from "@ant-design/icons";
import { Card, Col, Empty, Progress, Row, Skeleton, Statistic } from "antd";
import Link from "next/link";
import { useEffect, useState } from "react";

type Stats = { contracts: number; stores: number; expiringContracts: number; overdueContracts: number; todayLogins: number; taskCount: number; completedTaskCount: number; taskByType: Record<string, { total: number; completed: number }> };
const metrics = [
  { key: "contracts", title: "合同总数", icon: <FileTextOutlined />, href: "/lead_pc/stores/contracts", helper: "全部合同档案" },
  { key: "stores", title: "门店总数", icon: <ShopOutlined />, href: "/lead_pc/stores/list", helper: "已建立门店档案" },
  { key: "expiringContracts", title: "近效期合同", icon: <ClockCircleOutlined />, href: "/lead_pc/stores/contracts", helper: "90 天内到期" },
  { key: "overdueContracts", title: "逾期合同", icon: <ClockCircleOutlined />, href: "/lead_pc/stores/contracts", helper: "需尽快处理" },
  { key: "todayLogins", title: "今日登录用户", icon: <TeamOutlined />, href: "/lead_pc/settings/operation-logs", helper: "今日已登录人数" },
] as const;
const taskLabel: Record<string, string> = { DAILY: "日任务", WEEKLY: "周任务", MONTHLY: "月度任务", TEMPORARY: "临时任务" };

export function Dashboard() {
  const [stats, setStats] = useState<Stats>(); const [error, setError] = useState(false);
  const load = () => { setError(false); fetch("/api/dashboard").then(r => r.ok ? r.json() : Promise.reject()).then(setStats).catch(() => setError(true)); };
  useEffect(load, []);
  if (error) return <Card><Empty description="数据加载失败，请稍后重试"><a onClick={load}>重新加载</a></Empty></Card>;
  if (!stats) return <Skeleton active paragraph={{ rows: 10 }} />;
  return <><Row gutter={[16, 16]}>{metrics.map(metric => <Col xs={24} sm={12} xl={4} key={metric.key}><Link href={metric.href}><Card className="metric-card" size="small"><Statistic title={<span className="metric-label">{metric.icon}　{metric.title}</span>} value={stats[metric.key]} valueStyle={{ fontSize: 30, fontWeight: 600 }} /><div className="metric-helper">{metric.helper}</div></Card></Link></Col>)}</Row><Row gutter={[16, 16]} style={{ marginTop: 16 }}><Col xs={24} xl={14}><Card className="section-card" title="平台已发布任务" extra={<Link href="/lead_pc/tasks/settings">查看任务设置</Link>}><Statistic title="已发布任务总数" value={stats.taskCount} prefix={<FileTextOutlined />} /><Row gutter={[24, 24]} style={{ marginTop: 24 }}>{Object.entries(stats.taskByType).map(([type, value]) => <Col span={12} sm={6} key={type}><div className="metric-label">{taskLabel[type]}</div><div style={{ fontSize: 22, fontWeight: 600, marginTop: 8 }}>{value.total}</div><div className="metric-helper">已完成 {value.completed} 项</div></Col>)}</Row></Card></Col><Col xs={24} xl={10}><Card className="section-card" title="平台已完成任务" extra={<CheckCircleOutlined style={{ color: "#52c41a" }} />}><Statistic title="已完成任务总数" value={stats.completedTaskCount} /><div style={{ marginTop: 28 }}><div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}><span className="metric-label">整体完成率</span><span>{stats.taskCount ? Math.round(stats.completedTaskCount / stats.taskCount * 100) : 0}%</span></div><Progress percent={stats.taskCount ? Math.round(stats.completedTaskCount / stats.taskCount * 100) : 0} strokeColor="#52C41A" /></div></Card></Col></Row></>;
}

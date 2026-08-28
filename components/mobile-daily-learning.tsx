"use client";

import { ArrowLeftOutlined, CheckCircleFilled, ClockCircleOutlined, LockOutlined, ReadOutlined, ReloadOutlined } from "@ant-design/icons";
import { Alert, Button, Empty, message, Progress, Skeleton, Tag } from "antd";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type LearningDay = { weekDay: number; name: string; date: string; content: string | null; hasTask: boolean; available: boolean; completed: boolean };
type LearningPlan = { id: string; recordNo: string; isoYear: number; isoWeek: number; studentTag: string; learningDays: number; weekRangeText: string; completedDays: number; days: LearningDay[] };

export function MobileDailyLearning({ apiBase, homePath, clientName }: { apiBase: string; homePath: string; clientName: string }) {
  const router = useRouter(); const [plans, setPlans] = useState<LearningPlan[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(false); const [submitting, setSubmitting] = useState<string>();
  const load = useCallback(async () => {
    setLoading(true); setError(false);
    try { const response = await fetch(apiBase, { cache: "no-store" }); const data = await response.json(); if (response.status === 401) { router.replace(homePath.replace(/\/$/, "") + "/login"); return; } if (!response.ok) throw new Error(data.message); setPlans(data.plans || []); }
    catch { setError(true); }
    finally { setLoading(false); }
  }, [apiBase, homePath, router]);
  useEffect(() => { void load(); }, [load]);
  const complete = async (planId: string, day: LearningDay) => {
    const key = `${planId}:${day.weekDay}`; setSubmitting(key);
    try { const response = await fetch(`${apiBase}/${planId}/complete`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ weekDay: day.weekDay }) }); const data = await response.json(); if (!response.ok) throw new Error(data.message || "学习完成状态保存失败，请稍后重试"); message.success(`${day.name}学习已完成`); await load(); }
    catch (reason) { message.error(reason instanceof Error ? reason.message : "学习完成状态保存失败，请稍后重试"); }
    finally { setSubmitting(undefined); }
  };
  return <main className="mobile-learning-page">
    <header className="mobile-learning-header"><Button type="text" aria-label="返回" icon={<ArrowLeftOutlined />} onClick={() => router.push(homePath)} /><div><strong>每日学习</strong><small>{clientName}</small></div><span /></header>
    <section className="mobile-learning-hero"><span><ReadOutlined /></span><div><h1>今日学习，日日精进</h1><p>按日期完成本周学习内容</p></div></section>
    {loading ? <div className="mobile-learning-state"><Skeleton active paragraph={{ rows: 8 }} /></div> : error ? <div className="mobile-learning-state"><Alert type="error" showIcon message="每日学习内容加载失败，请稍后重试" action={<Button size="small" icon={<ReloadOutlined />} onClick={() => void load()}>重试</Button>} /></div> : !plans.length ? <div className="mobile-learning-empty"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="本周暂无每日学习计划" /><p>如有新的学习安排，将在这里展示</p></div> : <div className="mobile-learning-plans">{plans.map(plan => <section className="mobile-learning-plan" key={plan.id}>
      <div className="mobile-learning-plan-head"><div><Tag color="blue">{plan.studentTag}</Tag><strong>{plan.isoYear}年第{plan.isoWeek}周</strong><small>{plan.weekRangeText}</small></div><span>{plan.completedDays}/{plan.learningDays}天</span></div>
      <Progress percent={plan.learningDays ? Math.min(100, Math.round(plan.completedDays / plan.learningDays * 100)) : 0} showInfo={false} strokeColor="#1677ff" />
      <div className="mobile-learning-days">{plan.days.map(day => <article key={day.weekDay} className={`${day.completed ? "completed" : ""} ${!day.available ? "locked" : ""}`}>
        <div className="mobile-learning-day-title"><span>{day.completed ? <CheckCircleFilled /> : day.available ? <ClockCircleOutlined /> : <LockOutlined />}</span><div><strong>{day.name}</strong><small>{day.date}</small></div>{day.completed && <Tag color="success">已完成</Tag>}</div>
        <div className="mobile-learning-day-content">{!day.available ? <p className="muted">学习内容将在当天开放</p> : !day.hasTask ? <p className="muted">当天没有学习任务</p> : <p>{day.content}</p>}</div>
        {day.available && day.hasTask && !day.completed && <Button block type="primary" loading={submitting === `${plan.id}:${day.weekDay}`} onClick={() => void complete(plan.id, day)}>我已完成学习</Button>}
      </article>)}</div>
    </section>)}</div>}
  </main>;
}

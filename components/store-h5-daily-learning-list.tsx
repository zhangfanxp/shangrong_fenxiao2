"use client";

import { ArrowLeftOutlined, CheckCircleFilled, ClockCircleOutlined, ReadOutlined, ReloadOutlined, RightOutlined } from "@ant-design/icons";
import { Alert, Button, Empty, Skeleton, Tag } from "antd";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type LearningTask = {
  id: string;
  recordNo: string;
  studentTag: string;
  date: string;
  title: string;
  contentPreview: string;
  completed: boolean;
  completedAt: string | null;
};

export function StoreH5DailyLearningList({ canView }: { canView: boolean }) {
  const router = useRouter();
  const [tasks, setTasks] = useState<LearningTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setError(false);
    try {
      const response = await fetch("/api/store-h5/daily-learning", { cache: "no-store" });
      const data = await response.json();
      if (response.status === 401) { router.replace("/store_h5/login"); return; }
      if (!response.ok) throw new Error(data.message);
      setTasks(data.tasks || []);
    } catch { setError(true); }
    finally { setLoading(false); }
  }, [router]);
  useEffect(() => { void load(); }, [load]);

  return <main className="mobile-learning-page store-learning-list-page">
    <header className="mobile-learning-header">
      <Button type="text" aria-label="返回首页" icon={<ArrowLeftOutlined />} onClick={() => router.push("/store_h5")} />
      <div><strong>每日学习</strong><small>门店员工移动端</small></div><span />
    </header>
    <section className="mobile-learning-hero"><span><ReadOutlined /></span><div><h1>今日学习，日日精进</h1><p>朗读学习内容并提交录音</p></div></section>
    {loading ? <div className="mobile-learning-state"><Skeleton active paragraph={{ rows: 6 }} /></div>
      : error ? <div className="mobile-learning-state"><Alert type="error" showIcon message="每日学习内容加载失败，请稍后重试" action={<Button size="small" icon={<ReloadOutlined />} onClick={() => void load()}>重试</Button>} /></div>
        : !tasks.length ? <div className="mobile-learning-empty"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="今天暂无每日学习任务" /><p>如有新的学习安排，将在这里展示</p></div>
          : <div className="store-learning-task-list">{tasks.map(task => <button type="button" disabled={!canView} key={task.id} className={`store-learning-task-card ${task.completed ? "completed" : ""}`} onClick={() => router.push(`/store_h5/daily-learning/${task.id}`)}>
            <span className="store-learning-task-icon">{task.completed ? <CheckCircleFilled /> : <ClockCircleOutlined />}</span>
            <span className="store-learning-task-main"><span className="store-learning-task-title">{task.title}</span><span className="store-learning-task-preview">{task.contentPreview}</span><span className="store-learning-task-meta"><Tag color={task.completed ? "success" : "processing"}>{task.completed ? "已完成" : "待学习"}</Tag><span>{task.studentTag}</span></span></span>
            <RightOutlined className="store-learning-task-arrow" />
          </button>)}</div>}
  </main>;
}

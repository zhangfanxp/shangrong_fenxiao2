"use client";

import {
  ArrowLeftOutlined, AudioOutlined, BookOutlined, CheckCircleFilled, ClockCircleOutlined,
  FilePdfOutlined, FilePptOutlined, PlayCircleOutlined, ReadOutlined, ReloadOutlined,
  RightOutlined, VideoCameraOutlined,
} from "@ant-design/icons";
import { Alert, Button, Empty, Progress, Skeleton, Tag, message } from "antd";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from "react";

type Channel = "lead-h5" | "store-h5";
type CourseSummary = {
  id: string; recordNo: string; courseName: string; courseDescription: string | null; applicablePosition: string;
  lessonCount: number; completedLessons: number; progress: number; completed: boolean; assignedAt: string | null; coverUrl: string;
};
type LessonSummary = {
  id: string; recordNo: string; chapterName: string; chapterDescription: string | null; coursewareType: "VIDEO" | "AUDIO" | "PDF" | "PPT";
  coursewareTypeText: string; sortOrder: number; fileSizeText: string; progressSeconds: number; completed: boolean; coverUrl: string;
};
type CourseDetail = CourseSummary & { brands: string[]; lessons: LessonSummary[] };
type LessonDetail = LessonSummary & {
  courseId: string; courseName: string; originalFileName: string; mimeType: string; remark: string | null; fileUrl: string;
};

function paths(channel: Channel) {
  const webBase = channel === "lead-h5" ? "/lead_h5" : "/store_h5";
  return { webBase, apiBase: `/api/${channel}/online-courses`, loginPath: `${webBase}/login`, homePath: webBase };
}

function formatDate(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

function coursewareIcon(type: LessonSummary["coursewareType"]) {
  if (type === "VIDEO") return <VideoCameraOutlined />;
  if (type === "AUDIO") return <AudioOutlined />;
  if (type === "PDF") return <FilePdfOutlined />;
  return <FilePptOutlined />;
}

function CourseHeader({ title, subtitle, back, channel }: { title: string; subtitle?: string; back: () => void; channel: Channel }) {
  return <header className={`mobile-course-header ${channel}`}><Button type="text" aria-label="返回" icon={<ArrowLeftOutlined />} onClick={back} /><div><strong>{title}</strong>{subtitle && <small>{subtitle}</small>}</div><span /></header>;
}

function CourseCover({ src, alt, icon = <BookOutlined /> }: { src: string; alt: string; icon?: React.ReactNode }) {
  return <span className="mobile-course-cover"><span>{icon}</span><img src={src} alt={alt} onError={event => { event.currentTarget.style.display = "none"; }} /></span>;
}

export function MobileOnlineCourseList({ channel, clientName }: { channel: Channel; clientName: string }) {
  const router = useRouter();
  const route = paths(channel);
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setError(false);
    try {
      const response = await fetch(route.apiBase, { cache: "no-store" });
      const data = await response.json();
      if (response.status === 401) { router.replace(route.loginPath); return; }
      if (!response.ok) throw new Error(data.message);
      setCourses(data.courses || []);
    } catch { setError(true); }
    finally { setLoading(false); }
  }, [route.apiBase, route.loginPath, router]);
  useEffect(() => { void load(); }, [load]);

  return <main className={`mobile-course-page ${channel}`}>
    <CourseHeader channel={channel} title="线上课堂" subtitle={clientName} back={() => router.push(route.homePath)} />
    <section className="mobile-course-intro"><span><ReadOutlined /></span><div><h1>我的课程</h1><p>查看已分配课程，按课时完成学习</p></div></section>
    {loading ? <div className="mobile-course-state"><Skeleton active paragraph={{ rows: 8 }} /></div>
      : error ? <div className="mobile-course-state"><Alert type="error" showIcon message="课程列表加载失败，请稍后重试" action={<Button size="small" icon={<ReloadOutlined />} onClick={() => void load()}>重试</Button>} /></div>
        : !courses.length ? <div className="mobile-course-empty"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无已分配课程" /><p>课程分配后将在这里展示</p></div>
          : <section className="mobile-course-list">{courses.map(course => <button type="button" className="mobile-course-card" key={course.id} onClick={() => router.push(`${route.webBase}/online-courses/${course.id}`)}>
            <CourseCover src={course.coverUrl} alt={course.courseName} />
            <span className="mobile-course-card-body"><span className="mobile-course-card-heading"><strong>{course.courseName}</strong>{course.completed && <CheckCircleFilled />}</span><span className="mobile-course-description">{course.courseDescription || "暂无课程简介"}</span><span className="mobile-course-tags"><Tag color={channel === "lead-h5" ? "blue" : "green"}>{course.applicablePosition}</Tag><span>{course.lessonCount}个课时</span>{course.assignedAt && <span>{formatDate(course.assignedAt)} 分配</span>}</span><span className="mobile-course-progress"><Progress percent={course.progress} showInfo={false} size="small" /><small>{course.completedLessons}/{course.lessonCount}</small></span></span>
            <RightOutlined className="mobile-course-arrow" />
          </button>)}</section>}
  </main>;
}

export function MobileOnlineCourseDetail({ channel, courseId }: { channel: Channel; courseId: string }) {
  const router = useRouter(); const route = paths(channel);
  const [course, setCourse] = useState<CourseDetail>(); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`${route.apiBase}/${courseId}`, { cache: "no-store" }); const data = await response.json();
      if (response.status === 401) { router.replace(route.loginPath); return; }
      if (!response.ok) throw new Error(data.message || "课程详情加载失败"); setCourse(data.course);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "课程详情加载失败，请稍后重试"); }
    finally { setLoading(false); }
  }, [courseId, route.apiBase, route.loginPath, router]);
  useEffect(() => { void load(); }, [load]);
  return <main className={`mobile-course-page ${channel}`}>
    <CourseHeader channel={channel} title="课程详情" back={() => router.push(`${route.webBase}/online-courses`)} />
    {loading ? <div className="mobile-course-state"><Skeleton active paragraph={{ rows: 10 }} /></div>
      : error || !course ? <div className="mobile-course-state"><Alert type="error" showIcon message={error || "课程不存在"} action={<Button size="small" onClick={() => void load()}>重试</Button>} /></div>
        : <><section className="mobile-course-detail-hero"><CourseCover src={course.coverUrl} alt={course.courseName} /><div><Tag color={channel === "lead-h5" ? "blue" : "green"}>{course.applicablePosition}</Tag><h1>{course.courseName}</h1><p>{course.courseDescription || "暂无课程简介"}</p></div><div className="mobile-course-detail-progress"><span>学习进度</span><strong>{course.progress}%</strong><Progress percent={course.progress} showInfo={false} /></div></section>
          <section className="mobile-course-lessons"><div className="mobile-course-section-title"><div><strong>课时列表</strong><small>共{course.lessonCount}个课时，已完成{course.completedLessons}个</small></div></div>
            {!course.lessons.length ? <div className="mobile-course-empty"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前课程暂无课时" /></div> : course.lessons.map((lesson, index) => <button type="button" className={`mobile-course-lesson-card ${lesson.completed ? "completed" : ""}`} key={lesson.id} onClick={() => router.push(`${route.webBase}/online-courses/${course.id}/lessons/${lesson.id}`)}>
              <CourseCover src={lesson.coverUrl} alt={lesson.chapterName} icon={coursewareIcon(lesson.coursewareType)} /><span className="mobile-course-lesson-body"><small>第{index + 1}课 · {lesson.coursewareTypeText}</small><strong>{lesson.chapterName}</strong><span>{lesson.chapterDescription || lesson.fileSizeText}</span></span>{lesson.completed ? <CheckCircleFilled className="mobile-course-complete" /> : <PlayCircleOutlined className="mobile-course-play" />}
            </button>)}</section></>}
  </main>;
}

export function MobileOnlineLessonPlayer({ channel, courseId, lessonId }: { channel: Channel; courseId: string; lessonId: string }) {
  const router = useRouter(); const route = paths(channel);
  const [lesson, setLesson] = useState<LessonDetail>(); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const [completed, setCompleted] = useState(false); const savingRef = useRef(false); const lastSavedRef = useRef(0);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`${route.apiBase}/${courseId}/lessons/${lessonId}`, { cache: "no-store" }); const data = await response.json();
      if (response.status === 401) { router.replace(route.loginPath); return; }
      if (!response.ok) throw new Error(data.message || "课时详情加载失败");
      setLesson(data.lesson); setCompleted(data.lesson.completed); lastSavedRef.current = data.lesson.progressSeconds || 0;
    } catch (reason) { setError(reason instanceof Error ? reason.message : "课时详情加载失败，请稍后重试"); }
    finally { setLoading(false); }
  }, [courseId, lessonId, route.apiBase, route.loginPath, router]);
  useEffect(() => { void load(); }, [load]);

  const saveProgress = useCallback(async (progressSeconds: number, done: boolean) => {
    const seconds = Math.max(0, Math.floor(progressSeconds));
    if (savingRef.current || !done && seconds - lastSavedRef.current < 10) return;
    savingRef.current = true;
    try {
      const response = await fetch(`${route.apiBase}/${courseId}/lessons/${lessonId}/progress`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ progressSeconds: seconds, completed: done }), keepalive: true });
      const data = await response.json().catch(() => null);
      if (response.status === 401) { router.replace(route.loginPath); return; }
      if (!response.ok) throw new Error(data?.message || "学习进度保存失败");
      lastSavedRef.current = Math.max(lastSavedRef.current, data.progressSeconds || seconds);
      if (data.completed) setCompleted(true);
    } catch (reason) { if (done) message.error(reason instanceof Error ? reason.message : "学习进度保存失败"); }
    finally { savingRef.current = false; }
  }, [courseId, lessonId, route.apiBase, route.loginPath, router]);

  const onMediaTime = (event: SyntheticEvent<HTMLMediaElement>) => {
    const media = event.currentTarget;
    const done = Number.isFinite(media.duration) && media.duration > 0 && media.currentTime / media.duration >= .9;
    void saveProgress(media.currentTime, done);
  };
  const restoreMediaProgress = (event: SyntheticEvent<HTMLMediaElement>) => {
    if (!lesson?.progressSeconds || !Number.isFinite(event.currentTarget.duration) || lesson.progressSeconds >= event.currentTarget.duration - 2) return;
    event.currentTarget.currentTime = lesson.progressSeconds;
  };
  const completeDocument = () => { if (!completed) void saveProgress(0, true); };
  const openPpt = () => {
    if (!lesson) return;
    const opened = window.open(lesson.fileUrl, "_blank", "noopener,noreferrer");
    if (!opened) message.info("浏览器阻止了新窗口，请允许弹窗后重试");
    else completeDocument();
  };

  return <main className={`mobile-course-page mobile-lesson-page ${channel}`}>
    <CourseHeader channel={channel} title="课时学习" back={() => router.push(`${route.webBase}/online-courses/${courseId}`)} />
    {loading ? <div className="mobile-course-state"><Skeleton active paragraph={{ rows: 10 }} /></div>
      : error || !lesson ? <div className="mobile-course-state"><Alert type="error" showIcon message={error || "课时不存在"} action={<Button size="small" onClick={() => void load()}>重试</Button>} /></div>
        : <><section className="mobile-lesson-title"><div><Tag color={lesson.coursewareType === "VIDEO" ? "blue" : lesson.coursewareType === "AUDIO" ? "cyan" : lesson.coursewareType === "PDF" ? "red" : "orange"}>{lesson.coursewareTypeText}</Tag>{completed && <Tag color="success" icon={<CheckCircleFilled />}>已完成</Tag>}</div><h1>{lesson.chapterName}</h1><p>{lesson.courseName}</p></section>
          <section className="mobile-lesson-viewer">
            {lesson.coursewareType === "VIDEO" && <video key={lesson.fileUrl} controls playsInline preload="metadata" controlsList="nodownload" src={lesson.fileUrl} poster={lesson.coverUrl} onLoadedMetadata={restoreMediaProgress} onTimeUpdate={onMediaTime} onPause={onMediaTime} onEnded={event => void saveProgress(event.currentTarget.duration || event.currentTarget.currentTime, true)}>当前浏览器不支持视频播放。</video>}
            {lesson.coursewareType === "AUDIO" && <div className="mobile-lesson-audio"><CourseCover src={lesson.coverUrl} alt={lesson.chapterName} icon={<AudioOutlined />} /><strong>{lesson.originalFileName}</strong><audio key={lesson.fileUrl} controls preload="metadata" src={lesson.fileUrl} onLoadedMetadata={restoreMediaProgress} onTimeUpdate={onMediaTime} onPause={onMediaTime} onEnded={event => void saveProgress(event.currentTarget.duration || event.currentTarget.currentTime, true)}>当前浏览器不支持音频播放。</audio></div>}
            {lesson.coursewareType === "PDF" && <div className="mobile-lesson-document"><iframe src={lesson.fileUrl} title={lesson.chapterName} onLoad={completeDocument} /><Button type="primary" icon={<FilePdfOutlined />} href={lesson.fileUrl} target="_blank" onClick={completeDocument}>在新窗口查看PDF</Button></div>}
            {lesson.coursewareType === "PPT" && <div className="mobile-lesson-ppt"><span><FilePptOutlined /></span><h2>{lesson.originalFileName}</h2><p>点击下方按钮，使用手机浏览器或已安装的文档应用查看PPT课件。</p><Button type="primary" size="large" icon={<FilePptOutlined />} onClick={openPpt}>打开PPT课件</Button></div>}
          </section>
          <section className="mobile-lesson-info"><h2>课时介绍</h2><p>{lesson.chapterDescription || "暂无课时介绍"}</p><dl><div><dt>课件文件</dt><dd>{lesson.originalFileName}</dd></div><div><dt>文件大小</dt><dd>{lesson.fileSizeText}</dd></div>{lesson.remark && <div><dt>备注</dt><dd>{lesson.remark}</dd></div>}</dl></section></>}
  </main>;
}


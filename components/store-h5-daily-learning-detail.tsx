"use client";

import { ArrowLeftOutlined, AudioFilled, CheckCircleFilled, LoadingOutlined, PauseCircleFilled, RedoOutlined, UploadOutlined } from "@ant-design/icons";
import { Alert, Button, Progress, Skeleton, message } from "antd";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { encodeRecordingAsMp3 } from "@/lib/client/audio-mp3";
import { putFileWithProgress } from "@/lib/client/store-h5-direct-upload";

type Detail = {
  id: string;
  recordNo: string;
  studentTag: string;
  weekDay: number;
  date: string;
  title: string;
  content: string;
  completed: boolean;
  completedAt: string | null;
  recordingDurationSeconds: number | null;
  recordingSize: number | null;
};
type Phase = "ready" | "requesting" | "recording" | "encoding" | "uploading" | "completed" | "error";
type RecordingDraft = { file: File; durationSeconds: number };

const MAX_SECONDS = 600;

function twoDigits(value: number) { return String(value).padStart(2, "0"); }
function timeText(seconds: number) { return `${twoDigits(Math.floor(seconds / 60))}:${twoDigits(seconds % 60)}`; }
function baseMimeType(value: string) { return value.toLowerCase().split(";", 1)[0] || "audio/webm"; }
function supportedMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  return ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"].find(type => MediaRecorder.isTypeSupported(type)) || "";
}

export function MobileDailyLearningRecording({
  planId,
  apiBase,
  homePath,
  loginPath,
}: {
  planId: string;
  apiBase: string;
  homePath: string;
  loginPath: string;
}) {
  const router = useRouter();
  const [detail, setDetail] = useState<Detail>();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [phase, setPhase] = useState<Phase>("ready");
  const [elapsed, setElapsed] = useState(0);
  const [progress, setProgress] = useState(0);
  const [errorText, setErrorText] = useState("");
  const [draft, setDraft] = useState<RecordingDraft>();
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    setLoading(true); setLoadError("");
    try {
      const response = await fetch(`${apiBase}/${planId}`, { cache: "no-store" });
      const data = await response.json();
      if (response.status === 401) { router.replace(loginPath); return; }
      if (!response.ok) throw new Error(data.message || "每日学习内容加载失败");
      setDetail(data.detail);
      if (data.detail.completed) setPhase("completed");
    } catch (error) { setLoadError(error instanceof Error ? error.message : "每日学习内容加载失败，请稍后重试"); }
    finally { setLoading(false); }
  }, [apiBase, loginPath, planId, router]);
  useEffect(() => { void load(); }, [load]);

  const upload = useCallback(async (recording: RecordingDraft) => {
    setPhase("uploading"); setProgress(0); setErrorText("");
    try {
      const signResponse = await fetch(`${apiBase}/${planId}/recording/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: recording.file.name, type: recording.file.type, size: recording.file.size, durationSeconds: recording.durationSeconds }),
      });
      const sign = await signResponse.json();
      if (signResponse.status === 401) { router.replace(loginPath); return; }
      if (!signResponse.ok) throw new Error(sign.message || "获取录音上传地址失败");
      const result = await putFileWithProgress({ url: sign.uploadUrl, file: recording.file, headers: sign.headers, onProgress: setProgress });
      const confirmResponse = await fetch(`${apiBase}/${planId}/recording/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadToken: sign.uploadToken, etag: result.etag }),
      });
      const confirmed = await confirmResponse.json();
      if (confirmResponse.status === 401) { router.replace(loginPath); return; }
      if (!confirmResponse.ok) throw new Error(confirmed.message || "确认录音上传失败");
      if (!mountedRef.current) return;
      setDraft(undefined); setPhase("completed"); setProgress(100);
      setDetail(current => current ? { ...current, completed: true, completedAt: confirmed.completedAt, recordingDurationSeconds: recording.durationSeconds, recordingSize: recording.file.size } : current);
      message.success("今日学习录音已上传");
    } catch (error) {
      if (!mountedRef.current) return;
      setErrorText(error instanceof Error ? error.message : "录音上传失败，请检查网络后重试");
      setPhase("error");
    }
  }, [apiBase, loginPath, planId, router]);

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
  }, []);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") {
      setPhase("uploading");
      recorder.stop();
    }
  }, []);

  useEffect(() => {
    if (phase !== "recording") return;
    const timer = window.setInterval(() => {
      const seconds = Math.min(MAX_SECONDS, Math.floor((Date.now() - startedAtRef.current) / 1000));
      setElapsed(seconds);
      if (seconds >= MAX_SECONDS) stopRecording();
    }, 250);
    return () => window.clearInterval(timer);
  }, [phase, stopRecording]);

  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => {
      if (phase === "recording" || phase === "encoding" || phase === "uploading") { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [phase]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const recorder = recorderRef.current;
      if (recorder) { recorder.onstop = null; recorder.ondataavailable = null; if (recorder.state === "recording") recorder.stop(); }
      streamRef.current?.getTracks().forEach(track => track.stop());
    };
  }, []);

  const startRecording = async () => {
    setErrorText(""); setDraft(undefined);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setErrorText("当前浏览器不支持网页录音，请使用最新版手机浏览器并通过 HTTPS 访问"); setPhase("error"); return;
    }
    setPhase("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      if (!mountedRef.current) { stream.getTracks().forEach(track => track.stop()); return; }
      streamRef.current = stream;
      const mimeType = supportedMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder; chunksRef.current = [];
      recorder.ondataavailable = event => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onerror = () => { recorder.onstop = null; stopTracks(); setErrorText("录音过程发生异常，请重新录制"); setPhase("error"); };
      recorder.onstop = () => {
        stopTracks();
        const type = baseMimeType(recorder.mimeType || chunksRef.current[0]?.type || "audio/webm");
        const blob = new Blob(chunksRef.current, { type });
        const durationSeconds = Math.max(1, Math.min(MAX_SECONDS, Math.ceil((Date.now() - startedAtRef.current) / 1000)));
        if (!blob.size) { setErrorText("未录制到有效声音，请重新录制"); setPhase("error"); return; }
        setElapsed(durationSeconds); setPhase("encoding"); setProgress(0);
        void encodeRecordingAsMp3({ source: blob, learningDate: detail?.date || "recording", onProgress: setProgress })
          .then(file => {
            if (!mountedRef.current) return;
            const nextDraft = { file, durationSeconds };
            setDraft(nextDraft);
            void upload(nextDraft);
          })
          .catch(() => {
            if (!mountedRef.current) return;
            setErrorText("录音转换为MP3失败，请重新录制"); setPhase("error");
          });
      };
      startedAtRef.current = Date.now(); setElapsed(0); setPhase("recording"); recorder.start(1000);
    } catch (error) {
      stopTracks();
      const denied = error instanceof DOMException && ["NotAllowedError", "PermissionDeniedError"].includes(error.name);
      setErrorText(denied ? "麦克风权限未开启，请在浏览器设置中允许访问麦克风后重试" : "无法启动麦克风，请检查设备或浏览器设置");
      setPhase("error");
    }
  };

  if (loading) return <main className="store-learning-detail-page"><div className="store-learning-detail-loading"><Skeleton active paragraph={{ rows: 12 }} /></div></main>;
  if (loadError || !detail) return <main className="store-learning-detail-page"><header className="store-learning-detail-header compact"><Button type="text" icon={<ArrowLeftOutlined />} onClick={() => router.push(homePath)} /><strong>每日学习</strong><span /></header><div className="store-learning-detail-loading"><Alert type="error" showIcon message={loadError || "每日学习任务不存在"} action={<Button size="small" onClick={() => void load()}>重试</Button>} /></div></main>;

  const busy = phase === "requesting" || phase === "encoding" || phase === "uploading";
  return <main className="store-learning-detail-page">
    <header className="store-learning-detail-header">
      <Button type="text" aria-label="返回" icon={<ArrowLeftOutlined />} disabled={phase === "recording" || busy} onClick={() => router.push(homePath)} />
      <div><small>每日学习</small><h1>{detail.title}</h1></div><span />
    </header>
    <article className="store-learning-reading" aria-label="当日学习内容">{detail.content}</article>
    <footer className={`store-learning-recorder ${phase === "recording" ? "recording" : ""}`}>
      {errorText && <Alert className="store-learning-recording-error" type="error" showIcon message={errorText} />}
      {(phase === "encoding" || phase === "uploading") && <Progress percent={progress} size="small" status="active" showInfo={progress > 0} />}
      <div className="store-learning-recorder-status">
        <span>{phase === "recording" ? <><i />正在录音</> : phase === "requesting" ? "正在申请麦克风权限" : phase === "encoding" ? "正在生成MP3录音" : phase === "uploading" ? "正在上传MP3录音" : phase === "completed" ? "今日学习已完成" : draft ? "录音待重新上传" : "准备录音"}</span>
        <strong>{timeText(phase === "completed" ? detail.recordingDurationSeconds || elapsed : elapsed)}</strong>
      </div>
      {phase === "completed" ? <Button block size="large" className="store-learning-record-button success" icon={<CheckCircleFilled />} disabled>录音已上传</Button>
        : phase === "recording" ? <Button block size="large" danger className="store-learning-record-button" icon={<PauseCircleFilled />} onClick={stopRecording}>停止录音</Button>
          : phase === "uploading" || phase === "encoding" || phase === "requesting" ? <Button block size="large" className="store-learning-record-button" icon={<LoadingOutlined spin />} loading>{phase === "uploading" ? "MP3上传中，请稍候" : phase === "encoding" ? "正在生成MP3" : "正在启动录音"}</Button>
            : draft ? <Button block size="large" className="store-learning-record-button" icon={<UploadOutlined />} onClick={() => void upload(draft)}>重新上传</Button>
              : <Button block size="large" className="store-learning-record-button" icon={phase === "error" ? <RedoOutlined /> : <AudioFilled />} onClick={() => void startRecording()}>{phase === "error" ? "重新录音" : "开始录音"}</Button>}
      <p>{phase === "recording" ? "录音期间可继续上下滚动文章，最长10分钟" : busy ? "请保持页面打开，MP3录音将直接上传至 R2" : phase === "completed" ? "MP3录音已安全保存，可返回首页" : "首次使用时，请允许浏览器访问手机麦克风"}</p>
    </footer>
  </main>;
}

export function StoreH5DailyLearningDetail({ planId }: { planId: string }) {
  return <MobileDailyLearningRecording planId={planId} apiBase="/api/store-h5/daily-learning" homePath="/store_h5/daily-learning" loginPath="/store_h5/login" />;
}

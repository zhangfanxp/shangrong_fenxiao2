"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClientRequestId } from "@/lib/client-request-id";
import { createLessonVisitTracker, VisitRequestError, type VisitClientState, type VisitPayload } from "@/lib/lesson-visit-tracker";
import { LESSON_VISIT_HEARTBEAT_MS, type LessonVisitEndReason, type LessonVisitResponse } from "@/lib/lesson-visit-rules";

export function useLessonLearningVisit(url: string, enabled: boolean) {
  const [state, setState] = useState<VisitClientState>({});
  const [revision, setRevision] = useState(0);
  const trackerRef = useRef<ReturnType<typeof createLessonVisitTracker> | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let mounted = true;
    const send = async (payload: VisitPayload) => {
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), keepalive: true, cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new VisitRequestError(data.message || "课时学习记录保存失败，请稍后重试", response.status);
      return data as LessonVisitResponse;
    };
    const sendOnLeave = (payload: VisitPayload) => {
      // visibilitychange is an activity checkpoint, NOT an exit: opening a PDF
      // or switching apps must not claim a confirmed learning end.
      // https://developer.mozilla.org/en-US/docs/Web/API/Navigator/sendBeacon
      try {
        if (navigator.sendBeacon?.(url, new Blob([JSON.stringify(payload)], { type: "application/json" }))) return;
      } catch { /* Fall back when beacon isn't available or cannot queue. */ }
      void send(payload).catch(() => undefined);
    };
    const tracker = createLessonVisitTracker({ newId: createClientRequestId, send, sendOnLeave, onChange: next => { if (mounted) setState(next); } });
    trackerRef.current = tracker; setState({});
    // React StrictMode's setup/cleanup probe never becomes a real page entry.
    const startTimer = window.setTimeout(() => void tracker.start(), 0);
    const interval = window.setInterval(() => { if (!document.hidden) void tracker.heartbeat(); }, LESSON_VISIT_HEARTBEAT_MS);
    const visibility = () => { if (document.hidden) tracker.flushHeartbeat(); else void tracker.heartbeat(); };
    const pageHide = () => tracker.close("PAGE_HIDE");
    const pageShow = (event: PageTransitionEvent) => { if (event.persisted) setRevision(value => value + 1); };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", pageHide);
    window.addEventListener("pageshow", pageShow);
    return () => {
      mounted = false; window.clearTimeout(startTimer); window.clearInterval(interval);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", pageHide);
      window.removeEventListener("pageshow", pageShow);
      tracker.close();
      if (trackerRef.current === tracker) trackerRef.current = null;
    };
  }, [url, enabled, revision]);

  const close = useCallback((reason: LessonVisitEndReason = "BACK") => trackerRef.current?.close(reason), []);
  const retry = useCallback(() => {
    if (trackerRef.current?.isClosed()) setRevision(value => value + 1);
    else void trackerRef.current?.start();
  }, []);
  return { ...state, close, retry };
}

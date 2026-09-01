import type { LessonVisitEndReason, LessonVisitEvent, LessonVisitResponse } from "./lesson-visit-rules";

export type VisitPayload = { visitId: string; event: LessonVisitEvent; reason?: LessonVisitEndReason };
export type VisitClientState = { visitId?: string; error?: string; closed?: boolean };
export class VisitRequestError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

// Browser-independent lifecycle controller: retries reuse the entry ID, and
// leaving during a pending start closes that same record after it is created.
export function createLessonVisitTracker(options: {
  newId: () => string;
  send: (payload: VisitPayload) => Promise<LessonVisitResponse>;
  sendOnLeave: (payload: VisitPayload) => void;
  onChange: (state: VisitClientState) => void;
}) {
  let id: string | undefined;
  let pending: Promise<void> | undefined;
  let ready = false;
  let disposed = false;
  let terminal = false;
  let endSent = false;
  let heartbeatPending = false;
  let endReason: LessonVisitEndReason = "NAVIGATION";

  const finish = () => {
    if (!id || endSent) return;
    endSent = true;
    options.sendOnLeave({ visitId: id, event: "end", reason: endReason });
  };
  const receive = (visit: LessonVisitResponse) => {
    if (disposed) return;
    terminal = visit.status !== "ACTIVE";
    ready = !terminal;
    options.onChange(terminal
      ? { error: "本次课时学习已结束或中断，请点击重试重新进入", closed: true }
      : { visitId: visit.id });
  };
  return {
    start() {
      if (disposed) return Promise.resolve();
      if (pending) return pending;
      if (ready || terminal) return Promise.resolve();
      options.onChange({});
      try { id ||= options.newId(); }
      catch (error) { options.onChange({ error: error instanceof Error ? error.message : "无法建立课时学习记录" }); return Promise.resolve(); }
      pending = options.send({ visitId: id, event: "start" }).then(visit => {
        if (disposed) { finish(); return; }
        receive(visit);
      }).catch(error => {
        if (disposed) { finish(); return; }
        options.onChange({ error: error instanceof Error ? error.message : "课时学习记录创建失败，请重试" });
      }).finally(() => { pending = undefined; });
      return pending;
    },
    async heartbeat() {
      if (!id || !ready || disposed || terminal || heartbeatPending) return;
      heartbeatPending = true;
      try { receive(await options.send({ visitId: id, event: "heartbeat" })); }
      catch (error) {
        // A network failure isn't proof of exit. The server's last-active
        // timeout will distinguish it from a confirmed normal end.
        if (!disposed && error instanceof VisitRequestError && error.status >= 400 && error.status < 500) {
          terminal = true; ready = false;
          options.onChange({ error: error.message, closed: true });
        }
      } finally { heartbeatPending = false; }
    },
    flushHeartbeat() {
      if (id && ready && !disposed && !terminal) options.sendOnLeave({ visitId: id, event: "heartbeat" });
    },
    close(reason: LessonVisitEndReason = "NAVIGATION") {
      if (disposed) return;
      disposed = true; endReason = reason;
      if (!pending) finish();
    },
    isClosed: () => terminal || disposed,
  };
}

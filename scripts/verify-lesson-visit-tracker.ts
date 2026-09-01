import assert from "node:assert/strict";
import { createLessonVisitTracker, VisitRequestError, type VisitClientState, type VisitPayload } from "../lib/lesson-visit-tracker";
import { LESSON_VISIT_TIMEOUT_MS, lessonVisitStatus, type LessonVisitResponse } from "../lib/lesson-visit-rules";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fixture(send?: (payload: VisitPayload) => Promise<LessonVisitResponse>) {
  const sent: VisitPayload[] = []; const beacons: VisitPayload[] = []; const states: VisitClientState[] = [];
  let generated = 0;
  const tracker = createLessonVisitTracker({
    newId: () => `entry-${++generated}`, onChange: state => states.push(state), sendOnLeave: payload => beacons.push(payload),
    send: payload => { sent.push(payload); return send ? send(payload) : Promise.resolve({ id: payload.visitId, status: "ACTIVE" }); },
  });
  return { tracker, sent, beacons, states, generated: () => generated };
}

async function main() {
  const probe = fixture(); probe.tracker.close(); await probe.tracker.start();
  assert.equal(probe.sent.length, 0); assert.equal(probe.beacons.length, 0);
  const pending = deferred<LessonVisitResponse>();
  const early = fixture(() => pending.promise);
  const start = early.tracker.start(); assert.equal(early.tracker.start(), start);
  early.tracker.close("BACK"); early.tracker.close(); assert.equal(early.beacons.length, 0);
  pending.resolve({ id: "entry-1", status: "ACTIVE" }); await start;
  assert.deepEqual(early.beacons, [{ visitId: "entry-1", event: "end", reason: "BACK" }]);
  assert.equal(early.states.length, 1, "A late start cannot update an unmounted player");
  console.log("PASS StrictMode probe, duplicate start, exit during pending start, exactly-once close");

  let fail = true;
  const retry = fixture(async payload => { if (fail) throw new Error("offline"); return { id: payload.visitId, status: "ACTIVE" }; });
  await retry.tracker.start(); assert.equal(retry.states.at(-1)?.error, "offline"); fail = false;
  await retry.tracker.start(); await retry.tracker.start();
  assert.equal(retry.generated(), 1); assert.equal(retry.sent.length, 2);
  assert.equal(retry.sent[0].visitId, retry.sent[1].visitId);
  retry.tracker.flushHeartbeat(); assert.equal(retry.beacons.at(-1)?.event, "heartbeat"); assert(!retry.tracker.isClosed());
  await retry.tracker.heartbeat(); assert.equal(retry.sent.at(-1)?.event, "heartbeat");
  retry.tracker.close("PAGE_HIDE"); retry.tracker.flushHeartbeat(); await retry.tracker.heartbeat();
  assert.equal(retry.beacons.length, 2); assert.equal(retry.beacons.at(-1)?.event, "end");
  console.log("PASS failed-start retry reuses entry ID; hiding is activity, not confirmed exit");

  const heartbeat = deferred<LessonVisitResponse>();
  const late = fixture(payload => payload.event === "start" ? Promise.resolve({ id: payload.visitId, status: "ACTIVE" }) : heartbeat.promise);
  await late.tracker.start(); const first = late.tracker.heartbeat(); await late.tracker.heartbeat();
  assert.equal(late.sent.length, 2, "Only one heartbeat can be in flight");
  late.tracker.close(); const before = late.states.length;
  heartbeat.resolve({ id: "entry-1", status: "ACTIVE" }); await first;
  assert.equal(late.states.length, before);
  const terminal = fixture(async payload => ({ id: payload.visitId, status: payload.event === "start" ? "ACTIVE" : "INTERRUPTED" }));
  await terminal.tracker.start(); await terminal.tracker.heartbeat(); await terminal.tracker.start();
  assert(terminal.tracker.isClosed()); assert.equal(terminal.states.at(-1)?.closed, true); assert.equal(terminal.sent.length, 2);
  const forbidden = fixture(async payload => { if (payload.event !== "start") throw new VisitRequestError("revoked", 403); return { id: payload.visitId, status: "ACTIVE" }; });
  await forbidden.tracker.start(); await forbidden.tracker.heartbeat(); assert(forbidden.tracker.isClosed());
  const transient = fixture(async payload => { if (payload.event !== "start") throw new Error("offline"); return { id: payload.visitId, status: "ACTIVE" }; });
  await transient.tracker.start(); await transient.tracker.heartbeat(); assert(!transient.tracker.isClosed());
  console.log("PASS late-response isolation, closed sessions cannot reopen, network failure is not exit");

  const now = new Date();
  assert.equal(lessonVisitStatus({ status: "ACTIVE", lastActiveAt: new Date(now.getTime() - LESSON_VISIT_TIMEOUT_MS + 1) }, now), "ACTIVE");
  assert.equal(lessonVisitStatus({ status: "ACTIVE", lastActiveAt: new Date(now.getTime() - LESSON_VISIT_TIMEOUT_MS) }, now), "INTERRUPTED");
  assert.equal(lessonVisitStatus({ status: "LEGACY", lastActiveAt: null }), "LEGACY");
  assert.equal(lessonVisitStatus({ status: "ENDED", lastActiveAt: null }), "ENDED");
  console.log("All lesson-visit lifecycle checks passed.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });

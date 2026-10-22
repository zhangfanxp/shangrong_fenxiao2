"use client";

import { ArrowLeftOutlined, CameraOutlined, CheckCircleFilled, CloseCircleFilled, DeleteOutlined, LoadingOutlined, RedoOutlined, SaveOutlined, UploadOutlined, VideoCameraOutlined } from "@ant-design/icons";
import { Alert, Button, Image, Input, InputNumber, Modal, Select, Skeleton, Tag, Upload } from "antd";
import type { UploadProps } from "antd";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { deleteLocalTaskDraft, deleteLocalTaskDraftFile, getLocalTaskDraft, localDraftFileAsFile, markLocalTaskDraftSynced, mobileTaskDraftKey, saveLocalTaskDraft, type LocalTaskDraft } from "@/lib/client/mobile-task-drafts";
import { optimizeTaskPhoto, putFileWithProgress } from "@/lib/client/store-h5-direct-upload";
import { optimizeTaskVideo } from "@/lib/client/task-video-compression";
import { taskAttachmentMaxBytes, taskAttachmentMaxMb, TASK_VIDEO_SUGGESTED_MAX_SECONDS, TASK_VIDEO_SUGGESTED_MIN_SECONDS } from "@/lib/task-attachment-rules";
import { taskInputValueError } from "@/lib/task-input-values";
import { RectificationInspectionSection, RectificationRequirementSection } from "@/components/rectification-sections";
import type { RectificationInspection, RectificationRoundDetail } from "@/lib/inspection-rectification-shared";

type Item = { name: string; component: "attachment" | "input" | "select"; dataType: "photo" | "video" | "document" | "amount" | "quantity" | "score" | "text" | null; maxValue?: number | null; captureOnly?: boolean; options: string[]; description: string; required: boolean; weight: number };
type DraftValue = { index: number; value: string | number };
type ServerDraft = { values?: unknown; fallbackItemIndexes?: unknown; savedAt: string };
type TaskDetail = { rectification?: { inspection: RectificationInspection; round: RectificationRoundDetail } | null; id: string; recordNo?: string; taskName: string; taskTypeLabel: string; targetPersonnelName?: string | null; targetPersonnelPosition?: string | null; calendarDescription?: string | null; calendarRemark?: string | null; storeName?: string; brandName?: string; executionDate: string; dueDate: string; status?: "PENDING" | "COMPLETED" | "OVERDUE"; sharedExecution?: boolean; canEdit?: boolean; canStart?: boolean; editOwnerUserId?: string | null; editOwnerName?: string | null; submittedBy?: string | null; submittedAt?: string | null; submittedValues?: Array<{ index: number; value: string | null }>; items: Item[]; draftAttachments?: Array<{ id: string; itemIndex: number; name: string }>; draft?: ServerDraft | null };
type Attachment = { clientId: string; id?: string; name: string; status: "uploading" | "success" | "error" | "local"; phase?: "preparing" | "uploading"; message?: string; progress?: number; localFile?: File };
type DraftFeedback = { type: "success" | "warning" | "error" | "info"; message: string };

function serverDraftValues(value: unknown) {
  if (!Array.isArray(value)) return {};
  return value.reduce<Record<number, string | number>>((result, row) => {
    if (row && typeof row === "object" && Number.isInteger((row as DraftValue).index) && ["string", "number"].includes(typeof (row as DraftValue).value)) result[(row as DraftValue).index] = (row as DraftValue).value;
    return result;
  }, {});
}

function serverFallbackIndexes(value: unknown) {
  return Array.isArray(value) ? value.filter((index): index is number => Number.isInteger(index) && index >= 0) : [];
}

function localFilesAsAttachments(draft: LocalTaskDraft<TaskDetail> | null) {
  return (draft?.files || []).reduce<Record<number, Attachment[]>>((result, saved) => {
    result[saved.itemIndex] = [...(result[saved.itemIndex] || []), {
      clientId: saved.clientId,
      name: saved.name,
      status: "local",
      progress: 0,
      message: "文件已保存在本机，联网后可重试上传",
      localFile: localDraftFileAsFile(saved),
    }];
    return result;
  }, {});
}

function mergeAttachments(server: Record<number, Attachment[]>, local: Record<number, Attachment[]>) {
  const merged = { ...server };
  Object.entries(local).forEach(([rawIndex, files]) => {
    const index = Number(rawIndex);
    const existing = new Set((merged[index] || []).map(file => file.clientId));
    merged[index] = [...(merged[index] || []), ...files.filter(file => !existing.has(file.clientId))];
  });
  return merged;
}

export function StoreH5TaskForm({ taskInstanceId, draftOwnerId, canAttach, canSubmitTask, channel = "store-h5" }: { taskInstanceId: string; draftOwnerId: string; canAttach: boolean; canSubmitTask: boolean; channel?: "store-h5" | "lead-h5" }) {
  const router = useRouter();
  const webBase = channel === "lead-h5" ? "/lead_h5" : "/store_h5";
  const apiBase = channel === "lead-h5" ? "/api/lead-h5" : "/api/store-h5";
  const localDraftKey = mobileTaskDraftKey(channel, draftOwnerId, taskInstanceId);
  const [task, setTask] = useState<TaskDetail>();
  const [values, setValues] = useState<Record<number, string | number>>({});
  const [attachments, setAttachments] = useState<Record<number, Attachment[]>>({});
  const [fallbackItemIndexes, setFallbackItemIndexes] = useState<Set<number>>(new Set());
  const [draftSavedAt, setDraftSavedAt] = useState("");
  const [draftFeedback, setDraftFeedback] = useState<DraftFeedback>();
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [leaveTarget, setLeaveTarget] = useState(`${webBase}/tasks`);
  const canEditTask = canSubmitTask && Boolean(task?.canEdit);
  const canEditAttachments = canAttach && canEditTask;
  const itemRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const historyGuard = useRef(false);

  const syncLocalDraft = useCallback(async (draft: LocalTaskDraft<TaskDetail>, showFeedback = false, persistSyncState = true) => {
    const response = await fetch(`${apiBase}/tasks/${taskInstanceId}/draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: Object.entries(draft.values).map(([index, value]) => ({ index: Number(index), value })),
        fallbackItemIndexes: draft.fallbackItemIndexes,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) { router.replace(`${webBase}/login`); throw new Error("登录状态已失效，本次内容仅保存在本机"); }
    if (!response.ok) {
      const error = new Error(data.message || "草稿同步失败") as Error & { status?: number };
      error.status = response.status;
      throw error;
    }
    setTask(current => current?.sharedExecution ? { ...current, canEdit: true, editOwnerUserId: draftOwnerId } : current);
    const savedAt = String(data.savedAt || new Date().toISOString());
    if (persistSyncState) await markLocalTaskDraftSynced(localDraftKey, savedAt);
    setDraftSavedAt(savedAt);
    if (showFeedback) setDraftFeedback({ type: "success", message: "本机草稿已同步到服务器" });
    return savedAt;
  }, [apiBase, draftOwnerId, localDraftKey, router, taskInstanceId, webBase]);

  const load = useCallback(async () => {
    setLoading(true); setLoadError("");
    const localDraft = await getLocalTaskDraft<TaskDetail>(localDraftKey).catch(() => null);
    try {
      const response = await fetch(`${apiBase}/tasks/${taskInstanceId}`, { cache: "no-store" });
      const data = await response.json();
      if (response.status === 401) { router.replace(`${webBase}/login`); return; }
      if (!response.ok) throw new Error(data.message || "任务内容加载失败，请稍后重试");
      const detail = data as TaskDetail;
      const serverDraft = detail.draft;
      const preferLocal = Boolean(detail.canEdit && localDraft && (!serverDraft?.savedAt || new Date(localDraft.savedAt).getTime() >= new Date(serverDraft.savedAt).getTime()));
      const submittedValues = (detail.submittedValues || []).reduce<Record<number, string | number>>((result, item) => { if (item.value !== null) result[item.index] = item.value; return result; }, {});
      const nextValues = detail.status === "COMPLETED" ? submittedValues : preferLocal && localDraft ? Object.entries(localDraft.values).reduce<Record<number, string | number>>((result, [index, value]) => ({ ...result, [Number(index)]: value }), {}) : serverDraftValues(serverDraft?.values);
      const restoredServer = (detail.draftAttachments || []).reduce<Record<number, Attachment[]>>((grouped, attachment) => {
        grouped[attachment.itemIndex] = [...(grouped[attachment.itemIndex] || []), { clientId: attachment.id, id: attachment.id, name: attachment.name, status: "success", progress: 100, message: "已恢复此前上传的附件" }];
        return grouped;
      }, {});
      const localAttachments = localFilesAsAttachments(localDraft);
      const serverFallbacks = serverFallbackIndexes(serverDraft?.fallbackItemIndexes);
      const localFallbacks = preferLocal && localDraft ? localDraft.fallbackItemIndexes : [];
      setTask(detail);
      setValues(nextValues);
      setAttachments(mergeAttachments(restoredServer, detail.canEdit ? localAttachments : {}));
      setFallbackItemIndexes(new Set([...serverFallbacks, ...localFallbacks]));
      setDraftSavedAt(preferLocal && localDraft ? localDraft.savedAt : serverDraft?.savedAt || "");
      setDirty(false);
      if (detail.canEdit && localDraft && !localDraft.serverSynced && typeof navigator !== "undefined" && navigator.onLine) {
        void syncLocalDraft(localDraft, true).catch(() => setDraftFeedback({ type: "warning", message: "已恢复本机草稿，暂未同步到服务器" }));
      } else if (detail.canEdit && localDraft && !localDraft.serverSynced) setDraftFeedback({ type: "warning", message: "已恢复本机草稿，联网后将自动同步" });
      else if (detail.canEdit && (serverDraft?.savedAt || localDraft?.savedAt)) setDraftFeedback({ type: "info", message: "已恢复上次暂存的任务内容" });
    } catch (reason) {
      if (localDraft?.task && (localDraft.task.rectification || new Date(localDraft.task.dueDate).getTime() >= Date.now())) {
        setTask(localDraft.task);
        setValues(Object.entries(localDraft.values).reduce<Record<number, string | number>>((result, [index, value]) => ({ ...result, [Number(index)]: value }), {}));
        setAttachments(localFilesAsAttachments(localDraft));
        setFallbackItemIndexes(new Set(localDraft.fallbackItemIndexes));
        setDraftSavedAt(localDraft.savedAt);
        setDraftFeedback({ type: "warning", message: "当前处于离线状态，已从本机恢复草稿；联网后将自动同步" });
        setDirty(false);
      } else setLoadError(reason instanceof Error ? reason.message : "任务内容加载失败，请稍后重试");
    } finally { setLoading(false); }
  }, [apiBase, localDraftKey, router, syncLocalDraft, taskInstanceId, webBase]);

  useEffect(() => { void load(); }, [load]);
  const claimExecution = async () => {
    if (!task?.canStart || claiming) return;
    setClaiming(true); setSubmitError("");
    try {
      const response = await fetch(`${apiBase}/tasks/${taskInstanceId}/claim`, { method: "POST" });
      const data = await response.json();
      if (response.status === 401) { router.replace(`${webBase}/login`); return; }
      if (!response.ok) throw new Error(data.message || "开始执行失败，请刷新后重试");
      await load();
    } catch (reason) {
      setSubmitError(reason instanceof Error ? reason.message : "开始执行失败，请刷新后重试");
      void load();
    } finally { setClaiming(false); }
  };
  useEffect(() => {
    if (!task?.sharedExecution || task.status !== "PENDING" || task.editOwnerUserId === draftOwnerId) return;
    const refreshOwnership = async () => {
      const response = await fetch(`${apiBase}/tasks/${taskInstanceId}`, { cache: "no-store" }).catch(() => null);
      if (!response?.ok) return;
      const latest = await response.json() as TaskDetail;
      if (latest.status === "COMPLETED") { void load(); return; }
      if (latest.editOwnerUserId && latest.editOwnerUserId !== draftOwnerId) {
        setTask(current => current && (current.canEdit || current.editOwnerUserId !== latest.editOwnerUserId)
          ? { ...current, canEdit: false, editOwnerUserId: latest.editOwnerUserId, editOwnerName: latest.editOwnerName }
          : current);
        setValues(serverDraftValues(latest.draft?.values));
        setFallbackItemIndexes(new Set(serverFallbackIndexes(latest.draft?.fallbackItemIndexes)));
        setDraftSavedAt(latest.draft?.savedAt || "");
        const restored = (latest.draftAttachments || []).reduce<Record<number, Attachment[]>>((grouped, attachment) => {
          grouped[attachment.itemIndex] = [...(grouped[attachment.itemIndex] || []), { clientId: attachment.id, id: attachment.id, name: attachment.name, status: "success", progress: 100, message: "已恢复此前上传的附件" }];
          return grouped;
        }, {});
        setAttachments(restored);
        setDirty(false);
      }
    };
    const timer = window.setInterval(() => { void refreshOwnership(); }, 5_000);
    return () => window.clearInterval(timer);
  }, [apiBase, draftOwnerId, load, task, taskInstanceId]);
  useEffect(() => {
    const synchronize = async () => {
      if (!task) return;
      const localDraft = await getLocalTaskDraft<TaskDetail>(localDraftKey).catch(() => null);
      if (localDraft && !localDraft.serverSynced && (!task.sharedExecution || task.canEdit)) await syncLocalDraft(localDraft, true).catch(() => undefined);
    };
    window.addEventListener("online", synchronize);
    return () => window.removeEventListener("online", synchronize);
  }, [localDraftKey, syncLocalDraft, task]);
  useEffect(() => {
    if (dirty && !successOpen && !historyGuard.current) {
      window.history.pushState({ storeTaskGuard: true }, "", window.location.href);
      historyGuard.current = true;
    }
    const interceptBack = () => {
      if (!dirty || successOpen || !historyGuard.current) return;
      window.history.pushState({ storeTaskGuard: true }, "", window.location.href);
      setLeaveTarget(`${webBase}/tasks`); setLeaveOpen(true);
    };
    window.addEventListener("popstate", interceptBack);
    return () => window.removeEventListener("popstate", interceptBack);
  }, [dirty, successOpen, webBase]);

  const requestLeave = (target = `${webBase}/tasks`) => {
    if (!dirty) return void router.push(target);
    setLeaveTarget(target); setLeaveOpen(true);
  };
  const updateAttachment = (index: number, clientId: string, update: Partial<Attachment>) => {
    setAttachments(current => ({ ...current, [index]: (current[index] || []).map(attachment => attachment.clientId === clientId ? { ...attachment, ...update } : attachment) }));
  };
  const removeAttachment = async (index: number, clientId: string) => {
    if (!canEditAttachments) return;
    const attachment = (attachments[index] || []).find(item => item.clientId === clientId);
    if (!attachment || attachment.status === "uploading") return;
    if (attachment.id) {
      try {
        const response = await fetch(`${apiBase}/tasks/${taskInstanceId}/attachments`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ attachmentId: attachment.id }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "附件删除失败");
      } catch (reason) {
        updateAttachment(index, clientId, { status: "error", message: reason instanceof Error ? reason.message : "附件删除失败" });
        return;
      }
    }
    if (attachment.localFile) await deleteLocalTaskDraftFile(localDraftKey, clientId).catch(() => undefined);
    setAttachments(current => ({ ...current, [index]: (current[index] || []).filter(item => item.clientId !== clientId) }));
    setDirty(true);
  };

  const performUpload = async (index: number, item: Item, file: File, existingClientId?: string) => {
    if (!canEditAttachments) return;
    const activeCount = (attachments[index] || []).filter(attachment => attachment.status === "success" || attachment.status === "uploading").length;
    if (!existingClientId && activeCount >= item.weight) { setErrors(current => ({ ...current, [index]: `最多上传${item.weight}个附件` })); return; }
    const clientId = existingClientId || crypto.randomUUID();
    const typeOkay = item.dataType === "video" ? file.type.startsWith("video/") : item.dataType === "document" ? file.type.startsWith("application/") || file.type.startsWith("text/") : file.type.startsWith("image/");
    const dataType = item.dataType as "photo" | "video" | "document";
    const maxBytes = taskAttachmentMaxBytes(dataType); const maxMb = taskAttachmentMaxMb(dataType);
    if (!typeOkay || (dataType !== "video" && file.size > maxBytes)) {
      const failed: Attachment = { clientId, name: file.name, status: "error", message: !typeOkay ? "文件类型不符合要求" : `文件不能超过 ${maxMb}MB` };
      setAttachments(current => ({ ...current, [index]: existingClientId ? (current[index] || []).map(entry => entry.clientId === clientId ? failed : entry) : [...(current[index] || []), failed] }));
      return;
    }
    setDirty(true); setDraftFeedback(undefined); setErrors(current => ({ ...current, [index]: "" }));
    const uploading: Attachment = { clientId, name: file.name, status: "uploading", phase: dataType === "document" ? "uploading" : "preparing", progress: 0, message: dataType === "photo" ? "正在优化图片..." : dataType === "video" ? "正在读取视频并准备压缩..." : "正在准备直传...", localFile: file };
    setAttachments(current => ({ ...current, [index]: existingClientId ? (current[index] || []).map(entry => entry.clientId === clientId ? uploading : entry) : [...(current[index] || []), uploading] }));
    let retryFile = file;
    try {
      const prepared: { file: File; optimized: boolean; durationSeconds?: number } = dataType === "photo"
        ? await optimizeTaskPhoto(file)
        : dataType === "video"
          ? await optimizeTaskVideo(file, progress => updateAttachment(index, clientId, { name: file.name, status: "uploading", phase: "preparing", progress: Math.round(progress * .35), message: `正在压缩视频 ${progress}%` }))
          : { file, optimized: false };
      const directFile = prepared.file;
      retryFile = directFile;
      if (directFile.size > maxBytes) throw new Error(`文件不能超过 ${maxMb}MB`);
      const savedBytes = prepared.optimized ? file.size - directFile.size : 0;
      const durationText = prepared.durationSeconds ? `视频约 ${Math.round(prepared.durationSeconds)} 秒` : "视频";
      const durationAdvice = prepared.durationSeconds && prepared.durationSeconds > TASK_VIDEO_SUGGESTED_MAX_SECONDS ? `，建议控制在 ${TASK_VIDEO_SUGGESTED_MAX_SECONDS} 秒以内` : "";
      const resultMessage = dataType === "video"
        ? `${durationText}${prepared.optimized ? `，已压缩至 ${(directFile.size / 1024 / 1024).toFixed(1)}MB` : ""}${durationAdvice}`
        : prepared.optimized ? `图片已优化，减少 ${(savedBytes / 1024 / 1024).toFixed(1)}MB` : "";
      const preparationMessage = resultMessage ? `${resultMessage}，正在上传到R2...` : "正在上传到R2...";
      updateAttachment(index, clientId, { name: directFile.name, status: "uploading", phase: "uploading", progress: dataType === "video" && prepared.optimized ? 35 : 0, message: preparationMessage, localFile: directFile });
      const signResponse = await fetch(`${apiBase}/tasks/${taskInstanceId}/attachments/sign`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemIndex: index, name: directFile.name, type: directFile.type || "application/octet-stream", size: directFile.size }),
      });
      const sign = await signResponse.json();
      if (signResponse.status === 401) { router.replace(`${webBase}/login`); return; }
      if (!signResponse.ok) throw new Error(sign.message || "生成R2直传地址失败，请稍后重试");
      setTask(current => current?.sharedExecution ? { ...current, canEdit: true, editOwnerUserId: draftOwnerId } : current);
      const uploaded = await putFileWithProgress({
        url: sign.uploadUrl, file: directFile, headers: sign.headers,
        onProgress: progress => updateAttachment(index, clientId, { name: directFile.name, status: "uploading", progress: dataType === "video" && prepared.optimized ? 35 + Math.round(progress * .65) : progress, message: preparationMessage }),
      });
      const confirmResponse = await fetch(`${apiBase}/tasks/${taskInstanceId}/attachments/confirm`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadToken: sign.uploadToken, etag: uploaded.etag }),
      });
      const confirmed = await confirmResponse.json();
      if (confirmResponse.status === 401) { router.replace(`${webBase}/login`); return; }
      if (!confirmResponse.ok) throw new Error(confirmed.message || "确认R2附件失败，请重新上传");
      updateAttachment(index, clientId, { id: confirmed.id, name: confirmed.name, status: "success", progress: 100, message: resultMessage || undefined, localFile: undefined });
      await deleteLocalTaskDraftFile(localDraftKey, clientId).catch(() => undefined);
    } catch (reason) {
      updateAttachment(index, clientId, { name: retryFile.name, status: "error", message: reason instanceof Error ? reason.message : "附件上传失败，请重新上传", localFile: retryFile });
      setDirty(true);
    }
  };
  const upload = (index: number, item: Item): UploadProps["beforeUpload"] => async file => {
    await performUpload(index, item, file);
    return Upload.LIST_IGNORE;
  };

  const saveDraft = async () => {
    if (!task || saving || !canEditTask) return;
    setSaving(true); setSubmitError(""); setDraftFeedback(undefined);
    const failedCaptureItems = task.items.flatMap((item, index) => item.component === "attachment" && item.captureOnly && (attachments[index] || []).some(attachment => (attachment.status === "error" || attachment.status === "local") && Boolean(attachment.localFile)) ? [index] : []);
    const nextFallbacks = [...new Set([...fallbackItemIndexes, ...failedCaptureItems])];
    const savedAt = new Date().toISOString();
    const draft: LocalTaskDraft<TaskDetail> = {
      key: localDraftKey, taskInstanceId, channel, savedAt, serverSynced: false,
      values: Object.entries(values).reduce<Record<string, string | number>>((result, [index, value]) => ({ ...result, [index]: value }), {}),
      fallbackItemIndexes: nextFallbacks,
      task,
      files: Object.entries(attachments).flatMap(([rawIndex, files]) => files.flatMap(attachment => attachment.localFile && attachment.status !== "success" ? [{ clientId: attachment.clientId, itemIndex: Number(rawIndex), name: attachment.localFile.name, type: attachment.localFile.type, lastModified: attachment.localFile.lastModified, file: attachment.localFile }] : [])),
    };
    let localSaved = false;
    try { await saveLocalTaskDraft(draft); localSaved = true; }
    catch { setDraftFeedback({ type: "error", message: "本机存储空间不足或不可用，文件暂存失败，请勿关闭当前页面" }); }
    try {
      const serverSavedAt = await syncLocalDraft(draft, false, localSaved);
      setDraftSavedAt(serverSavedAt);
      setFallbackItemIndexes(new Set(nextFallbacks));
      setDraftFeedback(localSaved ? { type: "success", message: "暂存成功，任务内容已保存到本机并同步到服务器" } : { type: "warning", message: "表单内容已同步服务器，但文件未能保存在本机，请勿关闭当前页面" });
      if (localSaved || !draft.files.length) setDirty(false);
    } catch (reason) {
      if ((reason as { status?: number } | null)?.status === 409) {
        setSubmitError(reason instanceof Error ? reason.message : "任务已由其他执行人开始处理");
        void load();
      } else if (localSaved) {
        setDraftSavedAt(savedAt);
        setFallbackItemIndexes(new Set(nextFallbacks));
        setDraftFeedback({ type: "warning", message: "当前网络不可用，任务已暂存在本机；联网后将自动同步" });
        setDirty(false);
      } else setSubmitError(reason instanceof Error ? reason.message : "暂存失败，请稍后重试");
    } finally { setSaving(false); }
  };

  const validate = () => {
    if (!task) return false;
    const next: Record<number, string> = {};
    let uploading = false;
    task.items.forEach((item, index) => {
      if (item.component === "attachment") {
        const itemAttachments = attachments[index] || [];
        if (itemAttachments.some(attachment => attachment.status === "uploading")) uploading = true;
        else if (item.required && !itemAttachments.some(attachment => attachment.status === "success")) next[index] = `请上传${item.name}`;
        else if (itemAttachments.filter(attachment => attachment.status === "success").length > item.weight) next[index] = `最多上传${item.weight}个附件`;
      } else if (item.required && (values[index] === undefined || values[index] === null || String(values[index]).trim() === "")) next[index] = `请完成${item.name}`;
      else if (item.component === "input") {
        const inputError = taskInputValueError(item, values[index]);
        if (inputError) next[index] = inputError;
      }
    });
    if (uploading) { setSubmitError("附件正在上传，请上传完成后再提交"); return false; }
    setErrors(next);
    if (Object.keys(next).length) {
      setSubmitError("还有必填任务内容未完成，请完成后再提交。");
      const first = Number(Object.keys(next)[0]); setTimeout(() => itemRefs.current[first]?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
      return false;
    }
    setSubmitError(""); return true;
  };
  const requiredItemsComplete = task ? task.items.every((item, index) => {
    if (!item.required) return true;
    if (item.component === "attachment") return (attachments[index] || []).some(attachment => attachment.status === "success" && Boolean(attachment.id));
    const value = values[index];
    return value !== undefined && value !== null && String(value).trim() !== "";
  }) : false;
  const attachmentUploading = Object.values(attachments).flat().some(attachment => attachment.status === "uploading");
  const canSubmit = canEditTask && requiredItemsComplete && !attachmentUploading && !submitting && task?.status !== "COMPLETED";
  const beginSubmit = () => { if (canEditTask && validate()) setConfirmOpen(true); };
  const submit = async () => {
    if (!task || submitting) return;
    setSubmitting(true); setSubmitError("");
    try {
      const items = task.items.map((item, index) => item.component === "attachment" ? { index, attachmentIds: (attachments[index] || []).flatMap(attachment => attachment.status === "success" && attachment.id ? [attachment.id] : []) } : { index, value: values[index] });
      const response = await fetch(`${apiBase}/tasks/${taskInstanceId}/submit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items }) });
      const data = await response.json();
      if (response.status === 401) { router.replace(`${webBase}/login`); return; }
      if (!response.ok) throw new Error(data.message || "任务提交失败，请检查网络后重试");
      await deleteLocalTaskDraft(localDraftKey).catch(() => undefined);
      setConfirmOpen(false); setDirty(false); setSuccessOpen(true);
    } catch (reason) { setConfirmOpen(false); setSubmitError(reason instanceof Error ? reason.message : "任务提交失败，请检查网络后重试"); }
    finally { setSubmitting(false); }
  };

  if (loading) return <main className="store-h5-page store-h5-task-page"><header className="store-h5-subheader"><span /><div><strong>任务加载中...</strong><small>请稍候</small></div><span /></header><section className="store-h5-task-content"><Skeleton active paragraph={{ rows: 7 }} /></section></main>;
  if (loadError || !task) return <main className="store-h5-page store-h5-task-page"><header className="store-h5-subheader"><Button type="text" icon={<ArrowLeftOutlined />} onClick={() => router.push(`${webBase}/tasks`)} /><div><strong>任务执行</strong></div><span /></header><section className="store-h5-task-content"><Alert type="error" showIcon message={loadError || "任务内容加载失败，请稍后重试"} action={<Button size="small" onClick={() => void load()}>重新加载</Button>} /></section></main>;
  return <main className="store-h5-page store-h5-task-page store-h5-execution-page">
    <header className="store-h5-subheader"><Button type="text" aria-label="返回任务列表" icon={<ArrowLeftOutlined />} onClick={() => requestLeave()} /><div><strong>任务执行</strong><small>{task.recordNo}</small></div><span /></header>
    <section className="store-h5-task-summary"><div><h1>{task.taskName}</h1><Tag color="blue">{task.taskTypeLabel}</Tag></div><dl>{task.targetPersonnelName && <div><dt>评选员工</dt><dd>{task.targetPersonnelName}{task.targetPersonnelPosition ? `（${task.targetPersonnelPosition}）` : ""}</dd></div>}<div><dt>执行日期</dt><dd>{String(task.executionDate).slice(0, 10)}</dd></div><div><dt>截止时间</dt><dd>{new Date(task.dueDate).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}</dd></div><div><dt>门店</dt><dd>{task.storeName || "-"}</dd></div></dl>{task.calendarDescription && <Alert className="store-h5-calendar-note" type="info" showIcon message="当天任务说明" description={task.calendarDescription} />}{task.calendarRemark && <Alert className="store-h5-calendar-note" type="warning" showIcon message="备注" description={task.calendarRemark} />}</section>
    {task.rectification && <>
      {new Date(task.dueDate).getTime() < Date.now() && <Alert type="warning" showIcon message="本轮整改已超时，仍可上传并提交" />}
      <RectificationInspectionSection inspection={task.rectification.inspection} />
      <RectificationRequirementSection round={task.rectification.round} />
    </>}
    {task.sharedExecution && task.canStart && canSubmitTask && task.status === "PENDING" && <Alert type="info" showIcon message="当前任务尚未有人开始执行。点击后你将取得本任务编辑权，其他执行人仍可查看，但不能编辑或代为提交。" action={<Button type="primary" loading={claiming} onClick={() => void claimExecution()}>开始执行</Button>} />}
    {task.sharedExecution && task.editOwnerUserId && task.editOwnerUserId !== draftOwnerId && task.status === "PENDING" && <Alert type="info" showIcon message={`${task.editOwnerName || "其他执行人"}已开始执行，当前只能查看，不能填写、暂存或提交。`} />}
    {task.status === "COMPLETED" && <Alert type="success" showIcon message={`任务已由${task.submittedBy || task.editOwnerName || "执行人"}提交完成${task.submittedAt ? `（${new Date(task.submittedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}）` : ""}。当前为只读查看。`} />}
    {task.status === "OVERDUE" && <Alert type="warning" showIcon message="任务已逾期，当前只能查看，不能继续填写或提交。" />}
    {task.status !== "COMPLETED" && !canSubmitTask && <Alert type="info" showIcon message="当前角色仅可查看任务详情，不能填写、暂存或提交" />}
    {draftFeedback && <Alert className="store-h5-draft-alert" type={draftFeedback.type} showIcon message={draftFeedback.message} description={draftSavedAt ? `暂存时间：${new Date(draftSavedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}` : undefined} closable onClose={() => setDraftFeedback(undefined)} />}
    <section className="store-h5-form-list">
      {task.items.map((item, index) => {
        const itemAttachments = attachments[index] || [];
        const successCount = itemAttachments.filter(attachment => attachment.status === "success").length;
        const itemBusy = itemAttachments.some(attachment => attachment.status === "uploading");
        const fallbackUnlocked = item.captureOnly && fallbackItemIndexes.has(index);
        const uploadLabel = item.dataType === "video"
          ? item.captureOnly && !fallbackUnlocked ? successCount ? "继续拍摄视频" : "拍摄视频" : successCount ? "继续录像 / 选择相册视频" : "录像 / 选择相册视频"
          : item.dataType === "document" ? successCount ? "继续上传文档" : "上传文档"
            : item.captureOnly && !fallbackUnlocked ? successCount ? "继续拍照" : "拍照" : successCount ? "继续拍照 / 选择相册照片" : "拍照 / 选择相册照片";
        return <div ref={node => { itemRefs.current[index] = node; }} className={`store-h5-form-item ${errors[index] ? "error" : ""}`} key={`${item.name}-${index}`}><div className="store-h5-form-title"><span>{index + 1}</span><div><h2>{item.name}{item.required && <b>*</b>}</h2><small>{item.required ? "必填" : "选填"}{item.component === "attachment" ? ` · 已上传 ${successCount}/${item.weight} 个` : ""}</small></div></div><p>{item.description}</p>
          {item.component === "attachment" ? <div><Upload disabled={!canEditAttachments} showUploadList={false} maxCount={item.weight} accept={item.dataType === "video" ? "video/*" : item.dataType === "document" ? ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv" : "image/*"} capture={item.captureOnly && !fallbackUnlocked && (item.dataType === "photo" || item.dataType === "video") ? "environment" : undefined} beforeUpload={upload(index, item)}><Button block disabled={!canEditAttachments || itemBusy || successCount >= item.weight} icon={item.dataType === "video" ? <VideoCameraOutlined /> : item.dataType === "photo" ? <CameraOutlined /> : <UploadOutlined />}>{!canEditAttachments ? "仅可查看附件" : itemBusy ? "上传中..." : successCount >= item.weight ? `已达到 ${item.weight} 个上限` : uploadLabel}</Button></Upload>
            {fallbackUnlocked && <small className="store-h5-fallback-hint">该任务项曾上传失败，已开放从相册补传。</small>}
            {item.dataType === "video" && <small className="store-h5-video-hint">建议拍摄 {TASK_VIDEO_SUGGESTED_MIN_SECONDS}–{TASK_VIDEO_SUGGESTED_MAX_SECONDS} 秒，系统将自动压缩至最高约 720p，单个视频最大 {taskAttachmentMaxMb("video")}MB；本项最多上传 {item.weight} 个。</small>}
            {item.dataType === "photo" && successCount > 0 && <Image.PreviewGroup><div className="store-h5-photo-gallery">
              {itemAttachments.filter(attachment => attachment.status === "success" && attachment.id).map(attachment => <Image
                key={attachment.clientId} width={88} height={88} alt={attachment.name}
                src={`${apiBase}/tasks/${taskInstanceId}/attachments?attachmentId=${encodeURIComponent(attachment.id!)}`}
                style={{ objectFit: "cover" }} preview={{ mask: "查看大图" }}
              />)}
            </div></Image.PreviewGroup>}
            {itemAttachments.map(attachment => <div key={attachment.clientId} className={`store-h5-upload-status ${attachment.status}`}><span>{attachment.status === "uploading" ? <LoadingOutlined /> : attachment.status === "success" ? <CheckCircleFilled /> : <CloseCircleFilled />}{attachment.status === "uploading" ? `${attachment.phase === "preparing" ? "处理中" : "上传中"} ${attachment.progress || 0}%` : attachment.status === "success" ? "上传成功" : attachment.status === "local" ? "本机待上传" : "上传失败"}：{attachment.name}</span><div className="store-h5-upload-actions">{canEditAttachments && attachment.localFile && attachment.status !== "uploading" && <Button type="text" aria-label={`重试上传${attachment.name}`} icon={<RedoOutlined />} onClick={() => void performUpload(index, item, attachment.localFile!, attachment.clientId)}>重试</Button>}{canEditAttachments && attachment.status !== "uploading" && <Button type="text" aria-label={`删除附件${attachment.name}`} icon={<DeleteOutlined />} onClick={() => void removeAttachment(index, attachment.clientId)} />}</div>{attachment.status === "uploading" && <i className="store-h5-upload-progress"><b style={{ width: `${attachment.progress || 0}%` }} /></i>}{attachment.message && <small>{attachment.message}</small>}</div>)}
          </div> : item.component === "select" ? <Select disabled={!canEditTask} value={values[index]} placeholder="请选择" options={item.options.map(option => ({ value: option, label: option }))} onChange={value => { setDirty(true); setValues(current => ({ ...current, [index]: value })); setErrors(current => ({ ...current, [index]: "" })); }} /> : item.dataType === "text" ? <Input.TextArea disabled={!canEditTask} value={String(values[index] ?? "")} autoSize={{ minRows: 3, maxRows: 8 }} placeholder={item.description || "请输入文字"} onChange={event => { setDirty(true); setValues(current => ({ ...current, [index]: event.target.value })); setErrors(current => ({ ...current, [index]: "" })); }} /> : <InputNumber disabled={!canEditTask} value={values[index]} min={0} max={item.dataType === "score" ? 5 : item.dataType === "quantity" && item.maxValue !== undefined && item.maxValue !== null ? item.maxValue : undefined} step={item.dataType === "score" ? 0.1 : item.dataType === "amount" ? 0.01 : 1} precision={item.dataType === "score" ? 1 : item.dataType === "amount" ? 2 : 0} stringMode={item.dataType === "amount"} inputMode={item.dataType === "quantity" ? "numeric" : "decimal"} placeholder={item.dataType === "score" ? "请输入0至5分，可保留一位小数" : item.dataType === "amount" ? "请输入金额" : item.maxValue !== undefined && item.maxValue !== null ? `请输入0至${item.maxValue}的整数` : "请输入非负整数"} addonBefore={item.dataType === "amount" ? "¥" : undefined} addonAfter={item.dataType === "score" ? "分" : undefined} onChange={value => { setDirty(true); setValues(current => ({ ...current, [index]: value === null ? "" : value })); setErrors(current => ({ ...current, [index]: "" })); }} />}
          {errors[index] && <div className="store-h5-field-error">{errors[index]}</div>}
        </div>;
      })}
    </section>
    {task.status !== "COMPLETED" && <div className="store-h5-submit-space" />} {task.status !== "COMPLETED" && <footer className="store-h5-submit-bar">{submitError && <Alert type="error" showIcon message={submitError} closable onClose={() => setSubmitError("")} />}<div className="store-h5-submit-actions"><Button size="large" icon={<SaveOutlined />} loading={saving} disabled={!canEditTask || saving || submitting} onClick={() => void saveDraft()}>{saving ? "暂存中..." : "暂存"}</Button><Button type="primary" size="large" loading={submitting} disabled={!canSubmit} onClick={beginSubmit}>{canEditTask ? submitting ? "提交中..." : "提交" : "仅可查看"}</Button></div></footer>}
    <Modal title="确认提交当前任务？" open={confirmOpen} centered maskClosable={false} closable={!submitting} okText="确认提交" cancelText="取消" confirmLoading={submitting} onCancel={() => !submitting && setConfirmOpen(false)} onOk={() => void submit()}><p>提交后当前任务将变为已完成，请确认填写内容无误。</p></Modal>
    <Modal title="当前任务尚未暂存或提交" open={leaveOpen} centered okText="确认离开" cancelText="继续填写" okButtonProps={{ danger: true }} onCancel={() => setLeaveOpen(false)} onOk={() => { setDirty(false); setLeaveOpen(false); router.push(leaveTarget); }}><p>离开后尚未暂存的填写内容或文件可能丢失，是否继续？</p></Modal>
    <Modal title="温馨提示" open={successOpen} centered closable={false} maskClosable={false} footer={<Button block type="primary" onClick={() => { setSuccessOpen(false); router.replace(`${webBase}/tasks`); router.refresh(); }}>我知道了</Button>}><div className="store-h5-success"><CheckCircleFilled /><strong>当前任务已提交并完成。</strong></div></Modal>
  </main>;
}

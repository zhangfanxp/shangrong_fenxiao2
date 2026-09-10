"use client";

import { ArrowLeftOutlined, CameraOutlined, CheckCircleFilled, CloseCircleFilled, DeleteOutlined, LoadingOutlined, UploadOutlined, VideoCameraOutlined } from "@ant-design/icons";
import { Alert, Button, Input, InputNumber, Modal, Select, Skeleton, Tag, Upload } from "antd";
import type { UploadProps } from "antd";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { optimizeTaskPhoto, putFileWithProgress } from "@/lib/client/store-h5-direct-upload";
import { optimizeTaskVideo } from "@/lib/client/task-video-compression";
import { taskAttachmentMaxBytes, taskAttachmentMaxMb, TASK_VIDEO_SUGGESTED_MAX_SECONDS, TASK_VIDEO_SUGGESTED_MIN_SECONDS } from "@/lib/task-attachment-rules";

type Item = { name: string; component: "attachment" | "input" | "select"; dataType: "photo" | "video" | "document" | "amount" | "quantity" | "text" | null; captureOnly?: boolean; options: string[]; description: string; required: boolean; weight: number };
type TaskDetail = { id: string; recordNo?: string; taskName: string; taskTypeLabel: string; storeName?: string; brandName?: string; executionDate: string; dueDate: string; items: Item[]; draftAttachments?: Array<{ id: string; itemIndex: number; name: string }> };
type Attachment = { clientId: string; id?: string; name: string; status: "uploading" | "success" | "error"; phase?: "preparing" | "uploading"; message?: string; progress?: number };

export function StoreH5TaskForm({ taskInstanceId }: { taskInstanceId: string }) {
  const router = useRouter();
  const [task, setTask] = useState<TaskDetail>();
  const [values, setValues] = useState<Record<number, string | number>>({});
  const [attachments, setAttachments] = useState<Record<number, Attachment[]>>({});
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [leaveTarget, setLeaveTarget] = useState("/store_h5/tasks");
  const itemRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const historyGuard = useRef(false);

  const load = useCallback(async () => {
    setLoading(true); setLoadError("");
    try {
      const response = await fetch(`/api/store-h5/tasks/${taskInstanceId}`, { cache: "no-store" });
      const data = await response.json();
      if (response.status === 401) { router.replace("/store_h5/login"); return; }
      if (!response.ok) throw new Error(data.message || "任务内容加载失败，请稍后重试");
      setTask(data);
      const restored = (data.draftAttachments || []).reduce((grouped: Record<number, Attachment[]>, attachment: { id: string; itemIndex: number; name: string }) => {
        grouped[attachment.itemIndex] = [...(grouped[attachment.itemIndex] || []), { clientId: attachment.id, id: attachment.id, name: attachment.name, status: "success", progress: 100, message: "已恢复此前上传的附件" }];
        return grouped;
      }, {});
      setAttachments(restored);
    } catch (reason) { setLoadError(reason instanceof Error ? reason.message : "任务内容加载失败，请稍后重试"); }
    finally { setLoading(false); }
  }, [router, taskInstanceId]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (dirty && !successOpen && !historyGuard.current) {
      window.history.pushState({ storeTaskGuard: true }, "", window.location.href);
      historyGuard.current = true;
    }
    const interceptBack = () => {
      if (!dirty || successOpen || !historyGuard.current) return;
      window.history.pushState({ storeTaskGuard: true }, "", window.location.href);
      setLeaveTarget("/store_h5/tasks"); setLeaveOpen(true);
    };
    window.addEventListener("popstate", interceptBack);
    return () => window.removeEventListener("popstate", interceptBack);
  }, [dirty, successOpen]);

  const requestLeave = (target = "/store_h5/tasks") => {
    if (!dirty) return void router.push(target);
    setLeaveTarget(target); setLeaveOpen(true);
  };
  const updateAttachment = (index: number, clientId: string, update: Partial<Attachment>) => {
    setAttachments(current => ({ ...current, [index]: (current[index] || []).map(attachment => attachment.clientId === clientId ? { ...attachment, ...update } : attachment) }));
  };
  const removeAttachment = async (index: number, clientId: string) => {
    const attachment = (attachments[index] || []).find(item => item.clientId === clientId);
    if (!attachment || attachment.status === "uploading") return;
    if (attachment.id) {
      try {
        const response = await fetch(`/api/store-h5/tasks/${taskInstanceId}/attachments`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ attachmentId: attachment.id }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "附件删除失败");
      } catch (reason) {
        updateAttachment(index, clientId, { status: "error", message: reason instanceof Error ? reason.message : "附件删除失败" });
        return;
      }
    }
    setAttachments(current => ({ ...current, [index]: (current[index] || []).filter(item => item.clientId !== clientId) }));
    setDirty(true);
  };
  const upload = (index: number, item: Item): UploadProps["beforeUpload"] => async file => {
    const activeCount = (attachments[index] || []).filter(attachment => attachment.status !== "error").length;
    if (activeCount >= item.weight) { setErrors(current => ({ ...current, [index]: `最多上传${item.weight}个附件` })); return Upload.LIST_IGNORE; }
    const clientId = crypto.randomUUID();
    const typeOkay = item.dataType === "video" ? file.type.startsWith("video/") : item.dataType === "document" ? file.type.startsWith("application/") || file.type.startsWith("text/") : file.type.startsWith("image/");
    const dataType = item.dataType as "photo" | "video" | "document";
    const maxBytes = taskAttachmentMaxBytes(dataType); const maxMb = taskAttachmentMaxMb(dataType);
    if (!typeOkay || (dataType !== "video" && file.size > maxBytes)) {
      setAttachments(current => ({ ...current, [index]: [...(current[index] || []), { clientId, name: file.name, status: "error", message: !typeOkay ? "文件类型不符合要求" : `文件不能超过 ${maxMb}MB` }] }));
      return Upload.LIST_IGNORE;
    }
    setDirty(true); setErrors(current => ({ ...current, [index]: "" }));
    setAttachments(current => ({ ...current, [index]: [...(current[index] || []), { clientId, name: file.name, status: "uploading", phase: dataType === "document" ? "uploading" : "preparing", progress: 0, message: dataType === "photo" ? "正在优化图片..." : dataType === "video" ? "正在读取视频并准备压缩..." : "正在准备直传..." }] }));
    try {
      const prepared: { file: File; optimized: boolean; durationSeconds?: number } = dataType === "photo"
        ? await optimizeTaskPhoto(file)
        : dataType === "video"
          ? await optimizeTaskVideo(file, progress => updateAttachment(index, clientId, { name: file.name, status: "uploading", phase: "preparing", progress: Math.round(progress * .35), message: `正在压缩视频 ${progress}%` }))
          : { file, optimized: false };
      const directFile = prepared.file;
      if (directFile.size > maxBytes) throw new Error(`文件不能超过 ${maxMb}MB`);
      const savedBytes = prepared.optimized ? file.size - directFile.size : 0;
      const durationText = prepared.durationSeconds ? `视频约 ${Math.round(prepared.durationSeconds)} 秒` : "视频";
      const durationAdvice = prepared.durationSeconds && prepared.durationSeconds > TASK_VIDEO_SUGGESTED_MAX_SECONDS ? `，建议控制在 ${TASK_VIDEO_SUGGESTED_MAX_SECONDS} 秒以内` : "";
      const resultMessage = dataType === "video"
        ? `${durationText}${prepared.optimized ? `，已压缩至 ${(directFile.size / 1024 / 1024).toFixed(1)}MB` : ""}${durationAdvice}`
        : prepared.optimized ? `图片已优化，减少 ${(savedBytes / 1024 / 1024).toFixed(1)}MB` : "";
      const preparationMessage = resultMessage ? `${resultMessage}，正在上传到R2...` : "正在上传到R2...";
      updateAttachment(index, clientId, { name: directFile.name, status: "uploading", phase: "uploading", progress: dataType === "video" && prepared.optimized ? 35 : 0, message: preparationMessage });
      const signResponse = await fetch(`/api/store-h5/tasks/${taskInstanceId}/attachments/sign`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemIndex: index, name: directFile.name, type: directFile.type || "application/octet-stream", size: directFile.size }),
      });
      const sign = await signResponse.json();
      if (signResponse.status === 401) { router.replace("/store_h5/login"); return Upload.LIST_IGNORE; }
      if (!signResponse.ok) throw new Error(sign.message || "生成R2直传地址失败，请稍后重试");
      const uploaded = await putFileWithProgress({
        url: sign.uploadUrl, file: directFile, headers: sign.headers,
        onProgress: progress => updateAttachment(index, clientId, { name: directFile.name, status: "uploading", progress: dataType === "video" && prepared.optimized ? 35 + Math.round(progress * .65) : progress, message: preparationMessage }),
      });
      const confirmResponse = await fetch(`/api/store-h5/tasks/${taskInstanceId}/attachments/confirm`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadToken: sign.uploadToken, etag: uploaded.etag }),
      });
      const confirmed = await confirmResponse.json();
      if (confirmResponse.status === 401) { router.replace("/store_h5/login"); return Upload.LIST_IGNORE; }
      if (!confirmResponse.ok) throw new Error(confirmed.message || "确认R2附件失败，请重新上传");
      updateAttachment(index, clientId, { id: confirmed.id, name: confirmed.name, status: "success", progress: 100, message: resultMessage || undefined });
    } catch (reason) {
      updateAttachment(index, clientId, { status: "error", message: reason instanceof Error ? reason.message : "附件上传失败，请重新上传" });
    }
    return Upload.LIST_IGNORE;
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
  const canSubmit = requiredItemsComplete && !attachmentUploading && !submitting;
  const beginSubmit = () => { if (validate()) setConfirmOpen(true); };
  const submit = async () => {
    if (!task || submitting) return;
    setSubmitting(true); setSubmitError("");
    try {
      const items = task.items.map((item, index) => item.component === "attachment" ? { index, attachmentIds: (attachments[index] || []).flatMap(attachment => attachment.status === "success" && attachment.id ? [attachment.id] : []) } : { index, value: values[index] });
      const response = await fetch(`/api/store-h5/tasks/${taskInstanceId}/submit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items }) });
      const data = await response.json();
      if (response.status === 401) { router.replace("/store_h5/login"); return; }
      if (!response.ok) throw new Error(data.message || "任务提交失败，请检查网络后重试");
      setConfirmOpen(false); setDirty(false); setSuccessOpen(true);
    } catch (reason) { setConfirmOpen(false); setSubmitError(reason instanceof Error ? reason.message : "任务提交失败，请检查网络后重试"); }
    finally { setSubmitting(false); }
  };
  if (loading) return <main className="store-h5-page store-h5-task-page"><header className="store-h5-subheader"><span /><div><strong>任务加载中...</strong><small>请稍候</small></div><span /></header><section className="store-h5-task-content"><Skeleton active paragraph={{ rows: 7 }} /></section></main>;
  if (loadError || !task) return <main className="store-h5-page store-h5-task-page"><header className="store-h5-subheader"><Button type="text" icon={<ArrowLeftOutlined />} onClick={() => router.push("/store_h5/tasks")} /><div><strong>任务执行</strong></div><span /></header><section className="store-h5-task-content"><Alert type="error" showIcon message={loadError || "任务内容加载失败，请稍后重试"} action={<Button size="small" onClick={() => void load()}>重新加载</Button>} /></section></main>;
  return <main className="store-h5-page store-h5-task-page store-h5-execution-page">
    <header className="store-h5-subheader"><Button type="text" aria-label="返回任务列表" icon={<ArrowLeftOutlined />} onClick={() => requestLeave()} /><div><strong>任务执行</strong><small>{task.recordNo}</small></div><span /></header>
    <section className="store-h5-task-summary"><div><h1>{task.taskName}</h1><Tag color="blue">{task.taskTypeLabel}</Tag></div><dl><div><dt>执行日期</dt><dd>{String(task.executionDate).slice(0, 10)}</dd></div><div><dt>截止时间</dt><dd>{new Date(task.dueDate).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}</dd></div><div><dt>门店</dt><dd>{task.storeName || "-"}</dd></div></dl></section>
    <section className="store-h5-form-list">
      {task.items.map((item, index) => {
        const itemAttachments = attachments[index] || [];
        const successCount = itemAttachments.filter(attachment => attachment.status === "success").length;
        const itemBusy = itemAttachments.some(attachment => attachment.status === "uploading");
        return <div ref={node => { itemRefs.current[index] = node; }} className={`store-h5-form-item ${errors[index] ? "error" : ""}`} key={`${item.name}-${index}`}><div className="store-h5-form-title"><span>{index + 1}</span><div><h2>{item.name}{item.required && <b>*</b>}</h2><small>{item.required ? "必填" : "选填"}{item.component === "attachment" ? ` · 已上传 ${successCount}/${item.weight} 个` : ""}</small></div></div><p>{item.description}</p>
          {item.component === "attachment" ? <div><Upload showUploadList={false} maxCount={item.weight} accept={item.dataType === "video" ? "video/*" : item.dataType === "document" ? ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv" : "image/*"} capture={item.captureOnly && (item.dataType === "photo" || item.dataType === "video") ? "environment" : undefined} beforeUpload={upload(index, item)}><Button block disabled={itemBusy || successCount >= item.weight} icon={item.dataType === "video" ? <VideoCameraOutlined /> : item.dataType === "photo" ? <CameraOutlined /> : <UploadOutlined />}>{itemBusy ? "上传中..." : successCount >= item.weight ? `已达到 ${item.weight} 个上限` : item.dataType === "video" ? item.captureOnly ? successCount ? "继续拍摄视频" : "拍摄视频" : "拍摄 / 选择相册视频" : item.dataType === "document" ? successCount ? "继续上传文档" : "上传文档" : item.captureOnly ? successCount ? "继续拍照" : "拍照" : "拍照 / 选择相册照片"}</Button></Upload>{item.dataType === "video" && <small className="store-h5-video-hint">建议拍摄 {TASK_VIDEO_SUGGESTED_MIN_SECONDS}–{TASK_VIDEO_SUGGESTED_MAX_SECONDS} 秒，系统将自动压缩至最高约 720p，单个视频最大 {taskAttachmentMaxMb("video")}MB；本项最多上传 {item.weight} 个。</small>}
            {itemAttachments.map(attachment => <div key={attachment.clientId} className={`store-h5-upload-status ${attachment.status}`}><span>{attachment.status === "uploading" ? <LoadingOutlined /> : attachment.status === "success" ? <CheckCircleFilled /> : <CloseCircleFilled />}{attachment.status === "uploading" ? `${attachment.phase === "preparing" ? "处理中" : "上传中"} ${attachment.progress || 0}%` : attachment.status === "success" ? "上传成功" : "上传失败"}：{attachment.name}</span>{attachment.status !== "uploading" && <Button type="text" aria-label={`删除附件${attachment.name}`} icon={<DeleteOutlined />} onClick={() => void removeAttachment(index, attachment.clientId)} />} {attachment.status === "uploading" && <i className="store-h5-upload-progress"><b style={{ width: `${attachment.progress || 0}%` }} /></i>}{attachment.message && <small>{attachment.message}</small>}</div>)}
          </div> : item.component === "select" ? <Select value={values[index]} placeholder="请选择" options={item.options.map(option => ({ value: option, label: option }))} onChange={value => { setDirty(true); setValues(current => ({ ...current, [index]: value })); setErrors(current => ({ ...current, [index]: "" })); }} /> : item.dataType === "text" ? <Input.TextArea value={String(values[index] ?? "")} autoSize={{ minRows: 3, maxRows: 8 }} placeholder={item.description || "请输入文字"} onChange={event => { setDirty(true); setValues(current => ({ ...current, [index]: event.target.value })); setErrors(current => ({ ...current, [index]: "" })); }} /> : <InputNumber value={values[index]} min={0} precision={item.dataType === "amount" ? 2 : 0} stringMode={item.dataType === "amount"} inputMode="decimal" placeholder={item.dataType === "amount" ? "请输入金额" : "请输入数量"} addonBefore={item.dataType === "amount" ? "¥" : undefined} onChange={value => { setDirty(true); setValues(current => ({ ...current, [index]: value === null ? "" : value })); setErrors(current => ({ ...current, [index]: "" })); }} />}
          {errors[index] && <div className="store-h5-field-error">{errors[index]}</div>}
        </div>;
      })}
    </section>
    <div className="store-h5-submit-space" /><footer className="store-h5-submit-bar">{submitError && <Alert type="error" showIcon message={submitError} closable onClose={() => setSubmitError("")} />}<Button block type="primary" size="large" loading={submitting} disabled={!canSubmit} onClick={beginSubmit}>{submitting ? "提交中..." : "提交"}</Button></footer>
    <Modal title="确认提交当前任务？" open={confirmOpen} centered maskClosable={false} closable={!submitting} okText="确认提交" cancelText="取消" confirmLoading={submitting} onCancel={() => !submitting && setConfirmOpen(false)} onOk={() => void submit()}><p>提交后当前任务将变为已完成，请确认填写内容无误。</p></Modal>
    <Modal title="当前任务尚未提交" open={leaveOpen} centered okText="确认离开" cancelText="继续填写" okButtonProps={{ danger: true }} onCancel={() => setLeaveOpen(false)} onOk={() => { setDirty(false); setLeaveOpen(false); router.push(leaveTarget); }}><p>离开后已填写内容可能丢失，是否继续？</p></Modal>
    <Modal title="温馨提示" open={successOpen} centered closable={false} maskClosable={false} footer={<Button block type="primary" onClick={() => { setSuccessOpen(false); router.replace("/store_h5/tasks"); router.refresh(); }}>我知道了</Button>}><div className="store-h5-success"><CheckCircleFilled /><strong>当前任务已提交并完成。</strong></div></Modal>
  </main>;
}

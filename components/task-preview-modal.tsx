"use client";

import { InboxOutlined } from "@ant-design/icons";
import { Alert, Button, Form, InputNumber, message, Modal, Select, Space, Tag, Upload } from "antd";
import type { UploadProps } from "antd";
import { useEffect, useState } from "react";
import { taskAttachmentMaxMb } from "@/lib/task-attachment-rules";

type SubmitItem = { name: string; component: "attachment" | "input" | "select"; dataType: "photo" | "video" | "document" | "amount" | "quantity" | null; captureOnly?: boolean; options: string[]; description: string; required: boolean; weight: number; aiAnalysisType?: string | null; aiAnalysisPrompt?: string | null };
type Config = { taskName?: string; submitItems?: SubmitItem[] };
type FilePayload = { name: string; type: string; size: number; dataUrl: string };

function asConfig(value: unknown): Config | null {
  if (!value || typeof value !== "object" || !Array.isArray((value as Config).submitItems)) return null;
  return value as Config;
}
function fileAsPayload(file: File, mimeType: string) {
  return new Promise<FilePayload>((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(new Error("文件读取失败")); reader.onload = () => { const raw = String(reader.result); resolve({ name: file.name, type: mimeType, size: file.size, dataUrl: file.type ? raw : raw.replace(/^data:;base64,/, `data:${mimeType};base64,`) }); }; reader.readAsDataURL(file); });
}

export function TaskPreviewModal({ open, onClose, taskId, config }: { open: boolean; onClose: () => void; taskId?: string; config: unknown }) {
  const [form] = Form.useForm(); const [files, setFiles] = useState<Record<number, FilePayload[]>>({}); const [saving, setSaving] = useState(false);
  const parsed = asConfig(config); const items = parsed?.submitItems || [];
  useEffect(() => { if (open) { form.resetFields(); setFiles({}); } }, [open, form]);
  const uploadFile = (index: number, item: SubmitItem): UploadProps["beforeUpload"] => async file => {
    const kind = item.dataType === "video" ? "视频" : item.dataType === "document" ? "文档" : "照片"; const maxSize = taskAttachmentMaxMb(item.dataType === "video" ? "video" : item.dataType === "document" ? "document" : "photo");
    const documentType = file.type.startsWith("application/") || file.type.startsWith("text/") || /\.(pdf|docx?|xlsx?|pptx?|txt|csv)$/i.test(file.name);
    const validType = item.dataType === "video" ? file.type.startsWith("video/") : item.dataType === "document" ? documentType : file.type.startsWith("image/");
    if (!validType) { message.error(`仅支持上传${kind}`); return Upload.LIST_IGNORE; }
    if (file.size > maxSize * 1024 * 1024) { message.error(`${kind}不能超过 ${maxSize}MB`); return Upload.LIST_IGNORE; }
    try { const payload = await fileAsPayload(file, file.type || "application/octet-stream"); setFiles(current => ({ ...current, [index]: [...(current[index] || []), payload] })); } catch { message.error("文件读取失败，请重新上传"); }
    return Upload.LIST_IGNORE;
  };
  const submit = async () => {
    if (!taskId || !parsed) return;
    try {
      const values = await form.validateFields();
      for (const [index, item] of items.entries()) if (item.component === "attachment" && item.required && !(files[index] || []).length) { message.error(`请上传“${item.name}”`); return; }
      setSaving(true);
      const response = await fetch(`/api/tasks/settings/${taskId}/preview`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: items.map((item, index) => item.component === "attachment" ? { name: item.name, files: files[index] || [] } : { name: item.name, value: values[`item-${index}`] }) }) });
      const data = await response.json(); if (!response.ok) { message.error(data.message || "任务提交失败，请稍后重试"); return; }
      message.success("任务提交成功，已生成任务记录"); onClose();
    } finally { setSaving(false); }
  };
  return <Modal title={`任务预览：${parsed?.taskName || "任务"}`} open={open} onCancel={onClose} width={760} destroyOnHidden footer={<Space><Button onClick={onClose}>取消</Button><Button type="primary" loading={saving} onClick={() => void submit()}>提交</Button></Space>}>
    {!parsed ? <Alert type="error" showIcon message="任务配置文件格式异常，请联系系统管理员。" /> : <Form form={form} layout="vertical">
      <Alert style={{ marginBottom: 18 }} type="info" showIcon message="此预览可模拟实际任务提交；提交成功后会生成一条任务记录，并保存本次填写内容与配置快照。" />
      {items.map((item, index) => <div className="task-preview-item" key={`${item.name}-${index}`}><div className="task-preview-title">{item.name}{item.required && <span className="task-required">*</span>} <Tag>{item.required ? "必填" : "选填"}</Tag><Tag>权重：{item.weight}</Tag>{item.aiAnalysisType && <Tag color="purple">Ai分析：{item.aiAnalysisType}</Tag>}</div><div className="task-preview-description">{item.description}</div>{item.aiAnalysisPrompt && <div className="task-preview-ai-prompt"><strong>Ai分析提示词：</strong>{item.aiAnalysisPrompt}</div>}
        {item.component === "attachment" ? <div><Upload showUploadList={false} accept={item.dataType === "video" ? "video/*" : item.dataType === "document" ? ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv" : "image/*"} capture={item.captureOnly && (item.dataType === "photo" || item.dataType === "video") ? "environment" : undefined} beforeUpload={uploadFile(index, item)}><Button icon={<InboxOutlined />}>{item.dataType === "video" ? item.captureOnly ? "拍摄视频" : "拍摄 / 选择视频" : item.dataType === "document" ? "上传文档" : item.captureOnly ? "拍照" : "拍照 / 选择照片"}</Button></Upload><div className="task-preview-files">{(files[index] || []).map((file, fileIndex) => <Tag closable key={`${file.name}-${fileIndex}`} onClose={() => setFiles(current => ({ ...current, [index]: current[index].filter((_, i) => i !== fileIndex) }))}>{file.name}</Tag>)}</div></div> : item.component === "select" ? <Form.Item name={`item-${index}`} rules={item.required ? [{ required: true, message: `请选择${item.name}` }] : []}><Select placeholder={item.description} options={item.options.map(option => ({ value: option, label: option }))} /></Form.Item> : <Form.Item name={`item-${index}`} rules={item.required ? [{ required: true, message: `请填写${item.name}` }] : []}><InputNumber min={0} precision={item.dataType === "amount" ? 2 : 0} style={{ width: "100%" }} placeholder={item.description} addonBefore={item.dataType === "amount" ? "¥" : undefined} addonAfter={item.dataType === "quantity" ? "数量" : undefined} /></Form.Item>}
      </div>)}
    </Form>}
  </Modal>;
}

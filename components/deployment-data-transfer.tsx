"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Collapse, Descriptions, Input, message, Space, Tabs, Tag, Typography, Upload } from "antd";
import { DownloadOutlined, InboxOutlined, ReloadOutlined, SafetyCertificateOutlined, UploadOutlined } from "@ant-design/icons";

type Category = { key: string; title: string; count: number; entries: string[] };
type Overview = { packageVersion: number; generatedAt: string; categories: Category[] };
type Preview = { source: { appVersion?: string; exportedAt?: string; deploymentSchemaVersion?: number }; counts: Record<string, number>; excluded: string[]; includesR2Credentials: boolean };

const countLabels: Record<string, string> = {
  roles: "角色", brands: "品牌", dataDictionaries: "数据字典", dictionaryItems: "结构化字典项", dictionaryValues: "JSON字典项",
  taskCalendarTemplates: "日历任务模板", tasks: "任务模板", assessments: "考核模板", researchTemplates: "调研模板",
  businessDataSources: "业务数据源", restDays: "休息日", storeLaborStandards: "用工标准", r2StorageConfigs: "R2配置",
};

async function responseMessage(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "操作失败，请稍后重试");
  return data;
}

export function DeploymentDataTransfer() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [exportPassword, setExportPassword] = useState("");
  const [exportConfirm, setExportConfirm] = useState("");
  const [exporting, setExporting] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [importPassword, setImportPassword] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);

  const loadOverview = async () => {
    setLoadingOverview(true);
    try { setOverview(await responseMessage(await fetch("/api/settings/deployment-data", { cache: "no-store" }))); }
    catch (error) { message.error(error instanceof Error ? error.message : "读取资料清单失败"); }
    finally { setLoadingOverview(false); }
  };
  useEffect(() => { void loadOverview(); }, []);

  const tabItems = useMemo(() => (overview?.categories || []).map(category => ({
    key: category.key,
    label: <span>{category.title} <Tag color={category.count ? "blue" : "default"}>{category.count}</Tag></span>,
    children: category.entries.length ? <div style={{ maxHeight: 260, overflow: "auto", lineHeight: 2 }}>{category.entries.map((entry, index) => <div key={`${category.key}-${index}`} style={{ borderBottom: "1px solid #f0f0f0", padding: "2px 4px" }}>{entry}</div>)}</div> : <Typography.Text type="secondary">当前没有记录</Typography.Text>,
  })), [overview]);

  const exportPackage = async () => {
    if (exportPassword.length < 12) { message.warning("资料包加密口令至少需要12个字符"); return; }
    if (exportPassword !== exportConfirm) { message.warning("两次输入的加密口令不一致"); return; }
    setExporting(true);
    const progressKey = "deployment-data-export";
    let downloadUrl: string | null = null;
    message.loading({ content: "正在生成加密资料包……", key: progressKey, duration: 0 });
    try {
      const response = await fetch("/api/settings/deployment-data/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: exportPassword }) });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message || "资料包导出失败");
      const blob = await response.blob();
      if (!blob.size) throw new Error("服务器返回的资料包为空，请稍后重试");
      downloadUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      anchor.download = `canyin-reference-data-${new Date().toISOString().slice(0, 10)}.cspkg`;
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      // Keep the Blob URL alive long enough for Safari/macOS to start the download.
      window.setTimeout(() => { if (downloadUrl) URL.revokeObjectURL(downloadUrl); }, 60_000);
      message.success({ content: "下载已开始。请将加密资料包与口令分开妥善保管。", key: progressKey, duration: 4 });
    } catch (error) {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
      message.error({ content: error instanceof Error ? error.message : "资料包导出失败", key: progressKey, duration: 5 });
    }
    finally { setExporting(false); }
  };

  const makeForm = (action: "preview" | "import") => {
    if (!file) throw new Error("请先选择 .cspkg 资料包");
    const form = new FormData(); form.set("file", file); form.set("password", importPassword); form.set("action", action); return form;
  };
  const previewPackage = async () => {
    if (!file) { message.warning("请先选择 .cspkg 资料包"); return; }
    if (importPassword.length < 12) { message.warning("请输入导出时设置的资料包口令"); return; }
    setPreviewing(true); setPreview(null);
    try { setPreview(await responseMessage(await fetch("/api/settings/deployment-data/import", { method: "POST", body: makeForm("preview") }))); }
    catch (error) { message.error(error instanceof Error ? error.message : "资料包校验失败"); }
    finally { setPreviewing(false); }
  };
  const importPackage = async () => {
    if (!file || !preview) return;
    setImporting(true);
    try {
      const result = await responseMessage(await fetch("/api/settings/deployment-data/import", { method: "POST", body: makeForm("import") }));
      message.success(result.message || "资料包导入完成"); setPreview(null); setFile(null); setImportPassword(""); await loadOverview();
    } catch (error) { message.error(error instanceof Error ? error.message : "导入失败；可保留资料包后重试"); }
    finally { setImporting(false); }
  };

  return <div style={{ display: "grid", gap: 16 }}>
    <Alert showIcon type="info" message="用于把旧服务器维护的基础资料、模板和配置迁移到新部署系统。" description="资料包不包含人员档案、门店、合同、用户账号（新系统由 setup 创建 admin）、业务流水、通知、培训课件或操作日志。导入不会删除目标系统的其他数据；相同编号/编码的资料会更新。" />
    <Tabs items={[
      { key: "export", label: "数据导出", children: <div style={{ display: "grid", gap: 16 }}>
        <Card size="small" title={<Space><SafetyCertificateOutlined />当前可导出的基础资料</Space>} extra={<Button icon={<ReloadOutlined />} onClick={() => void loadOverview()} loading={loadingOverview}>刷新</Button>}>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>清单会读取当前系统记录。展开分类可核对具体角色、字典项和模板；导出时会生成完整资料包。</Typography.Paragraph>
          {loadingOverview ? <Typography.Text type="secondary">正在读取……</Typography.Text> : <Collapse items={tabItems} />}
        </Card>
        <Card size="small" title="生成加密资料包">
          <Typography.Paragraph>设置一个至少12位的口令。R2访问凭据会包含在加密包中，导入后由新服务器使用本机密钥重新加密；R2桶内文件不会复制。请把资料包与口令分开保存，不要将资料包提交到 GitHub。</Typography.Paragraph>
          <Space direction="vertical" style={{ width: "100%" }}>
            <Input.Password aria-label="资料包加密口令" placeholder="资料包加密口令（至少12位）" value={exportPassword} onChange={event => setExportPassword(event.target.value)} autoComplete="new-password" />
            <Input.Password aria-label="确认资料包加密口令" placeholder="再次输入加密口令" value={exportConfirm} onChange={event => setExportConfirm(event.target.value)} autoComplete="new-password" />
            <Button type="primary" icon={<DownloadOutlined />} loading={exporting} onClick={() => void exportPackage()}>下载加密资料包</Button>
          </Space>
        </Card>
      </div> },
      { key: "import", label: "数据导入", children: <div style={{ display: "grid", gap: 16 }}>
        <Card size="small" title="上传旧系统导出的资料包">
          <Space direction="vertical" style={{ width: "100%" }}>
            <Typography.Paragraph>在新服务器完成 setup、登录 admin 并配置好数据库后，再导入旧系统的 .cspkg 文件。R2配置会导入并在新服务器重新加密，R2对象文件不迁移。</Typography.Paragraph>
            <Upload.Dragger accept=".cspkg,application/vnd.canyin.reference-data-package+json" maxCount={1} beforeUpload={candidate => { setFile(candidate); setPreview(null); return false; }} onRemove={() => { setFile(null); setPreview(null); }} fileList={file ? [{ uid: "package", name: file.name, status: "done" }] : []}>
              <p className="ant-upload-drag-icon"><InboxOutlined /></p><p className="ant-upload-text">点击选择或拖入 .cspkg 资料包</p><p className="ant-upload-hint">最大50MB；只有超级管理员可以使用</p>
            </Upload.Dragger>
            <Input.Password aria-label="资料包解密口令" placeholder="输入导出时设置的资料包口令" value={importPassword} onChange={event => { setImportPassword(event.target.value); setPreview(null); }} autoComplete="current-password" />
            <Button icon={<SafetyCertificateOutlined />} loading={previewing} onClick={() => void previewPackage()}>校验口令并预览</Button>
          </Space>
        </Card>
        {preview && <Card size="small" title="导入预览" extra={<Tag color="green">校验通过</Tag>}>
          <Alert type="warning" showIcon message={`来源版本 ${preview.source.appVersion || "未知"} · 导出时间 ${preview.source.exportedAt ? new Date(preview.source.exportedAt).toLocaleString() : "未知"}`} description="确认资料范围后开始导入。导入会合并或更新同编号资料，不会清空数据库；建议只在新 setup 完成后的空业务库中执行。" style={{ marginBottom: 16 }} />
          <Descriptions size="small" bordered column={{ xs: 1, sm: 2, md: 3 }}>
            {Object.entries(preview.counts).map(([key, count]) => <Descriptions.Item key={key} label={countLabels[key] || key}>{count}</Descriptions.Item>)}
          </Descriptions>
          <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>明确排除：{preview.excluded.join("、")}。R2访问密钥位于加密资料包内；R2对象文件不迁移。</Typography.Paragraph>
          <Button type="primary" danger icon={<UploadOutlined />} loading={importing} onClick={() => window.confirm("确认将资料包导入当前系统？相同编号/编码的资料会更新。") && void importPackage()}>确认导入资料</Button>
        </Card>}
      </div> },
    ]} />
  </div>;
}

"use client";

import { CloudUploadOutlined, DatabaseOutlined, DeleteOutlined, DownloadOutlined, SaveOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Checkbox, Empty, Form, Input, message, Modal, Select, Space, Switch, Tag, Tooltip, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useMemo, useState } from "react";
import { DataTable } from "@/components/data-table";
import { DatabaseDictionaryButton } from "@/components/database-dictionary-button";
import { TimeStringPicker } from "@/components/time-string-picker";

type Permission = "query" | "configure" | "manual" | "download" | "delete";
type Frequency = "DAILY" | "WEEKLY";
type BackupStatus = "RUNNING" | "SUCCESS" | "FAILED";
type BackupRow = {
  id: string;
  fileName: string;
  r2StorageId: string;
  r2StorageNameSnapshot: string;
  bucketNameSnapshot: string;
  backupType: "MANUAL" | "SCHEDULED";
  status: BackupStatus;
  sizeBytes: number;
  checksumSha256: string | null;
  durationSeconds: number | null;
  errorMessage: string | null;
  createdByName: string;
  startedAt: string;
  completedAt: string | null;
};
type BackupForm = {
  r2StorageId: string | null;
  enabled: boolean;
  frequency: Frequency;
  weekdays: number[];
  executionTimes: string[];
};
type Overview = {
  setting: BackupForm & { updatedAt?: string; updatedByName?: string | null };
  selectedR2Unavailable: boolean;
  r2Storages: { value: string; label: string }[];
  rows: BackupRow[];
  total: number;
};

const WEEKDAY_OPTIONS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"].map((label, index) => ({ label, value: index + 1 }));
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function shanghaiDateTime(value: string | null) {
  if (!value) return "—";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}:${part("second")}`;
}

function sizeInMb(bytes: number) {
  if (!bytes) return "—";
  return (bytes / 1024 / 1024).toFixed(2);
}

function durationText(seconds: number | null) {
  if (!seconds) return "—";
  if (seconds < 60) return `${seconds}秒`;
  return `${Math.floor(seconds / 60)}分${seconds % 60}秒`;
}

function timeFields(frequency: Frequency, values: string[]) {
  if (frequency === "WEEKLY") return [values[0] || ""];
  return [values[0] || "", values[1] || "", values[2] || ""];
}

export function DatabaseBackup({ permissions }: { permissions: string[] }) {
  const hasAll = permissions.includes("*");
  const can = (action: Permission) => hasAll || permissions.includes(`database-backups:${action}`);
  const [form] = Form.useForm<BackupForm>();
  const frequency = Form.useWatch("frequency", form) || "DAILY";
  const r2StorageId = Form.useWatch("r2StorageId", form);
  const [executionTimes, setExecutionTimes] = useState<string[]>(["", "", ""]);
  const [rows, setRows] = useState<BackupRow[]>([]);
  const [r2Storages, setR2Storages] = useState<Overview["r2Storages"]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [scheduleError, setScheduleError] = useState("");
  const [selectedR2Unavailable, setSelectedR2Unavailable] = useState(false);
  const [saving, setSaving] = useState(false);
  const [manualBackingUp, setManualBackingUp] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<React.Key[]>([]);

  const load = async (nextPage = page, nextPageSize = pageSize, quiet = false) => {
    if (!quiet) setLoading(true);
    setLoadError("");
    try {
      const query = new URLSearchParams({ page: String(nextPage), pageSize: String(nextPageSize) });
      const response = await fetch(`/api/settings/database-backups?${query}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({})) as Partial<Overview> & { message?: string };
      if (!response.ok) throw new Error(data.message || "数据库备份数据加载失败，请稍后重试");
      const setting = data.setting || { r2StorageId: null, enabled: false, frequency: "DAILY", weekdays: [], executionTimes: [] };
      setRows(data.rows || []);
      setTotal(data.total || 0);
      setR2Storages(data.r2Storages || []);
      setSelectedR2Unavailable(Boolean(data.selectedR2Unavailable));
      if (!quiet) {
        const nextExecutionTimes = timeFields(setting.frequency, setting.executionTimes);
        setExecutionTimes(nextExecutionTimes);
        form.setFieldsValue({ ...setting, executionTimes: nextExecutionTimes });
      }
    } catch (error) {
      if (!quiet) setLoadError(error instanceof Error ? error.message : "数据库备份数据加载失败，请稍后重试");
    } finally {
      if (!quiet) setLoading(false);
    }
  };

  useEffect(() => {
    if (can("query")) void load(1, 10);
    else setLoading(false);
  }, []);

  const hasRunning = rows.some(row => row.status === "RUNNING");
  useEffect(() => {
    if (!manualBackingUp && !hasRunning) return;
    const timer = window.setInterval(() => void load(page, pageSize, true), 4_000);
    return () => window.clearInterval(timer);
  }, [manualBackingUp, hasRunning, page, pageSize]);

  const validateSchedule = (values: BackupForm) => {
    const times = values.executionTimes.map(value => value?.trim()).filter(Boolean);
    if (times.some(value => !TIME_PATTERN.test(value))) return "请选择正确的执行时间";
    if (new Set(times).size !== times.length) return "执行时间不能重复";
    if (values.frequency === "DAILY" && !times.length) return "每日备份的三个执行时间至少选择一个";
    if (values.frequency === "WEEKLY" && !(values.weekdays || []).length) return "每周备份至少勾选一个星期";
    if (values.frequency === "WEEKLY" && times.length !== 1) return "每周备份请选择一个执行时间";
    return "";
  };

  const save = async () => {
    try {
      const formValues = await form.validateFields();
      const values = { ...formValues, executionTimes };
      const error = validateSchedule(values);
      setScheduleError(error);
      if (error) return;
      setSaving(true);
      const payload = { ...values, executionTimes: values.executionTimes.map(value => value?.trim()).filter(Boolean), weekdays: values.frequency === "WEEKLY" ? values.weekdays : [] };
      const response = await fetch("/api/settings/database-backups", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return void message.error(data.message || "定时备份设置保存失败，请稍后重试");
      setSelectedR2Unavailable(false);
      message.success(data.message || "定时备份设置保存成功");
      await load(page, pageSize);
    } catch (error) {
      if (error instanceof Error) message.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const manualBackup = async () => {
    try {
      await form.validateFields(["r2StorageId"]);
      if (!r2StorageId) return;
      setManualBackingUp(true);
      message.loading({ key: "database-manual-backup", content: "正在生成MySQL全量备份并上传至R2，请勿重复操作…", duration: 0 });
      const response = await fetch("/api/settings/database-backups/manual", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ r2StorageId }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return void message.error({ key: "database-manual-backup", content: data.message || "数据库手动备份失败，请稍后重试", duration: 6 });
      message.destroy("database-manual-backup");
      Modal.success({ title: "备份完成", content: "数据库全量备份已生成、校验并上传至所选R2存储桶。该文件可独立用于新服务器恢复。", okText: "我知道了", centered: true });
      setPage(1);
      await load(1, pageSize);
    } catch (error) {
      message.error({ key: "database-manual-backup", content: error instanceof Error ? error.message : "数据库手动备份失败，请稍后重试", duration: 6 });
    } finally {
      setManualBackingUp(false);
    }
  };

  const remove = (ids: string[], bulk = false) => {
    Modal.confirm({
      title: bulk ? `确认批量删除所选的${ids.length}个备份文件？` : "确认删除此备份文件？",
      content: bulk ? "批量删除会将所选备份文件从 Cloudflare R2 永久移除。删除后无法通过系统恢复，请确认这些文件不再用于灾难恢复。" : "文件将从 Cloudflare R2 永久删除，删除后无法通过系统恢复。",
      okText: bulk ? "我知道了，继续删除" : "确认删除",
      cancelText: "取消",
      okButtonProps: { danger: true },
      centered: true,
      onOk: async () => {
        setDeleting(true);
        try {
          const response = await fetch("/api/settings/database-backups", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) { message.error(data.message || "备份文件删除失败，请稍后重试"); throw new Error("delete-failed"); }
          message.success(data.message || "备份文件已删除");
          setSelectedIds([]);
          const nextPage = rows.length <= ids.length && page > 1 ? page - 1 : page;
          setPage(nextPage);
          await load(nextPage, pageSize);
        } catch (error) {
          if (!(error instanceof Error && error.message === "delete-failed")) message.error("备份文件删除失败，请检查网络后重试");
          throw error;
        } finally { setDeleting(false); }
      },
    });
  };

  const selectedRows = useMemo(() => rows.filter(row => selectedIds.includes(row.id)), [rows, selectedIds]);
  const columns: ColumnsType<BackupRow> = [
    { title: "备份文件名称", dataIndex: "fileName", width: 330, ellipsis: { showTitle: false }, render: (value, row) => <Tooltip title={<><div>{value}</div>{row.checksumSha256 && <div>SHA-256：{row.checksumSha256}</div>}</>}><Typography.Text copyable={row.status === "SUCCESS" ? { text: value } : false}>{value}</Typography.Text></Tooltip> },
    { title: "备份耗时", dataIndex: "durationSeconds", width: 105, render: durationText },
    { title: "备份类型", dataIndex: "backupType", width: 110, render: value => value === "SCHEDULED" ? <Tag color="blue">定时备份</Tag> : <Tag color="cyan">人工备份</Tag> },
    { title: "状态", dataIndex: "status", width: 100, render: (value: BackupStatus, row) => value === "SUCCESS" ? <Tag color="success">成功</Tag> : value === "RUNNING" ? <Tag color="processing">进行中</Tag> : <Tooltip title={row.errorMessage || "备份失败"}><Tag color="error">失败</Tag></Tooltip> },
    { title: "文件大小（MB）", dataIndex: "sizeBytes", width: 135, align: "right", render: sizeInMb },
    { title: "备份时间", dataIndex: "startedAt", width: 180, render: shanghaiDateTime },
    { title: "R2存储桶", dataIndex: "r2StorageNameSnapshot", width: 190, ellipsis: { showTitle: false }, render: (value, row) => <Tooltip title={row.bucketNameSnapshot}>{value}</Tooltip> },
    { title: "操作", fixed: "right", width: 145, render: (_, row) => <Space size={0} className="table-actions">
      {can("download") && <Button type="link" size="small" icon={<DownloadOutlined />} disabled={row.status !== "SUCCESS"} href={`/api/settings/database-backups/${row.id}/download`}>下载</Button>}
      {can("delete") && <Button danger type="link" size="small" icon={<DeleteOutlined />} disabled={row.status === "RUNNING" || deleting} onClick={() => remove([row.id])}>删除</Button>}
    </Space> },
  ];

  if (!can("query")) return <Alert type="warning" showIcon message="暂无数据库备份查询权限" description="请联系管理员为当前角色配置相应权限。" />;

  const visibleTimes = timeFields(frequency, executionTimes);
  return <div className="database-backup-page">
    <div className="database-backup-page-actions"><DatabaseDictionaryButton /></div>
    <Alert className="database-backup-restore-tip" showIcon type="info" message="完整备份，可独立恢复" description="每次人工或定时任务都会生成包含表结构、全部数据、视图、触发器、存储过程与事件的 MySQL 全量 SQL，并压缩为 .sql.gz 文件；不是增量备份。" />
    <Form<BackupForm> form={form} layout="vertical" initialValues={{ r2StorageId: null, enabled: false, frequency: "DAILY", weekdays: [], executionTimes: ["", "", ""] }} disabled={loading || !can("configure")}>
      <Card title={<Space><DatabaseOutlined />R2存储桶</Space>} className="database-backup-card">
        {selectedR2Unavailable && <Alert showIcon type="warning" message="原R2存储桶已停用或删除" description="请重新选择一个已启用的R2存储桶并保存；在此之前不会执行自动备份。" style={{ marginBottom: 16 }} />}
        <Form.Item label="R2存储桶" name="r2StorageId" rules={[{ required: true, message: "请选择R2存储桶" }]} extra={r2Storages.length ? "选项读取自《设置》/《R2存储空间》中状态为“已启用”的记录。" : "暂无已启用的R2存储桶，请先前往《R2存储空间》完成配置。"} style={{ maxWidth: 560, marginBottom: 0 }}>
          <Select allowClear showSearch optionFilterProp="label" placeholder="请选择R2存储桶" options={r2Storages} notFoundContent="暂无已启用的R2存储桶" />
        </Form.Item>
      </Card>

      <Card title="定时备份设置" className="database-backup-card" extra={can("configure") ? <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => void save()}>保存</Button> : null}>
        <div className="database-backup-schedule-grid">
          <Form.Item label="定时备份" name="enabled" valuePropName="checked" extra="总开关关闭时，系统不会执行任何自动备份任务。">
            <Switch checkedChildren="已开启" unCheckedChildren="已关闭" />
          </Form.Item>
          <Form.Item label="备份频率" name="frequency" rules={[{ required: true, message: "请选择备份频率" }]}>
            <Select options={[{ value: "DAILY", label: "每日" }, { value: "WEEKLY", label: "每周" }]} onChange={(value: Frequency) => {
              const nextExecutionTimes = timeFields(value, executionTimes);
              setExecutionTimes(nextExecutionTimes);
              form.setFieldValue("frequency", value);
              form.setFieldValue("executionTimes", nextExecutionTimes);
              setScheduleError("");
            }} />
          </Form.Item>
          {frequency === "WEEKLY" && <Form.Item className="database-backup-weekdays" label="执行星期" name="weekdays" required validateStatus={scheduleError.includes("星期") ? "error" : undefined} help={scheduleError.includes("星期") ? scheduleError : undefined}>
            <Checkbox.Group options={WEEKDAY_OPTIONS} />
          </Form.Item>}
          <Form.Item className="database-backup-times" label="执行时间" required validateStatus={scheduleError && !scheduleError.includes("星期") ? "error" : undefined} help={scheduleError && !scheduleError.includes("星期") ? scheduleError : frequency === "DAILY" ? "三个时间选择框至少填写一个，系统会在每天对应时刻分别执行完整备份。" : "系统会在所选执行日的该时刻执行完整备份。"}>
            <div className="database-backup-time-inputs">
              {visibleTimes.map((value, index) => <TimeStringPicker key={index} value={value || ""} aria-label={`执行时间${index + 1}`} onChange={time => {
                const next = [...visibleTimes];
                next[index] = time;
                setExecutionTimes(next);
                form.setFieldValue("executionTimes", next);
                setScheduleError("");
              }} />)}
            </div>
          </Form.Item>
        </div>
      </Card>
    </Form>

    <Card title="手动备份" className="database-backup-card">
      <div className="database-backup-manual">
        <div><strong>立即创建数据库完整快照</strong><span className="database-backup-manual-description">将使用上方当前选择的R2存储桶；无需开启定时备份开关。</span></div>
        {can("manual") && <Button className="database-backup-manual-button" type="primary" icon={<CloudUploadOutlined />} size="large" loading={manualBackingUp} disabled={!r2StorageId || loading || hasRunning} onClick={() => void manualBackup()}>手动备份</Button>}
      </div>
    </Card>

    <Card title="备份文件列表" className="database-backup-card" extra={can("delete") ? <Tooltip title={!selectedIds.length ? "请先勾选需要删除的备份记录" : selectedRows.some(row => row.status === "RUNNING") ? "正在执行的备份不能删除" : undefined}><span><Button danger type="primary" icon={<DeleteOutlined />} disabled={!selectedIds.length || selectedRows.some(row => row.status === "RUNNING")} loading={deleting} onClick={() => remove(selectedIds.map(String), true)}>批量删除</Button></span></Tooltip> : null}>
      {loadError ? <Alert type="error" showIcon message={loadError} action={<Button size="small" onClick={() => void load()}>重新加载</Button>} /> : <DataTable<BackupRow>
        rowKey="id"
        columns={columns}
        dataSource={rows}
        loading={loading}
        scroll={{ x: 1320 }}
        rowSelection={can("delete") ? { selectedRowKeys: selectedIds, onChange: setSelectedIds, getCheckboxProps: row => ({ disabled: row.status === "RUNNING" }) } : undefined}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<><div>暂无数据库备份文件</div><small>请选择R2存储桶后执行手动备份，或保存并开启定时备份。</small></>} /> }}
        pagination={{ current: page, pageSize, total, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100], showTotal: count => `共 ${count} 条`, onChange: (nextPage, nextSize) => { setPage(nextPage); setPageSize(nextSize); setSelectedIds([]); void load(nextPage, nextSize); } }}
      />}
    </Card>
  </div>;
}

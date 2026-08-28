"use client";

import {
  DeleteOutlined, DownloadOutlined, EditOutlined, EyeOutlined, PlusOutlined, ReloadOutlined, SearchOutlined, SyncOutlined,
} from "@ant-design/icons";
import {
  Alert, Button, Card, Descriptions, Empty, Form, Input, message, Modal, Select, Skeleton,
  Space, Table, Tabs, Tag, Tooltip,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useRef, useState } from "react";
import { UnsavedChangesModal } from "@/components/unsaved-changes-modal";

const dayFields = ["mondayContent", "tuesdayContent", "wednesdayContent", "thursdayContent", "fridayContent", "saturdayContent", "sundayContent"] as const;
const dayLabels = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

type Plan = {
  id: string; recordNo: string; isoYear: number; isoWeek: number; studentTag: string; learningDays: number;
  mondayContent: string | null; tuesdayContent: string | null; wednesdayContent: string | null; thursdayContent: string | null;
  fridayContent: string | null; saturdayContent: string | null; sundayContent: string | null; remark: string | null;
  createdByName: string; createdAt: string; createdAtText: string; weekRangeText: string; version: number;
  editable: boolean; hasProgress: boolean; assigneeCount?: number;
};
type WeekOption = { isoYear: number; isoWeek: number; rangeText: string };
type Options = { tags: string[]; years: number[]; currentWeek: WeekOption; nextWeeks: WeekOption[]; currentUserName: string; weeksByYear: Record<string, number> };
type Filters = { year?: number; week?: number; studentTag?: string; creatorKeyword?: string };
type FormValues = Partial<Plan>;
type Person = {
  progressId?: string; userId: string; realName: string; username: string; roleName: string;
  completedDays: number; completedAt: string | null; completedAtText?: string; learningDate?: string;
  weekDayName?: string; hasRecording?: boolean; recordingOriginalName?: string | null;
  recordingMimeType?: string | null; recordingSize?: number | null; recordingDurationSeconds?: number | null;
};
type EffectiveLearningDay = { weekDay: number; name: string; date: string };
type UpdateResult = { selected: number; processed: number; missing: number; historicalSkipped: number; added: number; refreshed: number; removed: number; protectedWithProgress: number };

const emptyFilters: Filters = {};

function permission(permissions: string[], action: string) {
  return permissions.includes("*") || permissions.includes("training:view") || permissions.includes(`daily-learning:${action}`);
}

export function DailyLearningList({ permissions }: { permissions: string[] }) {
  const [filterForm] = Form.useForm<Filters>();
  const [planForm] = Form.useForm<FormValues>();
  const [rows, setRows] = useState<Plan[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [options, setOptions] = useState<Options>();
  const [optionsError, setOptionsError] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [formMode, setFormMode] = useState<"create" | "edit">();
  const [editing, setEditing] = useState<Plan>();
  const [saving, setSaving] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [detailId, setDetailId] = useState<string>();
  const [detail, setDetail] = useState<Plan>();
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const [people, setPeople] = useState<Record<string, { rows: Person[]; total: number; assigneeTotal: number }>>({});
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string>();
  const [updatingTasks, setUpdatingTasks] = useState(false);
  const requestSequence = useRef(0);

  const load = useCallback(async (nextPage = page, nextSize = pageSize, nextFilters = filters) => {
    const sequence = ++requestSequence.current; setLoading(true); setLoadError(false);
    try {
      const query = new URLSearchParams({ page: String(nextPage), pageSize: String(nextSize) });
      if (nextFilters.year) query.set("year", String(nextFilters.year));
      if (nextFilters.week) query.set("week", String(nextFilters.week));
      if (nextFilters.studentTag) query.set("studentTag", nextFilters.studentTag);
      if (nextFilters.creatorKeyword?.trim()) query.set("creatorKeyword", nextFilters.creatorKeyword.trim());
      const response = await fetch(`/api/daily-learning-plans?${query}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "每日学习计划加载失败，请稍后重试");
      if (sequence !== requestSequence.current) return;
      setRows(data.rows || []); setTotal(data.total || 0);
    } catch (reason) {
      if (sequence === requestSequence.current) { setLoadError(true); message.error(reason instanceof Error ? reason.message : "每日学习计划加载失败，请稍后重试"); }
    } finally { if (sequence === requestSequence.current) setLoading(false); }
  }, [filters, page, pageSize]);

  const loadOptions = useCallback(async () => {
    setOptionsError(false);
    try {
      const response = await fetch("/api/daily-learning-plans/options", { cache: "no-store" }); const data = await response.json();
      if (!response.ok) throw new Error(data.message); setOptions(data);
    } catch { setOptionsError(true); message.error("学员标签加载失败，请稍后重试"); }
  }, []);

  useEffect(() => { void Promise.all([load(1, 20, emptyFilters), loadOptions()]); }, []);

  const applyFilters = () => { const next = filterForm.getFieldsValue(); setFilters(next); setPage(1); setSelectedRowKeys([]); void load(1, pageSize, next); };
  const resetFilters = () => { filterForm.resetFields(); setFilters(emptyFilters); setPage(1); setSelectedRowKeys([]); void load(1, pageSize, emptyFilters); };

  const openCreate = () => {
    const first = options?.nextWeeks[0]; setEditing(undefined); setFormMode("create");
    planForm.setFieldsValue({ isoYear: first?.isoYear, isoWeek: first?.isoWeek, studentTag: undefined, remark: undefined, ...Object.fromEntries(dayFields.map(field => [field, undefined])) });
  };
  const openEdit = (plan: Plan) => { setEditing(plan); setFormMode("edit"); planForm.setFieldsValue(plan); };
  const closeForm = () => {
    if (saving) return;
    if (!planForm.isFieldsTouched()) { setFormMode(undefined); return; }
    setDiscardOpen(true);
  };
  const save = async () => {
    try {
      const values = await planForm.validateFields();
      if (!dayFields.some(field => values[field]?.trim())) { message.error("请至少填写一天的学习内容"); return; }
      setSaving(true);
      const response = await fetch(editing ? `/api/daily-learning-plans/${editing.id}` : "/api/daily-learning-plans", {
        method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, isoYear: editing?.isoYear || values.isoYear, isoWeek: editing?.isoWeek || values.isoWeek, version: editing?.version }),
      });
      const data = await response.json(); if (!response.ok) throw new Error(data.message || "每日学习计划保存失败，请稍后重试");
      message.success(editing ? "每日学习计划编辑成功" : "每日学习计划新增成功"); setFormMode(undefined); planForm.resetFields(); void load(page, pageSize, filters); void loadOptions();
    } catch (reason) {
      if (reason instanceof Error) message.error(reason.message);
    } finally { setSaving(false); }
  };

  const openDetail = async (id: string) => {
    setDetailId(id); setDetail(undefined); setDetailError(false); setDetailLoading(true); setPeople({});
    try { const response = await fetch(`/api/daily-learning-plans/${id}`, { cache: "no-store" }); const data = await response.json(); if (!response.ok) throw new Error(data.message); setDetail(data); }
    catch { setDetailError(true); message.error("学习计划详情加载失败，请稍后重试"); }
    finally { setDetailLoading(false); }
  };
  const loadPeople = async (kind: "completed-users" | "incomplete-users", weekDay: number, nextPage = 1, nextSize = 20) => {
    if (!detailId) return; setPeopleLoading(true);
    try { const response = await fetch(`/api/daily-learning-plans/${detailId}/${kind}?weekDay=${weekDay}&page=${nextPage}&pageSize=${nextSize}`, { cache: "no-store" }); const data = await response.json(); if (!response.ok) throw new Error(data.message); setPeople(current => ({ ...current, [`${kind}:${weekDay}`]: data })); }
    catch { message.error("学习人员完成情况加载失败，请稍后重试"); }
    finally { setPeopleLoading(false); }
  };

  const remove = (plan: Plan) => {
    Modal.confirm({
      title: "温馨提示", icon: <DeleteOutlined style={{ color: "#ff4d4f" }} />,
      content: <div className="daily-learning-delete-copy"><p>删除操作不可逆，一旦删除成功，当前每日学习计划将无法恢复。</p><p>请谨慎操作。</p></div>,
      okText: "我知道了，继续删除", cancelText: "我再想想", okButtonProps: { danger: true },
      onOk: async () => {
        setDeletingId(plan.id);
        try { const response = await fetch(`/api/daily-learning-plans/${plan.id}`, { method: "DELETE" }); const data = await response.json(); if (!response.ok) throw new Error(data.message || "每日学习计划删除失败，请稍后重试"); message.success("每日学习计划删除成功"); void load(page, pageSize, filters); }
        catch (reason) { message.error(reason instanceof Error ? reason.message : "每日学习计划删除失败，请稍后重试"); throw reason; }
        finally { setDeletingId(undefined); }
      },
    });
  };

  const updateTasks = async () => {
    if (updatingTasks || !selectedRowKeys.length) return;
    setUpdatingTasks(true);
    try {
      const response = await fetch("/api/daily-learning-plans/regenerate", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planIds: selectedRowKeys }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "每日学习任务更新失败，请稍后重试");
      const result = data as UpdateResult;
      Modal.success({
        title: "每日学习任务更新完成",
        content: <div className="daily-learning-update-result">
          <p>已处理 <strong>{result.processed}</strong> 条学习计划。</p>
          <ul><li>新增匹配学员：{result.added} 人</li><li>刷新未完成学员快照：{result.refreshed} 人</li><li>移除不再匹配且未学习学员：{result.removed} 人</li><li>保留已有学习记录学员：{result.protectedWithProgress} 人</li>{result.historicalSkipped > 0 && <li>跳过历史计划：{result.historicalSkipped} 条</li>}{result.missing > 0 && <li>无效或已删除记录：{result.missing} 条</li>}</ul>
        </div>,
      });
      setSelectedRowKeys([]);
      void load(page, pageSize, filters);
    } catch (reason) { message.error(reason instanceof Error ? reason.message : "每日学习任务更新失败，请稍后重试"); }
    finally { setUpdatingTasks(false); }
  };

  const year = Form.useWatch("isoYear", planForm);
  const selectableWeeks = options ? [options.currentWeek, ...options.nextWeeks] : [];
  const createWeeks = selectableWeeks.filter(item => item.isoYear === year);
  const effectiveDays: EffectiveLearningDay[] = detail ? (() => {
    const [yearText, monthText, dayText] = detail.weekRangeText.slice(0, 10).split("-");
    const monday = new Date(Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText)));
    return dayFields.flatMap((field, index) => {
      if (!detail[field]?.trim()) return [];
      const date = new Date(monday); date.setUTCDate(date.getUTCDate() + index);
      return [{ weekDay: index + 1, name: dayLabels[index], date: date.toISOString().slice(0, 10) }];
    });
  })() : [];
  const columns: ColumnsType<Plan> = [
    { title: "记录编号", dataIndex: "recordNo", width: 140, fixed: "left" },
    { title: "年份", dataIndex: "isoYear", width: 90 },
    { title: "周次", dataIndex: "isoWeek", width: 100, render: (value, row) => <Tooltip title={`${row.isoYear}年第${value}周 ${row.weekRangeText}`}><span>{value}周</span></Tooltip> },
    { title: "学员标签", dataIndex: "studentTag", width: 150, render: value => <Tag color="blue">{value}</Tag> },
    { title: "学习天数", dataIndex: "learningDays", width: 110, render: value => `${value}天` },
    { title: "创建人", dataIndex: "createdByName", width: 120 },
    { title: "创建时间", dataIndex: "createdAtText", width: 180 },
    { title: "操作", key: "actions", fixed: "right", width: 190, render: (_, row) => <Space size={2} className="table-actions">
      {permission(permissions, "view") && <Button type="link" icon={<EyeOutlined />} onClick={() => void openDetail(row.id)}>查看</Button>}
      {permission(permissions, "edit") && row.editable && <Button type="link" icon={<EditOutlined />} onClick={() => openEdit(row)}>编辑</Button>}
      {permission(permissions, "delete") && <Tooltip title={row.hasProgress ? "已有用户产生学习记录，不支持删除" : undefined}><span><Button danger type="link" icon={<DeleteOutlined />} disabled={row.hasProgress} loading={deletingId === row.id} onClick={() => remove(row)}>删除</Button></span></Tooltip>}
    </Space> },
  ];
  const incompletePeopleColumns: ColumnsType<Person> = [
    { title: "角色", dataIndex: "roleName", width: 180 },
    { title: "真实姓名", dataIndex: "realName" },
  ];
  const completedPeopleColumns: ColumnsType<Person> = [
    { title: "角色", dataIndex: "roleName", width: 130, fixed: "left" },
    { title: "真实姓名", dataIndex: "realName", width: 120, fixed: "left" },
    { title: "完成时间", dataIndex: "completedAtText", width: 180, render: value => value || "-" },
    { title: "录音时长", dataIndex: "recordingDurationSeconds", width: 110, render: value => typeof value === "number" ? `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}` : "-" },
    { title: "录音", key: "recording", width: 360, render: (_, row) => row.hasRecording && row.progressId && detailId ? <div className="daily-learning-recording-cell">
      <audio controls preload="none" src={`/api/daily-learning-plans/${detailId}/recordings/${row.progressId}`}>当前浏览器不支持在线播放录音</audio>
      <span>{row.recordingOriginalName || "每日学习录音"}{typeof row.recordingSize === "number" ? ` · ${(row.recordingSize / 1024 / 1024).toFixed(2)} MB` : ""}</span>
    </div> : <span className="daily-learning-record-secondary">无录音</span> },
    { title: "操作", key: "recordingActions", width: 100, fixed: "right", render: (_, row) => row.hasRecording && row.progressId && detailId ? <Button type="link" icon={<DownloadOutlined />} href={`/api/daily-learning-plans/${detailId}/recordings/${row.progressId}?download=1`}>下载</Button> : "-" },
  ];
  const peopleDateTabs = (kind: "completed-users" | "incomplete-users") => <Tabs
    className="daily-learning-date-tabs"
    tabPosition="left"
    defaultActiveKey={String(effectiveDays[0]?.weekDay || "")}
    onChange={key => { const weekDay = Number(key); const cacheKey = `${kind}:${weekDay}`; if (weekDay && !people[cacheKey]) void loadPeople(kind, weekDay); }}
    items={effectiveDays.map(day => {
      const cacheKey = `${kind}:${day.weekDay}`; const data = people[cacheKey];
      return {
        key: String(day.weekDay),
        label: <span className="daily-learning-date-tab-label"><strong>{day.name}</strong><small>{day.date}</small></span>,
        children: <Table
          rowKey={row => kind === "completed-users" ? row.progressId || row.userId : row.userId}
          loading={peopleLoading && !data}
          size="small"
          columns={kind === "completed-users" ? completedPeopleColumns : incompletePeopleColumns}
          dataSource={data?.rows || []}
          scroll={kind === "completed-users" ? { x: 1000 } : undefined}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={kind === "completed-users" ? `${day.date} 暂无已完成人员` : (data?.assigneeTotal || detail?.assigneeCount || 0) === 0 ? "当前计划暂无匹配学员" : `${day.date} 当前所有学员均已完成`} /> }}
          pagination={{ total: data?.total || 0, showSizeChanger: true, pageSizeOptions: [20, 50, 100], showTotal: value => `共 ${value} ${kind === "completed-users" ? "条完成记录" : "人"}`, onChange: (p, s) => void loadPeople(kind, day.weekDay, p, s) }}
        />,
      };
    })}
  />;

  return <>
    {optionsError && <Alert className="daily-learning-alert" type="error" showIcon message="学员标签加载失败，请稍后重试" action={<Button size="small" icon={<ReloadOutlined />} onClick={() => void loadOptions()}>重试</Button>} />}
    <Card className="daily-learning-filter-card"><Form form={filterForm} layout="vertical" onFinish={applyFilters}><div className="daily-learning-filter-grid">
      <Form.Item name="year" label="年份"><Select allowClear placeholder="全部" onChange={() => filterForm.setFieldValue("week", undefined)} options={options?.years.map(value => ({ value, label: String(value) }))} /></Form.Item>
      <Form.Item noStyle dependencies={["year"]}>{({ getFieldValue }) => <Form.Item name="week" label="周次"><Select allowClear placeholder="全部" options={Array.from({ length: Number(options?.weeksByYear[String(getFieldValue("year"))] || 53) }, (_, index) => ({ value: index + 1, label: `${index + 1}周` }))} /></Form.Item>}</Form.Item>
      <Form.Item name="studentTag" label="学员标签"><Select allowClear showSearch placeholder="全部" options={options?.tags.map(value => ({ value, label: value }))} /></Form.Item>
      <Form.Item name="creatorKeyword" label="创建人"><Input allowClear maxLength={50} placeholder="请输入创建人" onPressEnter={applyFilters} /></Form.Item>
      <div className="daily-learning-filter-actions"><Space><Button onClick={resetFilters}>重置</Button><Button type="primary" htmlType="submit" icon={<SearchOutlined />}>筛选</Button></Space></div>
    </div></Form></Card>
    <Card className="daily-learning-list-card">
      <div className="daily-learning-toolbar"><div>已选择 <strong>{selectedRowKeys.length}</strong> 条记录</div><Space>{permission(permissions, "update") && <Button icon={<SyncOutlined />} loading={updatingTasks} disabled={updatingTasks || !selectedRowKeys.length} onClick={() => void updateTasks()}>{updatingTasks ? "更新中..." : selectedRowKeys.length ? `更新任务（${selectedRowKeys.length}）` : "更新任务"}</Button>}{permission(permissions, "create") && <Button type="primary" icon={<PlusOutlined />} disabled={!options?.tags.length} onClick={openCreate}>新增</Button>}</Space></div>
      {loadError ? <Alert type="error" showIcon message="每日学习计划加载失败，请稍后重试" action={<Button onClick={() => void load()}>重试</Button>} /> : <Table rowKey="id" loading={loading} columns={columns} dataSource={rows} scroll={{ x: 1100 }} rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys }} locale={{ emptyText: <Empty description={<span>{Object.values(filters).some(Boolean) ? "没有找到符合当前条件的每日学习计划" : "暂无每日学习计划"}<br/><small>{Object.values(filters).some(Boolean) ? "请调整筛选条件后重试" : "点击新增制定未来一周学习计划"}</small></span>}>{Object.values(filters).some(Boolean) && <Button onClick={resetFilters}>重置筛选</Button>}</Empty> }} pagination={{ current: page, pageSize, total, showSizeChanger: true, pageSizeOptions: [20, 50, 100], showTotal: value => `共 ${value} 条`, onChange: (nextPage, nextSize) => { setPage(nextPage); setPageSize(nextSize); setSelectedRowKeys([]); void load(nextPage, nextSize, filters); } }} />}
    </Card>

    <Modal className="daily-learning-form-modal" width={1100} title={formMode === "edit" ? "编辑学习计划" : "新增每日学习计划"} open={Boolean(formMode)} onCancel={closeForm} onOk={() => void save()} okText="保存" cancelText="取消" confirmLoading={saving} maskClosable={false} destroyOnHidden>
      <Form form={planForm} layout="vertical" preserve={false}>
        <h3>基础信息</h3><div className="daily-learning-basic-grid">
          <Form.Item label="记录编号"><Input value={editing?.recordNo} placeholder="保存成功后自动生成" disabled /></Form.Item>
          <Form.Item name="isoYear" label="年份" rules={[{ required: true, message: "请选择年份" }]}><Select disabled={Boolean(editing)} onChange={() => planForm.setFieldValue("isoWeek", undefined)} options={[...new Set(selectableWeeks.map(item => item.isoYear))].map(value => ({ value, label: String(value) }))} /></Form.Item>
          <Form.Item name="isoWeek" label="周次" rules={[{ required: true, message: "请选择周次" }]}><Select disabled={Boolean(editing)} options={(editing ? [{ isoYear: editing.isoYear, isoWeek: editing.isoWeek, rangeText: editing.weekRangeText }] : createWeeks).map(item => ({ value: item.isoWeek, label: `${item.isoWeek}周${options && item.isoYear === options.currentWeek.isoYear && item.isoWeek === options.currentWeek.isoWeek ? "（本周）" : ""}（${item.rangeText}）` }))} /></Form.Item>
          <Form.Item name="studentTag" label="学员标签" rules={[{ required: true, message: "请选择学员标签" }]}><Select showSearch placeholder="请选择" options={options?.tags.map(value => ({ value, label: value }))} /></Form.Item>
        </div>
        <h3>学习内容</h3><div className="daily-learning-content-grid">{dayFields.map((field, index) => <Form.Item key={field} name={field} label={`${dayLabels[index]}学习内容`} rules={[{ max: 2000, message: `${dayLabels[index]}学习内容不能超过2000个字符` }]}><Input.TextArea autoSize={{ minRows: 4, maxRows: 8 }} maxLength={2000} showCount placeholder={`请输入${dayLabels[index]}学习内容`} /></Form.Item>)}</div>
        <h3>其他信息</h3><Form.Item name="remark" label="备注" rules={[{ max: 100, message: "备注不能超过100个字符" }]}><Input.TextArea rows={2} maxLength={100} showCount placeholder="请输入备注（选填）" /></Form.Item>
        <div className="daily-learning-basic-grid"><Form.Item label="创建人"><Input disabled value={editing?.createdByName || options?.currentUserName} /></Form.Item><Form.Item label="创建时间"><Input disabled value={editing?.createdAtText} placeholder="保存成功后自动生成" /></Form.Item></div>
      </Form>
    </Modal>
    <UnsavedChangesModal open={discardOpen} title="当前学习计划尚未保存" onKeep={() => setDiscardOpen(false)} onDiscard={() => { setDiscardOpen(false); setFormMode(undefined); }} />

    <Modal className="daily-learning-detail-modal" width={1200} title="查看学习计划" open={Boolean(detailId)} onCancel={() => setDetailId(undefined)} footer={<Button onClick={() => setDetailId(undefined)}>关闭</Button>} destroyOnHidden>
      {detailLoading ? <Skeleton active paragraph={{ rows: 9 }} /> : detailError || !detail ? <Alert type="error" showIcon message="学习计划详情加载失败，请稍后重试" action={<Button onClick={() => detailId && void openDetail(detailId)}>重试</Button>} /> : <Tabs defaultActiveKey="content" onChange={key => { if (key !== "content" && effectiveDays[0]) { const kind = key as "completed-users" | "incomplete-users"; const cacheKey = `${kind}:${effectiveDays[0].weekDay}`; if (!people[cacheKey]) void loadPeople(kind, effectiveDays[0].weekDay); } }} items={[
        { key: "content", label: "学习内容", children: <div className="daily-learning-detail"><Descriptions bordered size="small" column={3}><Descriptions.Item label="记录编号">{detail.recordNo}</Descriptions.Item><Descriptions.Item label="年份">{detail.isoYear}</Descriptions.Item><Descriptions.Item label="周次">{detail.isoWeek}周</Descriptions.Item><Descriptions.Item label="学员标签"><Tag color="blue">{detail.studentTag}</Tag></Descriptions.Item><Descriptions.Item label="学习天数">{detail.learningDays}天</Descriptions.Item><Descriptions.Item label="应学习人数">{detail.assigneeCount || 0}人</Descriptions.Item><Descriptions.Item label="创建人">{detail.createdByName}</Descriptions.Item><Descriptions.Item label="创建时间" span={2}>{detail.createdAtText}</Descriptions.Item><Descriptions.Item label="备注" span={3}>{detail.remark || "-"}</Descriptions.Item></Descriptions><div className="daily-learning-detail-days">{dayFields.map((field, index) => <section key={field}><strong>{dayLabels[index]}学习内容</strong><p>{detail[field] || "-"}</p></section>)}</div></div> },
        { key: "completed-users", label: "已完成人员", children: peopleDateTabs("completed-users") },
        { key: "incomplete-users", label: "未完成人员", children: peopleDateTabs("incomplete-users") },
      ]} />}
    </Modal>
  </>;
}

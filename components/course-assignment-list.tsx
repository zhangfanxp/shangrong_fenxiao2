"use client";

import { EyeOutlined, ReloadOutlined, SearchOutlined, StopOutlined, CheckCircleOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Col, DatePicker, Descriptions, Empty, Form, Image, Input, message, Modal, Row, Skeleton, Space, Table, Tabs } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { Dayjs } from "dayjs";
import { useEffect, useRef, useState } from "react";
import {
  assignmentDateError, canCourseAssignment,
  type AssignmentChangeResult, type AssignmentCourse, type AssignmentDetail, type AssignmentFilters,
  type AssignmentLearningRow, type AssignmentRow, type AssignmentStatus,
} from "@/lib/course-assignment-rules";

const api = "/api/course-assignments";
const pageSizeOptions = [20, 50, 100];
type PageResult<T> = { rows: T[]; total: number };
type FilterForm = { courseName?: string; assigneeKeyword?: string; assignStartDate?: Dayjs; assignEndDate?: Dayjs };
type Query = { page: number; pageSize: number; filters: AssignmentFilters; revision: number };

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || "操作失败，请稍后重试");
  return result;
}

function AssignmentLearningModal({ batchId, course, onClose }: { batchId: string; course: AssignmentCourse; onClose: () => void }) {
  const [tab, setTab] = useState("learning-records");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<PageResult<AssignmentLearningRow>>({ rows: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const loadedQuery = useRef("");
  const unlearned = tab === "unlearned-users";
  useEffect(() => {
    const timer = window.setInterval(() => { if (!document.hidden) setRevision(value => value + 1); }, 30_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const queryKey = `${batchId}/${course.courseId}/${tab}/${page}/${pageSize}`;
    setLoading(true); setError("");
    if (loadedQuery.current !== queryKey) setResult({ rows: [], total: 0 });
    loadedQuery.current = queryKey;
    void requestJson<PageResult<AssignmentLearningRow>>(`${api}/${batchId}/courses/${course.courseId}/${tab}?page=${page}&pageSize=${pageSize}`, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setResult(data); })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : unlearned ? "未学习人员加载失败，请稍后重试" : "学习记录加载失败，请稍后重试"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [batchId, course.courseId, tab, page, pageSize, revision, unlearned]);

  const columns: ColumnsType<AssignmentLearningRow> = unlearned ? [{ title: "真实姓名", dataIndex: "realName" }] : [
    { title: "课程记录编号", dataIndex: "recordNo", width: 160 },
    { title: "课程名称", dataIndex: "courseName", width: 220, ellipsis: true },
    { title: "章节名称", dataIndex: "chapterName", width: 200, ellipsis: true },
    { title: "学习人", dataIndex: "realName", width: 140 },
    { title: "学习开始时间", width: 190, render: (_, row) => row.visitStatus === "LEGACY" ? "历史数据未采集" : row.startedAt || "—" },
    { title: "学习结束时间", width: 250, render: (_, row) => row.visitStatus === "LEGACY" ? "历史数据未采集"
      : row.visitStatus === "ACTIVE" ? "学习中"
      : row.visitStatus === "INTERRUPTED" ? <span>异常结束{row.lastActiveAt && <><br /><small>最后活跃：{row.lastActiveAt}</small></>}</span>
      : row.endedAt || "—" },
  ];
  return <Modal open title="查看学习记录" width={1180} zIndex={1200} onCancel={onClose} footer={<Button onClick={onClose}>关闭</Button>}>
    <p>{course.courseNameSnapshot} · 仅统计当前分配批次的学员，每次进入课时单独记录。</p>
    <p style={{ color: "#8c8c8c" }}>进入记录不代表有效学习或课程完成；“未学习人员”仍以是否产生有效学习进度判断。异常结束仅显示最后活跃时间，旧记录不补造进出时间。</p>
    <Tabs activeKey={tab} onChange={key => { setTab(key); setPage(1); }} tabBarExtraContent={<Button icon={<ReloadOutlined />} loading={loading} onClick={() => setRevision(value => value + 1)}>刷新</Button>} items={[{ key: "learning-records", label: "学习记录" }, { key: "unlearned-users", label: "未学习人员" }]} />
    {error ? <Alert type="error" showIcon message={error} action={<Button onClick={() => setRevision(value => value + 1)}>重试</Button>} /> :
      <Table rowKey="id" loading={loading} columns={columns} dataSource={result.rows} scroll={{ x: unlearned ? undefined : 1160, y: 420 }}
        locale={{ emptyText: <Empty description={unlearned ? "当前课程所有被分配人员均已开始学习" : "当前课程暂无学习记录"} /> }}
        pagination={{ current: page, pageSize, total: result.total, showSizeChanger: true, pageSizeOptions, showTotal: total => `共 ${total} 条`, onChange: (nextPage, size) => { setPage(size === pageSize ? nextPage : 1); setPageSize(size); } }} />}
  </Modal>;
}

function AssignmentDetailModal({ id, permissions, onClose }: { id: string; permissions: string[]; onClose: () => void }) {
  const [detail, setDetail] = useState<AssignmentDetail>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<React.Key[]>([]);
  const [learningCourse, setLearningCourse] = useState<AssignmentCourse>();
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    void requestJson<AssignmentDetail>(`${api}/${id}`, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setDetail(data); })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "课程分配详情加载失败，请稍后重试"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id, revision]);
  const columns: ColumnsType<AssignmentCourse> = [
    { title: "课程名称", dataIndex: "courseNameSnapshot", width: 280, ellipsis: true },
    { title: "课程封面", width: 140, render: (_, row) => <Image src={row.coverUrl} fallback={`${row.coverUrl}?fallback=1`} alt={row.courseNameSnapshot} width={88} height={56} style={{ objectFit: "cover", borderRadius: 4 }} /> },
    { title: "适用岗位", dataIndex: "applicablePositionSnapshot", width: 240 },
    { title: "查看学习记录", width: 160, fixed: "right", render: (_, row) => canCourseAssignment(permissions, "learning") ? <Button type="link" onClick={() => setLearningCourse(row)}>查看学习记录</Button> : "—" },
  ];
  return <>
    <Modal open title="查看-课程分配" width={1120} onCancel={onClose} footer={<Button onClick={onClose}>关闭</Button>}>
      {loading ? <Skeleton active paragraph={{ rows: 6 }} /> : error ? <Alert type="error" showIcon message={error} action={<Button onClick={() => setRevision(value => value + 1)}>重试</Button>} /> : detail && <>
        {detail.legacyImported && <Alert type="info" showIcon message="历史关系补录：原系统未保存分配批次，此记录按单条课程—用户关系导入，快照为导入时资料，并非原始操作批次。" style={{ marginBottom: 16 }} />}
        <Descriptions column={{ xs: 1, sm: 2, md: 3 }} items={[
          { key: "recordNo", label: "记录编号", children: detail.recordNo },
          { key: "assignedAt", label: "分配时间", children: detail.assignedAtText },
          { key: "assignedByName", label: "分配人", children: detail.assignedByName },
        ]} />
        <Table rowKey="courseId" columns={columns} dataSource={detail.courses} rowSelection={{ selectedRowKeys: selected, onChange: setSelected, columnWidth: 48 }}
          scroll={{ x: 900, y: 450 }} pagination={false} />
        <p style={{ color: "#8c8c8c", marginTop: 12 }}>共 {detail.courseCount} 门课程 · 分配 {detail.userCount} 名用户。课程勾选仅作后续批量功能预留，本期不会执行操作。</p>
      </>}
    </Modal>
    {learningCourse && <AssignmentLearningModal batchId={id} course={learningCourse} onClose={() => setLearningCourse(undefined)} />}
  </>;
}

export function CourseAssignmentList({ permissions }: { permissions: string[] }) {
  const [form] = Form.useForm<FilterForm>();
  const [query, setQuery] = useState<Query>({ page: 1, pageSize: 20, filters: {}, revision: 0 });
  const [result, setResult] = useState<PageResult<AssignmentRow>>({ rows: [], total: 0 });
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detailId, setDetailId] = useState<string>();
  const [confirmation, setConfirmation] = useState<{ rows: AssignmentRow[]; target: AssignmentStatus; batch: boolean }>();
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [changeResult, setChangeResult] = useState<AssignmentChangeResult>();
  const can = (action: Parameters<typeof canCourseAssignment>[1]) => canCourseAssignment(permissions, action);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setSelectedKeys([]);
    const search = new URLSearchParams({ page: String(query.page), pageSize: String(query.pageSize) });
    Object.entries(query.filters).forEach(([key, value]) => { if (value) search.set(key, value); });
    void requestJson<PageResult<AssignmentRow>>(`${api}?${search}`, { signal: controller.signal })
      .then(data => {
        if (controller.signal.aborted) return;
        if (query.page > 1 && data.rows.length === 0 && data.total <= (query.page - 1) * query.pageSize) {
          setQuery(current => ({ ...current, page: Math.max(1, Math.ceil(data.total / current.pageSize)) })); return;
        }
        setResult(data);
      })
      .catch(reason => { if (!controller.signal.aborted) { setResult({ rows: [], total: 0 }); setError(reason instanceof Error ? reason.message : "课程分配记录加载失败，请稍后重试"); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [query]);

  const refresh = () => setQuery(current => ({ ...current, revision: current.revision + 1 }));
  const reset = () => { form.resetFields(); setSelectedKeys([]); setQuery(current => ({ ...current, page: 1, filters: {}, revision: current.revision + 1 })); };
  const filter = (values: FilterForm) => {
    const filters = { courseName: values.courseName?.trim(), assigneeKeyword: values.assigneeKeyword?.trim(), assignStartDate: values.assignStartDate?.format("YYYY-MM-DD"), assignEndDate: values.assignEndDate?.format("YYYY-MM-DD") };
    const dateError = assignmentDateError(filters.assignStartDate, filters.assignEndDate);
    if (dateError) { message.warning(dateError); return; }
    setSelectedKeys([]); setQuery(current => ({ ...current, page: 1, filters, revision: current.revision + 1 }));
  };
  const selectedRows = result.rows.filter(row => selectedKeys.includes(row.id));
  const selectedEnabled = selectedRows.filter(row => row.status === "ENABLED").length;
  const selectedDisabled = selectedRows.length - selectedEnabled;
  const isFiltered = Object.values(query.filters).some(Boolean);
  const verb = confirmation?.target === "ENABLED" ? "启用" : "停用";
  const eligible = confirmation?.rows.filter(row => row.status !== confirmation.target).length || 0;

  const saveStatus = async () => {
    if (!confirmation || savingRef.current) return;
    savingRef.current = true; setSaving(true); setChangeResult(undefined);
    try {
      if (confirmation.batch) {
        const result = await requestJson<AssignmentChangeResult>(`${api}/batch-${confirmation.target === "ENABLED" ? "enable" : "disable"}`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assignmentIds: confirmation.rows.map(row => row.id), versions: Object.fromEntries(confirmation.rows.map(row => [row.id, row.version])) }),
        });
        setChangeResult(result);
        const text = `已成功${verb} ${result.changed} 条课程分配记录${result.skipped ? `，${result.skipped} 条原本已处于目标状态` : ""}${result.failed ? `，${result.failed} 条失败` : ""}`;
        if (result.failed) message.warning(text); else message.success(text);
      } else {
        const row = confirmation.rows[0];
        await requestJson(`${api}/${row.id}/${confirmation.target === "ENABLED" ? "enable" : "disable"}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: row.version }) });
        message.success(`已成功${verb} 1 条课程分配记录`);
      }
      setConfirmation(undefined); refresh();
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : `课程分配${verb}失败，请稍后重试`);
      setConfirmation(undefined); refresh();
    } finally { savingRef.current = false; setSaving(false); }
  };

  const columns: ColumnsType<AssignmentRow> = [
    { title: "记录编号", dataIndex: "recordNo", width: 175 },
    { title: "课程数量", dataIndex: "courseCount", width: 110 },
    { title: "分配用户数", dataIndex: "userCount", width: 120 },
    { title: "分配人", dataIndex: "assignedByName", width: 150, ellipsis: true },
    { title: "分配时间", dataIndex: "assignedAtText", width: 200 },
    { title: "操作", width: 180, fixed: "right", render: (_, row) => <Space size={4}>
      {can("view") && <Button type="link" icon={<EyeOutlined />} disabled={saving} onClick={() => setDetailId(row.id)}>查看</Button>}
      {row.status === "ENABLED" && can("disable") && <Button type="link" danger disabled={saving} onClick={() => setConfirmation({ rows: [row], target: "DISABLED", batch: false })}>停用</Button>}
      {row.status === "DISABLED" && can("enable") && <Button type="link" disabled={saving} onClick={() => setConfirmation({ rows: [row], target: "ENABLED", batch: false })}>启用</Button>}
    </Space> },
  ];
  return <>
    <Card className="filter-card">
      <Form form={form} layout="vertical" onFinish={filter}>
        <Row gutter={16}>
          <Col xs={24} sm={12} xl={6}><Form.Item label="课程名称" name="courseName"><Input allowClear maxLength={100} placeholder="请输入课程名称" /></Form.Item></Col>
          <Col xs={24} sm={12} xl={6}><Form.Item label="分配人员" name="assigneeKeyword" tooltip="按被分配用户的真实姓名快照查询"><Input allowClear maxLength={100} placeholder="请输入分配人员姓名" /></Form.Item></Col>
          <Col xs={24} sm={12} xl={6}><Form.Item label="分配开始日期" name="assignStartDate"><DatePicker allowClear format="YYYY-MM-DD" placeholder="开始日期" style={{ width: "100%" }} /></Form.Item></Col>
          <Col xs={24} sm={12} xl={6}><Form.Item label="分配截止日期" name="assignEndDate"><DatePicker allowClear format="YYYY-MM-DD" placeholder="截止日期" style={{ width: "100%" }} /></Form.Item></Col>
        </Row>
        <div style={{ display: "flex", justifyContent: "flex-end" }}><Space>
          <Button icon={<ReloadOutlined />} onClick={reset} disabled={saving}>重置</Button>
          <Button htmlType="submit" type="primary" icon={<SearchOutlined />} loading={loading} disabled={saving}>筛选</Button>
        </Space></div>
      </Form>
    </Card>
    <Card style={{ marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <span>已选择 {selectedKeys.length} 条</span>
        <Space wrap>
          {can("batch-disable") && <Button icon={<StopOutlined />} disabled={loading || saving || !selectedEnabled} onClick={() => setConfirmation({ rows: selectedRows, target: "DISABLED", batch: true })}>批量停用</Button>}
          {can("batch-enable") && <Button icon={<CheckCircleOutlined />} disabled={loading || saving || !selectedDisabled} onClick={() => setConfirmation({ rows: selectedRows, target: "ENABLED", batch: true })}>批量启用</Button>}
        </Space>
      </div>
      {changeResult?.failed ? <Alert type="warning" showIcon closable onClose={() => setChangeResult(undefined)} style={{ marginBottom: 16 }}
        message={`操作结果：成功 ${changeResult.changed}，跳过 ${changeResult.skipped}，失败 ${changeResult.failed}`}
        description={<ul>{changeResult.results.filter(row => row.outcome === "failed").map(row => <li key={row.id}>{row.recordNo || result.rows.find(item => item.id === row.id)?.recordNo || row.id}：{row.message}</li>)}</ul>} /> : null}
      {error ? <Alert type="error" showIcon message={error} action={<Button onClick={refresh}>重试</Button>} /> :
        <Table rowKey="id" loading={loading} columns={columns} dataSource={result.rows} scroll={{ x: 1000 }}
          rowSelection={{ selectedRowKeys: selectedKeys, onChange: setSelectedKeys, columnWidth: 48, fixed: true, getCheckboxProps: () => ({ disabled: saving || loading }) }}
          locale={{ emptyText: <Empty description={isFiltered ? <span>没有找到符合当前条件的课程分配记录<br /><small>请调整筛选条件后重试</small></span> : "暂无课程分配记录"}>{isFiltered && <Button onClick={reset}>重置筛选</Button>}</Empty> }}
          pagination={{ current: query.page, pageSize: query.pageSize, total: result.total, showSizeChanger: true, pageSizeOptions, showTotal: total => `共 ${total} 条`,
            onChange: (page, pageSize) => { setSelectedKeys([]); setQuery(current => ({ ...current, page: pageSize === current.pageSize ? page : 1, pageSize })); } }} />}
    </Card>
    {detailId && <AssignmentDetailModal key={detailId} id={detailId} permissions={permissions} onClose={() => setDetailId(undefined)} />}
    <Modal open={Boolean(confirmation)} title="温馨提示" okText={saving ? `${verb}中...` : `确定${verb}`} cancelText="取消" confirmLoading={saving}
      okButtonProps={{ danger: confirmation?.target === "DISABLED" }} cancelButtonProps={{ disabled: saving }} closable={!saving} maskClosable={!saving}
      onCancel={() => { if (!saving) setConfirmation(undefined); }} onOk={() => void saveStatus()}>
      {confirmation?.batch ? <p>已选择 {confirmation.rows.length} 条记录，其中 {eligible} 条可{verb}，{confirmation.rows.length - eligible} 条已处于目标状态。是否继续{verb} {eligible} 条记录？</p> : <p>确认{verb}当前课程分配记录（{confirmation?.rows[0].recordNo}）？</p>}
      <p>{confirmation?.target === "DISABLED" ? "停用后，本批次不再向被分配用户提供移动端学习资格；若该用户仍有其他启用批次分配同一课程，课程仍可见。已产生的历史学习记录和学习进度不会被删除。" : "启用后，仍然有效的课程将在符合条件的用户移动端恢复展示，并继续原有学习进度；不会自动启用已禁用或已删除的课程。"}</p>
    </Modal>
  </>;
}

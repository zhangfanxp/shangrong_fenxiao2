"use client";

import {
  CalendarOutlined, CheckCircleOutlined, DownloadOutlined, EyeOutlined, PlusOutlined,
  SearchOutlined, TeamOutlined, UserDeleteOutlined, WarningOutlined,
} from "@ant-design/icons";
import {
  Alert, Button, Card, DatePicker, Descriptions, Empty, Form, Input, message, Modal,
  Skeleton, Space, Table, Tag, Tooltip,
} from "antd";
import type { ColumnsType, TableRowSelection } from "antd/es/table/interface";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import { useCallback, useEffect, useRef, useState } from "react";

type AttendanceStatus = "UNSIGNED" | "SIGNED";
type MeetingRow = {
  id: string;
  recordNo: string;
  meetingMonth: string;
  meetingMonthText: string;
  expectedCount: number;
  actualCount: number | null;
  attendanceStatus: AttendanceStatus;
  notificationReleaseDate: string;
  publisherName: string;
};
type Person = { id: string; realName: string; role: string };
type MeetingDetail = {
  id: string;
  recordNo: string;
  meetingMonthText: string;
  notificationContent: string;
  notificationReleaseDate: string;
  publisherName: string;
  attendanceStatus: AttendanceStatus;
  expectedAttendees: Person[];
  actualAttendees: Person[] | null;
};
type AttendanceData = {
  id: string;
  recordNo: string;
  expectedAttendees: Person[];
  actualAttendeeIds: string[];
  attendanceStatus: AttendanceStatus;
  attendanceVersion: number;
};
type Filters = { meetingMonth: string; expectedAttendeeKeyword: string };
type FormValues = { meetingMonth?: Dayjs | null; expectedAttendeeKeyword?: string };

const emptyFilters: Filters = { meetingMonth: "", expectedAttendeeKeyword: "" };

type MeetingVariant = "monthly-online" | "mid-month-offline";

const meetingConfigurations = {
  "monthly-online": { apiBase: "/api/monthly-online-meetings", permissionPrefix: "monthly-online-meetings", pageName: "每月线上会" },
  "mid-month-offline": { apiBase: "/api/mid-month-offline-meetings", permissionPrefix: "mid-month-offline-meetings", pageName: "月中线下会" },
} as const;

function responseFileName(response: Response, pageName: string) {
  const encoded = response.headers.get("Content-Disposition")?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  return encoded ? decodeURIComponent(encoded) : `${pageName}_${dayjs().format("YYYYMMDD_HHmmss")}.xlsx`;
}

function MeetingManagementList({ permissions, variant }: { permissions: string[]; variant: MeetingVariant }) {
  const configuration = meetingConfigurations[variant];
  const legacyAll = permissions.includes("*") || permissions.includes("meetings:view");
  const canView = legacyAll || permissions.includes(`${configuration.permissionPrefix}:view`);
  const canAttend = legacyAll || permissions.includes(`${configuration.permissionPrefix}:attendance`);
  const canExport = legacyAll || permissions.includes(`${configuration.permissionPrefix}:export`);
  const [confirmModal, confirmContext] = Modal.useModal();
  const [form] = Form.useForm<FormValues>();
  const [rows, setRows] = useState<MeetingRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [exporting, setExporting] = useState(false);
  const [detailId, setDetailId] = useState<string>();
  const [detail, setDetail] = useState<MeetingDetail>();
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const [attendanceId, setAttendanceId] = useState<string>();
  const [attendance, setAttendance] = useState<AttendanceData>();
  const [candidateIds, setCandidateIds] = useState<string[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceError, setAttendanceError] = useState(false);
  const [saving, setSaving] = useState(false);
  const requestSequence = useRef(0);

  const load = useCallback(async (nextPage = page, nextPageSize = pageSize, nextFilters = filters) => {
    const sequence = ++requestSequence.current;
    setLoading(true);
    setLoadError(false);
    try {
      const query = new URLSearchParams({ page: String(nextPage), pageSize: String(nextPageSize) });
      if (nextFilters.meetingMonth) query.set("meetingMonth", nextFilters.meetingMonth);
      if (nextFilters.expectedAttendeeKeyword) query.set("expectedAttendeeKeyword", nextFilters.expectedAttendeeKeyword);
      const response = await fetch(`${configuration.apiBase}?${query}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "线上会记录加载失败，请稍后重试");
      if (sequence !== requestSequence.current) return;
      setRows(data.rows || []);
      setTotal(data.total || 0);
    } catch (reason) {
      if (sequence === requestSequence.current) {
        setLoadError(true);
        message.error(reason instanceof Error ? reason.message : "线上会记录加载失败，请稍后重试");
      }
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, [filters, page, pageSize]);

  useEffect(() => { void load(1, 20, emptyFilters); }, []);

  const readFilters = (): Filters => {
    const values = form.getFieldsValue();
    return {
      meetingMonth: values.meetingMonth?.format("YYYY-MM") || "",
      expectedAttendeeKeyword: values.expectedAttendeeKeyword?.trim() || "",
    };
  };

  const applyFilters = () => {
    const next = readFilters();
    setFilters(next);
    setPage(1);
    setSelectedRowKeys([]);
    void load(1, pageSize, next);
  };

  const resetFilters = () => {
    form.resetFields();
    setFilters(emptyFilters);
    setPage(1);
    setSelectedRowKeys([]);
    void load(1, pageSize, emptyFilters);
  };

  const exportRows = async () => {
    setExporting(true);
    try {
      const response = await fetch(`${configuration.apiBase}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingIds: selectedRowKeys.length ? selectedRowKeys : undefined, filters }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || "线上会记录导出失败，请稍后重试");
      }
      const blob = await response.blob();
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = responseFileName(response, configuration.pageName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(href);
      message.success(`导出成功，共导出 ${selectedRowKeys.length || total} 条会议记录`);
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : "线上会记录导出失败，请稍后重试");
    } finally {
      setExporting(false);
    }
  };

  const openDetail = async (id: string) => {
    setDetailId(id);
    setDetail(undefined);
    setDetailError(false);
    setDetailLoading(true);
    try {
      const response = await fetch(`${configuration.apiBase}/${id}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "会议详情加载失败，请稍后重试");
      setDetail(data);
    } catch (reason) {
      setDetailError(true);
      message.error(reason instanceof Error ? reason.message : "会议详情加载失败，请稍后重试");
    } finally {
      setDetailLoading(false);
    }
  };

  const loadAttendance = async (id: string) => {
    setAttendance(undefined);
    setAttendanceError(false);
    setAttendanceLoading(true);
    try {
      const response = await fetch(`${configuration.apiBase}/${id}/attendance`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "会议签到人员加载失败，请稍后重试");
      setAttendance(data);
      setCandidateIds(data.actualAttendeeIds || []);
    } catch (reason) {
      setAttendanceError(true);
      message.error(reason instanceof Error ? reason.message : "会议签到人员加载失败，请稍后重试");
    } finally {
      setAttendanceLoading(false);
    }
  };

  const openAttendance = (id: string) => {
    setAttendanceId(id);
    void loadAttendance(id);
  };

  const persistAttendance = async () => {
    if (!attendance) return;
    setSaving(true);
    try {
      const response = await fetch(`${configuration.apiBase}/${attendance.id}/attendance`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actualAttendeeIds: candidateIds, attendanceVersion: attendance.attendanceVersion }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 409) void loadAttendance(attendance.id);
        throw new Error(data.message || "会议签到保存失败，请稍后重试");
      }
      message.success("会议签到保存成功");
      setAttendanceId(undefined);
      setAttendance(undefined);
      void load(page, pageSize, filters);
      if (detailId === attendance.id) void openDetail(attendance.id);
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : "会议签到保存失败，请稍后重试");
    } finally {
      setSaving(false);
    }
  };

  const saveAttendance = () => {
    if (candidateIds.length) {
      void persistAttendance();
      return;
    }
    confirmModal.confirm({
      title: "确认保存 0 人参会？",
      icon: <WarningOutlined />,
      content: "当前实际参会人数为0，请确认签到结果是否正确。",
      okText: "确认保存",
      cancelText: "返回检查",
      okButtonProps: { danger: true },
      onOk: persistAttendance,
    });
  };

  const columns: ColumnsType<MeetingRow> = [
    { title: "记录编号", dataIndex: "recordNo", width: 150, fixed: "left" },
    { title: "会议月份", dataIndex: "meetingMonthText", width: 135 },
    { title: "应参会", dataIndex: "expectedCount", width: 105, align: "center", render: value => <Tag color="blue">{value}</Tag> },
    { title: "实际参会", dataIndex: "actualCount", width: 105, align: "center", render: (value: number | null) => value === null ? <Tooltip title="尚未完成会议签到"><span className="monthly-meeting-unsigned">-</span></Tooltip> : <Tag color={value ? "success" : "default"}>{value}</Tag> },
    { title: "通知发布日期", dataIndex: "notificationReleaseDate", width: 145 },
    { title: "发布人", dataIndex: "publisherName", width: 150, ellipsis: true },
    { title: "操作", key: "actions", width: 210, fixed: "right", render: (_, row) => <Space size={2} className="table-actions">
      {canView && <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => void openDetail(row.id)}>查看</Button>}
      {canAttend && <Button type="link" size="small" icon={<CheckCircleOutlined />} onClick={() => openAttendance(row.id)}>会议签到</Button>}
    </Space> },
  ];
  const rowSelection: TableRowSelection<MeetingRow> = { selectedRowKeys, preserveSelectedRowKeys: true, onChange: setSelectedRowKeys, columnWidth: 48 };
  const selectedIdSet = new Set(candidateIds);
  const currentCandidates = attendance?.expectedAttendees.filter(person => selectedIdSet.has(person.id)) || [];
  const removedPeople = attendance?.expectedAttendees.filter(person => !selectedIdSet.has(person.id)) || [];

  const peopleTags = (people: Person[]) => <div className="monthly-meeting-people-tags">
    {people.map(person => <Tooltip key={person.id} title={person.role}><Tag>{person.realName}</Tag></Tooltip>)}
  </div>;

  return <>
    {confirmContext}
    <Card className="monthly-meeting-filter-card">
      <Form form={form} layout="vertical"><div className="monthly-meeting-filter-grid">
        <Form.Item label="会议月份" name="meetingMonth"><DatePicker picker="month" format="YYYY年M月" placeholder="请选择月份" allowClear /></Form.Item>
        <Form.Item label="应参会人" name="expectedAttendeeKeyword"><Input allowClear placeholder="请输入应参会人姓名" onPressEnter={applyFilters} /></Form.Item>
        <div className="monthly-meeting-filter-actions"><Space><Button onClick={resetFilters}>重置</Button><Button type="primary" icon={<SearchOutlined />} onClick={applyFilters}>筛选</Button></Space></div>
      </div></Form>
    </Card>

    <Card className="monthly-meeting-list-card">
      <div className="monthly-meeting-toolbar"><span>已选择 <strong>{selectedRowKeys.length}</strong> 条</span>{canExport && <Button icon={<DownloadOutlined />} loading={exporting} onClick={() => void exportRows()}>{exporting ? "导出中..." : "批量导出"}</Button>}</div>
      {loadError ? <Alert type="error" showIcon message="线上会记录加载失败，请稍后重试" action={<Button size="small" onClick={() => void load()}>重新加载</Button>} /> : <Table<MeetingRow>
        rowKey="id"
        dataSource={rows}
        loading={loading}
        columns={columns}
        rowSelection={rowSelection}
        scroll={{ x: 1100 }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={Object.values(filters).some(Boolean) ? <><div>没有找到符合当前条件的会议记录</div><small>请调整筛选条件后重试</small><div><Button type="link" onClick={resetFilters}>重置筛选</Button></div></> : `暂无${configuration.pageName}记录`} /> }}
        pagination={{ current: page, pageSize, total, showSizeChanger: true, pageSizeOptions: [20, 50, 100], showTotal: value => `共 ${value} 条`, onChange: (nextPage, nextSize) => { const targetPage = nextSize !== pageSize ? 1 : nextPage; setPage(targetPage); setPageSize(nextSize); void load(targetPage, nextSize, filters); } }}
      />}
    </Card>

    <Modal className="monthly-meeting-detail-modal" width={900} open={!!detailId} title={<Space><CalendarOutlined />查看会议</Space>} onCancel={() => setDetailId(undefined)} footer={<Button onClick={() => setDetailId(undefined)}>关闭</Button>}>
      {detailLoading ? <Skeleton active paragraph={{ rows: 12 }} /> : detailError ? <Alert type="error" showIcon message="会议详情加载失败，请稍后重试" action={<Button size="small" onClick={() => detailId && void openDetail(detailId)}>重新加载</Button>} /> : detail && <div className="monthly-meeting-detail">
        <Descriptions bordered size="small" column={2} title="会议信息">
          <Descriptions.Item label="记录编号">{detail.recordNo}</Descriptions.Item>
          <Descriptions.Item label="会议月份">{detail.meetingMonthText}</Descriptions.Item>
          <Descriptions.Item label="通知发布日期">{detail.notificationReleaseDate}</Descriptions.Item>
          <Descriptions.Item label="发布人">{detail.publisherName}</Descriptions.Item>
        </Descriptions>
        <section><h3>会议通知正文</h3><div className="monthly-meeting-notice-body">{detail.notificationContent}</div></section>
        <section><h3>应参会人员（{detail.expectedAttendees.length}人）</h3>{detail.expectedAttendees.length ? peopleTags(detail.expectedAttendees) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="本次会议无应参会人员" />}</section>
        <section><h3>实际参会人员（{detail.actualAttendees?.length ?? "-"}人）</h3>{detail.actualAttendees === null ? <Alert type="info" showIcon message="尚未完成会议签到" /> : detail.actualAttendees.length ? peopleTags(detail.actualAttendees) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="本次会议无实际参会人员" />}</section>
      </div>}
    </Modal>

    <Modal className="monthly-meeting-attendance-modal" width={760} open={!!attendanceId} title={<Space><TeamOutlined />会议签到</Space>} onCancel={() => !saving && setAttendanceId(undefined)} closable={!saving} maskClosable={!saving} footer={attendance && !attendanceError ? <Space><Button disabled={saving} onClick={() => setAttendanceId(undefined)}>取消</Button><Button type="primary" loading={saving} onClick={saveAttendance}>{saving ? "保存中..." : "保存签到"}</Button></Space> : <Button onClick={() => setAttendanceId(undefined)}>关闭</Button>}>
      {attendanceLoading ? <div className="monthly-meeting-attendance-loading"><Skeleton active paragraph={{ rows: 8 }} /><span>签到数据加载中...</span></div> : attendanceError ? <Alert type="error" showIcon message="会议签到人员加载失败，请稍后重试" action={<Button size="small" onClick={() => attendanceId && void loadAttendance(attendanceId)}>重新加载</Button>} /> : attendance && <div className="monthly-meeting-attendance">
        <div className="monthly-meeting-attendance-summary"><div><span>应参会</span><strong>{attendance.expectedAttendees.length}</strong><small>人</small></div><div><span>当前实际参会</span><strong>{candidateIds.length}</strong><small>人</small></div></div>
        <section><h3>实际参会候选</h3><p>首次签到默认包含全部应参会人员，点击姓名右侧删除图标可标记为未参会。</p><div className="monthly-meeting-candidate-tags">{currentCandidates.map(person => <Tooltip key={person.id} title={person.role}><Tag closable closeIcon={<UserDeleteOutlined />} onClose={event => { event.preventDefault(); setCandidateIds(current => current.filter(id => id !== person.id)); }}>{person.realName}</Tag></Tooltip>)}</div>{!currentCandidates.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前实际参会人数为0" />}</section>
        {removedPeople.length > 0 && <section className="monthly-meeting-removed"><h3>本次标记未参会（{removedPeople.length}人）</h3><p>如有误操作，可点击姓名恢复到实际参会候选名单。</p><div>{removedPeople.map(person => <Button key={person.id} size="small" icon={<PlusOutlined />} onClick={() => setCandidateIds(current => [...current, person.id])}>{person.realName}</Button>)}</div></section>}
      </div>}
    </Modal>
  </>;
}

export function MonthlyOnlineMeetingList({ permissions }: { permissions: string[] }) {
  return <MeetingManagementList permissions={permissions} variant="monthly-online" />;
}

export function MidMonthOfflineMeetingList({ permissions }: { permissions: string[] }) {
  return <MeetingManagementList permissions={permissions} variant="mid-month-offline" />;
}

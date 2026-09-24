"use client";

import {
  CalculatorOutlined, CalendarOutlined, DeleteOutlined, DownloadOutlined, EditOutlined, EyeOutlined,
  PlusOutlined, SearchOutlined,
} from "@ant-design/icons";
import {
  Alert, Button, Card, DatePicker, Descriptions, Empty, Form, Input, InputNumber,
  message, Modal, Select, Skeleton, Space, Spin, Table,
} from "antd";
import type { ColumnsType, TableRowSelection } from "antd/es/table/interface";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import { useCallback, useEffect, useRef, useState } from "react";

type HolidayType =
  | "NEW_YEAR_DAY"
  | "SPRING_FESTIVAL"
  | "QINGMING_FESTIVAL"
  | "LABOR_DAY"
  | "DRAGON_BOAT_FESTIVAL"
  | "MID_AUTUMN_FESTIVAL"
  | "NATIONAL_DAY"
  | "OTHER";

type RestDayRow = {
  id: string;
  recordNo: string;
  year: number;
  holidayType: HolidayType;
  holidayName: string;
  startDate: string;
  endDate: string;
  dateRangeText: string;
  remark: string;
  createdByName: string;
  createdAt: string;
  version: number;
};

type Filters = { year: string; month: string; holidayKeyword: string };
type FilterFormValues = { year?: string; month?: string; holidayKeyword?: string };
type RecordFormValues = {
  year?: number | null;
  holidayType?: HolidayType;
  startDate?: Dayjs | null;
  endDate?: Dayjs | null;
  remark?: string;
};
type ModalMode = "create" | "view" | "edit";
type LaborCostCalculationResult = {
  month: string;
  monthLabel: string;
  totalCount: number;
  completedCount: number;
  failedCount: number;
};

const emptyFilters: Filters = { year: "", month: "", holidayKeyword: "" };
const holidayOptions: { value: HolidayType; label: string }[] = [
  { value: "NEW_YEAR_DAY", label: "元旦" },
  { value: "SPRING_FESTIVAL", label: "春节" },
  { value: "QINGMING_FESTIVAL", label: "清明节" },
  { value: "LABOR_DAY", label: "劳动节" },
  { value: "DRAGON_BOAT_FESTIVAL", label: "端午节" },
  { value: "MID_AUTUMN_FESTIVAL", label: "中秋节" },
  { value: "NATIONAL_DAY", label: "国庆节" },
  { value: "OTHER", label: "其他" },
];
const monthOptions = [
  { value: "ALL", label: "全部" },
  ...Array.from({ length: 12 }, (_, index) => ({ value: String(index + 1), label: `${index + 1}月` })),
];

function responseFileName(response: Response) {
  const encoded = response.headers.get("Content-Disposition")?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  return encoded ? decodeURIComponent(encoded) : `休息日管理_${dayjs().format("YYYYMMDD_HHmmss")}.xlsx`;
}

function hasPermission(permissions: string[], action: string) {
  return permissions.includes("*") || permissions.includes("settings:rest-days") || permissions.includes(`rest-days:${action}`);
}

function validYear(value?: number | null) {
  return Number.isInteger(value) && String(value).length === 4 && Number(value) >= 2026 && Number(value) <= 2096;
}

export function RestDayList({ permissions, currentUserName }: { permissions: string[]; currentUserName: string }) {
  const canCreate = hasPermission(permissions, "create");
  const canView = hasPermission(permissions, "view");
  const canEdit = hasPermission(permissions, "edit");
  const canCalculate = hasPermission(permissions, "calculate");
  const canExport = hasPermission(permissions, "export");
  const canDelete = hasPermission(permissions, "delete");
  const [confirmModal, confirmContext] = Modal.useModal();
  const [filterForm] = Form.useForm<FilterFormValues>();
  const [recordForm] = Form.useForm<RecordFormValues>();
  const [rows, setRows] = useState<RestDayRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [calculating, setCalculating] = useState(false);
  const [calculationResult, setCalculationResult] = useState<LaborCostCalculationResult>();
  const [exporting, setExporting] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>();
  const [activeRow, setActiveRow] = useState<RestDayRow>();
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [deleteRow, setDeleteRow] = useState<RestDayRow>();
  const [deleting, setDeleting] = useState(false);
  const requestSequence = useRef(0);
  const selectedYear = Form.useWatch("year", recordForm);

  const load = useCallback(async (nextPage: number, nextPageSize: number, nextFilters: Filters) => {
    const sequence = ++requestSequence.current;
    setLoading(true);
    setLoadError(false);
    try {
      const query = new URLSearchParams({ page: String(nextPage), pageSize: String(nextPageSize) });
      if (nextFilters.year) query.set("year", nextFilters.year);
      if (nextFilters.month) query.set("month", nextFilters.month);
      if (nextFilters.holidayKeyword) query.set("holidayKeyword", nextFilters.holidayKeyword);
      const response = await fetch(`/api/rest-days?${query}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "休息日数据加载失败，请稍后重试");
      if (sequence !== requestSequence.current) return;
      setRows(data.rows || []);
      setTotal(data.total || 0);
    } catch (reason) {
      if (sequence === requestSequence.current) {
        setLoadError(true);
        message.error(reason instanceof Error ? reason.message : "休息日数据加载失败，请稍后重试");
      }
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, []);

  useEffect(() => { void load(1, 20, emptyFilters); }, [load]);

  const applyFilters = async () => {
    try {
      const values = await filterForm.validateFields();
      const next = {
        year: values.year?.trim() || "",
        month: values.month === "ALL" ? "" : values.month || "",
        holidayKeyword: values.holidayKeyword?.trim() || "",
      };
      setFilters(next);
      setPage(1);
      setSelectedRowKeys([]);
      void load(1, pageSize, next);
    } catch { /* field validation owns the message */ }
  };

  const resetFilters = () => {
    filterForm.resetFields();
    setFilters(emptyFilters);
    setPage(1);
    setSelectedRowKeys([]);
    void load(1, pageSize, emptyFilters);
  };

  const closeRecordModal = () => {
    setModalMode(undefined);
    setActiveRow(undefined);
    setDetailError(false);
    setDirty(false);
    recordForm.resetFields();
  };

  const requestCloseRecordModal = () => {
    if (saving) return;
    if ((modalMode === "create" || modalMode === "edit") && dirty) {
      confirmModal.confirm({
        title: "当前休息日信息尚未保存",
        content: "关闭后填写内容将丢失，是否继续？",
        okText: "继续关闭",
        cancelText: "返回填写",
        onOk: closeRecordModal,
      });
      return;
    }
    closeRecordModal();
  };

  const openCreate = () => {
    setActiveRow(undefined);
    setModalMode("create");
    setDirty(false);
    recordForm.resetFields();
    recordForm.setFieldsValue({ year: null, holidayType: undefined, startDate: null, endDate: null, remark: "" });
  };

  const openEdit = (row: RestDayRow) => {
    setActiveRow(row);
    setModalMode("edit");
    setDirty(false);
    recordForm.setFieldsValue({
      year: row.year,
      holidayType: row.holidayType,
      startDate: dayjs(row.startDate),
      endDate: dayjs(row.endDate),
      remark: row.remark,
    });
  };

  const openView = async (id: string) => {
    setModalMode("view");
    setActiveRow(undefined);
    setDetailLoading(true);
    setDetailError(false);
    try {
      const response = await fetch(`/api/rest-days/${id}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "休息日详情加载失败，请稍后重试");
      setActiveRow(data);
    } catch (reason) {
      setDetailError(true);
      message.error(reason instanceof Error ? reason.message : "休息日详情加载失败，请稍后重试");
    } finally {
      setDetailLoading(false);
    }
  };

  const saveRecord = async () => {
    try {
      const values = await recordForm.validateFields();
      if (!values.year || !values.holidayType || !values.startDate || !values.endDate) return;
      setSaving(true);
      const editing = modalMode === "edit" && activeRow;
      const response = await fetch(editing ? `/api/rest-days/${activeRow.id}` : "/api/rest-days", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year: values.year,
          holidayType: values.holidayType,
          startDate: values.startDate.format("YYYY-MM-DD"),
          endDate: values.endDate.format("YYYY-MM-DD"),
          remark: values.remark || "",
          ...(editing ? { version: activeRow.version } : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || (editing ? "休息日保存失败，请稍后重试" : "休息日新增失败，请稍后重试"));
      message.success(editing ? "休息日保存成功" : "休息日新增成功");
      closeRecordModal();
      const nextPage = editing ? page : 1;
      if (!editing) setPage(1);
      void load(nextPage, pageSize, filters);
    } catch (reason) {
      if (reason instanceof Error) message.error(reason.message);
    } finally {
      setSaving(false);
    }
  };

  const onRecordValuesChange = (changed: Partial<RecordFormValues>, allValues: RecordFormValues) => {
    setDirty(true);
    if (!("year" in changed)) return;
    const year = changed.year;
    const clearStart = allValues.startDate && (!validYear(year) || allValues.startDate.year() !== year);
    const clearEnd = allValues.endDate && (!validYear(year) || allValues.endDate.year() !== year);
    if (clearStart || clearEnd) {
      recordForm.setFieldsValue({
        ...(clearStart ? { startDate: null } : {}),
        ...(clearEnd ? { endDate: null } : {}),
      });
      message.warning("所属年份已变更，请重新选择放假日期");
    }
  };

  const exportRows = async () => {
    setExporting(true);
    try {
      const response = await fetch("/api/rest-days/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordIds: selectedRowKeys.length ? selectedRowKeys.map(String) : undefined, filters }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || "休息日数据导出失败，请稍后重试");
      }
      const blob = await response.blob();
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = responseFileName(response);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(href);
      message.success("休息日数据导出成功");
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : "休息日数据导出失败，请稍后重试");
    } finally {
      setExporting(false);
    }
  };

  const calculateLaborCosts = async () => {
    setCalculationResult(undefined);
    setCalculating(true);
    try {
      const response = await fetch("/api/rest-days/recalculate-labor-costs", { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "本月人力成本计算失败，请稍后重试");
      setCalculationResult(data as LaborCostCalculationResult);
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : "本月人力成本计算失败，请稍后重试");
    } finally {
      setCalculating(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteRow) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/rest-days/${deleteRow.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "休息日删除失败，请稍后重试");
      message.success("休息日删除成功");
      setSelectedRowKeys(current => current.filter(key => String(key) !== deleteRow.id));
      setDeleteRow(undefined);
      const targetPage = rows.length === 1 && page > 1 ? page - 1 : page;
      if (targetPage !== page) setPage(targetPage);
      void load(targetPage, pageSize, filters);
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : "休息日删除失败，请稍后重试");
    } finally {
      setDeleting(false);
    }
  };

  const columns: ColumnsType<RestDayRow> = [
    { title: "记录编号", dataIndex: "recordNo", width: 150, fixed: "left" },
    { title: "所属年份", dataIndex: "year", width: 110, align: "center" },
    { title: "节日", dataIndex: "holidayName", width: 130 },
    { title: "放假日期", dataIndex: "dateRangeText", width: 245 },
    { title: "创建人", dataIndex: "createdByName", width: 140, ellipsis: true },
    { title: "创建时间", dataIndex: "createdAt", width: 190 },
    { title: "操作", key: "actions", width: 210, fixed: "right", render: (_, row) => <Space size={0} className="table-actions">
      {canView && <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => void openView(row.id)}>查看</Button>}
      {canEdit && <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(row)}>编辑</Button>}
      {canDelete && <Button danger type="link" size="small" icon={<DeleteOutlined />} onClick={() => setDeleteRow(row)}>删除</Button>}
    </Space> },
  ];

  const rowSelection: TableRowSelection<RestDayRow> = {
    selectedRowKeys,
    preserveSelectedRowKeys: true,
    onChange: setSelectedRowKeys,
    columnWidth: 48,
  };
  const hasFilters = Boolean(filters.year || filters.month || filters.holidayKeyword);
  const modalTitle = modalMode === "create" ? "新增休息日" : modalMode === "edit" ? "编辑休息日" : "查看休息日";

  return <>
    {confirmContext}
    <Card className="rest-day-filter-card">
      <Form form={filterForm} layout="vertical" initialValues={{ month: "ALL" }}>
        <div className="rest-day-filter-grid">
          <Form.Item label="所属年份" name="year" validateFirst getValueFromEvent={event => String(event.target.value || "").replace(/\D/g, "").slice(0, 4)} rules={[
            { pattern: /^\d{4}$/, message: "请输入2026-2096之间的四位年份" },
            { validator: (_, value) => !value || (Number(value) >= 2026 && Number(value) <= 2096) ? Promise.resolve() : Promise.reject(new Error("请输入2026-2096之间的四位年份")) },
          ]}>
            <Input inputMode="numeric" maxLength={4} allowClear placeholder="请输入年份" onPressEnter={() => void applyFilters()} />
          </Form.Item>
          <Form.Item label="所属月份" name="month"><Select options={monthOptions} /></Form.Item>
          <Form.Item label="节日" name="holidayKeyword"><Input allowClear maxLength={30} placeholder="请输入节日名称" onPressEnter={() => void applyFilters()} /></Form.Item>
          <div className="rest-day-filter-actions"><Space><Button onClick={resetFilters}>重置</Button><Button type="primary" icon={<SearchOutlined />} onClick={() => void applyFilters()}>筛选</Button></Space></div>
        </div>
      </Form>
    </Card>

    <Card className="rest-day-list-card">
      <div className="rest-day-toolbar">
        <Space>{canCreate && <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增</Button>}<span>已选择 <strong>{selectedRowKeys.length}</strong> 条</span></Space>
        <Space>
          {canCalculate && <Button icon={<CalculatorOutlined />} loading={calculating} disabled={loading || exporting} onClick={() => void calculateLaborCosts()}>{calculating ? "计算中..." : "立即计算"}</Button>}
          {canExport && <Button icon={<DownloadOutlined />} loading={exporting} disabled={loading || calculating} onClick={() => void exportRows()}>{exporting ? "导出中..." : "批量导出"}</Button>}
        </Space>
      </div>
      {loadError ? <Alert type="error" showIcon message="休息日数据加载失败，请稍后重试" action={<Button size="small" onClick={() => void load(page, pageSize, filters)}>重新加载</Button>} /> : <Table<RestDayRow>
        rowKey="id"
        dataSource={rows}
        loading={loading}
        columns={columns}
        rowSelection={canExport ? rowSelection : undefined}
        scroll={{ x: 1220 }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={hasFilters ? <><div>没有找到符合当前条件的休息日记录</div><small>请调整筛选条件后重试</small><div><Button type="link" onClick={resetFilters}>重置筛选</Button></div></> : <><div>当前还没有配置休息日</div>{canCreate && <div><Button type="link" icon={<PlusOutlined />} onClick={openCreate}>新增</Button></div>}</>} /> }}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          pageSizeOptions: [20, 50, 100],
          showTotal: value => `共 ${value} 条`,
          onChange: (nextPage, nextSize) => {
            const targetPage = nextSize !== pageSize ? 1 : nextPage;
            setPage(targetPage);
            setPageSize(nextSize);
            void load(targetPage, nextSize, filters);
          },
        }}
      />}
    </Card>

    <Modal
      className="rest-day-record-modal"
      width={760}
      open={Boolean(modalMode)}
      title={<Space><CalendarOutlined />{modalTitle}</Space>}
      onCancel={requestCloseRecordModal}
      closable={!saving}
      maskClosable={false}
      footer={modalMode === "view" ? <Button onClick={requestCloseRecordModal}>关闭</Button> : <Space><Button disabled={saving} onClick={requestCloseRecordModal}>取消</Button><Button type="primary" loading={saving} onClick={() => void saveRecord()}>{saving ? "保存中..." : "保存"}</Button></Space>}
    >
      {modalMode === "view" ? detailLoading ? <Skeleton active paragraph={{ rows: 8 }} /> : detailError ? <Alert type="error" showIcon message="休息日详情加载失败，请稍后重试" /> : activeRow && <Descriptions bordered size="small" column={1}>
        <Descriptions.Item label="记录编号">{activeRow.recordNo}</Descriptions.Item>
        <Descriptions.Item label="所属年份">{activeRow.year}</Descriptions.Item>
        <Descriptions.Item label="节日">{activeRow.holidayName}</Descriptions.Item>
        <Descriptions.Item label="放假开始日期">{activeRow.startDate}</Descriptions.Item>
        <Descriptions.Item label="放假截止日期">{activeRow.endDate}</Descriptions.Item>
        <Descriptions.Item label="备注"><span className="rest-day-remark-text">{activeRow.remark || "-"}</span></Descriptions.Item>
        <Descriptions.Item label="创建人">{activeRow.createdByName}</Descriptions.Item>
        <Descriptions.Item label="创建时间">{activeRow.createdAt}</Descriptions.Item>
      </Descriptions> : <Form form={recordForm} layout="vertical" onValuesChange={onRecordValuesChange}>
        <div className="rest-day-form-grid">
          <Form.Item label="记录编号"><Input readOnly value={activeRow?.recordNo || ""} placeholder="保存成功后由系统生成" /></Form.Item>
          <Form.Item label="所属年份" name="year" required validateFirst rules={[
            { required: true, message: "请输入所属年份" },
            { validator: (_, value) => Number.isInteger(value) && /^\d{4}$/.test(String(value)) ? Promise.resolve() : Promise.reject(new Error("所属年份必须为四位数字")) },
            { validator: (_, value) => value >= 2026 && value <= 2096 ? Promise.resolve() : Promise.reject(new Error("所属年份仅支持2026-2096")) },
          ]}>
            <InputNumber controls={false} precision={0} min={0} max={9999} placeholder="请输入所属年份" style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item label="节日" name="holidayType" rules={[{ required: true, message: "请选择节日" }]}><Select allowClear placeholder="请选择" options={holidayOptions} /></Form.Item>
          <Form.Item label="放假开始日期" name="startDate" dependencies={["year", "endDate"]} rules={[
            { required: true, message: "请选择放假开始日期" },
            { validator: (_, value: Dayjs | null) => !value || (validYear(selectedYear) && value.year() === selectedYear) ? Promise.resolve() : Promise.reject(new Error(`放假日期必须属于${selectedYear || "所属"}年`)) },
          ]}>
            <DatePicker disabled={!validYear(selectedYear)} disabledDate={date => validYear(selectedYear) && date.year() !== selectedYear} format="YYYY-MM-DD" placeholder={validYear(selectedYear) ? "请选择开始日期" : "请先选择所属年份"} />
          </Form.Item>
          <Form.Item label="放假截止日期" name="endDate" dependencies={["year", "startDate"]} rules={[
            { required: true, message: "请选择放假截止日期" },
            { validator: (_, value: Dayjs | null) => {
              if (!value) return Promise.resolve();
              if (!validYear(selectedYear) || value.year() !== selectedYear) return Promise.reject(new Error(`放假日期必须属于${selectedYear || "所属"}年`));
              const start = recordForm.getFieldValue("startDate") as Dayjs | null;
              return start && start.isAfter(value, "day") ? Promise.reject(new Error("放假开始日期不能晚于放假截止日期")) : Promise.resolve();
            } },
          ]}>
            <DatePicker disabled={!validYear(selectedYear)} disabledDate={date => validYear(selectedYear) && date.year() !== selectedYear} format="YYYY-MM-DD" placeholder={validYear(selectedYear) ? "请选择截止日期" : "请先选择所属年份"} />
          </Form.Item>
          <Form.Item className="rest-day-form-span" label="备注" name="remark" rules={[{ max: 50, message: "备注不能超过50个字符" }]}><Input.TextArea rows={3} maxLength={50} showCount placeholder="请输入备注（选填）" /></Form.Item>
          <Form.Item label="创建人"><Input readOnly value={activeRow?.createdByName || currentUserName} /></Form.Item>
          <Form.Item label="创建时间"><Input readOnly value={activeRow?.createdAt || ""} placeholder="保存成功后由系统生成" /></Form.Item>
        </div>
      </Form>}
    </Modal>

    <Modal
      open={Boolean(deleteRow)}
      title="温馨提示"
      okText={deleting ? "删除中..." : "我知道了，继续删除"}
      cancelText="我再想想"
      okButtonProps={{ danger: true, disabled: deleting }}
      cancelButtonProps={{ disabled: deleting }}
      confirmLoading={deleting}
      closable={!deleting}
      maskClosable={false}
      onCancel={() => !deleting && setDeleteRow(undefined)}
      onOk={() => void confirmDelete()}
    >
      <p className="rest-day-delete-warning">删除操作不可逆，一旦删除成功，当前休息日记录将从系统中永久删除，相关日期将不再被系统识别为该休息日，请谨慎操作。</p>
      {deleteRow && <div className="rest-day-delete-summary"><strong>{deleteRow.holidayName}</strong><span>{deleteRow.dateRangeText}</span></div>}
    </Modal>

    <Modal
      className="rest-day-calculating-modal"
      width={460}
      open={calculating}
      title="正在计算"
      footer={null}
      closable={false}
      maskClosable={false}
      keyboard={false}
      centered
    >
      <div className="rest-day-calculating">
        <Spin size="large" />
        <strong>正在重新计算本月所有人员的人力成本</strong>
        <span>系统将根据当前休息日和系统参数进行计算，请保持页面打开。</span>
      </div>
    </Modal>

    <Modal
      className="rest-day-calculation-result-modal"
      width={520}
      open={Boolean(calculationResult)}
      title="温馨提示"
      onCancel={() => setCalculationResult(undefined)}
      footer={<Button type="primary" onClick={() => setCalculationResult(undefined)}>我知道了</Button>}
      centered
    >
      {calculationResult && <>
        <p className="rest-day-calculation-message">{calculationResult.monthLabel}人力成本重新计算完毕。</p>
        <div className="rest-day-calculation-summary">
          <div><span>员工总数</span><strong>{calculationResult.totalCount}</strong><small>人</small></div>
          <div className="is-success"><span>计算完成</span><strong>{calculationResult.completedCount}</strong><small>人</small></div>
          <div className={calculationResult.failedCount ? "is-failed" : ""}><span>计算失败</span><strong>{calculationResult.failedCount}</strong><small>人</small></div>
        </div>
      </>}
    </Modal>
  </>;
}

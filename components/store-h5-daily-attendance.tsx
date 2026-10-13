"use client";

import { ArrowLeftOutlined, CalendarOutlined, CheckCircleFilled, ClockCircleOutlined, TeamOutlined } from "@ant-design/icons";
import { Alert, Button, Checkbox, Empty, InputNumber, Modal, Radio, Skeleton, Tag } from "antd";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type AttendanceType = "FULL_ATTENDANCE" | "REST" | "LEAVE_FULL_DAY" | "LEAVE_HOURS";
type Employee = {
  id: string;
  recordNo: string;
  name: string;
  positionLevel: string;
  attendanceType: AttendanceType | null;
  leaveHours: number | null;
  overtime: boolean;
  overtimeHours: number | null;
};
type Submission = { recordNo: string; createdByName: string; createdAt: string; partTimeHeadcount?: number | null; partTimeHours?: number | null; partTimeLaborCost?: number | null; partTimeActualLaborCost?: number | null };
type AttendanceData = {
  attendanceDate: string;
  attendanceDateLabel: string;
  storeName: string;
  partTimeLaborCost: number | null;
  employees: Employee[];
  availability: {
    status: "OPEN" | "NOT_OPEN" | "CLOSED" | "SUBMITTED";
    opensAt: string;
    deadlineAt: string;
    opensLabel: string;
    deadlineLabel: string;
    configured: boolean;
  };
  correctionRequired: boolean;
  missingEmployeeCount: number;
  submission: Submission | null;
};

function validPositiveOneDecimal(value: number | null, maximum: number) {
  return value !== null && value > 0 && value <= maximum && Math.abs(value * 10 - Math.round(value * 10)) < 1e-8;
}

function validHours(value: number | null) {
  return validPositiveOneDecimal(value, 24);
}

function validMoney(value: number | null) {
  return value !== null && value >= 0 && value <= 9999999999.99 && Math.abs(value * 100 - Math.round(value * 100)) < 1e-8;
}

function deadlineText(value: string) {
  return new Date(value).toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai", hour12: false, month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

export function StoreH5DailyAttendance({ canSubmit: hasSubmitPermission }: { canSubmit: boolean }) {
  const router = useRouter();
  const [data, setData] = useState<AttendanceData | null>(null);
  const [answers, setAnswers] = useState<Record<string, Employee>>({});
  const [partTimeHeadcount, setPartTimeHeadcount] = useState<number | null>(null);
  const [partTimeHours, setPartTimeHours] = useState<number | null>(null);
  const [partTimeLaborCost, setPartTimeLaborCost] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    setLoading(true); setLoadError("");
    try {
      const response = await fetch("/api/store-h5/daily-attendance", { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (response.status === 401) { router.replace("/store_h5/login"); return; }
      if (response.status === 403) { router.replace("/store_h5"); return; }
      if (!response.ok) throw new Error(payload?.message || "每日考勤加载失败，请稍后重试");
      const next = payload as AttendanceData;
      setData(next);
      setAnswers(Object.fromEntries(next.employees.map(employee => [employee.id, employee])));
      setPartTimeHeadcount(next.submission?.partTimeHeadcount ?? null);
      setPartTimeHours(next.submission?.partTimeHours ?? null);
      setPartTimeLaborCost(next.partTimeLaborCost);
      setNow(Date.now());
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "每日考勤加载失败，请稍后重试");
    } finally { setLoading(false); }
  }, [router]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const submitted = Boolean(data?.submission) && !data?.correctionRequired;
  const withinWindow = data !== null && !submitted && now >= new Date(data.availability.opensAt).getTime() && now <= new Date(data.availability.deadlineAt).getTime();
  const allEmployeesComplete = useMemo(() => !data ? false : data.employees.every(employee => {
    const answer = answers[employee.id];
    if (!answer?.attendanceType) return false;
    if (answer.attendanceType === "LEAVE_HOURS" && !validHours(answer.leaveHours)) return false;
    if (answer.overtime && !validHours(answer.overtimeHours)) return false;
    return true;
  }), [answers, data]);
  const partTimeComplete = (partTimeHeadcount === null || partTimeHeadcount === 0)
    ? partTimeHours === null
    : Number.isInteger(partTimeHeadcount) && partTimeHeadcount > 0 && validPositiveOneDecimal(partTimeHours, 9999.9) && validMoney(partTimeLaborCost);
  const partTimeActualLaborCost = partTimeHours === null || partTimeLaborCost === null
    ? null
    : Math.round((partTimeHours * partTimeLaborCost + Number.EPSILON) * 100) / 100;
  const canSubmit = hasSubmitPermission && withinWindow && allEmployeesComplete && partTimeComplete && !submitting;

  const changeAnswer = (employeeId: string, changes: Partial<Employee>) => {
    setSubmitError("");
    setAnswers(current => ({ ...current, [employeeId]: { ...current[employeeId], ...changes } }));
  };

  const submit = async () => {
    if (!data || !canSubmit) return;
    setSubmitting(true); setSubmitError("");
    try {
      const response = await fetch("/api/store-h5/daily-attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attendanceDate: data.attendanceDate,
          items: data.employees.map(employee => {
            const answer = answers[employee.id];
            return {
              personnelId: employee.id,
              attendanceType: answer.attendanceType,
              leaveHours: answer.attendanceType === "LEAVE_HOURS" ? answer.leaveHours : null,
              overtime: answer.overtime,
              overtimeHours: answer.overtime ? answer.overtimeHours : null,
            };
          }),
          partTimeHeadcount,
          partTimeHours,
          partTimeLaborCost,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (response.status === 401) { router.replace("/store_h5/login"); return; }
      if (!response.ok) throw new Error(payload?.message || "每日考勤提交失败，请稍后重试");
      setData(current => current ? { ...current, availability: { ...current.availability, status: "SUBMITTED" }, correctionRequired: false, missingEmployeeCount: 0, submission: payload as Submission } : current);
      setConfirmOpen(false); setSuccessOpen(true);
    } catch (error) {
      setConfirmOpen(false);
      setSubmitError(error instanceof Error ? error.message : "每日考勤提交失败，请稍后重试");
    } finally { setSubmitting(false); }
  };

  if (loading) return <main className="store-h5-page store-h5-task-page"><header className="store-h5-subheader"><span /><div><strong>每日考勤</strong><small>正在加载</small></div><span /></header><section className="store-h5-task-content"><Skeleton active paragraph={{ rows: 8 }} /></section></main>;
  if (loadError || !data) return <main className="store-h5-page store-h5-task-page"><header className="store-h5-subheader"><Button type="text" aria-label="返回首页" icon={<ArrowLeftOutlined />} onClick={() => router.push("/store_h5")} /><div><strong>每日考勤</strong></div><span /></header><section className="store-h5-task-content"><Alert type="error" showIcon message={loadError || "每日考勤加载失败"} action={<Button size="small" onClick={() => void load()}>重新加载</Button>} /></section></main>;

  const availabilityMessage = data.correctionRequired
    ? `原考勤记录遗漏${data.missingEmployeeCount}名员工，请补全后提交补正`
    : submitted
    ? `本次考勤已由${data.submission!.createdByName}于${data.submission!.createdAt}提交`
    : !withinWindow && now < new Date(data.availability.opensAt).getTime()
      ? `尚未到考勤打卡时间，请在${deadlineText(data.availability.opensAt)}后填写`
      : !withinWindow
        ? "当前考勤已超过截止提交时间"
        : `请在${deadlineText(data.availability.deadlineAt)}前完成提交`;

  return <main className="store-h5-page store-h5-task-page store-h5-attendance-page">
    <header className="store-h5-subheader"><Button type="text" aria-label="返回首页" icon={<ArrowLeftOutlined />} onClick={() => router.push("/store_h5")} /><div><strong>每日考勤</strong><small>{data.storeName}</small></div><span /></header>
    <section className="store-h5-attendance-summary">
      <div><span><CalendarOutlined /></span><div><small>考勤日期</small><h1>{data.attendanceDateLabel}</h1></div></div>
      <Tag color={submitted ? "success" : withinWindow ? "processing" : "default"}>{submitted ? "已提交" : withinWindow ? "填写中" : now < new Date(data.availability.opensAt).getTime() ? "未开放" : "已截止"}</Tag>
      <p><ClockCircleOutlined /> {availabilityMessage}</p>
      <small>考勤时段：{data.availability.opensLabel} 至 {data.availability.deadlineLabel}{!data.availability.configured && "（默认）"}</small>
    </section>
    {submitError && <div className="store-h5-attendance-alert"><Alert type="error" showIcon message={submitError} closable onClose={() => setSubmitError("")} /></div>}
    <section className="store-h5-attendance-section">
      <div className="store-h5-attendance-heading"><div><TeamOutlined /><strong>员工考勤</strong></div><span>{data.employees.length} 人</span></div>
      {!data.employees.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前门店暂无在职员工" /> : data.employees.map((employee, index) => {
        const answer = answers[employee.id];
        const disabled = !hasSubmitPermission || !withinWindow || submitted;
        return <article className="store-h5-attendance-employee" key={employee.id}>
          <header><span>{index + 1}</span><div><strong>{employee.name}</strong><small>{employee.positionLevel} · {employee.recordNo}</small></div></header>
          <Radio.Group className="store-h5-attendance-status" value={answer?.attendanceType} disabled={disabled} onChange={event => changeAnswer(employee.id, { attendanceType: event.target.value, leaveHours: event.target.value === "LEAVE_HOURS" ? answer?.leaveHours ?? null : null })}>
            <Radio value="FULL_ATTENDANCE">全勤</Radio><Radio value="REST">休息</Radio><Radio value="LEAVE_FULL_DAY">请假全天</Radio><Radio value="LEAVE_HOURS">请假小时</Radio>
          </Radio.Group>
          {answer?.attendanceType === "LEAVE_HOURS" && <label className="store-h5-attendance-hours"><span>请假时长</span><InputNumber value={answer.leaveHours} disabled={disabled} min={0.1} max={24} precision={1} step={0.1} inputMode="decimal" placeholder="如 1.2 或 3" addonAfter="小时" onChange={value => changeAnswer(employee.id, { leaveHours: value })} /></label>}
          <div className="store-h5-attendance-overtime"><Checkbox checked={answer?.overtime || false} disabled={disabled} onChange={event => changeAnswer(employee.id, { overtime: event.target.checked, overtimeHours: event.target.checked ? answer?.overtimeHours ?? null : null })}>加班</Checkbox>{answer?.overtime && <InputNumber value={answer.overtimeHours} disabled={disabled} min={0.1} max={24} precision={1} step={0.1} inputMode="decimal" placeholder="如 1.2 或 3" addonAfter="小时" onChange={value => changeAnswer(employee.id, { overtimeHours: value })} />}</div>
        </article>;
      })}
    </section>
    <section className="store-h5-attendance-section store-h5-attendance-part-time">
      <div className="store-h5-attendance-heading"><div><TeamOutlined /><strong>兼职用工</strong></div><span>选填</span></div>
      <label><span>今日兼职人数</span><InputNumber value={partTimeHeadcount} disabled={!hasSubmitPermission || !withinWindow || submitted} min={0} max={9999} precision={0} inputMode="numeric" placeholder="请输入正整数" addonAfter="人" onChange={value => { setSubmitError(""); setPartTimeHeadcount(value); if (!value) setPartTimeHours(null); }} /></label>
      <label><span>今日兼职工时{Boolean(partTimeHeadcount) && <b>*</b>}</span><InputNumber value={partTimeHours} disabled={!hasSubmitPermission || !withinWindow || submitted || !partTimeHeadcount} min={0.1} max={9999.9} precision={1} step={0.1} inputMode="decimal" placeholder={partTimeHeadcount ? "必填，最多一位小数" : "填写兼职人数后录入"} addonAfter="小时" onChange={value => { setSubmitError(""); setPartTimeHours(value); }} /></label>
      <label><span>兼职用工成本{Boolean(partTimeHeadcount) && <b>*</b>}</span><InputNumber value={partTimeLaborCost} disabled={!hasSubmitPermission || !withinWindow || submitted} min={0} max={9999999999.99} precision={2} step={0.01} inputMode="decimal" placeholder="读取门店档案，可修改" addonAfter="元/小时" onChange={value => { setSubmitError(""); setPartTimeLaborCost(value); }} /></label>
      <label><span>今日兼职用工成本</span><InputNumber value={partTimeActualLaborCost} readOnly controls={false} precision={2} placeholder="根据工时和单价自动计算" addonAfter="元" /></label>
    </section>
    <div className="store-h5-submit-space" /><footer className="store-h5-submit-bar"><Button block type="primary" size="large" disabled={!canSubmit} loading={submitting} onClick={() => setConfirmOpen(true)}>{!hasSubmitPermission ? "仅可查看" : submitted ? "今日考勤已提交" : submitting ? "提交中..." : data.correctionRequired ? "提交补正" : "提交"}</Button></footer>
    <Modal title={data.correctionRequired ? "确认提交考勤补正？" : "确认提交今日考勤？"} open={confirmOpen} centered maskClosable={false} closable={!submitting} okText={data.correctionRequired ? "确认补正" : "确认提交"} cancelText="取消" confirmLoading={submitting} onCancel={() => !submitting && setConfirmOpen(false)} onOk={() => void submit()}><p>{data.correctionRequired ? "将保留原有记录编号并补全遗漏员工，请确认考勤信息无误。" : "提交后不能重复填报，请确认所有员工考勤、兼职工时及兼职用工成本填写无误。"}</p></Modal>
    <Modal title="提交成功" open={successOpen} centered closable={false} maskClosable={false} footer={<Button block type="primary" onClick={() => { setSuccessOpen(false); router.push("/store_h5"); router.refresh(); }}>我知道了</Button>}><div className="store-h5-success"><CheckCircleFilled /><strong>今日考勤已成功上报</strong><span>记录编号：{data.submission?.recordNo}</span><small>创建人：{data.submission?.createdByName}<br />创建时间：{data.submission?.createdAt}</small></div></Modal>
  </main>;
}

"use client";

import { ArrowLeftOutlined, ExclamationCircleOutlined, UserOutlined } from "@ant-design/icons";
import { Alert, Button, Checkbox, DatePicker, Form, Input, Modal, Skeleton, Tag, message } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { PersonnelDetail } from "@/components/personnel-details";

const dateText = (value?: string | null) => value ? dayjs(value).format("YYYY-MM-DD") : "-";
const valueText = (value?: ReactNode) => value === undefined || value === null || value === "" ? "-" : value;
const money = (value?: string | number | null) => value === null || value === undefined ? "-" : `¥${Number(value).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function DetailSection({ title, fields }: { title: string; fields: Array<{ label: string; value: ReactNode; wide?: boolean }> }) {
  return <section className="store-h5-detail-section"><h2>{title}</h2><dl>{fields.map(field => <div className={field.wide ? "wide" : ""} key={field.label}><dt>{field.label}</dt><dd>{valueText(field.value)}</dd></div>)}</dl></section>;
}

type Detail = PersonnelDetail & { dailyLaborCost?: number | null; hourlyLaborCost?: number | null };
type OutstandingReturn = {
  requisitionId: string;
  requisitionNo: string;
  requisitionDate: string;
  itemName: string;
  specification: string | null;
  unit: string;
  requisitionQuantity: number;
  returnedQuantity: number;
  outstandingQuantity: number;
};
type ResignationForm = { resignationDate: Dayjs; reason: string; disablePlatformUser: boolean };

export function StoreH5EmployeeDetail({ personnelId, canResign }: { personnelId: string; canResign: boolean }) {
  const router = useRouter();
  const [resignationForm] = Form.useForm<ResignationForm>();
  const [row, setRow] = useState<Detail>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [resignationOpen, setResignationOpen] = useState(false);
  const [resignationChecking, setResignationChecking] = useState(false);
  const [resignationCheckError, setResignationCheckError] = useState("");
  const [outstandingReturns, setOutstandingReturns] = useState<OutstandingReturn[]>([]);
  const [resigning, setResigning] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/store-h5/my-store/employees/${personnelId}`, { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (response.status === 401) { router.replace("/store_h5/login"); return; }
      if (!response.ok) throw new Error(data?.message || "员工详情加载失败，请稍后重试");
      setRow(data);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "员工详情加载失败，请稍后重试"); }
    finally { setLoading(false); }
  }, [personnelId, router]);
  useEffect(() => { void load(); }, [load]);
  const checkResignation = async () => {
    setResignationChecking(true); setResignationCheckError(""); setOutstandingReturns([]);
    try {
      const response = await fetch(`/api/store-h5/my-store/employees/${personnelId}/resign`, { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (response.status === 401) { router.replace("/store_h5/login"); return; }
      if (!response.ok) throw new Error(data?.message || "离职物品返还情况检查失败，请稍后重试");
      setOutstandingReturns(Array.isArray(data.rows) ? data.rows : []);
      if (!data.canResign && !data.rows?.length) setResignationCheckError("该员工当前状态不能办理离职");
    } catch (reason) {
      setResignationCheckError(reason instanceof Error ? reason.message : "离职物品返还情况检查失败，请稍后重试");
    } finally { setResignationChecking(false); }
  };
  const openResignation = () => {
    resignationForm.setFieldsValue({ resignationDate: dayjs(), reason: "", disablePlatformUser: true });
    setResignationOpen(true);
    void checkResignation();
  };
  const closeResignation = () => {
    if (resigning) return;
    setResignationOpen(false); setResignationCheckError(""); setOutstandingReturns([]); resignationForm.resetFields();
  };
  const resign = async (values: ResignationForm) => {
    if (resigning || resignationChecking || resignationCheckError || outstandingReturns.length) return;
    setResigning(true);
    try {
      const response = await fetch(`/api/store-h5/my-store/employees/${personnelId}/resign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resignationDate: values.resignationDate.format("YYYY-MM-DD"), reason: values.reason, disablePlatformUser: values.disablePlatformUser }),
      });
      const data = await response.json().catch(() => null);
      if (response.status === 401) { router.replace("/store_h5/login"); return; }
      if (!response.ok) {
        if (Array.isArray(data?.outstandingReturns)) {
          setOutstandingReturns(data.outstandingReturns);
          setResignationCheckError("");
          message.error(data?.message || "请先完成离职物品返还");
          return;
        }
        throw new Error(data?.message || "员工离职办理失败，请稍后重试");
      }
      message.success("员工离职办理成功");
      setResignationOpen(false); setResignationCheckError(""); setOutstandingReturns([]); resignationForm.resetFields();
      await load();
    } catch (reason) {
      const text = reason instanceof Error ? reason.message : "员工离职办理失败，请稍后重试";
      setResignationCheckError(text); message.error(text);
    } finally { setResigning(false); }
  };
  return <><main className="store-h5-page store-h5-task-page store-h5-my-store-page">
    <header className="store-h5-subheader"><Button type="text" aria-label="返回员工列表" icon={<ArrowLeftOutlined />} onClick={() => router.push("/store_h5/my-store/employees")} /><div><strong>员工详情</strong><small>{row?.recordNo || "人员档案"}</small></div><span /></header>
    {loading ? <section className="store-h5-task-content"><Skeleton active paragraph={{ rows: 12 }} /></section> : error || !row ? <section className="store-h5-task-content"><Alert type="error" showIcon message={error || "员工详情加载失败"} action={<Button size="small" onClick={() => void load()}>重新加载</Button>} /></section> : <>
      <section className="store-h5-personnel-hero"><span><UserOutlined /></span><div><h1>{row.name}</h1><small>{row.positionLevel} · {row.store?.name || "未安排门店"}</small></div><Tag color={row.status === "ACTIVE" ? "success" : "default"}>{row.status === "ACTIVE" ? "在职" : "离职"}</Tag></section>
      <DetailSection title="基本信息" fields={[{ label: "记录编号", value: row.recordNo }, { label: "姓名", value: row.name }, { label: "手机号", value: row.phone }, { label: "身份证", value: row.idNumber }, { label: "员工生日", value: row.birthday ? `${row.birthdayCalendar === "SOLAR" ? "公历" : "农历"} ${Number(row.birthday.slice(0, 2))}月${Number(row.birthday.slice(3))}日` : "-" }]} />
      <DetailSection title="任职信息" fields={[{ label: "入职时间", value: dateText(row.hireDate) }, { label: "所属岗位星级", value: row.positionLevel }, { label: "人员归属", value: row.organization }, { label: "部门/店面", value: row.organization === "总部" ? row.department : row.store?.name }, { label: "离职日期", value: dateText(row.resignationDate) }, { label: "离职原因", value: row.resignationReason }]} />
      <DetailSection title="合同与联系信息" fields={[{ label: "合同签署日期", value: dateText(row.contractSignDate) }, { label: "合同年限", value: row.contractYears ? `${row.contractYears}年` : "手工到期日" }, { label: "合同到期日", value: dateText(row.contractExpiryDate) }, { label: "家庭住址", value: row.homeAddress, wide: true }, { label: "现住址", value: row.currentAddress, wide: true }]} />
      <DetailSection title="薪资社保与账号" fields={[{ label: "基本工资", value: money(row.baseSalary) }, { label: "用工日成本", value: money(row.dailyLaborCost) }, { label: "用工小时成本", value: money(row.hourlyLaborCost) }, { label: "工作日小时", value: row.store?.workdayHours === null || row.store?.workdayHours === undefined ? "-" : `${Number(row.store.workdayHours)}小时/日` }, { label: "社保情况", value: row.socialSecurity === "INSURED" ? "是" : "已签补充协议" }, { label: "平台权限", value: row.platformAccess === "YES" ? "有" : row.platformAccess === "NO" ? "无" : "-" }, { label: "本平台用户", value: row.platformUser ? `${row.platformUser.username} / ${row.platformUser.realName}` : "-", wide: true }, { label: "需补充材料", value: row.supplementaryMaterial, wide: true }, { label: "备注", value: row.remark, wide: true }]} />
      <section className="store-h5-detail-section"><h2>调薪历史</h2>{row.salaryHistory.length ? <div className="store-h5-history-list">{row.salaryHistory.map(item => <article key={item.id}><strong>{dateText(item.effectiveDate)}</strong><span>{money(item.oldSalary)} → {money(item.newSalary)}</span><p>{item.reason || "-"}</p><small>操作人：{item.operatorName || "-"}</small></article>)}</div> : <p className="store-h5-no-data">暂无调薪记录</p>}</section>
      <section className="store-h5-detail-section"><h2>调岗历史</h2>{row.positionHistory.length ? <div className="store-h5-history-list">{row.positionHistory.map(item => <article key={item.id}><strong>{dateText(item.effectiveDate)}</strong><span>{item.oldOrganization} / {item.oldStoreName} / {item.oldPositionLevel}</span><span>→ {item.newOrganization} / {item.newStoreName} / {item.newPositionLevel}</span><p>{item.reason || "-"}</p><small>操作人：{item.operatorName || "-"}</small></article>)}</div> : <p className="store-h5-no-data">暂无调岗记录</p>}</section>
      <section className="store-h5-detail-section"><h2>创建信息</h2><dl><div><dt>创建人</dt><dd>{row.createdBy?.realName || "-"}</dd></div><div><dt>创建时间</dt><dd>{dayjs(row.createdAt).format("YYYY-MM-DD HH:mm:ss")}</dd></div><div><dt>更新时间</dt><dd>{dayjs(row.updatedAt).format("YYYY-MM-DD HH:mm:ss")}</dd></div></dl></section>
      <div className="store-h5-my-store-bottom store-h5-employee-detail-actions"><Button block size="large" onClick={() => router.push("/store_h5/my-store/employees")}>关闭</Button>{canResign && row.status === "ACTIVE" && <Button block type="text" danger size="large" onClick={openResignation}>离职</Button>}</div>
    </>}
  </main>
  <Modal className="store-h5-resignation-modal" title="员工离职" open={resignationOpen} centered maskClosable={false} closable={!resigning} okText="确认离职" cancelText="取消" confirmLoading={resigning} okButtonProps={{ danger: true, disabled: resignationChecking || Boolean(resignationCheckError) || outstandingReturns.length > 0 }} onCancel={closeResignation} onOk={() => resignationForm.submit()}>
    {row && <Form<ResignationForm> form={resignationForm} layout="vertical" disabled={resigning} onFinish={values => void resign(values)}>
      <Alert type="warning" showIcon icon={<ExclamationCircleOutlined />} message={`${row.name} · ${row.store?.name || "未安排门店"}`} description={row.platformUser ? `该人员已关联平台账号 ${row.platformUser.username}，请确认账号处理方式。` : undefined} />
      <div className="store-h5-resignation-check">
        {resignationChecking ? <Alert type="info" showIcon message="正在检查离职需返还物品，请稍候……" /> : resignationCheckError ? <Alert type="error" showIcon message="暂时不能办理离职" description={resignationCheckError} action={<Button size="small" disabled={resigning} onClick={() => void checkResignation()}>重新检查</Button>} /> : outstandingReturns.length ? <><Alert type="error" showIcon message={`当前有 ${outstandingReturns.length} 项离职需返还物品尚未全部返还`} description="请先在 PC 运营端的人员领用记录中完成物品返还，再重新办理离职。" /><div className="store-h5-outstanding-returns">{outstandingReturns.map(item => <article key={item.requisitionId}><strong>{item.itemName}</strong><small>{item.requisitionNo} · {item.requisitionDate}</small><span>规格：{item.specification || "-"}</span><span>领用 {item.requisitionQuantity}{item.unit}，已返还 {item.returnedQuantity}{item.unit}</span><b>尚未返还 {item.outstandingQuantity}{item.unit}</b></article>)}</div></> : <Alert type="success" showIcon message="未发现尚未返还的离职需返还物品，可以办理离职。" />}
      </div>
      <Form.Item label="离职日期" name="resignationDate" rules={[{ required: true, message: "请选择离职日期" }]}><DatePicker format="YYYY-MM-DD" style={{ width: "100%" }} /></Form.Item>
      <Form.Item label="离职原因" name="reason" rules={[{ required: true, message: "请输入离职原因" }, { max: 200, message: "离职原因不能超过200个字符" }]}><Input.TextArea maxLength={200} showCount autoSize={{ minRows: 3, maxRows: 6 }} /></Form.Item>
      {row.platformUser && <Form.Item name="disablePlatformUser" valuePropName="checked"><Checkbox>同时禁用对应平台用户（推荐）</Checkbox></Form.Item>}
    </Form>}
  </Modal></>;
}

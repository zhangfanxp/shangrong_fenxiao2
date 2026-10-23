"use client";

import { Button, Descriptions, Divider, Empty, Space, Table } from "antd";
import dayjs from "dayjs";
import type { ReactNode } from "react";
import { StatusTag } from "@/components/status-tag";

type PersonnelStore = { id: string; name: string; operationStatus: string; managerName?: string; workdayHours?: number | string | null; brand: { id: string; name: string } };
type PlatformUser = { id: string; username: string; realName: string; role: { name: string } };
type HistorySalary = { id: string; oldSalary: string; newSalary: string; effectiveDate: string; reason: string; operatorName: string; createdAt: string };
type HistoryPosition = { id: string; oldOrganization: string; newOrganization: string; oldStoreName: string; newStoreName: string; oldPositionLevel: string; newPositionLevel: string; effectiveDate: string; reason: string; operatorName: string; createdAt: string };

export type PersonnelDetail = {
  id: string;
  recordNo: string;
  name: string;
  phone: string;
  idNumber: string;
  birthday?: string | null;
  birthdayCalendar?: "LUNAR" | "SOLAR";
  status: "ACTIVE" | "RESIGNED";
  hireDate: string;
  positionLevel: string;
  organization: string;
  department?: string | null;
  storeId?: string | null;
  store?: PersonnelStore | null;
  resignationDate?: string | null;
  resignationReason?: string | null;
  contractSignDate: string | null;
  contractYears?: number | null;
  contractExpiryDate: string | null;
  homeAddress: string | null;
  currentAddress: string;
  supplementaryMaterial?: string | null;
  baseSalary: string;
  laborCost: string;
  dailyLaborCost?: number | null;
  hourlyLaborCost?: number | null;
  workdayHours?: string | null;
  socialSecurity: "INSURED" | "AGREEMENT";
  platformAccess?: "YES" | "NO" | null;
  platformUserId?: string | null;
  platformUser?: PlatformUser | null;
  remark?: string | null;
  version: number;
  salaryHistory: HistorySalary[];
  positionHistory: HistoryPosition[];
  createdBy?: { realName: string } | null;
  createdAt: string;
  updatedAt: string;
};

const dateText = (value?: string | null) => value ? dayjs(value).format("YYYY-MM-DD") : "-";
const valueText = (value?: ReactNode) => value === undefined || value === null || value === "" ? "-" : value;

export function PersonnelDetails({ row, sensitive, onViewLaborCosts }: { row: PersonnelDetail; sensitive: boolean; onViewLaborCosts?: () => void }) {
  const costValue = (value?: number | null) => sensitive ? value === null || value === undefined ? "-" : `¥ ${Number(value).toFixed(2)}` : "******";
  const costField = (value?: number | null) => <Space size={4}><span>{costValue(value)}</span>{onViewLaborCosts && <Button type="link" size="small" onClick={onViewLaborCosts}>查看</Button>}</Space>;
  return <>
    <Descriptions bordered size="small" column={3} items={[
      { key: "record", label: "记录编号", children: row.recordNo },
      { key: "name", label: "姓名", children: row.name },
      { key: "status", label: "人员状态", children: <StatusTag value={row.status === "ACTIVE" ? "ACTIVE_PERSONNEL" : row.status} /> },
      { key: "phone", label: "手机号", children: row.phone },
      { key: "id", label: "身份证", children: row.idNumber },
      { key: "birthday", label: "员工生日", children: row.birthday ? `${row.birthdayCalendar === "SOLAR" ? "公历" : "农历"} ${Number(row.birthday.slice(0, 2))}月${Number(row.birthday.slice(3))}日` : "-" },
    ]} />
    <Divider orientation="left">任职信息</Divider>
    <Descriptions bordered size="small" column={3} items={[
      { key: "hire", label: "入职时间", children: dateText(row.hireDate) },
      { key: "position", label: "所属岗位星级", children: row.positionLevel },
      { key: "organization", label: "人员归属", children: row.organization },
      { key: "store", label: "部门/店面", children: row.organization === "总部" ? row.department || "-" : row.store?.name || "未安排门店" },
      { key: "resign", label: "离职日期", children: dateText(row.resignationDate) },
      { key: "reason", label: "离职原因", children: valueText(row.resignationReason) },
    ]} />
    <Divider orientation="left">合同与联系信息</Divider>
    <Descriptions bordered size="small" column={3} items={[
      { key: "sign", label: "合同签署日期", children: dateText(row.contractSignDate) },
      { key: "years", label: "合同年限", children: row.contractYears ? `${row.contractYears}年` : "手工到期日" },
      { key: "expiry", label: "合同到期日", children: dateText(row.contractExpiryDate) },
      { key: "home", label: "家庭住址", span: 3, children: valueText(row.homeAddress) },
      { key: "current", label: "现住址", span: 3, children: valueText(row.currentAddress) },
    ]} />
    <Divider orientation="left">薪资社保与账号</Divider>
    <Descriptions bordered size="small" column={3} items={[
      { key: "salary", label: "基本工资", children: sensitive ? `¥ ${Number(row.baseSalary).toFixed(2)}` : "******" },
      { key: "dailyLaborCost", label: "用工日成本", children: costField(row.dailyLaborCost) },
      { key: "hourlyLaborCost", label: "用工小时成本", children: costField(row.hourlyLaborCost) },
      { key: "workdayHours", label: "工作日小时", children: row.store?.workdayHours === null || row.store?.workdayHours === undefined ? "-" : `${Number(row.store.workdayHours)}小时/日` },
      { key: "social", label: "社保情况", children: row.socialSecurity === "INSURED" ? "是" : "已签补充协议" },
      { key: "platform", label: "平台权限", children: row.platformAccess === "YES" ? "有" : row.platformAccess === "NO" ? "无" : "-" },
      { key: "user", label: "本平台用户", children: row.platformUser ? `${row.platformUser.username} / ${row.platformUser.realName}` : "-" },
      { key: "material", label: "需补充材料", children: valueText(row.supplementaryMaterial) },
      { key: "remark", label: "备注", children: valueText(row.remark) },
    ]} />
    <Divider orientation="left">调薪历史</Divider>
    {row.salaryHistory.length ? <Table size="small" pagination={false} rowKey="id" dataSource={row.salaryHistory} columns={[
      { title: "生效日期", dataIndex: "effectiveDate", render: dateText },
      { title: "原工资", dataIndex: "oldSalary", render: value => sensitive ? `¥${Number(value).toFixed(2)}` : "******" },
      { title: "新工资", dataIndex: "newSalary", render: value => sensitive ? `¥${Number(value).toFixed(2)}` : "******" },
      { title: "原因", dataIndex: "reason" },
      { title: "操作人", dataIndex: "operatorName" },
    ]} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无调薪记录" />}
    <Divider orientation="left">调岗历史</Divider>
    {row.positionHistory.length ? <Table size="small" pagination={false} rowKey="id" dataSource={row.positionHistory} columns={[
      { title: "生效日期", dataIndex: "effectiveDate", render: dateText },
      { title: "原任职信息", render: (_, item) => `${item.oldOrganization} / ${item.oldStoreName} / ${item.oldPositionLevel}` },
      { title: "新任职信息", render: (_, item) => `${item.newOrganization} / ${item.newStoreName} / ${item.newPositionLevel}` },
      { title: "原因", dataIndex: "reason" },
      { title: "操作人", dataIndex: "operatorName" },
    ]} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无调岗记录" />}
  </>;
}

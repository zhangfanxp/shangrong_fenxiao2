"use client";

import { Alert, Button, Descriptions, Modal, Select, Skeleton, Space, Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useMemo, useState } from "react";

export type PersonnelLaborCostSource = {
  personnelId?: string;
  draft?: {
    name?: string;
    phone?: string;
    baseSalary?: number | null;
    positionLevel?: string;
    organization?: string;
    storeId?: string | null;
    hireDate?: string | null;
    resignationDate?: string | null;
  };
};

export type PersonnelLaborCostRow = {
  month: number;
  daysInMonth: number;
  monthlyRestDays: number;
  legalRestDays: number;
  overlappingRestDays: number;
  payableDays: number;
  dailyLaborCost: number | null;
  hourlyLaborCost: number | null;
};

export type PersonnelLaborCostReport = {
  year: number;
  name: string;
  phone: string;
  baseSalary: number | null;
  positionLevel: string;
  storeName: string | null;
  workdayHours: number | null;
  rows: PersonnelLaborCostRow[];
};

const currentYear = new Date().getFullYear();
const yearOptions = [
  ...Array.from({ length: Math.max(0, currentYear - 2026 + 1) }, (_, index) => currentYear - index),
  ...Array.from({ length: Math.max(0, 2096 - currentYear) }, (_, index) => currentYear + index + 1),
].map(value => ({ value, label: `${value}年` }));

export async function requestPersonnelLaborCosts(source: PersonnelLaborCostSource, year: number, signal?: AbortSignal) {
  const response = await fetch("/api/personnel/labor-costs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...source, year }),
    signal,
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof result?.message === "string" ? result.message : "用工成本加载失败，请稍后重试");
  return result as PersonnelLaborCostReport;
}

const money = (value: number | null) => value === null ? "-" : `¥ ${value.toFixed(2)}`;

export function PersonnelLaborCostModal({ source, onClose }: { source: PersonnelLaborCostSource | null; onClose: () => void }) {
  const [year, setYear] = useState(currentYear);
  const [data, setData] = useState<PersonnelLaborCostReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!source) return;
    setLoading(true); setError(null);
    try { setData(await requestPersonnelLaborCosts(source, year, signal)); }
    catch (reason) { if (!(reason instanceof DOMException && reason.name === "AbortError")) { setData(null); setError(reason instanceof Error ? reason.message : "用工成本加载失败，请稍后重试"); } }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [source, year]);

  useEffect(() => {
    if (!source) return;
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, source]);

  useEffect(() => { if (source) setYear(currentYear); }, [source]);

  const columns = useMemo<ColumnsType<PersonnelLaborCostRow>>(() => [
    { title: "月份", dataIndex: "month", width: 80, render: value => `${value}月` },
    { title: "天数", dataIndex: "daysInMonth", width: 80 },
    { title: "每月公休数", dataIndex: "monthlyRestDays", width: 110 },
    { title: "法定假期数", dataIndex: "legalRestDays", width: 110 },
    { title: "重合去重", dataIndex: "overlappingRestDays", width: 100, render: value => value ? `${value}天` : "-" },
    { title: "计薪天数", dataIndex: "payableDays", width: 100 },
    { title: "用工日成本", dataIndex: "dailyLaborCost", width: 135, align: "right", render: money },
    { title: "用工小时成本", dataIndex: "hourlyLaborCost", width: 145, align: "right", render: money },
  ], []);

  return <Modal title="查看用工成本" width={900} open={Boolean(source)} onCancel={onClose} destroyOnHidden footer={<Button onClick={onClose}>关闭</Button>}>
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Space><span>所属年份：</span><Select value={year} options={yearOptions} showSearch optionFilterProp="label" style={{ width: 140 }} onChange={setYear} /></Space>
      {loading && !data ? <Skeleton active paragraph={{ rows: 8 }} /> : error ? <Alert type="error" showIcon message="用工成本加载失败" description={error} action={<Button size="small" onClick={() => void load()}>重新加载</Button>} /> : data && <>
        <Descriptions bordered size="small" column={3} items={[
          { key: "name", label: "员工姓名", children: data.name || "-" },
          { key: "phone", label: "手机号码", children: data.phone || "-" },
          { key: "position", label: "岗位星级", children: data.positionLevel || "-" },
          { key: "salary", label: "基本工资", children: data.baseSalary === null ? "-" : money(data.baseSalary) },
          { key: "store", label: "关联门店", children: data.storeName || "-" },
          { key: "hours", label: "工作日小时", children: data.workdayHours === null ? "-" : `${data.workdayHours}小时/日` },
        ]} />
        <Alert type="info" showIcon message="每月成本按该月最后一日已生效的基本工资和人员归属计算；公休及法定假期采用该月已生效的系统参数版本。" />
        {data.workdayHours === null && <Alert type="warning" showIcon message="当前人员未关联含工作日小时的门店，用工小时成本暂无法计算。" />}
        <Table<PersonnelLaborCostRow> rowKey="month" size="small" loading={loading} columns={columns} dataSource={data.rows} pagination={false} scroll={{ x: 960 }} />
      </>}
    </Space>
  </Modal>;
}

"use client";
import { DeleteOutlined, WarningOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Input, Modal, Space, Table, Tag, Typography } from "antd";
import { useState } from "react";
import { businessDataTargets, businessDataTargetValues, type BusinessDataTarget } from "@/lib/business-data-targets";

type ClearResult = {
  targetLabels: string[];
  tables: { key: string; label: string; count: number }[];
  totalCount: number;
};

export function ClearBusinessData() {
  const [selected, setSelected] = useState<BusinessDataTarget[]>([]);
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [clearError, setClearError] = useState("");
  const [result, setResult] = useState<ClearResult | null>(null);
  const selectedTargets = businessDataTargets.filter(target => selected.includes(target.value));
  const recordTargetValues = businessDataTargets.filter(target => target.kind === "业务记录").map(target => target.value);

  const openConfirmation = () => {
    setClearError("");
    setConfirmOpen(true);
  };

  const clear = async () => {
    setLoading(true);
    setClearError("");
    try {
      const response = await fetch("/api/settings/clear-business-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targets: selected, confirmation }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || "业务数据清空失败，请稍后重试");
      if (!data || !Array.isArray(data.targetLabels) || !Array.isArray(data.tables) || typeof data.totalCount !== "number") {
        throw new Error("业务数据已提交清理，但未能读取清理结果，请刷新页面后核对");
      }
      setConfirmOpen(false);
      setResult({ targetLabels: data.targetLabels, tables: data.tables, totalCount: data.totalCount });
      setSelected([]);
      setConfirmation("");
    } catch (error) {
      setClearError(error instanceof Error ? error.message : "业务数据清空失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  return <>
    <Alert type="error" showIcon message="高风险操作" description="清空后的数据库记录无法通过系统直接恢复。请先完成数据库备份。涉及附件、课件、录音等 R2 对象文件不会被本页面删除；清理的是数据库记录及其对象关联信息。" style={{ marginBottom: 16 }} />
    <Card title="选择需要清空的业务数据">
      <Alert
        type="info"
        showIcon
        message="按当前系统功能及数据库模型分组"
        description="表名采用 Prisma 数据模型名称；“主要字段”列展示关键业务字段（非字段全集）。每日销售、微信新增、线上团购、百日筑基等任务型上报数据保存在任务提交记录中。系统账号、角色、品牌、字典、业务数据源、休息日、用工标准、R2 配置及备份设置不属于本页清理范围。"
        style={{ marginBottom: 16 }}
      />
      <div style={{ marginBottom: 12 }}>
        <Space wrap>
          <Button type="primary" ghost onClick={() => setSelected([...recordTargetValues])}>仅选业务记录</Button>
          <Button onClick={() => setSelected([...businessDataTargetValues])}>全选</Button>
          <Button disabled={!selected.length} onClick={() => setSelected([])}>清空选择</Button>
          <span style={{ color: "rgba(0,0,0,.45)" }}>已选择 {selected.length} 项</span>
        </Space>
      </div>
      <Table
        rowKey="value"
        size="small"
        pagination={false}
        scroll={{ x: 1760 }}
        dataSource={[...businessDataTargets]}
        rowSelection={{
          selectedRowKeys: selected,
          onChange: keys => setSelected(keys as BusinessDataTarget[]),
        }}
        columns={[
          { title: "功能", dataIndex: "module", key: "module", width: 80 },
          { title: "清空项目", dataIndex: "label", key: "label", width: 210 },
          { title: "数据类型", dataIndex: "kind", key: "kind", width: 110, render: (kind: string) => <Tag color={kind === "设置/模板" ? "orange" : kind === "业务记录" ? "blue" : "default"}>{kind}</Tag> },
          { title: "涉及的数据表/模型", dataIndex: "tables", key: "tables", width: 440, render: (tables: readonly string[]) => <Space size={[0, 4]} wrap>{tables.map(table => <Tag key={table}>{table}</Tag>)}</Space> },
          { title: "主要字段（示例）", dataIndex: "fields", key: "fields", width: 500, render: (fields: readonly string[]) => <Typography.Text type="secondary" style={{ whiteSpace: "normal", overflowWrap: "anywhere" }}>{fields.join("、")}</Typography.Text> },
          { title: "清空说明及关联影响", dataIndex: "description", key: "description", width: 410 },
        ]}
      />
      <div style={{ borderTop: "1px solid #f0f0f0", marginTop: 24, paddingTop: 20, maxWidth: 480 }}>
        <div style={{ marginBottom: 8 }}>请输入“确认清空”以继续</div>
        <Input value={confirmation} onChange={event => setConfirmation(event.target.value)} placeholder="确认清空" />
        <Button danger type="primary" icon={<DeleteOutlined />} disabled={!selected.length || confirmation !== "确认清空"} onClick={openConfirmation} style={{ marginTop: 16 }}>清空所选业务数据</Button>
      </div>
    </Card>
    <Modal
      open={confirmOpen}
      width={820}
      title={<Space><WarningOutlined style={{ color: "#ff4d4f" }} />二次确认：清空业务数据</Space>}
      okText="确认清空"
      cancelText="取消"
      okButtonProps={{ danger: true }}
      confirmLoading={loading}
      closable={!loading}
      maskClosable={false}
      onCancel={() => { if (!loading) setConfirmOpen(false); }}
      onOk={clear}
    >
      <Alert type="warning" showIcon message="此操作不可撤销，请再次核对清空范围" style={{ marginBottom: 16 }} />
      <div>将清空以下 <b>{selectedTargets.length}</b> 项数据：</div>
      <ul style={{ margin: "12px 0 16px", paddingLeft: 24 }}>
        {selectedTargets.map(target => <li key={target.value} style={{ marginBottom: 10 }}>
          <b>{target.label}</b>
          <div><Typography.Text type="secondary">数据表：{target.tables.join("、")}</Typography.Text></div>
          <div><Typography.Text type="secondary">主要字段：{target.fields.join("、")}</Typography.Text></div>
        </li>)}
      </ul>
      <div style={{ color: "rgba(0,0,0,.65)" }}>仅清理所选范围。未勾选数据，以及系统账号、角色、品牌、数据字典、业务数据源、休息日、用工标准、R2 配置和数据库备份配置均保留；R2 对象文件不会删除。</div>
      {clearError && <Alert type="error" showIcon message="清空失败" description={clearError} style={{ marginTop: 16 }} />}
    </Modal>
    <Modal
      open={Boolean(result)}
      title="业务数据清空完成"
      width={620}
      footer={<Button type="primary" onClick={() => setResult(null)}>知道了</Button>}
      closable={false}
      maskClosable={false}
    >
      {result && <>
        <Alert
          type="success"
          showIcon
          message={`共清空 ${result.totalCount} 条数据记录`}
          description={`本次选择：${result.targetLabels.join("、")}；涉及 ${result.tables.length} 张数据表。`}
          style={{ marginBottom: 16 }}
        />
        <Table
          rowKey="key"
          size="small"
          pagination={false}
          scroll={{ y: 360 }}
          dataSource={result.tables}
          columns={[
            { title: "数据表", dataIndex: "label", key: "label" },
            { title: "清空记录数", dataIndex: "count", key: "count", width: 130, align: "right", render: (count: number) => `${count} 条` },
          ]}
        />
      </>}
    </Modal>
  </>;
}

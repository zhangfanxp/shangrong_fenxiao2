"use client";
import { DeleteOutlined, WarningOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Input, Modal, Space, Table, Tag } from "antd";
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
    <Alert type="error" showIcon message="高风险操作" description="清空后的业务数据无法通过系统直接恢复。请在确认数据无误并完成必要备份后再进行操作。" style={{ marginBottom: 16 }} />
    <Card title="选择需要清空的业务数据">
      <Alert
        type="info"
        showIcon
        message="设置/模版与实际业务记录已分开"
        description="日常清理建议使用“仅选业务记录”，不会删除已配置好的任务、考核、调研、学习计划和课程设置。"
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
        scroll={{ x: 1180 }}
        dataSource={[...businessDataTargets]}
        rowSelection={{
          selectedRowKeys: selected,
          onChange: keys => setSelected(keys as BusinessDataTarget[]),
        }}
        columns={[
          { title: "功能", dataIndex: "module", key: "module", width: 80 },
          { title: "清空项目", dataIndex: "label", key: "label", width: 210 },
          { title: "数据类型", dataIndex: "kind", key: "kind", width: 110, render: (kind: string) => <Tag color={kind === "设置/模板" ? "orange" : kind === "业务记录" ? "blue" : "default"}>{kind}</Tag> },
          { title: "包含的数据表", dataIndex: "tables", key: "tables", width: 390, render: (tables: readonly string[]) => <Space size={[0, 4]} wrap>{tables.map(table => <Tag key={table}>{table}</Tag>)}</Space> },
          { title: "清空说明", dataIndex: "description", key: "description", width: 390 },
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
        {selectedTargets.map(target => <li key={target.value}><b>{target.label}</b>（{target.tables.join("、")}）</li>)}
      </ul>
      <div style={{ color: "rgba(0,0,0,.65)" }}>未勾选的设置/模版，以及系统账号、角色、品牌、数据字典、R2 和数据库备份配置会保留。</div>
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

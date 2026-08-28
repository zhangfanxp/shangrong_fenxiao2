"use client";
import { DeleteOutlined, WarningOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Checkbox, Input, Modal, Space, Table } from "antd";
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
  const allSelected = selected.length === businessDataTargetValues.length;
  const partiallySelected = selected.length > 0 && !allSelected;
  const selectedLabels = businessDataTargets.filter(target => selected.includes(target.value)).map(target => target.label);

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
      <div style={{ paddingBottom: 12, marginBottom: 16, borderBottom: "1px solid #f0f0f0" }}>
        <Checkbox
          checked={allSelected}
          indeterminate={partiallySelected}
          onChange={event => setSelected(event.target.checked ? [...businessDataTargetValues] : [])}
        >全选</Checkbox>
      </div>
      <Checkbox.Group value={selected} onChange={values => setSelected(values as BusinessDataTarget[])} style={{ width: "100%" }}>
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          {businessDataTargets.map(option => <Checkbox value={option.value} key={option.value}>
            <span>{option.label}</span>
            <span style={{ display: "block", color: "rgba(0,0,0,.45)", marginTop: 4, marginLeft: 24 }}>{option.description}</span>
          </Checkbox>)}
        </Space>
      </Checkbox.Group>
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
      <div>将清空以下 <b>{selectedLabels.length}</b> 类业务数据：</div>
      <ul style={{ margin: "12px 0 16px", paddingLeft: 24 }}>
        {selectedLabels.map(label => <li key={label}>{label}</li>)}
      </ul>
      <div style={{ color: "rgba(0,0,0,.65)" }}>系统账号、角色、品牌、数据字典及各类业务模版会保留。</div>
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
          message={`共清空 ${result.totalCount} 条业务记录`}
          description={`本次选择：${result.targetLabels.join("、")}；涉及 ${result.tables.length} 张业务表。`}
          style={{ marginBottom: 16 }}
        />
        <Table
          rowKey="key"
          size="small"
          pagination={false}
          scroll={{ y: 360 }}
          dataSource={result.tables}
          columns={[
            { title: "业务表", dataIndex: "label", key: "label" },
            { title: "清空记录数", dataIndex: "count", key: "count", width: 130, align: "right", render: (count: number) => `${count} 条` },
          ]}
        />
      </>}
    </Modal>
  </>;
}

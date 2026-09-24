"use client";

import { BookOutlined, EyeOutlined, ReloadOutlined } from "@ant-design/icons";
import { Alert, Button, Descriptions, Input, Modal, Space, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useMemo, useState } from "react";
import { DataTable } from "@/components/data-table";

type DictionaryField = {
  name: string;
  chineseName: string;
  type: string;
  meaning: string;
  primaryKey: boolean;
  indexes: string[];
};

type DictionaryTable = {
  name: string;
  chineseName: string;
  purpose: string;
  fields: DictionaryField[];
};

type DictionaryResponse = {
  source: string;
  updatedAt: string;
  tableCount: number;
  fieldCount: number;
  tables: DictionaryTable[];
  message?: string;
};

function formatUpdatedAt(value?: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).format(new Date(value)).replaceAll("/", "-");
}

export function DatabaseDictionaryButton() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dictionary, setDictionary] = useState<DictionaryResponse>();
  const [keyword, setKeyword] = useState("");
  const [selectedTable, setSelectedTable] = useState<DictionaryTable>();

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/settings/database-backups/dictionary", { cache: "no-store" });
      const data = await response.json().catch(() => ({})) as Partial<DictionaryResponse>;
      if (!response.ok) throw new Error(data.message || "数据库数据字典加载失败，请稍后重试");
      setDictionary(data as DictionaryResponse);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "数据库数据字典加载失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  const show = () => {
    setOpen(true);
    setKeyword("");
    void load();
  };

  const tables = useMemo(() => {
    const normalized = keyword.trim().toLowerCase();
    if (!normalized) return dictionary?.tables || [];
    return (dictionary?.tables || []).filter(table => [table.name, table.chineseName, table.purpose].some(value => value.toLowerCase().includes(normalized)));
  }, [dictionary, keyword]);

  const tableColumns: ColumnsType<DictionaryTable> = [
    { title: "表的英文名", dataIndex: "name", width: 240, render: value => <Typography.Text code copyable={{ text: value }}>{value}</Typography.Text> },
    { title: "中文名", dataIndex: "chineseName", width: 190 },
    { title: "表的作用", dataIndex: "purpose", ellipsis: { showTitle: false }, render: value => <Typography.Paragraph ellipsis={{ rows: 2, tooltip: value }} style={{ marginBottom: 0 }}>{value}</Typography.Paragraph> },
    { title: "操作", fixed: "right", width: 110, render: (_, record) => <Button type="link" icon={<EyeOutlined />} onClick={() => setSelectedTable(record)}>查看字段</Button> },
  ];

  const fieldColumns: ColumnsType<DictionaryField> = [
    { title: "字段英文名", dataIndex: "name", width: 220, render: value => <Typography.Text code copyable={{ text: value }}>{value}</Typography.Text> },
    { title: "中文名", dataIndex: "chineseName", width: 180 },
    { title: "字段类型", dataIndex: "type", width: 220, render: value => <Typography.Text code>{value}</Typography.Text> },
    { title: "字段存储的数据内容（意义）", dataIndex: "meaning", width: 360 },
    { title: "是否主键", dataIndex: "primaryKey", width: 100, align: "center", render: value => value ? <Tag color="gold">是</Tag> : <Tag>否</Tag> },
    { title: "索引", dataIndex: "indexes", width: 300, render: (indexes: string[]) => indexes.length ? <Space size={[4, 4]} wrap>{indexes.map(index => <Tag key={index} color={index.startsWith("唯一") ? "purple" : "blue"}>{index}</Tag>)}</Space> : "—" },
  ];

  const close = () => {
    setOpen(false);
    setSelectedTable(undefined);
  };

  return <>
    <Button icon={<BookOutlined />} onClick={show}>数据库数据字典</Button>
    <Modal
      className="database-dictionary-modal"
      title="查看-数据字典"
      open={open}
      width={1120}
      onCancel={close}
      footer={<Button onClick={close}>关闭</Button>}
      destroyOnHidden
    >
      {error && <Alert type="error" showIcon message={error} action={<Button size="small" icon={<ReloadOutlined />} onClick={() => void load()}>重新加载</Button>} />}
      {!error && <>
        <div className="database-dictionary-summary">
          <Space size={16} wrap>
            <span>数据表：<strong>{dictionary?.tableCount ?? 0}</strong> 张</span>
            <span>字段：<strong>{dictionary?.fieldCount ?? 0}</strong> 个</span>
            <span>来源：<Typography.Text code>{dictionary?.source || "db_dict.md"}</Typography.Text></span>
            <span>文件更新时间：{formatUpdatedAt(dictionary?.updatedAt)}</span>
          </Space>
          <Input.Search allowClear value={keyword} onChange={event => setKeyword(event.target.value)} placeholder="搜索英文表名、中文名或作用" style={{ width: 320 }} />
        </div>
        <DataTable<DictionaryTable>
          rowKey="name"
          columns={tableColumns}
          dataSource={tables}
          loading={loading}
          scroll={{ x: 980, y: 520 }}
          pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100], showTotal: total => `共 ${total} 张表` }}
        />
      </>}
    </Modal>

    <Modal
      className="database-dictionary-fields-modal"
      title="查看-表字段"
      open={Boolean(selectedTable)}
      width={1380}
      zIndex={1100}
      onCancel={() => setSelectedTable(undefined)}
      footer={<Button onClick={() => setSelectedTable(undefined)}>关闭</Button>}
      destroyOnHidden
    >
      {selectedTable && <>
        <Descriptions bordered size="small" column={1} className="database-dictionary-table-info">
          <Descriptions.Item label="当前表格名称"><Typography.Text code>{selectedTable.name}</Typography.Text>（{selectedTable.chineseName}）</Descriptions.Item>
          <Descriptions.Item label="表格信息">{selectedTable.purpose}</Descriptions.Item>
          <Descriptions.Item label="字段数量">{selectedTable.fields.length} 个</Descriptions.Item>
        </Descriptions>
        <DataTable<DictionaryField>
          rowKey="name"
          columns={fieldColumns}
          dataSource={selectedTable.fields}
          scroll={{ x: 1380, y: 500 }}
          pagination={false}
        />
      </>}
    </Modal>
  </>;
}

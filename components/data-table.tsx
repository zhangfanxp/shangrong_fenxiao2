"use client";
import { ReloadOutlined } from "@ant-design/icons";
import { Alert, Button, Empty, Table } from "antd";
import type { TableProps } from "antd";

export function DataTable<T extends object>({ error, onRetry, ...props }: TableProps<T> & { error?: boolean; onRetry?: () => void }) {
  if (error) return <Alert type="error" showIcon message="数据加载失败，请稍后重试" action={<Button size="small" onClick={onRetry} icon={<ReloadOutlined />}>重新加载</Button>} />;
  return <Table<T> size="middle" scroll={{ x: 1100 }} locale={{ emptyText: <Empty description="暂无数据" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }} {...props} />;
}

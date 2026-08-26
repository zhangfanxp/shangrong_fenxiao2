"use client";

import { Alert, Card, Form, Input, Modal, Skeleton, Space, Tag, Typography } from "antd";
import { useEffect, useMemo } from "react";

type Item = { id: string; section: string; subSection: string; label: string; component: "input"; required: boolean };
export type ResearchTemplatePreviewConfig = {
  recordNo: string;
  templateType: string;
  brands: string[];
  status: "已启用" | "已禁用";
  configVersion: number;
  items: Item[];
};

export function ResearchTemplatePreviewModal({ open, loading, config, onClose }: { open: boolean; loading: boolean; config: ResearchTemplatePreviewConfig | null; onClose: () => void }) {
  const [form] = Form.useForm();
  useEffect(() => { if (open) form.resetFields(); }, [open, config?.configVersion]);
  const groups = useMemo(() => {
    const sections = new Map<string, Map<string, Item[]>>();
    for (const item of config?.items || []) {
      if (!sections.has(item.section)) sections.set(item.section, new Map());
      const subsections = sections.get(item.section)!;
      if (!subsections.has(item.subSection)) subsections.set(item.subSection, []);
      subsections.get(item.subSection)!.push(item);
    }
    return Array.from(sections, ([name, subsections]) => ({ name, subsections: Array.from(subsections, ([name, items]) => ({ name, items })) }));
  }, [config]);

  return <Modal title="调研模版预览" open={open} width={1000} onCancel={onClose} okText="关闭" onOk={onClose} cancelButtonProps={{ style: { display: "none" } }} destroyOnHidden maskClosable={false} styles={{ body: { maxHeight: "72vh", overflowY: "auto" } }}>
    {loading ? <Skeleton active paragraph={{ rows: 10 }} /> : !config ? <Alert type="error" showIcon message="调研配置文件加载失败" /> : <>
      <div className="research-preview-summary"><div><Typography.Title level={4} style={{ margin: 0 }}>{config.templateType}</Typography.Title><Space wrap style={{ marginTop: 8 }}><Tag>记录编号 {config.recordNo}</Tag><Tag color="blue">配置版本 v{config.configVersion}</Tag>{config.brands.map(brand => <Tag color="cyan" key={brand}>{brand}</Tag>)}</Space></div></div>
      <Form form={form} layout="vertical">
        {groups.map(section => <Card key={section.name} size="small" title={section.name} className="research-preview-section">
          {section.subsections.map(subsection => <section key={`${section.name}-${subsection.name}`} className="research-preview-subsection"><h4>{subsection.name}</h4><div className="research-preview-grid">
            {subsection.items.map(item => <Form.Item key={item.id} name={item.id} label={item.label} rules={item.required ? [{ required: true, message: `请输入${item.label}` }] : undefined} required={item.required}><Input placeholder="请输入" /></Form.Item>)}
          </div></section>)}
        </Card>)}
      </Form>
      <Alert showIcon type="info" message="预览输入仅用于验证模版效果，关闭后不会保存，也不会产生正式调研记录。" />
    </>}
  </Modal>;
}

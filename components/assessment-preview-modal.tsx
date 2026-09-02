"use client";

import { Alert, Card, InputNumber, Modal, Radio, Skeleton, Space, Table, Tag, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";

type Item = { id: string; description: string; breachAmount?: string; maxScore: number; supportsPhoto?: boolean };
type Section = { name: string; children: { name: string; items: Item[] }[] };
export type AssessmentPreviewConfig = {
  reviewName: string;
  assessmentType?: string;
  scoreMode: "BINARY" | "CUSTOM_SCORE";
  scoreModeLabel: string;
  configVersion: number;
  totalScore: number;
  photoAttachmentLimit?: number;
  photoStorage?: { id: string; name: string };
  sections: Section[];
};
type Result = "PASS" | "PARTIAL" | "FAIL";
type ScoreState = Record<string, { result?: Result; score: number | null }>;

export function AssessmentPreviewModal({ open, loading, config, onClose }: { open: boolean; loading: boolean; config: AssessmentPreviewConfig | null; onClose: () => void }) {
  const [scores, setScores] = useState<ScoreState>({});
  useEffect(() => { if (open) setScores({}); }, [open, config?.configVersion]);
  const currentScore = useMemo(() => Math.round(Object.values(scores).reduce((sum, value) => sum + (value.score || 0), 0) * 10) / 10, [scores]);
  const choose = (item: Item, result: Result) => setScores(previous => ({ ...previous, [item.id]: { result, score: result === "PASS" ? item.maxScore : result === "FAIL" ? 0 : null } }));
  const setPartialScore = (item: Item, value: number | null) => setScores(previous => ({ ...previous, [item.id]: { result: "PARTIAL", score: value } }));

  return <Modal title="考核表预览" open={open} width={1200} onCancel={onClose} okText="关闭" onOk={onClose} cancelButtonProps={{ style: { display: "none" } }} destroyOnHidden maskClosable={false} styles={{ body: { maxHeight: "72vh", overflowY: "auto" } }}>
    {loading ? <Skeleton active paragraph={{ rows: 10 }} /> : !config ? <Alert type="error" showIcon message="考核明细配置加载失败" /> : <>
      <div className="assessment-preview-summary">
        <div><Typography.Title level={4} style={{ margin: 0 }}>{config.reviewName}</Typography.Title><Space style={{ marginTop: 8 }} wrap><Tag color="blue">{config.scoreModeLabel}</Tag><Tag>配置版本 v{config.configVersion}</Tag><Tag color="cyan">拍照项每项最多 {config.photoAttachmentLimit || 3} 张</Tag>{config.photoStorage?.name && <Tag color="purple">存储空间：{config.photoStorage.name}</Tag>}<span>总分：<b>{config.totalScore}</b></span></Space></div>
        <div className="assessment-preview-score"><span>当前得分</span><strong>{currentScore}</strong><span>/ {config.totalScore}</span></div>
      </div>
      {config.sections.map(section => <Card key={section.name} size="small" title={section.name} className="assessment-preview-section">
        {section.children.map(subsection => <div key={`${section.name}-${subsection.name}`} className="assessment-preview-subsection">
          {config.assessmentType !== "门店信用评分" && <h4>{subsection.name}</h4>}
          <Table<Item> rowKey="id" size="small" pagination={false} dataSource={subsection.items} scroll={{ x: 800 }} columns={[
            { title: config.assessmentType === "门店信用评分" ? "违约项目" : "检查明细", dataIndex: "description", minWidth: 360 },
            ...(config.assessmentType === "门店信用评分" ? [{ title: "违约金额", dataIndex: "breachAmount" as const, width: 130, align: "center" as const }] : []),
            { title: "分值", dataIndex: "maxScore", width: 80, align: "center" },
            { title: "拍照", dataIndex: "supportsPhoto", width: 105, align: "center", render: value => value ? <Tag color="green">支持拍照</Tag> : <Tag>不支持</Tag> },
            { title: "评分结果", width: config.scoreMode === "CUSTOM_SCORE" ? 300 : 210, render: (_, item) => <Radio.Group value={scores[item.id]?.result} onChange={event => choose(item, event.target.value)}><Radio value="PASS">合格</Radio>{config.scoreMode === "CUSTOM_SCORE" && <Radio value="PARTIAL" disabled={item.maxScore <= 0.1}>部分合格</Radio>}<Radio value="FAIL">不合格</Radio></Radio.Group> },
            { title: "得分", width: 145, render: (_, item) => {
              const value = scores[item.id]; const partial = value?.result === "PARTIAL"; const invalid = partial && (value.score == null || value.score <= 0 || value.score >= item.maxScore || Math.round(value.score * 10) !== value.score * 10);
              return <div><InputNumber aria-label={`${item.description}得分`} value={value?.score} disabled={!partial} min={0.1} max={Math.max(0.1, item.maxScore - 0.1)} step={0.1} precision={1} status={invalid ? "error" : undefined} onChange={next => setPartialScore(item, next)} style={{ width: 100 }} />{invalid && <div className="assessment-score-error">须大于0且小于{item.maxScore}</div>}</div>;
            } },
          ]} />
        </div>)}
      </Card>)}
      <Alert showIcon type="info" message="预览评分仅用于测试配置效果，关闭后不会保存，也不会产生正式考核记录。" />
    </>}
  </Modal>;
}

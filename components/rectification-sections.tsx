"use client";

import { Empty, Image, Tag } from "antd";
import { RECTIFICATION_DEADLINES, rectificationDateTime, rectificationIsOverdue, type RectificationInspection, type RectificationPhoto, type RectificationRoundDetail } from "@/lib/inspection-rectification-shared";

export function RectificationPhotos({ photos }: { photos: RectificationPhoto[] }) {
  if (!photos.length) return <span className="rectification-muted">暂无照片</span>;
  return <Image.PreviewGroup><div className="rectification-photos">{photos.map(photo => photo.url
    ? <Image key={photo.id} width={88} height={88} style={{ objectFit: "cover" }} src={photo.url} alt={photo.name} />
    : <span key={photo.id} className="rectification-photo-error">{photo.name}<small>照片暂不可用，请刷新重试</small></span>)}</div></Image.PreviewGroup>;
}

export function RectificationInspectionSection({ inspection }: { inspection: RectificationInspection }) {
  return <section className="rectification-section"><h2>巡检详情</h2><dl>
    <div><dt>记录编号</dt><dd>{inspection.recordNo}</dd></div>
    <div><dt>巡检日期</dt><dd>{rectificationDateTime(inspection.assessmentDate)}</dd></div>
    <div><dt>巡检人</dt><dd>{inspection.reviewerName}</dd></div>
    <div><dt>门店名称</dt><dd>{inspection.brandName}|{inspection.storeName}</dd></div>
    <div><dt>检查表</dt><dd>{inspection.assessmentName}</dd></div>
    <div><dt>总项&amp;子项</dt><dd>{inspection.sectionName} / {inspection.subsectionName || "-"}</dd></div>
    <div><dt>检查明细项</dt><dd>{inspection.itemDescription}</dd></div>
    <div><dt>检查结果</dt><dd><Tag color={inspection.result === "FAIL" ? "error" : "warning"}>{inspection.result === "FAIL" ? "不合格" : "部分合格"}</Tag></dd></div>
    <div><dt>问题描述</dt><dd>{inspection.problemDescription || "-"}</dd></div>
    <div className="rectification-full-field"><dt>问题照片</dt><dd><RectificationPhotos photos={inspection.photos} /></dd></div>
  </dl></section>;
}

export function RectificationRequirementSection({ round }: { round: RectificationRoundDetail }) {
  const overdue = rectificationIsOverdue(round.dueAt, round.submittedAt);
  return <section className="rectification-section"><h2>整改要求 <small>第{round.roundNumber}轮</small></h2><dl>
    <div><dt>生成时间</dt><dd>{rectificationDateTime(round.generatedAt)}</dd></div>
    <div><dt>时间节点</dt><dd>{RECTIFICATION_DEADLINES.find(option => option.value === round.deadlineHours)?.label || "-"}</dd></div>
    <div><dt>截止时间</dt><dd>{rectificationDateTime(round.dueAt)}</dd></div>
    <div><dt>责任人</dt><dd>{round.responsibleName}</dd></div>
    <div><dt>整改要求</dt><dd>{round.requirement || "-"}</dd></div>
    <div><dt>抄送人</dt><dd>{round.ccRecipients.map(person => person.name).join("、") || "无"}</dd></div>
    <div><dt>是否超时</dt><dd><Tag color={overdue ? "error" : "success"}>{overdue ? "已超时" : round.submittedAt ? "未超时" : "暂未超时"}</Tag></dd></div>
  </dl></section>;
}

export function RectificationSubmissionSection({ round }: { round: RectificationRoundDetail }) {
  return <section className="rectification-section"><h2>整改详情</h2>{round.submittedAt ? <dl>
    <div><dt>整改提交时间</dt><dd>{rectificationDateTime(round.submittedAt)}</dd></div>
    <div className="rectification-full-field"><dt>整改照片</dt><dd><RectificationPhotos photos={round.photos} /></dd></div>
    <div><dt>整改说明</dt><dd>{round.submissionDescription || "-"}</dd></div>
  </dl> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="责任人暂未提交整改" />}</section>;
}

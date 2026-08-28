"use client";

import type { ReactNode } from "react";
import { Modal } from "antd";

type UnsavedChangesModalProps = {
  open: boolean;
  title: string;
  content?: ReactNode;
  okText?: string;
  cancelText?: string;
  onDiscard: () => void | Promise<void>;
  onKeep: () => void;
};

export function UnsavedChangesModal({
  open,
  title,
  content = "关闭后填写内容将丢失，是否继续？",
  okText = "确认关闭",
  cancelText = "继续编辑",
  onDiscard,
  onKeep,
}: UnsavedChangesModalProps) {
  return <Modal
    title={title}
    open={open}
    centered
    zIndex={2100}
    maskClosable={false}
    destroyOnHidden
    okText={okText}
    cancelText={cancelText}
    onCancel={onKeep}
    onOk={onDiscard}
  >
    {content}
  </Modal>;
}

"use client";

import * as React from "react";
import { Modal } from "./overlays";
import { Button } from "./primitives";

export type ConfirmDialogTone = "primary" | "danger";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  children?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmDialogTone;
  loading?: boolean;
  disabled?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  children,
  confirmLabel = "Onayla",
  cancelLabel = "Vazgeç",
  tone = "primary",
  loading = false,
  disabled = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      title={title}
      description={description}
      onClose={onClose}
      dismissalPolicy="protected-action"
      dismissible={!loading}
      dialogRole="alertdialog"
      footer={(
        <>
          <Button variant="ghost" size="md" onClick={onClose} disabled={loading} data-autofocus>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === "danger" ? "danger" : "primary"}
            size="md"
            onClick={onConfirm}
            loading={loading}
            disabled={disabled}
          >
            {confirmLabel}
          </Button>
        </>
      )}
    >
      {children ? <div className="ruth-confirm-dialog__content">{children}</div> : null}
    </Modal>
  );
}

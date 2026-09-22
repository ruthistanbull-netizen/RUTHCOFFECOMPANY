"use client";

import { type ReactNode } from "react";
import { ExactLargePopup } from "./ExactLargePopup";

export function ExactWorkspaceModal({
  open,
  onClose,
  title,
  subtitle,
  children,
  kind = "generic",
  headerActions,
  toolbarSearch,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  kind?: "generic" | "product" | "manual-order";
  headerActions?: ReactNode;
  toolbarSearch?: ReactNode;
}) {
  const isProduct = kind === "product";

  const toolbar = isProduct ? (
    <div
      data-product-workspace-toolbar
      className="grid min-h-[52px] grid-cols-1 items-center gap-2 xl:grid-cols-[340px_minmax(0,1fr)]"
    >
      <div data-product-workspace-search className="hidden min-w-0 xl:block">
        {toolbarSearch}
      </div>
      <div
        data-product-workspace-actions
        className="flex min-w-0 items-center justify-end gap-2 overflow-x-auto no-scrollbar"
      />
    </div>
  ) : null;

  return (
    <ExactLargePopup
      open={open}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      size="workspace"
      dismissalPolicy="light-dismiss"
      toolbar={toolbar}
      headerActions={headerActions ? <div className="hidden items-center gap-2 md:flex">{headerActions}</div> : undefined}
      bodyClassName={isProduct ? "px-3 pt-3 md:px-5 md:pt-4" : "pt-4"}
      surfaceData={{
        "data-exact-workspace-modal": "true",
        "data-workspace-kind": kind,
        "data-product-instant-ready": isProduct ? "true" : undefined,
        "data-product-workspace-prewarmed": isProduct ? "true" : undefined,
      }}
    >
      {children}
    </ExactLargePopup>
  );
}

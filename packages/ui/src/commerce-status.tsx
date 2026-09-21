"use client";

import * as React from "react";
import { StatusBadge, type StatusTone } from "./primitives";
import {
  getCommerceStatusPresentation,
  type CommerceStatusDomain,
  type CommerceStatusKey,
} from "./status-presentation";

export interface CommerceStatusBadgeProps extends Omit<React.ComponentProps<typeof StatusBadge>, "tone" | "children"> {
  status: CommerceStatusKey | string;
  domain?: CommerceStatusDomain;
  label?: string;
  tone?: StatusTone;
}

export function CommerceStatusBadge({
  status,
  domain = "order",
  label,
  tone,
  ...props
}: CommerceStatusBadgeProps) {
  const presentation = getCommerceStatusPresentation(status, domain);
  return (
    <StatusBadge tone={tone ?? presentation.tone} {...props}>
      {label ?? presentation.label}
    </StatusBadge>
  );
}

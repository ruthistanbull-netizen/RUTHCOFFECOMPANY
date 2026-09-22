"use client";

import { VisualThemeCustomizerV2 } from "@/components/theme/VisualThemeCustomizerV2";

type ExactSettingsProps = { initialTab?: string };

export function ExactSettings(props: ExactSettingsProps) {
  return <VisualThemeCustomizerV2 key={props.initialTab || "theme"} />;
}

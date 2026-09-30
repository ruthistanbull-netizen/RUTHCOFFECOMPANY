"use client";

import { useEffect, useState } from "react";
import { HomeHeroRuntimeAdjustments } from "@/components/HomeHeroRuntimeAdjustments";
import { HomeHeroVisibleTone } from "@/components/HomeHeroVisibleTone";
import { LegacyExperienceStyles } from "@/components/LegacyExperienceStyles";
import { MobileSafeAreaContinuity } from "@/components/MobileSafeAreaContinuity";
import { ProductSwipeExperiencePolish } from "@/components/ProductSwipeExperiencePolish";
import { ProductSwipeFirstVisitGuard } from "@/components/ProductSwipeFirstVisitGuard";
import { ProductSwipePreviewDataGuard } from "@/components/ProductSwipePreviewDataGuard";
import { ProductSwipeTransitionParity } from "@/components/ProductSwipeTransitionParity";
import { StorefrontBatchFixes } from "@/components/StorefrontBatchFixes";
import { StorefrontInteractionFixes } from "@/components/StorefrontInteractionFixes";
import { StorefrontLightboxCloseTone } from "@/components/StorefrontLightboxCloseTone";
import { StorefrontProductCode } from "@/components/StorefrontProductCode";
import { StorefrontRequestedFixes } from "@/components/StorefrontRequestedFixes";
import { StorefrontRevisionStyles } from "@/components/StorefrontRevisionStyles";
import { UniversalPopoverStyles } from "@/components/UniversalPopoverStyles";
import { VariantPickerCloseGuard } from "@/components/VariantPickerCloseGuard";
import type { ThemeCustomizerSettings } from "@/lib/themeCustomizer";

export function FloatingWhatsApp({
  settings,
  socialHref,
}: {
  settings: ThemeCustomizerSettings["whatsapp"];
  socialHref?: string;
}) {
  const [editorMode, setEditorMode] = useState(false);
  const socialTarget = String(socialHref || "").trim();
  const message = "Merhaba, Rosta Coffee Co ekibinden yardım almak istiyorum.";

  const targetHref = (() => {
    if (!socialTarget) return "";
    try {
      const url = new URL(socialTarget);
      if (!url.searchParams.has("text")) url.searchParams.set("text", message);
      return url.toString();
    } catch {
      return socialTarget;
    }
  })();

  useEffect(() => {
    setEditorMode(new URLSearchParams(window.location.search).get("themeEditor") === "1");
  }, []);

  const shouldMount = Boolean(targetHref) && (settings.enabled || editorMode);

  return (
    <>
      <LegacyExperienceStyles />
      <UniversalPopoverStyles />
      <StorefrontRevisionStyles />
      <StorefrontBatchFixes />
      <HomeHeroRuntimeAdjustments />
      <HomeHeroVisibleTone />
      <StorefrontInteractionFixes />
      <VariantPickerCloseGuard />
      <StorefrontRequestedFixes />
      <MobileSafeAreaContinuity />
      <StorefrontProductCode />
      <ProductSwipeFirstVisitGuard />
      <ProductSwipeExperiencePolish />
      <ProductSwipeTransitionParity />
      <ProductSwipePreviewDataGuard />
      <StorefrontLightboxCloseTone />
      {shouldMount ? (
        <a
          href={targetHref}
          target="_blank"
          rel="noreferrer"
          aria-label="WhatsApp destek"
          className="whatsapp-floating-bubble premium-touch"
          style={!settings.enabled && editorMode ? { display: "none" } : undefined}
          data-theme-whatsapp
        >
          <span className="whatsapp-floating-icon">
            <img src="/whatsapp-icon-black.png" alt="" aria-hidden="true" />
          </span>
          <span>{settings.label || "WhatsApp"}</span>
        </a>
      ) : null}
    </>
  );
}

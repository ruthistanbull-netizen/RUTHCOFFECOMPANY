"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertTriangle } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { useOverlayBehavior } from "@ruth-commerce/ui";
import { ruthMotion, ruthMotionEase } from "@ruth-commerce/ui/motion";
import {
  clearAdminConfirmations,
  getAdminConfirmationSnapshot,
  settleAdminConfirmation,
  subscribeAdminConfirmation,
} from "@/lib/adminConfirmation";

export function AdminConfirmationProvider() {
  const [request, setRequest] = useState(getAdminConfirmationSnapshot());
  const reduceMotion = useReducedMotion();
  const duration = reduceMotion ? ruthMotion.duration.none : ruthMotion.duration.normal;
  const close = () => {
    if (request) settleAdminConfirmation(request.id, false);
  };
  const overlay = useOverlayBehavior({
    active: Boolean(request),
    onClose: close,
    dismissalPolicy: "light-dismiss",
  });

  useEffect(() => {
    const sync = () => setRequest(getAdminConfirmationSnapshot());
    const unsubscribe = subscribeAdminConfirmation(sync);
    sync();
    return () => {
      unsubscribe();
      clearAdminConfirmations();
    };
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {request ? (
        <motion.div
          key={request.id}
          className="admin-confirmation-layer"
          role="presentation"
          data-dismissal-policy={overlay.dismissalPolicy}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration, ease: ruthMotionEase }}
        >
          <button
            type="button"
            className="admin-confirmation-backdrop"
            aria-label="Onay penceresini kapat"
            onClick={overlay.onBackdropClick}
          />
          <motion.section
            ref={overlay.containerRef}
            className="admin-confirmation-card"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="admin-confirmation-title"
            aria-describedby="admin-confirmation-message"
            data-admin-close-motion="shared"
            data-dismissal-policy={overlay.dismissalPolicy}
            tabIndex={-1}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: ruthMotion.distance.standard, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: ruthMotion.distance.subtle, scale: ruthMotion.scale.enter }}
            transition={{ duration, ease: ruthMotionEase }}
            style={{ animation: "none" }}
          >
            <div className="admin-confirmation-header">
              <span className="admin-confirmation-icon" aria-hidden="true"><AlertTriangle /></span>
              <div className="admin-confirmation-copy">
                <p className="admin-confirmation-eyebrow">Onay gerekiyor</p>
                <h2 className="admin-confirmation-title" id="admin-confirmation-title">İşlemi onayla</h2>
                <p className="admin-confirmation-message" id="admin-confirmation-message">{request.message}</p>
              </div>
            </div>
            <p className="admin-confirmation-note">Bu işlem sistemde veya bağlı sağlayıcıda değişiklik yapabilir.</p>
            <div className="admin-confirmation-actions">
              <button
                type="button"
                className="admin-confirmation-button admin-confirmation-button-secondary"
                onClick={() => settleAdminConfirmation(request.id, false)}
              >
                Vazgeç
              </button>
              <button
                type="button"
                className="admin-confirmation-button admin-confirmation-button-primary"
                data-autofocus="true"
                onClick={() => settleAdminConfirmation(request.id, true)}
              >
                Devam et
              </button>
            </div>
          </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

export default function Loading() {
  return (
    <div className="admin-route-loading-fallback" role="status" aria-live="polite">
      <span className="admin-route-loading-center">
        <span className="admin-route-loading-spinner" aria-hidden="true" />
        <small>Yükleniyor…</small>
      </span>
      <style>{`
        .admin-route-loading-fallback {
          position: relative;
          min-height: calc(100dvh - 7rem);
          display: grid;
          place-items: center;
          overflow: hidden;
          color: hsl(var(--text-muted));
          background: transparent;
          animation: adminRouteFallbackFade 140ms ease both;
        }

        .dark .admin-route-loading-fallback {
          color: rgba(255, 255, 255, 0.64);
          background: transparent;
        }

        .admin-route-loading-center {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 11px;
          margin: auto;
        }

        .admin-route-loading-center small {
          font-size: 15px;
          font-weight: 600;
          line-height: 1.4;
          letter-spacing: -0.015em;
        }

        .admin-route-loading-spinner {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          border: 2.5px solid hsl(var(--accent));
          border-right-color: transparent;
          opacity: 0.94;
          animation: adminRouteFallbackSpin 680ms linear infinite;
        }

        @media (min-width: 1024px) {
          .admin-route-loading-fallback {
            min-height: calc(100dvh - 5.5rem);
          }

          .admin-route-loading-center small {
            font-size: 16px;
          }

          .admin-route-loading-spinner {
            width: 32px;
            height: 32px;
            border-width: 2.75px;
          }
        }

        @keyframes adminRouteFallbackFade {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes adminRouteFallbackSpin {
          to { transform: rotate(360deg); }
        }

        @media (prefers-reduced-motion: reduce) {
          .admin-route-loading-fallback { animation: none; }
          .admin-route-loading-spinner { animation-duration: 1200ms; }
        }
      `}</style>
    </div>
  );
}

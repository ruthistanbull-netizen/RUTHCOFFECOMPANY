"use client";

export function RuthieChatMobileIntegrationPolish() {
  return (
    <style jsx global>{`
      @media (max-width: 620px) {
        section[role="dialog"][aria-label="Eklentiler"],
        section[role="dialog"][aria-label="Yetenekler"] {
          width: 100% !important;
          max-height: calc(100dvh - max(env(safe-area-inset-top), 10px)) !important;
          overflow: hidden !important;
        }

        section[role="dialog"][aria-label="Eklentiler"] > header,
        section[role="dialog"][aria-label="Yetenekler"] > header {
          min-height: 88px !important;
          padding: 14px 16px !important;
          align-items: center !important;
        }

        section[role="dialog"][aria-label="Eklentiler"] > header > div,
        section[role="dialog"][aria-label="Yetenekler"] > header > div {
          min-width: 0 !important;
          align-items: center !important;
          gap: 12px !important;
        }

        section[role="dialog"][aria-label="Eklentiler"] > header > div > span,
        section[role="dialog"][aria-label="Yetenekler"] > header > div > span {
          width: 48px !important;
          height: 48px !important;
          min-width: 48px !important;
          min-height: 48px !important;
          border-radius: 16px !important;
        }

        section[role="dialog"][aria-label="Eklentiler"] > header > div > span svg,
        section[role="dialog"][aria-label="Yetenekler"] > header > div > span svg {
          width: 21px !important;
          height: 21px !important;
          margin: 0 !important;
        }

        section[role="dialog"][aria-label="Eklentiler"] > header strong,
        section[role="dialog"][aria-label="Yetenekler"] > header strong {
          display: block !important;
          font-size: 25px !important;
          line-height: 1.05 !important;
        }

        section[role="dialog"][aria-label="Eklentiler"] > header small,
        section[role="dialog"][aria-label="Yetenekler"] > header small {
          display: block !important;
          margin-top: 5px !important;
          font-size: 11px !important;
          line-height: 1.35 !important;
        }

        section[role="dialog"][aria-label="Eklentiler"] > header > button,
        section[role="dialog"][aria-label="Yetenekler"] > header > button {
          display: grid !important;
          place-items: center !important;
          width: 46px !important;
          height: 46px !important;
          min-width: 46px !important;
          min-height: 46px !important;
          padding: 0 !important;
          margin: 0 !important;
        }

        section[role="dialog"][aria-label="Eklentiler"] > header > button svg,
        section[role="dialog"][aria-label="Yetenekler"] > header > button svg {
          width: 20px !important;
          height: 20px !important;
          margin: 0 !important;
        }

        section[role="dialog"][aria-label="Eklentiler"] > div {
          padding: 12px !important;
          gap: 12px !important;
          overflow-y: auto !important;
          overscroll-behavior: contain !important;
          scroll-padding-bottom: max(18px, env(safe-area-inset-bottom)) !important;
        }

        section[role="dialog"][aria-label="Eklentiler"] > div > article {
          min-height: 126px !important;
          padding: 14px !important;
          display: grid !important;
          grid-template-columns: 48px minmax(0, 1fr) 42px !important;
          grid-template-rows: auto auto !important;
          grid-template-areas:
            "service copy help"
            ". status help" !important;
          align-items: start !important;
          column-gap: 12px !important;
          row-gap: 10px !important;
          overflow: visible !important;
        }

        section[role="dialog"][aria-label="Eklentiler"] > div > article > span:first-child {
          grid-area: service !important;
          align-self: start !important;
          justify-self: start !important;
          width: 48px !important;
          height: 48px !important;
          min-width: 48px !important;
          min-height: 48px !important;
          margin: 0 !important;
          border-radius: 15px !important;
        }

        section[role="dialog"][aria-label="Eklentiler"] > div > article > span:first-child svg {
          width: 22px !important;
          height: 22px !important;
          margin: 0 !important;
        }

        section[role="dialog"][aria-label="Eklentiler"] > div > article > div:nth-child(2) {
          grid-area: copy !important;
          min-width: 0 !important;
          align-self: start !important;
          gap: 5px !important;
        }

        section[role="dialog"][aria-label="Eklentiler"] > div > article > div:nth-child(2) > strong {
          display: block !important;
          font-size: 15px !important;
          line-height: 1.2 !important;
          overflow-wrap: anywhere !important;
        }

        section[role="dialog"][aria-label="Eklentiler"] > div > article > div:nth-child(2) > small {
          display: block !important;
          font-size: 11px !important;
          line-height: 1.42 !important;
          overflow-wrap: anywhere !important;
        }

        section[role="dialog"][aria-label="Eklentiler"] > div > article > div:nth-child(2) > p {
          display: block !important;
          margin: 3px 0 0 !important;
          font-size: 10px !important;
          line-height: 1.35 !important;
          overflow-wrap: anywhere !important;
        }

        section[role="dialog"][aria-label="Eklentiler"] > div > article > span:nth-child(3) {
          grid-area: status !important;
          justify-self: start !important;
          align-self: center !important;
          position: static !important;
          max-width: 100% !important;
          min-height: 28px !important;
          margin: 0 !important;
          padding: 6px 9px !important;
          gap: 6px !important;
          white-space: nowrap !important;
          font-size: 10px !important;
          line-height: 1 !important;
        }

        section[role="dialog"][aria-label="Eklentiler"] > div > article > span:nth-child(3) svg {
          width: 14px !important;
          height: 14px !important;
          margin: 0 !important;
        }

        section[role="dialog"][aria-label="Eklentiler"] > div > article > button:last-child {
          grid-area: help !important;
          align-self: center !important;
          justify-self: end !important;
          position: static !important;
          width: 42px !important;
          height: 42px !important;
          min-width: 42px !important;
          min-height: 42px !important;
          padding: 0 !important;
          margin: 0 !important;
        }

        section[role="dialog"][aria-label="Eklentiler"] > div > article > button:last-child svg {
          width: 19px !important;
          height: 19px !important;
          margin: 0 !important;
        }

        section[role="dialog"][aria-label="Yetenekler"] > div {
          padding: 12px !important;
          gap: 10px !important;
          overflow-y: auto !important;
        }

        section[role="dialog"][aria-label="Yetenekler"] > div > button {
          min-height: 88px !important;
          padding: 13px !important;
          grid-template-columns: 46px minmax(0, 1fr) 44px !important;
          align-items: center !important;
          gap: 12px !important;
        }

        section[role="dialog"][aria-label="Yetenekler"] > div > button > span:first-child {
          width: 46px !important;
          height: 46px !important;
          min-width: 46px !important;
          min-height: 46px !important;
        }

        section[role="dialog"][aria-label="Yetenekler"] > div > button > span:first-child svg {
          width: 21px !important;
          height: 21px !important;
          margin: 0 !important;
        }
      }

      @media (max-width: 390px) {
        section[role="dialog"][aria-label="Eklentiler"] > header strong,
        section[role="dialog"][aria-label="Yetenekler"] > header strong {
          font-size: 22px !important;
        }

        section[role="dialog"][aria-label="Eklentiler"] > header small,
        section[role="dialog"][aria-label="Yetenekler"] > header small {
          font-size: 10px !important;
        }

        section[role="dialog"][aria-label="Eklentiler"] > div > article {
          grid-template-columns: 44px minmax(0, 1fr) 38px !important;
          column-gap: 10px !important;
          padding: 12px !important;
        }

        section[role="dialog"][aria-label="Eklentiler"] > div > article > span:first-child {
          width: 44px !important;
          height: 44px !important;
          min-width: 44px !important;
          min-height: 44px !important;
        }

        section[role="dialog"][aria-label="Eklentiler"] > div > article > button:last-child {
          width: 38px !important;
          height: 38px !important;
          min-width: 38px !important;
          min-height: 38px !important;
        }
      }
    `}</style>
  );
}

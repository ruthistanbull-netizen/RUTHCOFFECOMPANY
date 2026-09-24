export type PasswordRecoveryTarget = "storefront" | "admin";

export const PASSWORD_RECOVERY_SUBJECT = "ROSTA | Şifre Yenileme";

const RESET_URLS: Record<PasswordRecoveryTarget, string> = {
  storefront: "https://rostacoffecompany.zeabur.app/reset-password",
  admin: "https://rostapanel.zeabur.app/reset-password",
};

const STOREFRONT_ACCOUNT_ACTIVATION_URL = "https://rostacoffecompany.zeabur.app/activate-account";

export function normalizeRecoveryEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLocaleLowerCase("tr-TR") : "";
}

export function isValidRecoveryEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isPasswordRecoveryTarget(value: unknown): value is PasswordRecoveryTarget {
  return value === "storefront" || value === "admin";
}

function appendRecoveryToken(urlValue: string, tokenHash: string) {
  const url = new URL(urlValue);
  url.searchParams.set("token_hash", tokenHash);
  url.searchParams.set("type", "recovery");
  return url.toString();
}

export function buildPasswordRecoveryUrl(target: PasswordRecoveryTarget, tokenHash: string) {
  return appendRecoveryToken(RESET_URLS[target], tokenHash);
}

export function buildAccountActivationUrl(tokenHash: string) {
  return appendRecoveryToken(STOREFRONT_ACCOUNT_ACTIVATION_URL, tokenHash);
}

export function buildPasswordRecoveryHtml(resetUrl: string, target: PasswordRecoveryTarget) {
  const destination = target === "admin" ? "ROSTA yönetim paneli hesabın" : "ROSTA hesabın";

  return `<!doctype html>
<html lang="tr">
  <body style="margin:0;padding:0;background:#F4F0E8;color:#111111;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F4F0E8;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#F4F0E8;border:1px solid #AAA8A1;border-radius:20px;overflow:hidden;">
            <tr>
              <td style="padding:34px 34px 16px;text-align:center;">
                <div style="font-size:27px;font-weight:800;letter-spacing:5px;color:#111111;">ROSTA</div>
                <div style="margin-top:9px;font-size:11px;letter-spacing:2.6px;color:#B9563D;text-transform:uppercase;">Password Recovery</div>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 34px 36px;">
                <h1 style="margin:0 0 14px;font-size:28px;font-weight:500;line-height:1.25;color:#111111;">Yeni şifreni oluştur</h1>
                <p style="margin:0 0 18px;font-size:15px;line-height:1.75;color:#6F725B;">${destination} için bir şifre yenileme isteği aldık.</p>
                <p style="margin:0 0 28px;font-size:15px;line-height:1.75;color:#6F725B;">Aşağıdaki butona basarak ROSTA içinde güvenli yeni şifre ekranını açabilirsin.</p>
                <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 auto 28px;">
                  <tr>
                    <td bgcolor="#111111" style="border-radius:999px;">
                      <a href="${resetUrl}" style="display:inline-block;padding:15px 28px;color:#F4F0E8;text-decoration:none;font-size:12px;font-weight:700;letter-spacing:1.8px;text-transform:uppercase;">Şifremi Yenile</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 10px;font-size:12px;line-height:1.7;color:#6F725B;">Bu bağlantı güvenlik nedeniyle tek kullanımlıktır ve süresi dolabilir.</p>
                <p style="margin:0;font-size:12px;line-height:1.7;color:#6F725B;">Bu isteği sen yapmadıysan e-postayı dikkate alma; mevcut şifren değişmez.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

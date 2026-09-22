export type PasswordRecoveryTarget = "storefront" | "admin";

export const PASSWORD_RECOVERY_SUBJECT = "RUTH ISTANBUL | Şifre Yenileme";

const RESET_URLS: Record<PasswordRecoveryTarget, string> = {
  storefront: "https://www.ruthistanbul.com/reset-password",
  admin: "https://ruthcommerce.zeabur.app/reset-password",
};

const STOREFRONT_ACCOUNT_ACTIVATION_URL = "https://www.ruthistanbul.com/activate-account";

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
  const destination = target === "admin" ? "Ruth Commerce panel hesabın" : "Ruth Istanbul hesabın";

  return `<!doctype html>
<html lang="tr">
  <body style="margin:0;padding:0;background:#f7f3ec;color:#241f1a;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7f3ec;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fffaf2;border:1px solid #e7dccd;border-radius:20px;overflow:hidden;">
            <tr>
              <td style="padding:34px 34px 16px;text-align:center;">
                <div style="font-family:Georgia,Times New Roman,serif;font-size:27px;letter-spacing:5px;color:#241f1a;">RUTH ISTANBUL</div>
                <div style="margin-top:9px;font-size:11px;letter-spacing:2.6px;color:#9d815f;text-transform:uppercase;">Password Recovery</div>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 34px 36px;">
                <h1 style="margin:0 0 14px;font-family:Georgia,Times New Roman,serif;font-size:28px;font-weight:500;line-height:1.25;color:#241f1a;">Yeni şifreni oluştur</h1>
                <p style="margin:0 0 18px;font-size:15px;line-height:1.75;color:#62584f;">${destination} için bir şifre yenileme isteği aldık.</p>
                <p style="margin:0 0 28px;font-size:15px;line-height:1.75;color:#62584f;">Aşağıdaki butona basarak Ruth içinde güvenli yeni şifre ekranını açabilirsin.</p>
                <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 auto 28px;">
                  <tr>
                    <td bgcolor="#241f1a" style="border-radius:999px;">
                      <a href="${resetUrl}" style="display:inline-block;padding:15px 28px;color:#fffaf2;text-decoration:none;font-size:12px;font-weight:700;letter-spacing:1.8px;text-transform:uppercase;">Şifremi Yenile</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 10px;font-size:12px;line-height:1.7;color:#8a7d71;">Bu bağlantı güvenlik nedeniyle tek kullanımlıktır ve süresi dolabilir.</p>
                <p style="margin:0;font-size:12px;line-height:1.7;color:#8a7d71;">Bu isteği sen yapmadıysan e-postayı dikkate alma; mevcut şifren değişmez.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

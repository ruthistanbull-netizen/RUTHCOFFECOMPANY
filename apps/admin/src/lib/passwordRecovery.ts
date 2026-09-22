export type PasswordRecoveryTarget="storefront"|"admin";

export const PASSWORD_RECOVERY_SUBJECT="ROSTA | Şifre Yenileme";
const RESET_URLS:Record<PasswordRecoveryTarget,string>={
  storefront:"https://rostacoffecompany.zeabur.app/reset-password",
  admin:"https://rostapanel.zeabur.app/reset-password",
};

export function normalizeRecoveryEmail(value:unknown){
  return typeof value==="string"?value.trim().toLocaleLowerCase("tr-TR"):"";
}
export function isValidRecoveryEmail(email:string){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);}
export function isPasswordRecoveryTarget(value:unknown):value is PasswordRecoveryTarget{return value==="storefront"||value==="admin";}
export function buildPasswordRecoveryUrl(target:PasswordRecoveryTarget,tokenHash:string){
  const url=new URL(RESET_URLS[target]);url.searchParams.set("token_hash",tokenHash);url.searchParams.set("type","recovery");return url.toString();
}
export function buildAccountActivationUrl(tokenHash:string){
  const url=new URL("https://rostacoffecompany.zeabur.app/activate-account");url.searchParams.set("token_hash",tokenHash);url.searchParams.set("type","recovery");return url.toString();
}
export function buildPasswordRecoveryHtml(resetUrl:string,target:PasswordRecoveryTarget){
  const destination=target==="admin"?"ROSTA yönetim paneli hesabın":"ROSTA hesabın";
  return `<!doctype html><html lang="tr"><body style="margin:0;background:#F4F0E8;color:#111111;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px;background:#F4F0E8"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;border:1px solid #AAA8A1;border-radius:20px;background:#F4F0E8;overflow:hidden"><tr><td style="padding:34px 34px 16px;text-align:center"><div style="font-size:28px;font-weight:800;letter-spacing:4px">ROSTA</div><div style="margin-top:8px;font-size:10px;letter-spacing:2.4px;color:#B9563D;text-transform:uppercase">Password Recovery</div></td></tr><tr><td style="padding:16px 34px 36px"><h1 style="margin:0 0 14px;font-size:28px;line-height:1.2">Yeni şifreni oluştur</h1><p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#6F725B">${destination} için şifre yenileme isteği aldık.</p><table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 auto 26px"><tr><td bgcolor="#111111" style="border-radius:999px"><a href="${resetUrl}" style="display:inline-block;padding:15px 28px;color:#F4F0E8;text-decoration:none;font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase">Şifremi Yenile</a></td></tr></table><p style="margin:0;font-size:12px;line-height:1.7;color:#6F725B">Bu isteği sen yapmadıysan e-postayı dikkate alma.</p></td></tr></table></td></tr></table></body></html>`;
}

import { NextResponse } from "next/server";
import { normalizeCustomerEmail } from "@ruth-commerce/commerce-core/customer";
import { requireAdmin } from "@/lib/auth";
import { loadRostaInlineLogo } from "@/lib/gmail";
import { getActiveEmailIntegration, sendEmailWithIntegration, verifyEmailIntegration } from "@/lib/mailDelivery";
import { buildMarketingEmailHtml, buildSubject, type EmailTemplateFields } from "@/lib/emailTemplates";
import { resolveEmailTemplate } from "@/lib/emailTemplateStore";
import { buildAccountActivationUrl } from "@/lib/passwordRecovery";

export const runtime = "nodejs";

const OWNER_TEST_EMAILS = new Set(String(process.env.ROSTA_OWNER_TEST_EMAILS || "").split(",").map((value) => normalizeCustomerEmail(value)).filter((value): value is string => Boolean(value)));

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function ownerTestEmail(value: unknown) {
  const normalized = normalizeCustomerEmail(clean(value));
  return Boolean(normalized && OWNER_TEST_EMAILS.has(normalized));
}

type Recipient = {
  email: string;
  name?: string;
  group?: string;
  order_count?: number;
  total_spent?: number;
  last_order_no?: string;
};

type CustomerEligibilityRow = {
  email: string | null;
  is_member: boolean | null;
  service_email_allowed: boolean | null;
  marketing_email_status: "granted" | "denied" | "unknown" | null;
};

function authErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return clean((error as { message?: unknown }).message);
  }
  return "";
}

function isMissingAuthUser(error: unknown) {
  const message = authErrorMessage(error).toLocaleLowerCase("en-US");
  return message.includes("user with this email not found")
    || message.includes("user not found")
    || message.includes("email not found");
}

function recoveryTokenHash(linkData: unknown) {
  const properties = linkData && typeof linkData === "object"
    ? (linkData as { properties?: { hashed_token?: string; action_link?: string } }).properties
    : undefined;

  let tokenHash = properties?.hashed_token || "";
  if (!tokenHash && properties?.action_link) {
    try {
      tokenHash = new URL(properties.action_link).searchParams.get("token") || "";
    } catch {
      tokenHash = "";
    }
  }
  return tokenHash;
}

async function generateAccountMigrationActivationUrl(supabase: any, recipient: Recipient) {
  const generateRecoveryLink = () => supabase.auth.admin.generateLink({
    type: "recovery",
    email: recipient.email,
  });

  let { data: linkData, error: linkError } = await generateRecoveryLink();

  // After the self-hosted Supabase migration, legacy customer/profile rows can exist
  // while the matching auth.users row is missing. In that case, rebuild only the
  // missing Auth identity, reconnect it to the existing profile when possible, then
  // retry the recovery link. Normal campaign emails never enter this path.
  if (linkError && isMissingAuthUser(linkError)) {
    const { data: created, error: createError } = await (supabase.auth.admin as any).createUser({
      email: recipient.email,
      email_confirm: true,
      user_metadata: {
        full_name: recipient.name || undefined,
        imported_from: "bulk_account_migration",
        migrated_member: true,
      },
    });

    if (createError || !created?.user) {
      throw new Error(authErrorMessage(createError) || "Müşteri hesabı oluşturulamadı.");
    }

    // Best-effort rebind of a stale legacy profile to the newly recreated Auth user.
    // The RPC is intentionally allowed to no-op when ownership is ambiguous.
    try {
      const { error: reconcileError } = await supabase.rpc("reconcile_profile_auth_user", {
        p_auth_user_id: created.user.id,
        p_email: recipient.email,
      });
      if (reconcileError) {
        console.warn("Bulk account migration profile reconciliation skipped:", reconcileError.message);
      }
    } catch (error) {
      console.warn("Bulk account migration profile reconciliation unavailable:", authErrorMessage(error));
    }

    const retry = await generateRecoveryLink();
    linkData = retry.data;
    linkError = retry.error;
  }

  const tokenHash = recoveryTokenHash(linkData);
  if (linkError || !tokenHash) {
    throw new Error(authErrorMessage(linkError) || "Şifre oluşturma bağlantısı üretilemedi.");
  }

  return buildAccountActivationUrl(tokenHash);
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const { supabase, profile } = auth;
  const body = await request.json();

  const recipients: Recipient[] = Array.isArray(body.recipients)
    ? body.recipients
        .map((item: unknown) => {
          const value = item && typeof item === "object" ? item as Record<string, unknown> : {};
          return {
            email: clean(value.email),
            name: clean(value.name),
            group: clean(value.group),
            order_count: Number(value.order_count || 0),
            total_spent: Number(value.total_spent || 0),
            last_order_no: clean(value.last_order_no),
          };
        })
        .filter((item: Recipient) => item.email)
    : [];

  if (!recipients.length) return NextResponse.json({ ok: false, error: "Alıcı seçmedin." }, { status: 400 });
  if (recipients.length > 300) return NextResponse.json({ ok: false, error: "Tek seferde en fazla 300 alıcı gönder." }, { status: 400 });

  const template = await resolveEmailTemplate(supabase, clean(body.template_key));
  if (!template) {
    return NextResponse.json({ ok: false, error: "Seçilen e-posta şablonu bulunamadı." }, { status: 400 });
  }
  if (!template.enabled) {
    return NextResponse.json({ ok: false, error: "Seçilen e-posta şablonu pasif durumda." }, { status: 400 });
  }

  const isServiceTemplate = template.type === "service";
  const requestedEmails = [...new Set(recipients
    .map((item) => normalizeCustomerEmail(item.email))
    .filter((email): email is string => Boolean(email)))];

  const [{ data: customerRows, error: customerError }, contactResult] = await Promise.all([
    supabase
      .from("customer_read_model")
      .select("email, is_member, service_email_allowed, marketing_email_status")
      .in("email", requestedEmails),
    isServiceTemplate
      ? supabase.from("contact_messages").select("email").in("email", requestedEmails)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (customerError) {
    return NextResponse.json({ ok: false, error: customerError.message }, { status: 400 });
  }
  if (contactResult.error) {
    return NextResponse.json({ ok: false, error: contactResult.error.message }, { status: 400 });
  }

  const allowedEmails = new Set(
    ((customerRows || []) as CustomerEligibilityRow[])
      .filter((row) => {
        if (template.key === "account_migrated") {
          return Boolean(row.is_member && row.service_email_allowed);
        }
        if (isServiceTemplate) return Boolean(row.service_email_allowed);
        return row.marketing_email_status === "granted";
      })
      .map((row) => normalizeCustomerEmail(row.email))
      .filter((email): email is string => Boolean(email))
  );

  for (const email of requestedEmails) {
    if (OWNER_TEST_EMAILS.has(email)) allowedEmails.add(email);
  }

  if (isServiceTemplate && template.key !== "account_migrated") {
    for (const row of contactResult.data || []) {
      const email = normalizeCustomerEmail(row.email);
      if (email) allowedEmails.add(email);
    }
  }

  const allowedRecipients = recipients.filter((item) => {
    const email = normalizeCustomerEmail(item.email);
    return Boolean(email && (allowedEmails.has(email) || ownerTestEmail(email)));
  });

  if (!allowedRecipients.length) {
    return NextResponse.json({
      ok: false,
      error: template.key === "account_migrated"
        ? "Seçilen kişiler arasında hesabı bulunan ve hizmet e-postası açık müşteri yok."
        : isServiceTemplate
          ? "Seçilen kişiler arasında hizmet e-postası açık müşteri veya iletişim formu göndereni yok."
          : "Seçilen müşterilerde açık pazarlama e-postası izni bulunmuyor.",
    }, { status: 400 });
  }

  const fields: EmailTemplateFields = {
    ...template.fields,
    ...(body.fields || {}),
  };

  let integration;
  try {
    integration = await getActiveEmailIntegration(supabase, profile.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gmail bağlantısı okunamadı.";
    return NextResponse.json({ ok: false, code: "gmail_integration_error", error: message }, { status: 503 });
  }
  if (!integration) {
    return NextResponse.json({ ok: false, code: "gmail_not_connected", error: "Önce Gmail hesabını bağla." }, { status: 400 });
  }

  // Validate the shared Gmail dependency once before marking individual customers
  // as sending. A broken/expired OAuth connection is a batch-level dependency,
  // not ten unrelated customer failures.
  try {
    await verifyEmailIntegration(supabase, integration);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gmail bağlantısı gönderime hazır değil.";
    return NextResponse.json({ ok: false, code: "gmail_not_ready", error: message }, { status: 400 });
  }

  const logoUrl = fields.logoUrl || "cid:rosta-email-logo";
  const inlineImages = loadRostaInlineLogo();

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const recipient of allowedRecipients) {
    let activationUrl = "";
    if (template.key === "account_migrated") {
      try {
        activationUrl = await generateAccountMigrationActivationUrl(supabase, recipient);
      } catch (error) {
        failed += 1;
        const message = authErrorMessage(error) || "Şifre oluşturma bağlantısı üretilemedi.";
        errors.push(`${recipient.email}: ${message}`);
        await supabase.from("email_logs").insert({
          provider: "gmail",
          profile_id: profile.id,
          to_email: recipient.email,
          subject: fields.subject,
          template_key: template.key,
          status: "failed",
          error_message: message,
        });
        continue;
      }
    }

    const variables = {
      customer_name: recipient.name || "ROSTA Coffee Co. müşterisi",
      email: recipient.email,
      customer_email: recipient.email,
      activation_url: activationUrl,
      order_count: recipient.order_count || 0,
      total_spent: recipient.total_spent || 0,
      last_order_no: recipient.last_order_no || "",
    };

    const finalFields = { ...fields, logoUrl };
    const subject = buildSubject(finalFields, variables);
    const html = buildMarketingEmailHtml(finalFields, variables);

    const logBase = {
      provider: "gmail",
      profile_id: profile.id,
      to_email: recipient.email,
      subject,
      template_key: template.key,
      status: "failed",
    };

    try {
      const result = await sendEmailWithIntegration(supabase, integration, {
        to: recipient.email,
        subject,
        html,
        inlineImages,
      });

      await supabase.from("email_logs").insert({
        ...logBase,
        status: "sent",
        gmail_message_id: result.id,
        sent_at: new Date().toISOString(),
      });

      sent += 1;
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : "Gönderilemedi.";
      errors.push(`${recipient.email}: ${message}`);
      await supabase.from("email_logs").insert({
        ...logBase,
        status: "failed",
        error_message: message,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    complete: failed === 0,
    provider: "gmail",
    sent,
    failed,
    skipped: recipients.length - allowedRecipients.length,
    errors,
  });
}

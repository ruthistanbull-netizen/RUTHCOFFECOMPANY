import { appendShippingEvent, findLocalOrderForWebhook, syncShipmentForOrder } from "@/lib/basitKargoShipping";
import { assertPhase4OrderShippingEnabled } from "@/lib/phase4Flags";

type ShippingWebhookInboxRow = {
  id: string;
  provider: string;
  event_key: string;
  event_type?: string | null;
  external_order_id?: string | null;
  tracking_no?: string | null;
  signature_valid?: boolean | null;
  payload: any;
  attempts: number;
  max_attempts: number;
};

function retryDelaySeconds(attempts: number) {
  return Math.min(3600, Math.max(30, 30 * (2 ** Math.max(0, attempts - 1))));
}

async function complete(
  supabase: any,
  row: ShippingWebhookInboxRow,
  workerId: string,
  input: { success: boolean; error?: string | null; ignored?: boolean },
) {
  const { data, error } = await supabase.rpc("complete_shipping_webhook", {
    p_id: row.id,
    p_worker: workerId,
    p_success: input.success,
    p_error: input.error || null,
    p_retry_delay_seconds: retryDelaySeconds(row.attempts),
    p_ignored: Boolean(input.ignored),
  });
  if (error) throw new Error(`Webhook sonucu kaydedilemedi: ${error.message}`);
  return data;
}

async function resolveDeadLetter(supabase: any, row: ShippingWebhookInboxRow, note: string) {
  const { error } = await supabase
    .from("commerce_dead_letters")
    .update({
      status: "resolved",
      resolution_note: note,
      resolved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("source", "shipping_webhook")
    .eq("source_id", row.id)
    .in("status", ["open", "retrying"]);
  if (error) throw new Error(`Webhook dead-letter kaydı kapatılamadı: ${error.message}`);
}

export async function processShippingWebhookInbox(
  supabase: any,
  input: { workerId?: string; limit?: number } = {},
) {
  // Flag is checked before claiming rows so a disabled integration preserves the inbox untouched.
  assertPhase4OrderShippingEnabled();

  const workerId = input.workerId || `shipping-worker:${crypto.randomUUID()}`;
  const limit = Math.max(1, Math.min(50, Number(input.limit || 10)));
  const { data, error } = await supabase.rpc("claim_shipping_webhooks", {
    p_worker: workerId,
    p_limit: limit,
  });
  if (error) throw new Error(`Kargo webhook kuyruğu alınamadı: ${error.message}`);

  const rows = (Array.isArray(data) ? data : []) as ShippingWebhookInboxRow[];
  const summary = {
    workerId,
    claimed: rows.length,
    processed: 0,
    ignored: 0,
    failed: 0,
    deadLettered: 0,
    results: [] as Array<Record<string, unknown>>,
  };

  for (const row of rows) {
    try {
      if (row.signature_valid === false) {
        const completed = await complete(supabase, row, workerId, {
          success: false,
          ignored: true,
          error: "Webhook imzası geçersiz.",
        });
        summary.ignored += 1;
        summary.results.push({ id: row.id, status: completed?.status || "ignored" });
        continue;
      }

      const orderId = await findLocalOrderForWebhook(supabase, row.payload);
      if (!orderId) throw new Error("Webhook için eşleşen sipariş bulunamadı.");

      const correlationId = `shipping-webhook:${row.id}`;
      const providerEventKey = `${row.provider}:${row.event_key}`;
      const synced = await syncShipmentForOrder(
        supabase,
        orderId,
        row.event_type || "webhook_inbox_sync",
        {
          providerEventKey,
          correlationId,
          source: "shipping_webhook",
        },
      );

      await appendShippingEvent(supabase, orderId, {
        eventType: row.event_type || "webhook_received",
        status: synced.shipment.status,
        externalOrderId: row.external_order_id || synced.shipment.id,
        barcode: synced.shipment.barcode,
        trackingNo: row.tracking_no || synced.shipment.trackingNo,
        payload: row.payload,
        eventKey: `${providerEventKey}:payload`,
      });

      const completed = await complete(supabase, row, workerId, { success: true });
      let deadLetterWarning: string | null = null;
      try {
        await resolveDeadLetter(supabase, row, `Webhook başarıyla yeniden işlendi. Sipariş: ${orderId}`);
      } catch (resolutionError) {
        deadLetterWarning = resolutionError instanceof Error ? resolutionError.message : "Dead-letter kapanışı başarısız.";
        console.error(deadLetterWarning);
      }

      summary.processed += 1;
      summary.results.push({
        id: row.id,
        orderId,
        status: completed?.status || "processed",
        shipmentStatus: synced.shipment.status,
        warning: deadLetterWarning,
      });
    } catch (processingError) {
      const message = processingError instanceof Error ? processingError.message : "Kargo webhook işleme hatası.";
      try {
        const completed = await complete(supabase, row, workerId, {
          success: false,
          error: message,
        });
        if (completed?.status === "dead_letter") summary.deadLettered += 1;
        else summary.failed += 1;
        summary.results.push({ id: row.id, status: completed?.status || "failed", error: message });
      } catch (completionError) {
        summary.failed += 1;
        summary.results.push({
          id: row.id,
          status: "completion_failed",
          error: completionError instanceof Error ? completionError.message : message,
        });
      }
    }
  }

  return summary;
}

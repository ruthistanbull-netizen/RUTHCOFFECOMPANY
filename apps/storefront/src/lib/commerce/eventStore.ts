import type { CommerceEvent, IdempotencyKey } from "@ruth-commerce/contracts";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function persistCommerceEvents(
  events: readonly CommerceEvent<unknown>[],
  idempotencyKey: IdempotencyKey | string,
): Promise<void> {
  if (events.length === 0) return;

  const supabase = getSupabaseAdmin();
  const rows = events.map((event) => ({
    event_id: event.eventId,
    event_type: event.type,
    aggregate_id: event.aggregateId,
    aggregate_type: event.aggregateType,
    event_version: event.version,
    channel: event.channel,
    correlation_id: event.correlationId,
    causation_id: event.causationId ?? null,
    actor_id: event.actorId ?? null,
    idempotency_key: String(idempotencyKey),
    payload: event.payload,
    occurred_at: event.occurredAt,
  }));

  const { error } = await supabase
    .from("commerce_events")
    .upsert(rows, {
      onConflict: "event_id",
      ignoreDuplicates: true,
    });

  if (error) {
    throw new Error(`Commerce eventleri kaydedilemedi: ${error.message}`);
  }
}

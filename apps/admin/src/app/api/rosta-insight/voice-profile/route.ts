import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { noStoreHeaders } from "@/lib/websiteRevalidate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VOICEPRINT_VERSION = "acoustic-v1";
const MIN_VECTOR_SIZE = 8;
const MAX_VECTOR_SIZE = 16;

type VoiceProfileRow = {
  id: string;
  profile_id: string;
  analysis_enabled: boolean;
  learning_enabled: boolean;
  completion_percent: number | string;
  status: "collecting" | "ready" | "paused" | "reset_required";
  sample_count: number | string;
  total_duration_seconds: number | string;
  device_count: number | string;
  clean_duration_seconds: number | string;
  speech_rate_average: number | string | null;
  pitch_average_hz: number | string | null;
  accent_summary: Record<string, unknown> | null;
  voiceprint: Record<string, unknown> | null;
  voiceprint_version: string | null;
  last_match_confidence: number | string | null;
  last_matched_profile_id: string | null;
  last_device_hash: string | null;
  last_quality_score: number | string | null;
  last_speech_rate: number | string | null;
  last_pitch_hz: number | string | null;
  last_analyzed_at: string | null;
  updated_at: string;
};

type ProfileNameRow = {
  id: string;
  full_name: string | null;
  email: string | null;
};

type VoiceprintPayload = {
  version?: string;
  vector?: unknown;
  sampleCount?: unknown;
};

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  try {
    const profile = await ensureVoiceProfile(auth.supabase, String(auth.profile.id));
    const names = await profileNames(auth.supabase, [profile.profile_id, profile.last_matched_profile_id]);
    return NextResponse.json({
      ok: true,
      profile: publicProfile(profile, names),
    }, { headers: noStoreHeaders() });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  try {
    const profileId = String(auth.profile.id);
    const body = await request.json().catch(() => null) as { action?: unknown } | null;
    const action = text(body?.action).toLowerCase();
    const current = await ensureVoiceProfile(auth.supabase, profileId);

    if (action === "reset") {
      const { error: samplesError } = await auth.supabase
        .from("ruthie_voice_samples")
        .delete()
        .eq("profile_id", profileId);
      if (samplesError) throw new Error(samplesError.message);

      const { error: matchError } = await auth.supabase
        .from("ruthie_voice_match_events")
        .delete()
        .or(`expected_profile_id.eq.${profileId},matched_profile_id.eq.${profileId}`);
      if (matchError) throw new Error(matchError.message);

      const { data, error } = await auth.supabase
        .from("ruthie_voice_profiles")
        .update({
          analysis_enabled: true,
          learning_enabled: true,
          completion_percent: 0,
          status: "collecting",
          sample_count: 0,
          total_duration_seconds: 0,
          clean_duration_seconds: 0,
          device_count: 0,
          speech_rate_average: null,
          pitch_average_hz: null,
          accent_summary: {},
          voiceprint: {},
          voiceprint_version: VOICEPRINT_VERSION,
          last_match_confidence: null,
          last_matched_profile_id: null,
          last_device_hash: null,
          last_quality_score: null,
          last_speech_rate: null,
          last_pitch_hz: null,
          last_analyzed_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("profile_id", profileId)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      const names = await profileNames(auth.supabase, [profileId]);
      return NextResponse.json({ ok: true, profile: publicProfile(data as VoiceProfileRow, names), message: "Ses profili sıfırlandı." }, { headers: noStoreHeaders() });
    }

    let patch: Record<string, unknown>;
    if (action === "enable") patch = { analysis_enabled: true, status: current.completion_percent === 100 ? "ready" : "collecting" };
    else if (action === "disable") patch = { analysis_enabled: false, status: "paused" };
    else if (action === "toggle") patch = { analysis_enabled: !current.analysis_enabled, status: current.analysis_enabled ? "paused" : numberValue(current.completion_percent) === 100 ? "ready" : "collecting" };
    else if (action === "learning_enable") patch = { learning_enabled: true };
    else if (action === "learning_disable") patch = { learning_enabled: false };
    else return NextResponse.json({ ok: false, error: { message: "Geçerli ses profili işlemi seçilmedi." } }, { status: 400, headers: noStoreHeaders() });

    const { data, error } = await auth.supabase
      .from("ruthie_voice_profiles")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("profile_id", profileId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    const names = await profileNames(auth.supabase, [profileId, (data as VoiceProfileRow).last_matched_profile_id]);
    return NextResponse.json({ ok: true, profile: publicProfile(data as VoiceProfileRow, names) }, { headers: noStoreHeaders() });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  try {
    const profileId = String(auth.profile.id);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const current = await ensureVoiceProfile(auth.supabase, profileId);
    if (!current.analysis_enabled) {
      const names = await profileNames(auth.supabase, [profileId]);
      return NextResponse.json({ ok: true, ignored: true, profile: publicProfile(current, names) }, { headers: noStoreHeaders() });
    }

    const vector = featureVector(body?.featureVector);
    const duration = clamp(numberValue(body?.durationSeconds), 0, 20);
    const quality = clamp(numberValue(body?.qualityScore), 0, 100);
    const speechRate = nullableNumber(body?.speechRate, 40, 280);
    const pitchMean = nullableNumber(body?.pitchMeanHz, 50, 500);
    const pitchStd = nullableNumber(body?.pitchStdHz, 0, 250);
    const energyMean = clamp(numberValue(body?.energyMean), 0, 1);
    const noiseScore = clamp(numberValue(body?.noiseScore), 0, 100);
    const deviceHash = text(body?.deviceHash).slice(0, 128) || "unknown";
    const transcriptWordCount = Math.max(0, Math.min(500, Math.round(numberValue(body?.transcriptWordCount))));
    const accepted = current.learning_enabled && duration >= 1.5 && quality >= 35 && vector.length >= MIN_VECTOR_SIZE;

    const { error: insertError } = await auth.supabase.from("ruthie_voice_samples").insert({
      voice_profile_id: current.id,
      profile_id: profileId,
      surface: "voice",
      duration_seconds: duration,
      quality_score: quality,
      speech_rate: speechRate,
      pitch_mean_hz: pitchMean,
      pitch_std_hz: pitchStd,
      energy_mean: energyMean,
      noise_score: noiseScore,
      device_hash: deviceHash,
      feature_payload: {
        version: VOICEPRINT_VERSION,
        vector,
        transcriptWordCount,
      },
      accepted_for_learning: accepted,
    });
    if (insertError) throw new Error(insertError.message);

    const { data: allData, error: allError } = await auth.supabase
      .from("ruthie_voice_profiles")
      .select("*")
      .eq("analysis_enabled", true);
    if (allError) throw new Error(allError.message);
    const allProfiles = (allData || []) as VoiceProfileRow[];
    const names = await profileNames(auth.supabase, allProfiles.map((item) => item.profile_id));
    const match = matchVoice(vector, allProfiles, names, profileId);

    const previousPrint = parseVoiceprint(current.voiceprint);
    const nextPrint = accepted
      ? mergeVoiceprint(previousPrint.vector, previousPrint.sampleCount, vector)
      : previousPrint.vector;
    const nextPrintCount = accepted ? previousPrint.sampleCount + 1 : previousPrint.sampleCount;
    const nextSampleCount = numberValue(current.sample_count) + (accepted ? 1 : 0);
    const nextTotalDuration = numberValue(current.total_duration_seconds) + duration;
    const nextCleanDuration = numberValue(current.clean_duration_seconds) + (accepted ? duration : 0);

    const { data: deviceRows, error: deviceError } = await auth.supabase
      .from("ruthie_voice_samples")
      .select("device_hash")
      .eq("profile_id", profileId)
      .eq("accepted_for_learning", true)
      .limit(500);
    if (deviceError) throw new Error(deviceError.message);
    const deviceCount = new Set((deviceRows || []).map((row: { device_hash?: string | null }) => row.device_hash).filter(Boolean)).size;

    const nextSpeechRate = weightedAverage(current.speech_rate_average, numberValue(current.sample_count), speechRate, accepted);
    const nextPitch = weightedAverage(current.pitch_average_hz, numberValue(current.sample_count), pitchMean, accepted);
    const completion = completionPercent({
      sampleCount: nextSampleCount,
      cleanDuration: nextCleanDuration,
      deviceCount,
      quality,
      hasSpeechRate: nextSpeechRate != null,
      hasPitch: nextPitch != null,
    });

    const now = new Date().toISOString();
    const { data: updatedData, error: updateError } = await auth.supabase
      .from("ruthie_voice_profiles")
      .update({
        completion_percent: completion,
        status: completion >= 100 ? "ready" : "collecting",
        sample_count: nextSampleCount,
        total_duration_seconds: round2(nextTotalDuration),
        clean_duration_seconds: round2(nextCleanDuration),
        device_count: deviceCount,
        speech_rate_average: nextSpeechRate,
        pitch_average_hz: nextPitch,
        accent_summary: {
          mode: "continuous",
          version: VOICEPRINT_VERSION,
          featureStability: round2(voiceprintStability(previousPrint.vector, vector)),
        },
        voiceprint: nextPrint.length ? { version: VOICEPRINT_VERSION, vector: nextPrint, sampleCount: nextPrintCount } : {},
        voiceprint_version: VOICEPRINT_VERSION,
        last_match_confidence: match.confidence,
        last_matched_profile_id: match.matchedProfileId,
        last_device_hash: deviceHash,
        last_quality_score: quality,
        last_speech_rate: speechRate,
        last_pitch_hz: pitchMean,
        last_analyzed_at: now,
        updated_at: now,
      })
      .eq("profile_id", profileId)
      .select("*")
      .single();
    if (updateError) throw new Error(updateError.message);
    const updated = updatedData as VoiceProfileRow;

    const { error: matchEventError } = await auth.supabase.from("ruthie_voice_match_events").insert({
      expected_profile_id: profileId,
      matched_profile_id: match.matchedProfileId,
      confidence: match.confidence,
      decision: match.decision,
      device_hash: deviceHash,
    });
    if (matchEventError) throw new Error(matchEventError.message);

    return NextResponse.json({
      ok: true,
      accepted,
      profile: publicProfile(updated, names),
      match,
    }, { headers: noStoreHeaders() });
  } catch (error) {
    return errorResponse(error);
  }
}

async function ensureVoiceProfile(supabase: any, profileId: string): Promise<VoiceProfileRow> {
  const { data, error } = await supabase
    .from("ruthie_voice_profiles")
    .select("*")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data) return data as VoiceProfileRow;

  const { data: created, error: createError } = await supabase
    .from("ruthie_voice_profiles")
    .insert({ profile_id: profileId, analysis_enabled: true, learning_enabled: true, status: "collecting", consent_at: new Date().toISOString() })
    .select("*")
    .single();
  if (createError) throw new Error(createError.message);
  return created as VoiceProfileRow;
}

async function profileNames(supabase: any, ids: Array<string | null | undefined>) {
  const unique = [...new Set(ids.filter((value): value is string => Boolean(value)))];
  if (!unique.length) return new Map<string, ProfileNameRow>();
  const { data, error } = await supabase.from("profiles").select("id,full_name,email").in("id", unique);
  if (error) throw new Error(error.message);
  return new Map(((data || []) as ProfileNameRow[]).map((item) => [item.id, item]));
}

function publicProfile(profile: VoiceProfileRow, names: Map<string, ProfileNameRow>) {
  const owner = names.get(profile.profile_id);
  const matched = profile.last_matched_profile_id ? names.get(profile.last_matched_profile_id) : null;
  return {
    profileId: profile.profile_id,
    displayName: owner?.full_name || owner?.email || "Admin",
    analysisEnabled: profile.analysis_enabled,
    learningEnabled: profile.learning_enabled,
    completionPercent: numberValue(profile.completion_percent),
    status: profile.status,
    sampleCount: numberValue(profile.sample_count),
    totalDurationSeconds: numberValue(profile.total_duration_seconds),
    cleanDurationSeconds: numberValue(profile.clean_duration_seconds),
    deviceCount: numberValue(profile.device_count),
    speechRateAverage: nullableNumber(profile.speech_rate_average, 0, 1_000),
    pitchAverageHz: nullableNumber(profile.pitch_average_hz, 0, 2_000),
    lastMatchConfidence: nullableNumber(profile.last_match_confidence, 0, 100),
    lastMatchedProfileId: profile.last_matched_profile_id,
    lastMatchedName: matched?.full_name || matched?.email || null,
    lastQualityScore: nullableNumber(profile.last_quality_score, 0, 100),
    lastAnalyzedAt: profile.last_analyzed_at,
    updatedAt: profile.updated_at,
  };
}

function parseVoiceprint(value: Record<string, unknown> | null): { vector: number[]; sampleCount: number } {
  const payload = (value || {}) as VoiceprintPayload;
  return {
    vector: featureVector(payload.vector),
    sampleCount: Math.max(0, Math.round(numberValue(payload.sampleCount))),
  };
}

function mergeVoiceprint(previous: number[], previousCount: number, incoming: number[]) {
  if (!previous.length || previous.length !== incoming.length || previousCount <= 0) return incoming.map(round6);
  const weight = Math.min(previousCount, 60);
  return incoming.map((value, index) => round6(((previous[index] || 0) * weight + value) / (weight + 1)));
}

function matchVoice(vector: number[], profiles: VoiceProfileRow[], names: Map<string, ProfileNameRow>, expectedProfileId: string) {
  let best: { profileId: string; confidence: number } | null = null;
  for (const profile of profiles) {
    const voiceprint = parseVoiceprint(profile.voiceprint);
    if (voiceprint.sampleCount < 3 || voiceprint.vector.length !== vector.length) continue;
    const confidence = similarityPercent(voiceprint.vector, vector);
    if (!best || confidence > best.confidence) best = { profileId: profile.profile_id, confidence };
  }

  if (!best) {
    return {
      expectedProfileId,
      matchedProfileId: expectedProfileId,
      matchedName: names.get(expectedProfileId)?.full_name || null,
      confidence: null,
      decision: "uncertain" as const,
    };
  }

  const decision = best.confidence >= 78 ? "matched" : best.confidence >= 62 ? "uncertain" : "rejected";
  return {
    expectedProfileId,
    matchedProfileId: decision === "rejected" ? null : best.profileId,
    matchedName: decision === "rejected" ? null : names.get(best.profileId)?.full_name || null,
    confidence: round2(best.confidence),
    decision,
  };
}

function similarityPercent(left: number[], right: number[]) {
  const weights = [1.1, 0.8, 1.2, 0.9, 0.9, 0.9, 0.7, 1.4, 1.1, 0.8, 0.8, 0.8];
  let difference = 0;
  let totalWeight = 0;
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    const weight = weights[index] || 1;
    difference += Math.abs(left[index] - right[index]) * weight;
    totalWeight += weight;
  }
  return clamp((1 - difference / Math.max(totalWeight, 1)) * 100, 0, 100);
}

function completionPercent(options: {
  sampleCount: number;
  cleanDuration: number;
  deviceCount: number;
  quality: number;
  hasSpeechRate: boolean;
  hasPitch: boolean;
}) {
  const durationScore = Math.min(55, options.cleanDuration / 240 * 55);
  const sampleScore = Math.min(25, options.sampleCount / 20 * 25);
  const deviceScore = Math.min(5, Math.max(0, options.deviceCount) * 5);
  const featureScore = (options.hasSpeechRate ? 5 : 0) + (options.hasPitch ? 5 : 0);
  const qualityScore = Math.min(5, options.quality / 75 * 5);
  return Math.min(100, Math.round(durationScore + sampleScore + deviceScore + featureScore + qualityScore));
}

function voiceprintStability(previous: number[], incoming: number[]) {
  if (!previous.length || previous.length !== incoming.length) return 0;
  return similarityPercent(previous, incoming);
}

function featureVector(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, MAX_VECTOR_SIZE)
    .map((item) => clamp(numberValue(item), 0, 1))
    .filter((item) => Number.isFinite(item));
}

function weightedAverage(previous: unknown, previousCount: number, incoming: number | null, accepted: boolean) {
  if (!accepted || incoming == null) return nullableNumber(previous, 0, 10_000);
  const old = nullableNumber(previous, 0, 10_000);
  if (old == null || previousCount <= 0) return round2(incoming);
  return round2((old * previousCount + incoming) / (previousCount + 1));
}

function nullableNumber(value: unknown, min: number, max: number): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function round6(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function errorResponse(error: unknown) {
  return NextResponse.json({
    ok: false,
    error: { message: error instanceof Error ? error.message : "Ses profili işlemi tamamlanamadı." },
  }, { status: 400, headers: noStoreHeaders() });
}

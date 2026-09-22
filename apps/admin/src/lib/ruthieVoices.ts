export const RUTHIE_VOICES = [
  { id: "marin", label: "Marin", description: "Doğal, dengeli ve kaliteli", recommended: true },
  { id: "coral", label: "Coral", description: "Sıcak, net ve enerjik", recommended: false },
  { id: "shimmer", label: "Shimmer", description: "Yumuşak, ince ve nazik", recommended: false },
  { id: "sage", label: "Sage", description: "Sakin ve güven veren", recommended: false },
  { id: "alloy", label: "Alloy", description: "Nötr ve dengeli", recommended: false },
  { id: "ash", label: "Ash", description: "Net ve kontrollü", recommended: false },
  { id: "ballad", label: "Ballad", description: "Yumuşak ve anlatıcı", recommended: false },
  { id: "echo", label: "Echo", description: "Tok ve belirgin", recommended: false },
  { id: "verse", label: "Verse", description: "Canlı ve akıcı", recommended: false },
  { id: "cedar", label: "Cedar", description: "Doğal ve güçlü", recommended: true },
] as const;

export type RuthieVoiceId = (typeof RUTHIE_VOICES)[number]["id"];

export const DEFAULT_RUTHIE_VOICE: RuthieVoiceId = "marin";
export const RUTHIE_VOICE_STORAGE_KEY = "ruthie.voice";
export const RUTHIE_VOICE_COOKIE = "ruthie_voice";

const VOICE_IDS = new Set<string>(RUTHIE_VOICES.map((voice) => voice.id));

export function isRuthieVoiceId(value: unknown): value is RuthieVoiceId {
  return typeof value === "string" && VOICE_IDS.has(value.trim().toLowerCase());
}

export function normalizeRuthieVoice(value: unknown, fallback: RuthieVoiceId = DEFAULT_RUTHIE_VOICE): RuthieVoiceId {
  if (!isRuthieVoiceId(value)) return fallback;
  return value.trim().toLowerCase() as RuthieVoiceId;
}

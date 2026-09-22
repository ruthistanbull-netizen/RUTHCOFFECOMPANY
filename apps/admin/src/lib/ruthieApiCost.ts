export type RuthieApiUsage = {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  input_tokens_details?: {
    cached_tokens?: number;
    text_tokens?: number;
    audio_tokens?: number;
    image_tokens?: number;
    cached_tokens_details?: {
      text_tokens?: number;
      audio_tokens?: number;
      image_tokens?: number;
    };
  };
  input_token_details?: {
    cached_tokens?: number;
    text_tokens?: number;
    audio_tokens?: number;
    image_tokens?: number;
    cached_tokens_details?: {
      text_tokens?: number;
      audio_tokens?: number;
      image_tokens?: number;
    };
  };
  output_tokens_details?: {
    text_tokens?: number;
    audio_tokens?: number;
  };
  output_token_details?: {
    text_tokens?: number;
    audio_tokens?: number;
  };
};

export type RuthieApiCost = {
  model: string;
  usd: number;
  tokenCostUsd: number;
  toolCostUsd: number;
  webSearchCalls: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  textInputTokens: number;
  audioInputTokens: number;
  imageInputTokens: number;
  textOutputTokens: number;
  audioOutputTokens: number;
  supported: boolean;
  source: "openai_usage";
};

type ModelRates = {
  textInput: number;
  cachedTextInput: number;
  textOutput: number;
  audioInput?: number;
  cachedAudioInput?: number;
  audioOutput?: number;
  imageInput?: number;
  cachedImageInput?: number;
};

// Her 0,15 USD gerçek kullanım diliminden sonra yeni harcama için onay gerekir.
export const RUTHIE_COST_CONFIRM_THRESHOLD_USD = .15;

// USD per 1M tokens. Keep server-owned and fail closed for unknown models.
const MODEL_RATES: Array<{ match: (model: string) => boolean; rates: ModelRates }> = [
  { match: (m) => m === "gpt-5.6" || m.startsWith("gpt-5.6-sol"), rates: { textInput: 5, cachedTextInput: .5, textOutput: 30, imageInput: 5, cachedImageInput: .5 } },
  { match: (m) => m.startsWith("gpt-5.6-terra"), rates: { textInput: 2.5, cachedTextInput: .25, textOutput: 15, imageInput: 2.5, cachedImageInput: .25 } },
  { match: (m) => m.startsWith("gpt-5.6-luna"), rates: { textInput: 1, cachedTextInput: .1, textOutput: 6, imageInput: 1, cachedImageInput: .1 } },
  { match: (m) => m.startsWith("gpt-5.5-pro"), rates: { textInput: 30, cachedTextInput: 30, textOutput: 180, imageInput: 30, cachedImageInput: 30 } },
  { match: (m) => m.startsWith("gpt-5.5"), rates: { textInput: 5, cachedTextInput: .5, textOutput: 30, imageInput: 5, cachedImageInput: .5 } },
  { match: (m) => m.startsWith("gpt-5.4-mini"), rates: { textInput: .75, cachedTextInput: .075, textOutput: 4.5, imageInput: .75, cachedImageInput: .075 } },
  { match: (m) => m.startsWith("gpt-5.4-nano"), rates: { textInput: .2, cachedTextInput: .02, textOutput: 1.25, imageInput: .2, cachedImageInput: .02 } },
  { match: (m) => m.startsWith("gpt-5.4"), rates: { textInput: 2.5, cachedTextInput: .25, textOutput: 15, imageInput: 2.5, cachedImageInput: .25 } },
  { match: (m) => m.startsWith("gpt-5-mini"), rates: { textInput: .25, cachedTextInput: .025, textOutput: 2, imageInput: .25, cachedImageInput: .025 } },
  { match: (m) => m.startsWith("gpt-4o-mini"), rates: { textInput: .15, cachedTextInput: .075, textOutput: .6, imageInput: .15, cachedImageInput: .075 } },
  { match: (m) => m.startsWith("gpt-4o"), rates: { textInput: 2.5, cachedTextInput: 1.25, textOutput: 10, imageInput: 2.5, cachedImageInput: 1.25 } },
  { match: (m) => m.startsWith("gpt-realtime-2.1-mini"), rates: { textInput: .6, cachedTextInput: .06, textOutput: 2.4, audioInput: 10, cachedAudioInput: .3, audioOutput: 20, imageInput: .8, cachedImageInput: .08 } },
  { match: (m) => m.startsWith("gpt-realtime-2.1") || m.startsWith("gpt-realtime-2"), rates: { textInput: 4, cachedTextInput: .4, textOutput: 24, audioInput: 32, cachedAudioInput: .4, audioOutput: 64, imageInput: 5, cachedImageInput: .5 } },
  { match: (m) => m.startsWith("gpt-realtime-mini") || m.startsWith("gpt-4o-mini-realtime"), rates: { textInput: .6, cachedTextInput: .06, textOutput: 2.4, audioInput: 10, cachedAudioInput: .3, audioOutput: 20 } },
  { match: (m) => m.startsWith("gpt-realtime-1.5") || m === "gpt-realtime", rates: { textInput: 4, cachedTextInput: .4, textOutput: 16, audioInput: 32, cachedAudioInput: .4, audioOutput: 64, imageInput: 5, cachedImageInput: .5 } },
];

const WEB_SEARCH_USD_PER_CALL = .01;

function finite(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

export function mergeRuthieUsage(target: RuthieApiUsage, usage: unknown): RuthieApiUsage {
  if (!usage || typeof usage !== "object") return target;
  const source = usage as RuthieApiUsage;
  const inDetails = source.input_token_details || source.input_tokens_details || {};
  const outDetails = source.output_token_details || source.output_tokens_details || {};
  const cached = inDetails.cached_tokens_details || {};
  const targetIn = target.input_token_details || {};
  const targetOut = target.output_token_details || {};
  const targetCached = targetIn.cached_tokens_details || {};
  return {
    input_tokens: finite(target.input_tokens) + finite(source.input_tokens),
    output_tokens: finite(target.output_tokens) + finite(source.output_tokens),
    total_tokens: finite(target.total_tokens) + finite(source.total_tokens),
    input_token_details: {
      text_tokens: finite(targetIn.text_tokens) + finite(inDetails.text_tokens),
      audio_tokens: finite(targetIn.audio_tokens) + finite(inDetails.audio_tokens),
      image_tokens: finite(targetIn.image_tokens) + finite(inDetails.image_tokens),
      cached_tokens: finite(targetIn.cached_tokens) + finite(inDetails.cached_tokens),
      cached_tokens_details: {
        text_tokens: finite(targetCached.text_tokens) + finite(cached.text_tokens),
        audio_tokens: finite(targetCached.audio_tokens) + finite(cached.audio_tokens),
        image_tokens: finite(targetCached.image_tokens) + finite(cached.image_tokens),
      },
    },
    output_token_details: {
      text_tokens: finite(targetOut.text_tokens) + finite(outDetails.text_tokens),
      audio_tokens: finite(targetOut.audio_tokens) + finite(outDetails.audio_tokens),
    },
  };
}

export function calculateRuthieApiCost(
  modelValue: unknown,
  usageValue: unknown,
  options: { webSearchCalls?: number; extraToolCostUsd?: number } = {},
): RuthieApiCost {
  const model = typeof modelValue === "string" ? modelValue.trim().toLowerCase() : "";
  const rates = MODEL_RATES.find((entry) => entry.match(model))?.rates;
  const usage = (usageValue && typeof usageValue === "object" ? usageValue : {}) as RuthieApiUsage;
  const inputDetails = usage.input_token_details || usage.input_tokens_details || {};
  const outputDetails = usage.output_token_details || usage.output_tokens_details || {};
  const cachedDetails = inputDetails.cached_tokens_details || {};
  const inputTokens = finite(usage.input_tokens);
  const outputTokens = finite(usage.output_tokens);
  const audioInputTokens = finite(inputDetails.audio_tokens);
  const imageInputTokens = finite(inputDetails.image_tokens);
  const explicitTextInput = finite(inputDetails.text_tokens);
  const textInputTokens = explicitTextInput || Math.max(0, inputTokens - audioInputTokens - imageInputTokens);
  const audioOutputTokens = finite(outputDetails.audio_tokens);
  const explicitTextOutput = finite(outputDetails.text_tokens);
  const textOutputTokens = explicitTextOutput || Math.max(0, outputTokens - audioOutputTokens);
  const cachedInputTokens = finite(inputDetails.cached_tokens);
  const cachedText = finite(cachedDetails.text_tokens) || Math.min(cachedInputTokens, textInputTokens);
  const cachedAudio = finite(cachedDetails.audio_tokens);
  const cachedImage = finite(cachedDetails.image_tokens);
  const uncachedText = Math.max(0, textInputTokens - cachedText);
  const uncachedAudio = Math.max(0, audioInputTokens - cachedAudio);
  const uncachedImage = Math.max(0, imageInputTokens - cachedImage);
  const webSearchCalls = Math.max(0, Math.floor(finite(options.webSearchCalls)));
  const toolCostUsd = webSearchCalls * WEB_SEARCH_USD_PER_CALL + finite(options.extraToolCostUsd);

  let result: RuthieApiCost;
  if (!rates) {
    result = { model, usd: toolCostUsd, tokenCostUsd: 0, toolCostUsd, webSearchCalls, inputTokens, cachedInputTokens, outputTokens, textInputTokens, audioInputTokens, imageInputTokens, textOutputTokens, audioOutputTokens, supported: false, source: "openai_usage" };
  } else {
    let inputMultiplier = 1;
    let outputMultiplier = 1;
    if (model.startsWith("gpt-5.6") && inputTokens > 272_000) {
      inputMultiplier = 2;
      outputMultiplier = 1.5;
    }

    const tokenCostUsd = (
      (uncachedText * rates.textInput + cachedText * rates.cachedTextInput) * inputMultiplier
      + textOutputTokens * rates.textOutput * outputMultiplier
      + uncachedAudio * (rates.audioInput || rates.textInput)
      + cachedAudio * (rates.cachedAudioInput || rates.cachedTextInput)
      + audioOutputTokens * (rates.audioOutput || rates.textOutput)
      + uncachedImage * (rates.imageInput || rates.textInput)
      + cachedImage * (rates.cachedImageInput || rates.cachedTextInput)
    ) / 1_000_000;
    const usd = tokenCostUsd + toolCostUsd;
    result = { model, usd, tokenCostUsd, toolCostUsd, webSearchCalls, inputTokens, cachedInputTokens, outputTokens, textInputTokens, audioInputTokens, imageInputTokens, textOutputTokens, audioOutputTokens, supported: true, source: "openai_usage" };
  }

  reportRealtimeCostToVoiceBudget(result);
  return result;
}

export function formatRuthieUsd(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "$0.000000";
  if (value < .000001) return "<$0.000001";
  if (value < .01) return `$${value.toFixed(6)}`;
  return `$${value.toFixed(4)}`;
}

type VoiceBudgetState = {
  installed: boolean;
  channel: RTCDataChannel | null;
  peer: RTCPeerConnection | null;
  rawSend: ((data: string | ArrayBuffer | ArrayBufferView | Blob) => void) | null;
  internalSend: boolean;
  allowNextResponse: boolean;
  awaiting: boolean;
  totalUsd: number;
  approvedThroughUsd: number;
  transcriptionModel: string;
};

const voiceBudgetState: VoiceBudgetState = {
  installed: false,
  channel: null,
  peer: null,
  rawSend: null,
  internalSend: false,
  allowNextResponse: false,
  awaiting: false,
  totalUsd: 0,
  approvedThroughUsd: RUTHIE_COST_CONFIRM_THRESHOLD_USD,
  transcriptionModel: "gpt-4o-mini-transcribe",
};

function reportRealtimeCostToVoiceBudget(cost: RuthieApiCost) {
  if (typeof window === "undefined" || !cost.supported || cost.usd <= 0 || !cost.model.includes("realtime")) return;
  voiceBudgetState.totalUsd += cost.usd;
  maybeRequestVoiceBudgetApproval();
}

function installRealtimeVoiceBudgetGuard() {
  if (typeof window === "undefined" || voiceBudgetState.installed || typeof RTCPeerConnection === "undefined") return;
  voiceBudgetState.installed = true;
  const prototype = RTCPeerConnection.prototype;
  const original = prototype.createDataChannel;
  prototype.createDataChannel = function patchedCreateDataChannel(label: string, options?: RTCDataChannelInit) {
    const channel = original.call(this, label, options);
    if (label === "oai-events") attachVoiceBudgetChannel(channel, this);
    return channel;
  };
}

function attachVoiceBudgetChannel(channel: RTCDataChannel, peer: RTCPeerConnection) {
  voiceBudgetState.channel = channel;
  voiceBudgetState.peer = peer;
  voiceBudgetState.totalUsd = 0;
  voiceBudgetState.approvedThroughUsd = RUTHIE_COST_CONFIRM_THRESHOLD_USD;
  voiceBudgetState.awaiting = false;
  const rawSend = channel.send.bind(channel);
  voiceBudgetState.rawSend = rawSend;

  channel.send = ((data: string | ArrayBuffer | ArrayBufferView | Blob) => {
    if (!voiceBudgetState.internalSend && voiceBudgetState.awaiting && isResponseCreate(data)) return;
    rawSend(data);
  }) as RTCDataChannel["send"];

  channel.addEventListener("message", (messageEvent) => {
    let event: Record<string, any> | null = null;
    try { event = JSON.parse(String(messageEvent.data)) as Record<string, any>; } catch { return; }
    if (!event) return;

    if (event.type === "session.created" || event.type === "session.updated") {
      const model = event.session?.audio?.input?.transcription?.model
        || event.session?.input_audio_transcription?.model;
      if (typeof model === "string" && model.trim()) voiceBudgetState.transcriptionModel = model.trim();
    }

    if (event.type === "conversation.item.input_audio_transcription.completed") {
      voiceBudgetState.totalUsd += realtimeTranscriptionCostUsd(voiceBudgetState.transcriptionModel, event.usage);
      if (voiceBudgetState.awaiting) handleVoiceBudgetDecision(String(event.transcript || ""));
      else maybeRequestVoiceBudgetApproval();
    }

    if (voiceBudgetState.awaiting && event.type === "input_audio_buffer.speech_started") {
      sendVoiceBudgetEvent({ type: "response.cancel" });
    }

    if (voiceBudgetState.awaiting && event.type === "response.created") {
      if (voiceBudgetState.allowNextResponse) voiceBudgetState.allowNextResponse = false;
      else sendVoiceBudgetEvent({ type: "response.cancel" });
    }
  });
}

function maybeRequestVoiceBudgetApproval() {
  if (voiceBudgetState.awaiting || voiceBudgetState.totalUsd < voiceBudgetState.approvedThroughUsd) return;
  const channel = voiceBudgetState.channel;
  if (!channel || channel.readyState !== "open") return;
  voiceBudgetState.awaiting = true;
  sendVoiceBudgetEvent({ type: "response.cancel" });
  speakVoiceBudgetPrompt(
    `Gerçek API maliyeti ${formatROSTA InsightUsd(voiceBudgetState.totalUsd)} oldu ve 0,15 dolarlık sınırı geçti. `
    + "Yeni 0,15 dolarlık bütçe dilimine devam etmemi onaylıyor musun? Lütfen evet veya hayır de.",
  );
}

function handleVoiceBudgetDecision(transcript: string) {
  const decision = voiceBudgetDecision(transcript);
  if (decision === "unclear") {
    speakVoiceBudgetPrompt("Cevabını anlayamadım. Yeni 0,15 dolarlık bütçe dilimine devam etmemi onaylıyor musun? Lütfen evet veya hayır de.");
    return;
  }

  if (decision === "accept") {
    while (voiceBudgetState.approvedThroughUsd <= voiceBudgetState.totalUsd) {
      voiceBudgetState.approvedThroughUsd += RUTHIE_COST_CONFIRM_THRESHOLD_USD;
    }
    voiceBudgetState.awaiting = false;
    speakVoiceBudgetPrompt("Onaylandı. Sesli ROSTA Insight devam ediyor.");
    return;
  }

  voiceBudgetState.awaiting = false;
  speakVoiceBudgetPrompt("Onay verilmedi. Sesli görüşmeyi kapatıyorum.");
  window.setTimeout(() => {
    voiceBudgetState.channel?.close();
    voiceBudgetState.peer?.close();
  }, 1_800);
}

function speakVoiceBudgetPrompt(instructions: string) {
  voiceBudgetState.allowNextResponse = true;
  sendVoiceBudgetEvent({
    type: "response.create",
    response: { output_modalities: ["audio"], instructions: `Yalnızca sesli ve kısa biçimde şunu söyle: ${instructions}` },
  });
}

function sendVoiceBudgetEvent(event: Record<string, unknown>) {
  const rawSend = voiceBudgetState.rawSend;
  if (!rawSend || voiceBudgetState.channel?.readyState !== "open") return;
  try {
    voiceBudgetState.internalSend = true;
    rawSend(JSON.stringify(event));
  } finally {
    voiceBudgetState.internalSend = false;
  }
}

function isResponseCreate(data: string | ArrayBuffer | ArrayBufferView | Blob) {
  if (typeof data !== "string") return false;
  try { return JSON.parse(data)?.type === "response.create"; } catch { return false; }
}

function voiceBudgetDecision(value: string): "accept" | "reject" | "unclear" {
  const text = value.toLocaleLowerCase("tr-TR").replace(/[^a-zçğıöşü0-9\s]/gi, " ").replace(/\s+/g, " ").trim();
  const words = text.split(" ");
  const rejects = ["hayır", "hayir", "iptal", "vazgeç", "vazgec", "reddet", "devam etme", "istemiyorum"];
  if (rejects.some((term) => text.includes(term))) return "reject";
  const accepts = ["evet", "onaylıyorum", "onayliyorum", "onayla", "kabul", "devam", "tamam", "tamamdır", "tamamdir"];
  if (accepts.some((term) => words.includes(term) || text.startsWith(`${term} `))) return "accept";
  return "unclear";
}

function realtimeTranscriptionCostUsd(modelValue: string, usageValue: unknown) {
  if (!usageValue || typeof usageValue !== "object") return 0;
  const model = modelValue.toLowerCase();
  const usage = usageValue as RuthieApiUsage;
  const details = usage.input_token_details || usage.input_tokens_details || {};
  const audioInput = finite(details.audio_tokens);
  const output = finite(usage.output_tokens);
  if (model.startsWith("gpt-4o-mini-transcribe")) return (audioInput * 1.25 + output * 5) / 1_000_000;
  if (model.startsWith("gpt-4o-transcribe")) return (audioInput * 2.5 + output * 10) / 1_000_000;
  return 0;
}

if (typeof window !== "undefined") installRealtimeVoiceBudgetGuard();

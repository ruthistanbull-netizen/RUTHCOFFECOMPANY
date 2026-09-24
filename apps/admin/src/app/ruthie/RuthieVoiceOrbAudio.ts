type RuthieVoiceVisualPhase =
  | "connecting"
  | "listening"
  | "thinking"
  | "acting"
  | "speaking"
  | "error";

export type AudioMetrics = {
  loudness: number;
  tempo: number;
  low: number;
  mid: number;
  high: number;
};

type AnalyserState = {
  audioContext: AudioContext;
  analyser: AnalyserNode;
  frequencies: Uint8Array<ArrayBuffer>;
  waveform: Uint8Array<ArrayBuffer>;
  previousRaw: number;
  lastOnsetAt: number;
  onsetTimes: number[];
  smoothed: AudioMetrics;
};

export const EMPTY_AUDIO: AudioMetrics = {
  loudness: 0.08,
  tempo: 0,
  low: 0.08,
  mid: 0.08,
  high: 0.06,
};

export function clamp(value: number, minimum = 0, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function mix(from: number, to: number, amount: number) {
  return from + (to - from) * amount;
}

export function fallbackAudio(phase: RuthieVoiceVisualPhase, time: number): AudioMetrics {
  if (phase === "speaking") {
    const loudness = 0.26 + Math.abs(Math.sin(time * 4.2) * 0.16 + Math.sin(time * 8.1) * 0.09);
    const tempo = clamp(0.34 + Math.sin(time * 2.7) * 0.14 + Math.sin(time * 5.4) * 0.08);
    return { loudness, tempo, low: loudness * 0.88, mid: loudness, high: loudness * 0.72 };
  }
  if (phase === "listening") {
    const loudness = 0.12 + Math.abs(Math.sin(time * 2.4)) * 0.09;
    const tempo = clamp(0.12 + Math.abs(Math.sin(time * 1.7)) * 0.12);
    return { loudness, tempo, low: loudness * 0.82, mid: loudness, high: loudness * 0.62 };
  }
  if (phase === "thinking") return { loudness: 0.18, tempo: 0.08, low: 0.16, mid: 0.22, high: 0.18 };
  if (phase === "acting") return { loudness: 0.24, tempo: 0.12, low: 0.22, mid: 0.28, high: 0.24 };
  if (phase === "error") return { loudness: 0.16, tempo: 0.1, low: 0.14, mid: 0.12, high: 0.22 };
  return EMPTY_AUDIO;
}

export function createAnalyser(selectedStream: MediaStream | null, speaking: boolean): AnalyserState | null {
  if (!selectedStream?.getAudioTracks().some((track) => track.readyState === "live")) return null;
  try {
    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = speaking ? 0.48 : 0.62;
    audioContext.createMediaStreamSource(selectedStream).connect(analyser);
    void audioContext.resume().catch(() => undefined);
    return {
      audioContext,
      analyser,
      frequencies: new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount)),
      waveform: new Uint8Array(new ArrayBuffer(analyser.fftSize)),
      previousRaw: 0,
      lastOnsetAt: 0,
      onsetTimes: [],
      smoothed: { ...EMPTY_AUDIO },
    };
  } catch {
    return null;
  }
}

function averageBand(values: Uint8Array<ArrayBuffer>, from: number, to: number) {
  const start = Math.max(0, Math.min(values.length - 1, from));
  const end = Math.max(start + 1, Math.min(values.length, to));
  let sum = 0;
  for (let index = start; index < end; index += 1) sum += values[index];
  return sum / Math.max(1, end - start) / 255;
}

export function readAudio(
  state: AnalyserState | null,
  fallback: AudioMetrics,
  muted: boolean,
  timestamp: number,
): AudioMetrics {
  if (!state || muted) return {
    loudness: mix(fallback.loudness, state?.smoothed.loudness ?? fallback.loudness, 0.18),
    tempo: mix(fallback.tempo, state?.smoothed.tempo ?? fallback.tempo, 0.18),
    low: mix(fallback.low, state?.smoothed.low ?? fallback.low, 0.18),
    mid: mix(fallback.mid, state?.smoothed.mid ?? fallback.mid, 0.18),
    high: mix(fallback.high, state?.smoothed.high ?? fallback.high, 0.18),
  };

  state.analyser.getByteFrequencyData(state.frequencies);
  state.analyser.getByteTimeDomainData(state.waveform);

  let squared = 0;
  for (const value of state.waveform) {
    const centered = (value - 128) / 128;
    squared += centered * centered;
  }
  const rms = Math.sqrt(squared / state.waveform.length);
  const rawLoudness = clamp((rms - 0.012) * 5.6);
  const attack = rawLoudness > state.smoothed.loudness ? 0.34 : 0.1;

  const relativeChange = Math.abs(rawLoudness - state.previousRaw) / Math.max(0.055, rawLoudness, state.previousRaw);
  const onset = rawLoudness > 0.035 && relativeChange > 0.18 && timestamp - state.lastOnsetAt > 85;
  if (onset) {
    state.lastOnsetAt = timestamp;
    state.onsetTimes.push(timestamp);
  }
  state.onsetTimes = state.onsetTimes.filter((value) => timestamp - value < 1250);
  const tempoTarget = clamp((state.onsetTimes.length - 1) / 5);
  state.previousRaw = mix(state.previousRaw, rawLoudness, 0.24);

  const next: AudioMetrics = {
    loudness: mix(state.smoothed.loudness, rawLoudness, attack),
    tempo: mix(state.smoothed.tempo, tempoTarget, tempoTarget > state.smoothed.tempo ? 0.22 : 0.08),
    low: mix(state.smoothed.low, clamp(averageBand(state.frequencies, 1, 18) * 2.4), 0.22),
    mid: mix(state.smoothed.mid, clamp(averageBand(state.frequencies, 18, 72) * 2.15), 0.24),
    high: mix(state.smoothed.high, clamp(averageBand(state.frequencies, 72, 150) * 2.7), 0.26),
  };
  state.smoothed = next;
  return next;
}

"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Camera,
  CheckCircle2,
  Clock3,
  FilePlus2,
  Mic,
  MicOff,
  Paperclip,
  Send,
  Settings2,
  Sparkles,
  Square,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { LoadingIndicator } from "@ruth-commerce/ui";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import {
  executeApprovedAction,
  sendRuthieChatMessage,
  type RuthieAttachmentPayload,
  type RuthieChatResponse,
  type RuthiePendingAction,
} from "@/app/ruthie/ruthieUnifiedAgentClient";
import {
  ExactButton,
  ExactIconButton,
  ExactPageHeader,
  ExactSegmentedControl,
  useExactToast,
} from "./primitives";
import { ExactDataCard } from "./data";

type RuthieState = "idle" | "listening" | "thinking" | "speaking" | "executing" | "waiting_approval" | "success" | "error";
type Mode = "chat" | "voice";
type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
  sources?: RuthieChatResponse["sources"];
  pendingAction?: RuthiePendingAction | null;
  actionResult?: RuthieChatResponse["actionResult"];
};

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> & { length: number } }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

const STORAGE_KEY = "rosta-insight-exact-conversation-v1";
const initialMessage: Message = {
  id: "welcome",
  role: "assistant",
  text: "Merhaba, ben ROSTA Insight. Sipariş, ödeme, stok, müşteri, kargo ve panel operasyonlarında sana yardımcı olabilirim.",
  createdAt: new Date().toISOString(),
};
const suggestions = [
  "Bugünkü satışları özetle",
  "İşlem gerektiren siparişleri bul",
  "Stoku azalan ürünleri göster",
  "Geciken kargoları kontrol et",
  "VIP müşteriler için kampanya öner",
];

function readFile(file: File): Promise<RuthieAttachmentPayload> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, type: file.type || "application/octet-stream", dataUrl: String(reader.result || "") });
    reader.onerror = () => reject(new Error(`${file.name} okunamadı.`));
    reader.readAsDataURL(file);
  });
}

function statusLabel(state: RuthieState) {
  const labels: Record<RuthieState, string> = {
    idle: "Hazır",
    listening: "Dinliyor…",
    thinking: "Düşünüyor…",
    speaking: "Konuşuyor…",
    executing: "İşlemi uyguluyor…",
    waiting_approval: "Onay bekliyor",
    success: "Tamamlandı",
    error: "Bir hata oluştu",
  };
  return labels[state];
}

function stateTone(state: RuthieState) {
  if (state === "listening") return "info";
  if (state === "thinking" || state === "waiting_approval") return "warning";
  if (state === "speaking" || state === "success") return "success";
  if (state === "error") return "danger";
  return "accent";
}

function ExactRuthieWaveform({ active, bars = 11, tone = "accent" }: { active: boolean; bars?: number; tone?: "accent" | "info" | "success" | "warning" | "danger" }) {
  const color = tone === "info" ? "bg-info" : tone === "success" ? "bg-success" : tone === "warning" ? "bg-warning" : tone === "danger" ? "bg-danger" : "bg-accent";
  return <div className="flex items-center justify-center gap-[3px] h-6" role={active ? "img" : undefined} aria-label={active ? "Ses etkinliği" : undefined}>{Array.from({ length: bars }).map((_, index) => <span key={index} className={`w-[2px] rounded-full ${color}`} style={{ height: "100%", transformOrigin: "center", transform: active ? undefined : "scaleY(.15)", animation: active ? `waveform-bar ${0.7 + (index % 3) * 0.25}s ease-in-out infinite` : undefined, animationDelay: `${index * 0.08}s`, opacity: active ? 0.8 : 0.3, transition: "transform .2s ease, opacity .2s ease" }} />)}</div>;
}

function ExactRuthieOrb({ state, size = 112 }: { state: RuthieState; size?: number }) {
  const active = ["listening", "speaking", "thinking", "executing"].includes(state);
  const deforming = state === "listening" || state === "speaking";
  const glow = state === "listening" ? "var(--info)" : state === "thinking" || state === "waiting_approval" ? "var(--warning)" : state === "speaking" || state === "success" ? "var(--success)" : state === "error" ? "var(--danger)" : "var(--accent)";
  const animation = deforming ? "orb-breathe 4s ease-in-out infinite, orb-deform 2.5s ease-in-out infinite" : state === "thinking" ? "orb-breathe 3s ease-in-out infinite" : "orb-breathe 5s ease-in-out infinite";
  return <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`ROSTA Insight: ${statusLabel(state)}`}>
    <div className="absolute inset-0 rounded-full pointer-events-none" style={{ background: `radial-gradient(circle, hsl(${glow} / .5) 0%, transparent 65%)`, filter: `blur(${size * 0.15}px)`, transform: "scale(1.35)", animation: active ? "orb-glow-pulse 2s ease-in-out infinite" : undefined, opacity: active ? undefined : 0.45 }} />
    <div className="absolute inset-0 rounded-full overflow-hidden" style={{ background: "radial-gradient(circle at 35% 28%, hsl(244 89% 78%) 0%, hsl(var(--accent)) 42%, hsl(245 82% 40%) 100%)", boxShadow: `inset 0 ${size * .1}px ${size * .18}px rgba(255,255,255,.25), inset 0 -${size * .08}px ${size * .14}px rgba(20,20,60,.22)`, animation }}>
      <div className="absolute rounded-full pointer-events-none" style={{ top: "7%", left: "18%", width: "46%", height: "35%", background: "radial-gradient(ellipse, rgba(255,255,255,.55) 0%, transparent 70%)", filter: "blur(1px)" }} />
      <div className="absolute rounded-full pointer-events-none" style={{ bottom: "4%", left: "26%", width: "48%", height: "14%", background: "radial-gradient(ellipse, rgba(180,210,255,.3) 0%, transparent 70%)", filter: "blur(1px)" }} />
      <span className="ruthie-particle" style={{ width: size * .2, height: size * .2, top: "18%", left: "12%", animationDelay: "0s", animationDuration: "5s" }} />
      <span className="ruthie-particle" style={{ width: size * .15, height: size * .15, top: "55%", left: "55%", animationDelay: "1.3s", animationDuration: "6.5s" }} />
      <span className="ruthie-particle" style={{ width: size * .12, height: size * .12, top: "32%", left: "62%", animationDelay: "2.6s", animationDuration: "4.5s" }} />
      <div className="absolute inset-0 flex items-center justify-center"><Sparkles style={{ width: size * .3, height: size * .3 }} className="text-white/90" strokeWidth={2.5} /></div>
    </div>
    {state === "thinking" || state === "executing" ? <div className="absolute inset-0 rounded-full border-[1.5px] border-white/25 pointer-events-none" style={{ animation: "orb-rotate 3s linear infinite" }} /> : null}
  </div>;
}

function ApprovalCard({ action, loading, onApprove, onCancel }: { action: RuthiePendingAction; loading: boolean; onApprove: () => void; onCancel: () => void }) {
  const params = action.params && typeof action.params === "object" ? Object.entries(action.params).slice(0, 6) : [];
  return <div className="radius-card border border-warning/30 bg-warning-soft/40 overflow-hidden animate-fade-in">
    <div className="flex items-center gap-2 px-4 py-3 border-b border-warning/20 bg-warning-soft"><div className="flex items-center justify-center h-7 w-7 rounded-full bg-warning/15"><AlertTriangle className="h-3.5 w-3.5 text-warning-foreground" /></div><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-warning-foreground truncate">İşlem onayı gerekiyor</p><p className="text-[11px] text-muted truncate">{action.summary || action.tool}</p></div></div>
    <div className="px-4 py-3 space-y-2"><p className="text-[11px] text-muted"><span className="font-medium text-main">Araç:</span> {action.tool}</p>{params.map(([key, value]) => <div key={key} className="flex items-start justify-between gap-3 text-xs"><span className="text-muted shrink-0">{key}</span><span className="font-semibold text-main text-right break-all">{typeof value === "string" ? value : JSON.stringify(value)}</span></div>)}<p className="text-[11px] text-muted pt-2 border-t border-border-subtle">Bu işlem gerçek panel verisini değiştirebilir. Onay vermeden uygulanmaz.</p></div>
    <div className="flex gap-2 px-4 py-3 border-t border-warning/20"><ExactButton variant="destructive" size="sm" className="flex-1" onClick={onApprove} loading={loading}>Onayla ve uygula</ExactButton><ExactButton variant="secondary" size="sm" className="flex-1" onClick={onCancel} disabled={loading}>Vazgeç</ExactButton></div>
  </div>;
}

export function ExactRuthie() {
  const toast = useExactToast();
  const [mode, setMode] = useState<Mode>("chat");
  const [state, setState] = useState<RuthieState>("idle");
  const [messages, setMessages] = useState<Message[]>([initialMessage]);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<RuthieAttachmentPayload[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<RuthiePendingAction | null>(null);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [listening, setListening] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [online, setOnline] = useState<boolean | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null") as { messages?: Message[]; threadId?: string | null; ttsEnabled?: boolean } | null;
      if (stored?.messages?.length) setMessages(stored.messages.slice(-80));
      if (stored?.threadId) setThreadId(stored.threadId);
      if (typeof stored?.ttsEnabled === "boolean") setTtsEnabled(stored.ttsEnabled);
    } catch { /* ignore invalid local state */ }
    void fetch("/api/rosta-insight/openai/status", { cache: "no-store" }).then((response) => setOnline(response.ok)).catch(() => setOnline(false));
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ messages: messages.slice(-80), threadId, ttsEnabled }));
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, threadId, ttsEnabled, state]);

  useEffect(() => () => {
    recognitionRef.current?.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    window.speechSynthesis?.cancel();
  }, []);

  const speak = useCallback((text: string) => {
    if (!ttsEnabled || !("speechSynthesis" in window) || !text.trim()) { setState("idle"); return; }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.replace(/https?:\/\/\S+/g, ""));
    utterance.lang = "tr-TR";
    utterance.rate = 1;
    utterance.onstart = () => setState("speaking");
    utterance.onend = () => setState("idle");
    utterance.onerror = () => setState("idle");
    window.speechSynthesis.speak(utterance);
  }, [ttsEnabled]);

  const send = useCallback(async (raw?: string) => {
    const text = (raw ?? input).trim();
    if ((!text && !attachments.length) || state === "thinking" || state === "executing") return;
    const currentAttachments = attachments;
    const userMessage: Message = { id: `user-${Date.now()}`, role: "user", text: text || `${currentAttachments.length} ek gönderildi`, createdAt: new Date().toISOString() };
    setMessages((current) => [...current, userMessage]);
    setInput(""); setAttachments([]); setPendingAction(null); setState("thinking");
    try {
      const history = messages.slice(-16).map((message) => ({ role: message.role, text: message.text }));
      const response = await sendRuthieChatMessage({ message: text || "Ekli görseli veya dosyayı analiz et.", history, attachments: currentAttachments, threadId });
      const assistant: Message = { id: `assistant-${Date.now()}`, role: "assistant", text: response.message || "İşlem tamamlandı.", createdAt: new Date().toISOString(), sources: response.sources, pendingAction: response.pendingAction, actionResult: response.actionResult };
      setMessages((current) => [...current, assistant]);
      if (response.threadId) setThreadId(response.threadId);
      if (response.pendingAction) { setPendingAction(response.pendingAction); setState("waiting_approval"); }
      else if (response.actionResult) { setState("success"); window.setTimeout(() => setState("idle"), 1200); }
      else speak(assistant.text);
    } catch (caught) {
      const error = caught instanceof Error ? caught.message : "ROSTA Insight yanıt veremedi.";
      setMessages((current) => [...current, { id: `error-${Date.now()}`, role: "assistant", text: error, createdAt: new Date().toISOString() }]);
      setState("error");
      toast.error(error);
    }
  }, [attachments, input, messages, speak, state, threadId, toast]);

  const approve = async () => {
    if (!pendingAction) return;
    setState("executing");
    try {
      const result = await executeApprovedAction(pendingAction);
      const text = result.message || result.summary || "Onaylanan işlem başarıyla uygulandı.";
      setMessages((current) => [...current, { id: `action-${Date.now()}`, role: "assistant", text, createdAt: new Date().toISOString(), actionResult: result }]);
      setPendingAction(null); setState("success"); toast.success(text); window.setTimeout(() => setState("idle"), 1200);
    } catch (caught) {
      const error = caught instanceof Error ? caught.message : "Onaylanan işlem uygulanamadı.";
      setMessages((current) => [...current, { id: `action-error-${Date.now()}`, role: "assistant", text: error, createdAt: new Date().toISOString() }]);
      setState("error"); toast.error(error);
    }
  };

  const toggleListening = () => {
    if (listening) { recognitionRef.current?.stop(); setListening(false); setState("idle"); return; }
    const SpeechRecognition = (window as unknown as { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor }).SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionConstructor }).webkitSpeechRecognition;
    if (!SpeechRecognition) { toast.error("Bu tarayıcı sesli yazmayı desteklemiyor."); return; }
    const recognition = new SpeechRecognition();
    recognition.lang = "tr-TR"; recognition.interimResults = true; recognition.continuous = false;
    recognition.onresult = (event) => {
      let transcript = "";
      for (let index = 0; index < event.results.length; index += 1) transcript += event.results[index][0]?.transcript || "";
      setInput(transcript.trim());
    };
    recognition.onerror = () => { setListening(false); setState("error"); toast.error("Ses anlaşılamadı. Tekrar deneyebilirsin."); };
    recognition.onend = () => { setListening(false); setState((current) => current === "listening" ? "idle" : current); };
    recognitionRef.current = recognition;
    setListening(true); setState("listening"); recognition.start();
  };

  const attachFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []).slice(0, 5);
    if (!files.length) return;
    try { const next = await Promise.all(files.map(readFile)); setAttachments((current) => [...current, ...next].slice(0, 8)); }
    catch (caught) { toast.error(caught instanceof Error ? caught.message : "Dosya eklenemedi."); }
    event.target.value = "";
  };

  const openCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) { fileRef.current?.click(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      streamRef.current = stream; setCameraOpen(true);
      window.setTimeout(() => { if (videoRef.current) { videoRef.current.srcObject = stream; void videoRef.current.play(); } }, 40);
    } catch { toast.error("Kamera açılamadı. Tarayıcı iznini kontrol et."); }
  };
  const closeCamera = () => { streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null; setCameraOpen(false); };
  const capture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas"); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    setAttachments((current) => [...current, { name: `rosta-insight-camera-${Date.now()}.jpg`, type: "image/jpeg", dataUrl: canvas.toDataURL("image/jpeg", 0.86) }].slice(0, 8));
    closeCamera(); toast.success("Kamera görüntüsü ROSTA Insight mesajına eklendi.");
  };

  const reset = () => {
    setMessages([initialMessage]); setThreadId(null); setPendingAction(null); setAttachments([]); setInput(""); setState("idle"); window.localStorage.removeItem(STORAGE_KEY); window.speechSynthesis?.cancel();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } };
  const tone = stateTone(state);
  const latestSources = [...messages].reverse().find((message) => message.sources?.length)?.sources || [];

  return <div className="min-h-screen p-4 md:p-6 bg-gradient-to-br from-background via-surface-primary to-accent-soft/30 overflow-y-auto" data-exact-base44-page="rosta-insight">
    <div className="max-w-[1480px] mx-auto space-y-4 animate-fade-in">
      <ExactPageHeader title="ROSTA Insight" subtitle="Operasyonel ticaret asistanın" actions={<><Link href="/"><ExactButton variant="secondary" size="sm"><ArrowLeft className="h-4 w-4" /> Panele dön</ExactButton></Link><ExactSegmentedControl size="sm" value={mode} onChange={(value) => setMode(value as Mode)} options={[{ value: "chat", label: "Yazılı" }, { value: "voice", label: "Sesli", icon: Mic }]} /><ExactIconButton icon={ttsEnabled ? Volume2 : VolumeX} label="Sesli yanıtı değiştir" variant="secondary" onClick={() => { window.speechSynthesis?.cancel(); setTtsEnabled((current) => !current); }} /><ExactIconButton icon={Settings2} label="Sohbeti sıfırla" variant="secondary" onClick={reset} /></>} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-[calc(100vh-130px)]">
        <div className="lg:col-span-2 flex flex-col bg-surface-primary radius-card shadow-card overflow-hidden min-h-[620px]">
          <div className="flex flex-col items-center justify-center py-6 px-4 border-b border-border-subtle bg-gradient-to-b from-accent-soft/30 to-transparent">
            <ExactRuthieOrb state={state} size={mode === "voice" ? 132 : 94} />
            <div className="mt-3 text-center"><p className="text-base font-bold text-main tracking-tight">ROSTA Insight</p><span className={`inline-flex items-center gap-1.5 mt-1 text-xs font-medium text-${tone}-foreground`}><span className={`h-2 w-2 rounded-full bg-${tone} ${["listening", "thinking", "speaking", "executing"].includes(state) ? "animate-pulse-soft" : ""}`} />{statusLabel(state)}{online === false ? " · OpenAI bağlantısı kontrol edilmeli" : ""}</span></div>
            <div className="mt-2 min-w-36"><ExactRuthieWaveform active={["listening", "thinking", "speaking", "executing"].includes(state)} tone={tone} /></div>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 no-scrollbar">
            {messages.map((message) => <div key={message.id} className={`flex gap-2 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
              {message.role === "assistant" ? <div className="mt-0.5"><ExactRuthieOrb state="idle" size={28} /></div> : null}
              <div className={`max-w-[86%] px-3.5 py-2.5 radius-control text-sm whitespace-pre-wrap leading-relaxed ${message.role === "user" ? "bg-accent text-white" : "bg-surface-secondary text-main"}`}>
                {message.text}
                {message.sources?.length ? <div className="mt-3 pt-2 border-t border-border-subtle space-y-1">{message.sources.slice(0, 4).map((source, index) => <a key={`${source.url}-${index}`} href={source.url} target="_blank" rel="noreferrer" className="block text-[10px] text-accent hover:underline truncate">{source.title || source.url}</a>)}</div> : null}
              </div>
            </div>)}
            {state === "thinking" ? <div className="flex justify-start gap-2"><ExactRuthieOrb state="thinking" size={28} /><div className="bg-surface-secondary px-4 py-3 radius-control"><ExactRuthieWaveform active bars={5} tone="warning" /></div></div> : null}
          </div>

          {state !== "thinking" && state !== "executing" ? <div className="px-4 pb-2 flex flex-wrap gap-1.5">{suggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => void send(suggestion)} className="px-2.5 py-1 radius-small bg-surface-secondary text-[11px] font-medium text-muted hover:text-accent hover:bg-accent-soft transition-colors">{suggestion}</button>)}</div> : null}

          {attachments.length ? <div className="px-4 pb-2 flex gap-2 overflow-x-auto no-scrollbar">{attachments.map((attachment, index) => <div key={`${attachment.name}-${index}`} className="relative shrink-0 h-16 min-w-28 max-w-44 radius-small bg-surface-secondary border border-border-subtle overflow-hidden">{attachment.type.startsWith("image/") ? <img src={attachment.dataUrl} alt={attachment.name} className="h-full w-full object-cover" /> : <div className="h-full px-3 flex items-center gap-2"><FilePlus2 className="h-4 w-4 text-accent" /><span className="text-[10px] text-main truncate">{attachment.name}</span></div>}<button type="button" onClick={() => setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/55 text-white flex items-center justify-center" aria-label="Eki kaldır"><X className="h-3 w-3" /></button></div>)}</div> : null}

          <div className="border-t border-border-subtle p-3">
            <div className="flex items-end gap-2">
              <button type="button" onClick={toggleListening} className={`flex items-center justify-center h-11 w-11 rounded-full shrink-0 transition-all ${listening ? "bg-info text-white animate-pulse-soft" : "bg-surface-secondary text-muted hover:text-main"}`} aria-label={listening ? "Dinlemeyi durdur" : "Sesli yazmayı başlat"}>{listening ? <Square className="h-4 w-4" /> : <Mic className="h-5 w-5" />}</button>
              <div className="flex-1 min-w-0"><textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={onKeyDown} rows={mode === "voice" ? 2 : 3} placeholder={mode === "voice" ? "Mikrofona dokun veya mesaj yaz…" : "ROSTA Insight’a bir şey sor…"} className="form-input min-h-11 max-h-32" /></div>
              <input ref={fileRef} type="file" multiple accept="image/*,.pdf,.txt,.csv,.json" hidden onChange={(event) => void attachFiles(event)} />
              <ExactIconButton icon={Paperclip} label="Dosya ekle" variant="secondary" onClick={() => fileRef.current?.click()} />
              <ExactIconButton icon={Camera} label="Kamera" variant="secondary" onClick={() => void openCamera()} />
              <ExactButton size="lg" onClick={() => void send()} disabled={(!input.trim() && !attachments.length) || state === "thinking" || state === "executing"}><Send className="h-4 w-4" /> Gönder</ExactButton>
            </div>
          </div>
        </div>

        <div className="space-y-3 overflow-y-auto no-scrollbar">
          {pendingAction ? <ApprovalCard action={pendingAction} loading={state === "executing"} onApprove={() => void approve()} onCancel={() => { setPendingAction(null); setState("idle"); setMessages((current) => [...current, { id: `cancel-${Date.now()}`, role: "assistant", text: "İşlem onayı iptal edildi. Panelde herhangi bir değişiklik yapılmadı.", createdAt: new Date().toISOString() }]); }} /> : null}
          <ExactDataCard title="Görev Durumu">
            <div className="space-y-2">{[
              { label: "İstek alındı", done: messages.some((message) => message.role === "user") },
              { label: "Veriler analiz edildi", done: messages.length > 2 && state !== "thinking" },
              { label: "Yanıt hazırlandı", done: messages.at(-1)?.role === "assistant" },
              { label: pendingAction ? "Onay bekleniyor" : "İşlem tamamlandı", done: state === "success" || !pendingAction, active: Boolean(pendingAction) },
            ].map((task, index) => <div key={task.label} className="flex items-center gap-2.5"><div className={`flex items-center justify-center h-6 w-6 rounded-full shrink-0 ${task.done ? "bg-success-soft text-success-foreground" : task.active ? "bg-warning-soft text-warning-foreground" : "bg-surface-tertiary text-subtle"}`}>{task.done ? <CheckCircle2 className="h-3 w-3" /> : task.active ? <LoadingIndicator size="sm" className="!h-3 !w-3" /> : <Clock3 className="h-3 w-3" />}</div><span className="text-xs text-main flex-1">{task.label}</span><span className="text-[10px] text-subtle">0{index + 1}</span></div>)}</div>
          </ExactDataCard>
          <ExactDataCard title="Yetkiler">
            <div className="space-y-2">{["Operasyon verilerini oku", "Sipariş ve stok analiz et", "Kampanya taslağı hazırla"].map((item) => <div key={item} className="flex items-center gap-2 text-xs"><CheckCircle2 className="h-3.5 w-3.5 text-success-foreground" /><span className="text-muted">{item}</span></div>)}{["İade işlemi uygula", "Sipariş iptal et", "Ürün yayınla"].map((item) => <div key={item} className="flex items-center gap-2 text-xs"><span className="h-3.5 w-3.5 rounded-full border-2 border-warning" /><span className="text-muted">{item} <span className="text-warning-foreground">(onay gerekir)</span></span></div>)}</div>
          </ExactDataCard>
          <ExactDataCard title="Hızlı Başlangıç"><div className="space-y-2">{suggestions.slice(0, 4).map((suggestion) => <button key={suggestion} type="button" onClick={() => void send(suggestion)} className="w-full text-left px-3 py-2 radius-small bg-surface-secondary hover:bg-accent-soft text-xs font-medium text-muted hover:text-accent transition-colors flex items-center justify-between group">{suggestion}<ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" /></button>)}</div></ExactDataCard>
          {latestSources.length ? <ExactDataCard title="Son Kaynaklar"><div className="space-y-2">{latestSources.slice(0, 6).map((source, index) => <a key={`${source.url}-${index}`} href={source.url} target="_blank" rel="noreferrer" className="block p-2.5 radius-small bg-surface-secondary hover:bg-accent-soft"><p className="text-xs font-medium text-main truncate">{source.title || "Kaynak"}</p><p className="text-[10px] text-subtle truncate">{source.url}</p></a>)}</div></ExactDataCard> : null}
        </div>
      </div>
    </div>

    {cameraOpen ? <div className="fixed inset-0 z-modal bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"><div className="w-full max-w-2xl bg-surface-primary radius-card shadow-overlay overflow-hidden animate-fade-in"><header className="flex items-center justify-between px-4 py-3 border-b border-border-subtle"><div><p className="text-sm font-semibold text-main">ROSTA Insight Kamera</p><p className="text-[10px] text-muted">Görüntüyü mesajına eklemek için fotoğraf çek.</p></div><ExactIconButton icon={X} label="Kamerayı kapat" variant="ghost" onClick={closeCamera} /></header><div className="bg-black aspect-video"><video ref={videoRef} muted playsInline className="h-full w-full object-contain" /></div><footer className="flex items-center justify-center gap-3 p-4"><ExactButton variant="secondary" onClick={closeCamera}><MicOff className="h-4 w-4" /> Vazgeç</ExactButton><ExactButton onClick={capture}><Camera className="h-4 w-4" /> Fotoğraf çek</ExactButton></footer></div></div> : null}
  </div>;
}

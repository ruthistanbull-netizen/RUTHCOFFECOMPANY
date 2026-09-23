import crypto from "node:crypto";

export type RuthieSurface = "chat" | "voice";
export type RuthieStoredRole = "user" | "assistant" | "system";

export type RuthieStoredMessage = {
  id: string;
  conversationId: string;
  role: RuthieStoredRole;
  surface: RuthieSurface;
  text: string;
  clientMessageId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type RuthieStoredMemory = {
  id: string;
  content: string;
  surface: RuthieSurface;
  createdAt: string;
  updatedAt: string;
};

export type RuthieStoredConversation = {
  id: string;
  title: string;
  lastSurface: RuthieSurface;
  createdAt: string;
  updatedAt: string;
  messages: RuthieStoredMessage[];
};

export type RuthieUnifiedContext = {
  messages: RuthieStoredMessage[];
  memories: RuthieStoredMemory[];
  context: string;
};

type RuthieConversationRow = {
  id: string;
  title: string;
  last_surface: RuthieSurface;
  created_at: string;
  updated_at: string;
};

type RuthieMemoryWriteResult = {
  id: string;
  content: string;
};

type SupabaseAdmin = any;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REMEMBER_PATTERN = /\b(aklında tut|aklinda tut|bunu unutma|unutma ki|hatırla ki|hatirla ki|şunu öğren|sunu ogren|bunu öğren|bunu ogren|bundan sonra|remember this|keep in mind|from now on)\b/i;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function cleanText(value: unknown, max = 24_000): string {
  return typeof value === "string" ? value.replace(/\u0000/g, "").trim().slice(0, max) : "";
}

function normalizeId(value: unknown): string {
  const id = cleanText(value, 80);
  return UUID_PATTERN.test(id) ? id : "";
}

function normalizeSurface(value: unknown): RuthieSurface {
  return value === "voice" ? "voice" : "chat";
}

function normalizeRole(value: unknown): RuthieStoredRole {
  return value === "assistant" || value === "system" ? value : "user";
}

function mapMessage(value: unknown): RuthieStoredMessage {
  const row = asRecord(value);
  const metadata = asRecord(row.metadata);
  return {
    id: String(row.id || ""),
    conversationId: String(row.conversation_id || ""),
    role: normalizeRole(row.role),
    surface: normalizeSurface(row.surface),
    text: String(row.content || ""),
    clientMessageId: String(row.client_message_id || row.id || ""),
    metadata,
    createdAt: String(row.created_at || ""),
  };
}

function mapConversationRow(value: unknown): RuthieConversationRow {
  const row = asRecord(value);
  return {
    id: String(row.id || ""),
    title: String(row.title || "Yeni sohbet"),
    last_surface: normalizeSurface(row.last_surface),
    created_at: String(row.created_at || ""),
    updated_at: String(row.updated_at || ""),
  };
}

function mapMemory(value: unknown): RuthieStoredMemory {
  const row = asRecord(value);
  return {
    id: String(row.id || ""),
    content: String(row.content || ""),
    surface: normalizeSurface(row.source_surface),
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
  };
}

function titleFromText(value: string): string {
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) return "Yeni sohbet";
  return text.length > 70 ? `${text.slice(0, 70).trim()}…` : text;
}

export async function ensureRuthieConversation(options: {
  supabase: SupabaseAdmin;
  profileId: string;
  conversationId?: string | null;
  title?: string;
  surface?: RuthieSurface;
}): Promise<RuthieConversationRow> {
  const { supabase, profileId } = options;
  const requestedId = normalizeId(options.conversationId);
  const surface = normalizeSurface(options.surface);
  const title = cleanText(options.title, 160) || "Yeni sohbet";

  if (requestedId) {
    const { data: existing, error: readError } = await supabase
      .from("ruthie_conversations")
      .select("id, title, last_surface, created_at, updated_at")
      .eq("id", requestedId)
      .eq("profile_id", profileId)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (existing) {
      const now = new Date().toISOString();
      await supabase
        .from("ruthie_conversations")
        .update({ last_surface: surface, updated_at: now })
        .eq("id", requestedId)
        .eq("profile_id", profileId);
      return { ...mapConversationRow(existing), last_surface: surface, updated_at: now };
    }
  }

  const row: Record<string, unknown> = {
    profile_id: profileId,
    title,
    last_surface: surface,
  };
  if (requestedId) row.id = requestedId;

  const { data, error } = await supabase
    .from("ruthie_conversations")
    .insert(row)
    .select("id, title, last_surface, created_at, updated_at")
    .single();

  if (error) {
    if (error.code === "23505" && requestedId) {
      const { data: collision, error: collisionError } = await supabase
        .from("ruthie_conversations")
        .select("id, title, last_surface, created_at, updated_at")
        .eq("id", requestedId)
        .eq("profile_id", profileId)
        .maybeSingle();
      if (collisionError) throw new Error(collisionError.message);
      if (collision) return mapConversationRow(collision);
    }
    throw new Error(error.message);
  }
  return mapConversationRow(data);
}

export async function appendRuthieMessage(options: {
  supabase: SupabaseAdmin;
  profileId: string;
  conversationId: string;
  role: RuthieStoredRole;
  surface: RuthieSurface;
  text: string;
  clientMessageId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<RuthieStoredMessage> {
  const text = cleanText(options.text);
  if (!text) throw new Error("ROSTA Insight mesajı boş olamaz.");
  const conversation = await ensureRuthieConversation({
    supabase: options.supabase,
    profileId: options.profileId,
    conversationId: options.conversationId,
    surface: options.surface,
    title: options.role === "user" ? titleFromText(text) : undefined,
  });
  const clientMessageId = cleanText(options.clientMessageId, 180) || crypto.randomUUID();

  const payload = {
    conversation_id: conversation.id,
    profile_id: options.profileId,
    role: options.role,
    surface: normalizeSurface(options.surface),
    content: text,
    client_message_id: clientMessageId,
    metadata: options.metadata || {},
  };

  const { data, error } = await options.supabase
    .from("ruthie_messages")
    .insert(payload)
    .select("id, conversation_id, role, surface, content, client_message_id, metadata, created_at")
    .single();

  let stored: unknown = data;
  if (error?.code === "23505") {
    const duplicate = await options.supabase
      .from("ruthie_messages")
      .select("id, conversation_id, role, surface, content, client_message_id, metadata, created_at")
      .eq("conversation_id", conversation.id)
      .eq("client_message_id", clientMessageId)
      .maybeSingle();
    if (duplicate.error) throw new Error(duplicate.error.message);
    stored = duplicate.data;
  } else if (error) {
    throw new Error(error.message);
  }

  if (!stored) throw new Error("ROSTA Insight mesajı kaydedilemedi.");

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { last_surface: options.surface, updated_at: now };
  if (options.role === "user" && conversation.title === "Yeni sohbet") updates.title = titleFromText(text);
  await options.supabase
    .from("ruthie_conversations")
    .update(updates)
    .eq("id", conversation.id)
    .eq("profile_id", options.profileId);

  const mapped = mapMessage(stored);
  if (options.role === "user") {
    await maybeCaptureRuthieMemory({
      supabase: options.supabase,
      profileId: options.profileId,
      conversationId: conversation.id,
      messageId: mapped.id,
      surface: options.surface,
      text,
    });
  }
  return mapped;
}

export async function loadRuthieMessages(options: {
  supabase: SupabaseAdmin;
  profileId: string;
  conversationId: string;
  limit?: number;
}): Promise<RuthieStoredMessage[]> {
  const conversationId = normalizeId(options.conversationId);
  if (!conversationId) return [];
  const limit = Math.max(1, Math.min(120, options.limit || 80));
  const { data, error } = await options.supabase
    .from("ruthie_messages")
    .select("id, conversation_id, role, surface, content, client_message_id, metadata, created_at")
    .eq("conversation_id", conversationId)
    .eq("profile_id", options.profileId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  const rows: unknown[] = Array.isArray(data) ? data : [];
  return rows.reverse().map(mapMessage);
}

export async function listRuthieConversations(options: {
  supabase: SupabaseAdmin;
  profileId: string;
  includeMessages?: boolean;
  limit?: number;
}): Promise<RuthieStoredConversation[]> {
  const limit = Math.max(1, Math.min(60, options.limit || 60));
  const { data, error } = await options.supabase
    .from("ruthie_conversations")
    .select("id, title, last_surface, created_at, updated_at")
    .eq("profile_id", options.profileId)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);

  const rows: unknown[] = Array.isArray(data) ? data : [];
  const conversations: RuthieStoredConversation[] = rows.map((value: unknown) => {
    const row = mapConversationRow(value);
    return {
      id: row.id,
      title: row.title,
      lastSurface: row.last_surface,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      messages: [],
    };
  });
  if (!options.includeMessages || !conversations.length) return conversations;

  const ids = conversations.map((item: RuthieStoredConversation) => item.id);
  const { data: messageRows, error: messageError } = await options.supabase
    .from("ruthie_messages")
    .select("id, conversation_id, role, surface, content, client_message_id, metadata, created_at")
    .eq("profile_id", options.profileId)
    .in("conversation_id", ids)
    .order("created_at", { ascending: true });
  if (messageError) throw new Error(messageError.message);
  const grouped = new Map<string, RuthieStoredMessage[]>();
  const storedRows: unknown[] = Array.isArray(messageRows) ? messageRows : [];
  for (const value of storedRows) {
    const message = mapMessage(value);
    const list = grouped.get(message.conversationId) || [];
    list.push(message);
    grouped.set(message.conversationId, list.slice(-80));
  }
  return conversations.map((conversation: RuthieStoredConversation) => ({
    ...conversation,
    messages: grouped.get(conversation.id) || [],
  }));
}

export async function deleteRuthieConversation(options: {
  supabase: SupabaseAdmin;
  profileId: string;
  conversationId: string;
}): Promise<boolean> {
  const id = normalizeId(options.conversationId);
  if (!id) return false;
  const { error } = await options.supabase
    .from("ruthie_conversations")
    .delete()
    .eq("id", id)
    .eq("profile_id", options.profileId);
  if (error) throw new Error(error.message);
  return true;
}

export async function renameRuthieConversation(options: {
  supabase: SupabaseAdmin;
  profileId: string;
  conversationId: string;
  title: string;
}): Promise<RuthieConversationRow> {
  const id = normalizeId(options.conversationId);
  const title = cleanText(options.title, 160);
  if (!id || !title) throw new Error("Geçerli sohbet ve başlık gerekli.");
  const { data, error } = await options.supabase
    .from("ruthie_conversations")
    .update({ title, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("profile_id", options.profileId)
    .select("id, title, last_surface, created_at, updated_at")
    .single();
  if (error) throw new Error(error.message);
  return mapConversationRow(data);
}

export async function loadRuthieMemories(options: {
  supabase: SupabaseAdmin;
  profileId: string;
  limit?: number;
}): Promise<RuthieStoredMemory[]> {
  const limit = Math.max(1, Math.min(50, options.limit || 30));
  const { data, error } = await options.supabase
    .from("ruthie_memories")
    .select("id, content, source_surface, created_at, updated_at")
    .eq("profile_id", options.profileId)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  const rows: unknown[] = Array.isArray(data) ? data : [];
  return rows.map(mapMemory);
}

export async function buildRuthieUnifiedContext(options: {
  supabase: SupabaseAdmin;
  profileId: string;
  conversationId: string;
  messageLimit?: number;
}): Promise<RuthieUnifiedContext> {
  const [messages, memories] = await Promise.all([
    loadRuthieMessages({ ...options, limit: options.messageLimit || 40 }),
    loadRuthieMemories({ supabase: options.supabase, profileId: options.profileId }),
  ]);
  const memoryText = memories.length
    ? `ORTAK ROSTA INSIGHT HAFIZASI:\n${memories.map((memory: RuthieStoredMemory, index: number) => `${index + 1}. ${memory.content}`).join("\n")}`
    : "";
  const conversationText = messages.length
    ? `ORTAK CHAT + VOICE SOHBETİ:\n${messages.map((message: RuthieStoredMessage) => `${message.role === "user" ? "Kullanıcı" : message.role === "assistant" ? "ROSTA Insight" : "Sistem"}: ${message.text}`).join("\n")}`
    : "";
  return {
    messages,
    memories,
    context: [memoryText, conversationText].filter(Boolean).join("\n\n").slice(-18_000),
  };
}

async function maybeCaptureRuthieMemory(options: {
  supabase: SupabaseAdmin;
  profileId: string;
  conversationId: string;
  messageId: string;
  surface: RuthieSurface;
  text: string;
}): Promise<RuthieMemoryWriteResult | null> {
  if (!REMEMBER_PATTERN.test(options.text)) return null;
  const content = cleanText(options.text, 2_000);
  if (!content) return null;
  const contentHash = crypto.createHash("sha256").update(content.toLocaleLowerCase("tr-TR")).digest("hex");
  const { data, error } = await options.supabase
    .from("ruthie_memories")
    .upsert({
      profile_id: options.profileId,
      content,
      content_hash: contentHash,
      source_conversation_id: options.conversationId,
      source_message_id: options.messageId,
      source_surface: options.surface,
      is_active: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: "profile_id,content_hash" })
    .select("id, content")
    .single();
  if (error) throw new Error(error.message);
  const row = asRecord(data);
  return { id: String(row.id || ""), content: String(row.content || content) };
}

"use client";

import {
  ArrowLeft,
  Copy,
  Eye,
  ImagePlus,
  Mail,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  useSaveLifecycle,
  useSaveLifecycleSource,
} from "@ruth-commerce/ui";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adminRequest } from "@/lib/adminApi";
import {
  buildMarketingEmailHtml,
  getReadyEmailTemplate,
  readyEmailTemplates,
  type EmailTemplateFields,
} from "@/lib/emailTemplates";
import {
  ExactButton,
  ExactField,
  ExactIconButton,
  ExactPageHeader,
  ExactSearchInput,
  ExactSegmentedControl,
  ExactSkeleton,
  exactFormInputClass,
  useExactToast,
} from "./primitives";
import { ExactDataCard, ExactEmptyState, ExactMetricCard } from "./data";

type TemplateType = "campaign" | "service" | "automation";
type EmailTemplate = {
  id: string;
  template_key: string;
  name: string;
  type: TemplateType;
  subject: string;
  preheader?: string | null;
  body?: string | null;
  html?: string | null;
  fields?: Partial<EmailTemplateFields> | null;
  enabled?: boolean;
  updated_at?: string | null;
  category?: string;
  description?: string;
};

type EditorState = {
  id: string;
  templateKey: string;
  name: string;
  type: TemplateType;
  category: string;
  description: string;
  enabled: boolean;
  fields: EmailTemplateFields;
};

const variableTokens = [
  "{{customer_name}}",
  "{{last_order_no}}",
  "{{order_count}}",
  "{{total_spent}}",
  "{{checkout_url}}",
  "{{review_url}}",
  "{{activation_url}}",
];

const previewVariables = {
  customer_name: "Ayşe",
  order_count: 2,
  total_spent: 2480,
  last_order_no: "RTH-1234",
  checkout_url: "https://www.ruthistanbul.com/checkout",
  review_url: "https://www.ruthistanbul.com/account/orders",
  activation_url: "https://www.ruthistanbul.com/account/activate",
};

function typeFromCategory(category: string): TemplateType {
  const normalized = category.toLocaleLowerCase("tr-TR");
  if (normalized.includes("otomasyon")) return "automation";
  if (normalized.includes("hizmet") || normalized.includes("müşteri")) return "service";
  return "campaign";
}

function normalizeFields(template: EmailTemplate): EmailTemplateFields {
  const ready = readyEmailTemplates.find((item) => item.key === template.template_key);
  const fallback = ready?.fields || getReadyEmailTemplate("soft_discount").fields;
  const source = template.fields || {};
  return {
    subject: String(source.subject ?? template.subject ?? fallback.subject),
    preheader: String(source.preheader ?? template.preheader ?? fallback.preheader),
    headline: String(source.headline ?? fallback.headline),
    intro: String(source.intro ?? template.body ?? fallback.intro),
    offer: String(source.offer ?? fallback.offer),
    buttonLabel: String(source.buttonLabel ?? fallback.buttonLabel),
    buttonUrl: String(source.buttonUrl ?? fallback.buttonUrl),
    note: String(source.note ?? fallback.note),
    heroImageUrl: String(source.heroImageUrl ?? fallback.heroImageUrl),
    logoUrl: String(source.logoUrl ?? fallback.logoUrl ?? ""),
  };
}

function toEditor(template: EmailTemplate): EditorState {
  return {
    id: template.id,
    templateKey: template.template_key || template.id,
    name: template.name,
    type: template.type || typeFromCategory(template.category || ""),
    category: template.category || "Özel",
    description: template.description || "Panelden düzenlenen Ruth Istanbul e-posta şablonu.",
    enabled: template.enabled !== false,
    fields: normalizeFields(template),
  };
}

function editorFingerprint(editor: EditorState) {
  return JSON.stringify({
    id: editor.id,
    templateKey: editor.templateKey,
    name: editor.name,
    type: editor.type,
    category: editor.category,
    description: editor.description,
    enabled: editor.enabled,
    fields: editor.fields,
  });
}

function dateTime(value?: string | null) {
  const date = new Date(value || "");
  return Number.isNaN(date.getTime())
    ? "Hazır şablon"
    : new Intl.DateTimeFormat("tr-TR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
}

function defaultTemplate(key: string): EmailTemplate {
  const ready = getReadyEmailTemplate(key);
  return {
    id: ready.key,
    template_key: ready.key,
    name: ready.title,
    type: typeFromCategory(ready.category),
    subject: ready.fields.subject,
    preheader: ready.fields.preheader,
    body: ready.fields.intro,
    html: buildMarketingEmailHtml(ready.fields),
    fields: ready.fields,
    enabled: true,
    category: ready.category,
    description: ready.description,
  };
}

export function ExactEmailTemplates() {
  const router = useRouter();
  const toast = useExactToast();
  const {
    save: saveLifecycle,
    discard: discardLifecycle,
    requestTransition,
    saving: savePending,
  } = useSaveLifecycle();
  const initialEditor = toEditor(defaultTemplate("soft_discount"));
  const [templates, setTemplates] = useState<EmailTemplate[]>(readyEmailTemplates.map((item) => defaultTemplate(item.key)));
  const [selectedKey, setSelectedKey] = useState("soft_discount");
  const [editor, setEditor] = useState<EditorState>(initialEditor);
  const [savedEditor, setSavedEditor] = useState<EditorState>(initialEditor);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | TemplateType>("all");
  const [activeField, setActiveField] = useState<keyof EmailTemplateFields>("intro");
  const [loading, setLoading] = useState(true);
  const [deletePending, setDeletePending] = useState(false);
  const editorRef = useRef(editor);
  const savedEditorRef = useRef(savedEditor);
  const templatesRef = useRef(templates);
  editorRef.current = editor;
  savedEditorRef.current = savedEditor;
  templatesRef.current = templates;

  const editorPersisted = templates.some(
    (item) => item.template_key === editor.templateKey || item.id === editor.id,
  );
  const editorDirty = !editorPersisted || editorFingerprint(editor) !== editorFingerprint(savedEditor);

  const commitEditor = useCallback((nextEditor: EditorState) => {
    editorRef.current = nextEditor;
    savedEditorRef.current = nextEditor;
    setSelectedKey(nextEditor.templateKey);
    setEditor(nextEditor);
    setSavedEditor(nextEditor);
  }, []);

  const acceptTemplate = useCallback((template: EmailTemplate) => {
    commitEditor(toEditor(template));
  }, [commitEditor]);

  const load = useCallback(async (preferredKey?: string) => {
    setLoading(true);
    try {
      const result = await adminRequest<{ templates?: EmailTemplate[] }>("/api/email/templates", { force: true });
      const next = result.templates?.length
        ? result.templates
        : readyEmailTemplates.map((item) => defaultTemplate(item.key));
      templatesRef.current = next;
      setTemplates(next);
      const targetKey = preferredKey || editorRef.current.templateKey;
      const chosen = next.find((item) => item.template_key === targetKey || item.id === targetKey) || next[0];
      if (chosen) acceptTemplate(chosen);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "E-posta şablonları alınamadı.");
    } finally {
      setLoading(false);
    }
  }, [acceptTemplate, toast]);

  useEffect(() => {
    void load("soft_discount");
  }, [load]);

  const choose = useCallback((template: EmailTemplate) => {
    if ((template.template_key || template.id) === editorRef.current.templateKey) return;
    void requestTransition(() => acceptTemplate(template));
  }, [acceptTemplate, requestTransition]);

  const updateEditor = useCallback((updater: (current: EditorState) => EditorState) => {
    setEditor((current) => {
      const next = updater(current);
      editorRef.current = next;
      return next;
    });
  }, []);

  const updateField = (key: keyof EmailTemplateFields, value: string) => {
    updateEditor((current) => ({ ...current, fields: { ...current.fields, [key]: value } }));
  };

  const insertVariable = (token: string) => {
    updateEditor((current) => ({
      ...current,
      fields: {
        ...current.fields,
        [activeField]: `${current.fields[activeField] || ""}${current.fields[activeField] ? " " : ""}${token}`,
      },
    }));
  };

  const validateEditor = useCallback(() => {
    const current = editorRef.current;
    if (!current.name.trim() || !current.fields.subject.trim() || !current.fields.headline.trim()) {
      toast.error("Şablon adı, mail konusu ve büyük başlık zorunlu.");
      return false;
    }
    return true;
  }, [toast]);

  const persistEditor = useCallback(async () => {
    const currentEditor = editorRef.current;
    const currentTemplates = templatesRef.current;
    try {
      const html = buildMarketingEmailHtml(currentEditor.fields, previewVariables);
      const existing = currentTemplates.find((item) => item.template_key === currentEditor.templateKey || item.id === currentEditor.id);
      const result = await adminRequest<{ template?: EmailTemplate }>("/api/email/templates", {
        method: existing ? "PUT" : "POST",
        body: JSON.stringify({
          id: currentEditor.id,
          template_key: currentEditor.templateKey,
          name: currentEditor.name,
          type: currentEditor.type,
          subject: currentEditor.fields.subject,
          preheader: currentEditor.fields.preheader,
          body: [currentEditor.fields.intro, currentEditor.fields.offer, currentEditor.fields.note].filter(Boolean).join("\n\n"),
          fields: currentEditor.fields,
          html,
          enabled: currentEditor.enabled,
        }),
      });
      const persisted = result.template || {
        id: currentEditor.id,
        template_key: currentEditor.templateKey,
        name: currentEditor.name,
        type: currentEditor.type,
        subject: currentEditor.fields.subject,
        fields: currentEditor.fields,
        html,
        enabled: currentEditor.enabled,
        category: currentEditor.category,
        description: currentEditor.description,
      };
      const nextTemplates = currentTemplates.some((item) => item.template_key === persisted.template_key || item.id === persisted.id)
        ? currentTemplates.map((item) => item.template_key === persisted.template_key || item.id === persisted.id ? persisted : item)
        : [persisted, ...currentTemplates];
      templatesRef.current = nextTemplates;
      setTemplates(nextTemplates);
      commitEditor(toEditor(persisted));
      toast.success("E-posta şablonunun bütün alanları kaydedildi.");
      return true;
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Şablon kaydedilemedi.");
      return false;
    }
  }, [commitEditor, toast]);

  const discardEditor = useCallback(() => {
    const baseline = savedEditorRef.current;
    editorRef.current = baseline;
    setEditor(baseline);
    setSelectedKey(baseline.templateKey);
  }, []);

  useSaveLifecycleSource({
    id: "email-template-editor",
    dirty: editorDirty,
    validate: validateEditor,
    save: persistEditor,
    discard: discardEditor,
  });

  const duplicateImmediately = useCallback(() => {
    const source = editorRef.current;
    const stamp = Date.now();
    const copy: EditorState = {
      ...source,
      id: `custom_${stamp}`,
      templateKey: `custom_${stamp}`,
      name: `${source.name} Kopya`,
      category: "Özel",
      description: "Kopyalanarak oluşturulan özel e-posta şablonu.",
      fields: { ...source.fields },
    };
    editorRef.current = copy;
    setSelectedKey(copy.templateKey);
    setEditor(copy);
    toast.info("Şablon kopyalandı. Kalıcı olması için kaydet.");
  }, [toast]);

  const duplicate = () => {
    void requestTransition(duplicateImmediately);
  };

  const createNewImmediately = useCallback(() => {
    const stamp = Date.now();
    const base = getReadyEmailTemplate("soft_discount");
    const next: EditorState = {
      id: `custom_${stamp}`,
      templateKey: `custom_${stamp}`,
      name: "Yeni E-posta Şablonu",
      type: "campaign",
      category: "Özel",
      description: "Sıfırdan hazırlanan özel Ruth Istanbul e-posta şablonu.",
      enabled: true,
      fields: { ...base.fields, subject: "", preheader: "", headline: "", intro: "", offer: "", note: "", heroImageUrl: "" },
    };
    editorRef.current = next;
    setSelectedKey(next.templateKey);
    setEditor(next);
  }, []);

  const createNew = () => {
    void requestTransition(createNewImmediately);
  };

  const removeOrReset = useCallback(async () => {
    if (deletePending) return;
    const currentEditor = editorRef.current;
    const currentTemplates = templatesRef.current;
    const persistedTarget = currentTemplates.find(
      (item) => item.template_key === currentEditor.templateKey || item.id === currentEditor.id,
    );
    if (!persistedTarget) return;

    setDeletePending(true);
    try {
      await adminRequest(`/api/email/templates?id=${encodeURIComponent(currentEditor.id || currentEditor.templateKey)}`, { method: "DELETE" });
      const builtInTarget = readyEmailTemplates.some((item) => item.key === currentEditor.templateKey);
      if (builtInTarget) {
        const restored = defaultTemplate(currentEditor.templateKey);
        const nextTemplates = currentTemplates.map((item) => item.template_key === currentEditor.templateKey ? restored : item);
        templatesRef.current = nextTemplates;
        setTemplates(nextTemplates);
        acceptTemplate(restored);
        toast.success("Şablon hazır Ruth tasarımına döndürüldü.");
      } else {
        const remaining = currentTemplates.filter((item) => item.template_key !== currentEditor.templateKey && item.id !== currentEditor.id);
        templatesRef.current = remaining;
        setTemplates(remaining);
        const next = remaining[0] || defaultTemplate("soft_discount");
        acceptTemplate(next);
        toast.success("Özel şablon silindi.");
      }
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Şablon işlemi tamamlanamadı.");
    } finally {
      setDeletePending(false);
    }
  }, [acceptTemplate, deletePending, toast]);

  const requestRemoveOrReset = () => {
    if (savePending || deletePending) return;
    if (!editorPersisted) {
      void discardLifecycle();
      toast.info("Kaydedilmemiş şablon taslağı silindi.");
      return;
    }
    void requestTransition(() => { void removeOrReset(); });
  };

  const requestRefresh = () => {
    if (loading || savePending || deletePending) return;
    const targetKey = editorRef.current.templateKey;
    void requestTransition(() => { void load(targetKey); });
  };

  const requestNavigate = (href: string) => {
    if (savePending || deletePending) return;
    void requestTransition(() => router.push(href));
  };

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("tr-TR");
    return templates.filter((template) => {
      if (filter !== "all" && template.type !== filter) return false;
      return !needle || `${template.name} ${template.category || ""} ${template.description || ""} ${template.subject}`.toLocaleLowerCase("tr-TR").includes(needle);
    });
  }, [filter, query, templates]);

  const previewHtml = useMemo(
    () => buildMarketingEmailHtml(editor.fields, previewVariables),
    [editor.fields],
  );

  const stats = useMemo(() => ({
    total: templates.length,
    campaign: templates.filter((item) => item.type === "campaign").length,
    service: templates.filter((item) => item.type === "service").length,
    automation: templates.filter((item) => item.type === "automation").length,
  }), [templates]);

  const builtIn = readyEmailTemplates.some((item) => item.key === editor.templateKey);

  return (
    <div className="space-y-4 animate-fade-in" data-exact-base44-page="email-templates">
      <ExactPageHeader
        title="E-posta Şablonları"
        subtitle="Konu, içerik, teklif, görsel, CTA, değişkenler ve canlı önizleme"
        actions={
          <>
            <ExactButton variant="secondary" size="sm" onClick={() => requestNavigate("/email")} disabled={savePending || deletePending}>
              <ArrowLeft className="h-4 w-4" /> E-posta merkezi
            </ExactButton>
            <ExactIconButton icon={RefreshCw} label="Yenile" variant="secondary" onClick={requestRefresh} loading={loading} disabled={savePending || deletePending} />
            <ExactButton variant="secondary" size="sm" onClick={createNew} disabled={savePending || deletePending}><Plus className="h-4 w-4" /> Yeni şablon</ExactButton>
            <ExactButton size="sm" onClick={() => requestNavigate(`/email/customers?template=${encodeURIComponent(editor.templateKey)}`)} disabled={savePending || deletePending}>
              <Send className="h-4 w-4" /> Bu şablonla gönder
            </ExactButton>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <ExactMetricCard label="Toplam Şablon" value={stats.total} icon={Mail} />
        <ExactMetricCard label="Kampanya" value={stats.campaign} icon={Send} />
        <ExactMetricCard label="Hizmet" value={stats.service} icon={Mail} />
        <ExactMetricCard label="Otomasyon" value={stats.automation} icon={Sparkles} />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[320px_1fr]">
        <div className="space-y-3 xl:sticky xl:top-20">
          <ExactSearchInput value={query} onChange={setQuery} placeholder="Şablon ara..." />
          <ExactSegmentedControl
            size="sm"
            value={filter}
            onChange={(value) => setFilter(value as typeof filter)}
            options={[
              { value: "all", label: "Tümü" },
              { value: "campaign", label: "Kampanya" },
              { value: "service", label: "Hizmet" },
              { value: "automation", label: "Otomasyon" },
            ]}
          />
          {loading ? <ExactSkeleton className="h-[620px]" /> : (
            <ExactDataCard noPadding>
              <div className="max-h-[70vh] divide-y divide-border-subtle overflow-y-auto no-scrollbar">
                {visible.map((template) => {
                  const active = selectedKey === (template.template_key || template.id);
                  return (
                    <button key={template.id} type="button" onClick={() => choose(template)} className={`w-full p-3 text-left transition-all hover:bg-surface-secondary ${active ? "bg-accent-soft" : ""}`} disabled={savePending || deletePending}>
                      <div className="flex items-start gap-3">
                        <div className={`flex h-9 w-9 shrink-0 items-center justify-center radius-small ${active ? "bg-accent text-white" : "bg-surface-tertiary text-subtle"}`}><Mail className="h-4 w-4" /></div>
                        <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className={`ruth-type-card-title truncate ${active ? "text-accent" : "text-main"}`}>{template.name}</p>{template.enabled === false ? <span className="ruth-type-caption rounded-full bg-neutral-soft px-1.5 py-0.5 text-neutral-foreground">Pasif</span> : null}</div><p className="ruth-type-label mt-0.5 font-medium uppercase tracking-wide text-subtle">{template.category || template.type}</p><p className="ruth-type-caption mt-1 line-clamp-2 text-muted">{template.description || template.subject}</p><p className="ruth-type-code mt-2 text-subtle">{dateTime(template.updated_at)}</p></div>
                      </div>
                    </button>
                  );
                })}
                {!visible.length ? <ExactEmptyState compact icon={Mail} title="Şablon bulunamadı" /> : null}
              </div>
            </ExactDataCard>
          )}
        </div>

        <div className="space-y-4">
          <ExactDataCard
            title={editor.name}
            action={
              <div className="flex items-center gap-2">
                <ExactButton variant="secondary" size="sm" onClick={duplicate} disabled={savePending || deletePending}><Copy className="h-4 w-4" /> Kopyala</ExactButton>
                <ExactButton variant={builtIn ? "secondary" : "destructive"} size="sm" onClick={requestRemoveOrReset} loading={deletePending} disabled={savePending}>
                  {builtIn ? <RotateCcw className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}{builtIn ? "Varsayılana dön" : "Sil"}
                </ExactButton>
              </div>
            }
          >
            <div className="grid gap-3 md:grid-cols-2">
              <ExactField label="Şablon adı" required><input value={editor.name} onChange={(event) => updateEditor((current) => ({ ...current, name: event.target.value }))} className={exactFormInputClass} /></ExactField>
              <ExactField label="Tür"><select value={editor.type} onChange={(event) => updateEditor((current) => ({ ...current, type: event.target.value as TemplateType }))} className={exactFormInputClass}><option value="campaign">Kampanya</option><option value="service">Hizmet</option><option value="automation">Otomasyon</option></select></ExactField>
              <ExactField label="Mail konusu" required><input value={editor.fields.subject} onFocus={() => setActiveField("subject")} onChange={(event) => updateField("subject", event.target.value)} className={exactFormInputClass} /></ExactField>
              <ExactField label="Ön açıklama"><input value={editor.fields.preheader} onFocus={() => setActiveField("preheader")} onChange={(event) => updateField("preheader", event.target.value)} className={exactFormInputClass} /></ExactField>
              <ExactField label="Büyük başlık" required><input value={editor.fields.headline} onFocus={() => setActiveField("headline")} onChange={(event) => updateField("headline", event.target.value)} className={exactFormInputClass} /></ExactField>
              <ExactField label="Buton yazısı"><input value={editor.fields.buttonLabel} onFocus={() => setActiveField("buttonLabel")} onChange={(event) => updateField("buttonLabel", event.target.value)} className={exactFormInputClass} /></ExactField>
              <ExactField label="Buton linki"><input value={editor.fields.buttonUrl} onFocus={() => setActiveField("buttonUrl")} onChange={(event) => updateField("buttonUrl", event.target.value)} className={exactFormInputClass} /></ExactField>
              <ExactField label="Hero görsel URL"><input value={editor.fields.heroImageUrl} onFocus={() => setActiveField("heroImageUrl")} onChange={(event) => updateField("heroImageUrl", event.target.value)} className={exactFormInputClass} /></ExactField>
              <ExactField label="Logo URL"><input value={editor.fields.logoUrl || ""} onFocus={() => setActiveField("logoUrl")} onChange={(event) => updateField("logoUrl", event.target.value)} className={exactFormInputClass} /></ExactField>
              <button type="button" onClick={() => updateEditor((current) => ({ ...current, enabled: !current.enabled }))} className="flex items-center justify-between bg-surface-secondary p-3 radius-control"><span className="ruth-type-control text-main">Şablon aktif</span><span className={`relative h-6 w-10 rounded-full transition-colors ${editor.enabled ? "bg-accent" : "bg-surface-tertiary"}`}><span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${editor.enabled ? "translate-x-4" : ""}`} /></span></button>
            </div>
          </ExactDataCard>

          <ExactDataCard title="E-posta İçeriği" action={<Sparkles className="h-4 w-4 text-accent" />}>
            <div className="space-y-3">
              <ExactField label="Giriş yazısı"><textarea value={editor.fields.intro} onFocus={() => setActiveField("intro")} onChange={(event) => updateField("intro", event.target.value)} className={`${exactFormInputClass} min-h-28`} /></ExactField>
              <ExactField label="Teklif / açıklama"><textarea value={editor.fields.offer} onFocus={() => setActiveField("offer")} onChange={(event) => updateField("offer", event.target.value)} className={`${exactFormInputClass} min-h-24`} /></ExactField>
              <ExactField label="Alt not"><textarea value={editor.fields.note} onFocus={() => setActiveField("note")} onChange={(event) => updateField("note", event.target.value)} className={`${exactFormInputClass} min-h-20`} /></ExactField>
            </div>
          </ExactDataCard>

          <ExactDataCard title="Kişiselleştirme Değişkenleri">
            <p className="ruth-type-caption mb-3 text-muted">Bir alanın içine tıkla, sonra değişkeni seç. Gönderimde müşteri veya sipariş bilgisiyle doldurulur.</p>
            <div className="flex flex-wrap gap-2">{variableTokens.map((token) => <button key={token} type="button" onClick={() => insertVariable(token)} className="ruth-type-code rounded-full bg-accent-soft px-3 py-1.5 text-accent transition-all hover:bg-accent hover:text-white">{token}</button>)}</div>
          </ExactDataCard>

          <ExactDataCard title="Canlı E-posta Önizlemesi" action={<Eye className="h-4 w-4 text-accent" />} noPadding>
            <div className="border-b border-border-subtle bg-surface-secondary px-4 py-3"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-accent"><ImagePlus className="h-4 w-4" /></div><div><p className="ruth-type-card-title text-main">{editor.fields.subject || "Konu girilmedi"}</p><p className="ruth-type-caption text-muted">{editor.fields.preheader || "Ön açıklama girilmedi"}</p></div></div></div>
            <iframe title="E-posta şablonu canlı önizlemesi" srcDoc={previewHtml} className="h-[720px] w-full bg-white" sandbox="allow-popups allow-popups-to-escape-sandbox" />
          </ExactDataCard>

          <div className="sticky bottom-20 z-10 flex items-center justify-end gap-2 rounded-[var(--radius-card)] border border-border-subtle bg-surface-primary/95 p-3 shadow-floating backdrop-blur-xl lg:bottom-4">
            <ExactButton variant="secondary" size="sm" onClick={() => void discardLifecycle()} disabled={!editorDirty || savePending || deletePending}>Değişiklikleri iptal et</ExactButton>
            <ExactButton size="sm" onClick={() => void saveLifecycle()} loading={savePending} disabled={!editorDirty || deletePending}>
              <Save className="h-4 w-4" /> Bütün Alanları Kaydet
            </ExactButton>
          </div>
        </div>
      </div>
    </div>
  );
}

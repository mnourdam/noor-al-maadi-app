import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ShieldCheck, Plus, Trash2, Copy, Download, Upload, Eye, EyeOff,
  Save, AlertTriangle, CheckCircle2, Database, Library, FileJson, Lock,
} from "lucide-react";
import type {
  Campaign, CampaignActivity, CampaignChapter, CampaignQuestionType,
} from "@/types/campaign";
import {
  listCampaigns, upsertCampaign, deleteCampaign, duplicateCampaign,
  validateCampaign, exportAllCampaigns, exportCampaign,
  snapshotBackup, uid, slugify, CAMPAIGNS_KEY, BACKUPS_KEY,
} from "@/lib/campaignStorage";
import type { ContentRegistryItem, RegistryItemType } from "@/types/contentRegistry";
import {
  listRegistry, upsertRegistryItem, deleteRegistryItem,
  knownRegistryIds, exportRegistry, REGISTRY_KEY,
} from "@/lib/contentRegistryStorage";
import { pullAllFromCloud, pushAllToCloud } from "@/lib/cloudSync";

// ============================================================
// /admin/campaigns — Hidden admin panel
// ------------------------------------------------------------
// Passcode is a TEMPORARY placeholder. TODO: replace with real
// Supabase/Firebase auth + role check before exposing publicly.
// No public navigation links to this route exist intentionally.
// ============================================================

const ADMIN_PASSCODE = "irth-admin-1447";
const SESSION_FLAG = "irth_admin_session_v1";

export const Route = createFileRoute("/admin/campaigns")({
  // No SEO metadata — admin surface is intentionally hidden.
  head: () => ({ meta: [{ title: "لوحة إدارة الحملات" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: AdminCampaignsPage,
});

const TYPE_LABELS: Record<RegistryItemType, string> = {
  figure: "شخصية", artifact: "أثر", city: "مدينة", battle: "معركة",
  scholar: "عالم", dynasty: "دولة", badge: "وسام", achievement: "إنجاز",
};

const ACTIVITY_LABELS: Record<CampaignQuestionType, string> = {
  reading_then_question: "قراءة ثم سؤال",
  multiple_choice: "اختيار من متعدد",
  true_false: "صح أو خطأ",
  arrange_events: "ترتيب أحداث",
  decision_choice: "قرار تاريخي",
  match_pairs: "مطابقة أزواج",
  fill_blank: "ملء الفراغ",
  reflection_prompt: "سؤال تأملي",
};

// ----- Passcode gate -----
function AdminCampaignsPage() {
  const [authed, setAuthed] = useState(false);
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.sessionStorage.getItem(SESSION_FLAG) === "1") setAuthed(true);
  }, []);

  if (!authed) {
    return (
      <div dir="rtl" className="min-h-screen bg-[#0a0f1e] text-foreground flex items-center justify-center p-6">
        <div className="w-full max-w-sm rounded-2xl border border-gold/30 bg-gradient-to-b from-[#0f1a36] to-[#0a0f1e] p-6 shadow-[0_0_60px_-20px_rgba(212,175,55,0.4)]">
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="grid size-12 place-items-center rounded-full bg-gold/15 text-gold">
              <Lock className="size-5" />
            </div>
            <h1 className="font-display text-xl font-bold text-gold">لوحة إدارة الحملات</h1>
            <p className="text-xs text-muted-foreground">منطقة محمية · أدخل رمز الدخول للمتابعة</p>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (code === ADMIN_PASSCODE) {
                window.sessionStorage.setItem(SESSION_FLAG, "1");
                setAuthed(true);
              } else setErr("رمز الدخول غير صحيح.");
            }}
            className="mt-5 space-y-3"
          >
            <input
              type="password"
              value={code}
              onChange={(e) => { setCode(e.target.value); setErr(""); }}
              placeholder="رمز الدخول"
              className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-foreground outline-none focus:border-gold/60"
              autoFocus
            />
            {err && <p className="text-xs text-red-400">{err}</p>}
            <button type="submit" className="w-full rounded-xl bg-gradient-gold py-2 text-sm font-bold text-primary-foreground shadow-gold">
              دخول
            </button>
            <p className="text-center text-[10px] text-muted-foreground">
              {/* TODO: replace passcode with Supabase/Firebase auth + admin role check */}
              نسخة مؤقتة — سيستبدل لاحقًا بمصادقة كاملة.
            </p>
          </form>
        </div>
      </div>
    );
  }

  return <AdminShell onLogout={() => { window.sessionStorage.removeItem(SESSION_FLAG); setAuthed(false); }} />;
}

// ----- Main shell + tabs -----
type Tab = "list" | "edit" | "registry" | "import" | "backup";

function AdminShell({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>("list");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [registry, setRegistry] = useState<ContentRegistryItem[]>([]);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [toast, setToast] = useState<{ kind: "ok" | "err" | "warn"; msg: string } | null>(null);

  const refresh = () => {
    setCampaigns(listCampaigns());
    setRegistry(listRegistry());
  };
  useEffect(() => {
    // Initial local read, then pull latest from cloud and re-read.
    refresh();
    pullAllFromCloud().then((res) => {
      if (res) {
        refresh();
        notify("ok", `تمت المزامنة من السحابة: ${res.campaigns} حملة، ${res.registry} عنصر سجل.`);
      }
    });
  }, []);

  const notify = (kind: "ok" | "err" | "warn", msg: string) => {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 3500);
  };

  const openEdit = (c: Campaign | null) => {
    setEditing(
      c ?? {
        id: uid("camp"),
        slug: "",
        title: "",
        status: "draft",
        chapters: [],
      },
    );
    setTab("edit");
  };

  const TABS: { id: Tab; label: string; icon: any }[] = [
    { id: "list",     label: "الحملات",           icon: Library },
    { id: "edit",     label: editing ? "تحرير حملة" : "إضافة حملة", icon: Plus },
    { id: "registry", label: "سجل المحتوى",       icon: Database },
    { id: "import",   label: "استيراد JSON",      icon: Upload },
    { id: "backup",   label: "تصدير ونسخ احتياطي", icon: Download },
  ];

  return (
    <div dir="rtl" className="min-h-screen bg-[#0a0f1e] text-foreground">
      <header className="sticky top-0 z-20 border-b border-gold/20 bg-[#0a0f1e]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-gold" />
            <div>
              <h1 className="font-display text-base font-bold text-gold">لوحة إدارة الحملات</h1>
              <p className="text-[10px] text-muted-foreground">منطقة خاصة · غير مرئية في التطبيق العام</p>
            </div>
          </div>
          <button onClick={onLogout} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">
            خروج
          </button>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-2 pb-2">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                tab === t.id
                  ? "bg-gold/15 text-gold ring-1 ring-gold/40"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <t.icon className="size-3.5" /> {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        {tab === "list" && (
          <CampaignsList
            campaigns={campaigns}
            onNew={() => openEdit(null)}
            onEdit={(c) => openEdit(c)}
            onDuplicate={(c) => { duplicateCampaign(c.id); refresh(); notify("ok", "تم تكرار الحملة."); }}
            onDelete={(c) => {
              if (confirm(`هل تريد حذف الحملة "${c.title}"؟ لا يمكن التراجع.`)) {
                deleteCampaign(c.id); refresh(); notify("ok", "تم حذف الحملة.");
              }
            }}
            onTogglePublish={(c) => {
              const next = { ...c, status: c.status === "published" ? ("draft" as const) : ("published" as const) };
              upsertCampaign(next); refresh();
              notify("ok", next.status === "published" ? "تم نشر الحملة." : "تم تحويلها إلى مسودة.");
            }}
            onExport={(c) => downloadJson(`${c.id}.json`, exportCampaign(c.id))}
          />
        )}

        {tab === "edit" && editing && (
          <CampaignEditor
            value={editing}
            registry={registry}
            onCancel={() => { setEditing(null); setTab("list"); }}
            onSave={(c) => {
              const v = validateCampaign(c, knownRegistryIds());
              if (!v.ok || !v.normalized) {
                notify("err", v.issues.find(i => i.level === "error")?.message ?? "فشل التحقق.");
                return;
              }
              upsertCampaign(v.normalized);
              refresh();
              setEditing(null);
              setTab("list");
              notify("ok", "تم حفظ الحملة.");
              const warns = v.issues.filter(i => i.level === "warning");
              if (warns.length) notify("warn", warns[0].message);
            }}
          />
        )}

        {tab === "registry" && (
          <RegistryPanel
            items={registry}
            onSave={(item) => { upsertRegistryItem(item); refresh(); notify("ok", "تم الحفظ في سجل المحتوى."); }}
            onDelete={(id) => {
              if (confirm("حذف هذا العنصر من سجل المحتوى؟")) { deleteRegistryItem(id); refresh(); notify("ok", "تم الحذف."); }
            }}
          />
        )}

        {tab === "import" && (
          <ImportPanel
            onImported={() => { refresh(); notify("ok", "تم استيراد الحملة."); setTab("list"); }}
            notify={notify}
          />
        )}

        {tab === "backup" && (
          <BackupPanel
            campaigns={campaigns}
            registry={registry}
            onSnapshot={() => { snapshotBackup("manual"); notify("ok", "تم إنشاء نسخة احتياطية."); }}
            onRefresh={refresh}
            notify={notify}
          />
        )}
      </main>

      {toast && (
        <div className={`fixed bottom-6 left-1/2 z-30 -translate-x-1/2 rounded-xl border px-4 py-2 text-sm shadow-lg backdrop-blur ${
          toast.kind === "ok"  ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-200"
          : toast.kind === "warn" ? "border-amber-400/40 bg-amber-500/15 text-amber-200"
          : "border-red-400/40 bg-red-500/15 text-red-200"
        }`}>
          {toast.kind === "ok" ? <CheckCircle2 className="me-1 inline size-4" /> : <AlertTriangle className="me-1 inline size-4" />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ----- Campaigns list -----
function CampaignsList(props: {
  campaigns: Campaign[];
  onNew: () => void;
  onEdit: (c: Campaign) => void;
  onDuplicate: (c: Campaign) => void;
  onDelete: (c: Campaign) => void;
  onTogglePublish: (c: Campaign) => void;
  onExport: (c: Campaign) => void;
}) {
  const { campaigns } = props;
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-gold">الحملات ({campaigns.length})</h2>
        <button onClick={props.onNew} className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-gold px-3 py-1.5 text-xs font-bold text-primary-foreground shadow-gold">
          <Plus className="size-3.5" /> حملة جديدة
        </button>
      </div>
      {campaigns.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gold/30 bg-[#0f1a36]/60 p-8 text-center text-sm text-muted-foreground">
          لا توجد حملات بعد. ابدأ بإنشاء حملة جديدة أو استيراد ملف JSON.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {campaigns.map(c => (
            <div key={c.id} className="rounded-xl border border-white/10 bg-[#0f1a36]/60 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[10px] tracking-widest text-gold/80">
                    <span>{c.historicalPeriod ?? "حملة"}</span>
                    <span className={`rounded-full px-2 py-0.5 ${c.status === "published" ? "bg-emerald-500/15 text-emerald-200" : "bg-amber-500/15 text-amber-200"}`}>
                      {c.status === "published" ? "منشورة" : "مسودة"}
                    </span>
                  </div>
                  <h3 className="font-display mt-1 truncate text-base font-bold">{c.title || "بدون عنوان"}</h3>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{c.subtitle || c.description || "—"}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">{c.chapters.length} فصول · {c.difficulty ?? "—"}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <IconBtn onClick={() => props.onEdit(c)} icon={Save} label="تحرير" />
                <IconBtn onClick={() => props.onTogglePublish(c)} icon={c.status === "published" ? EyeOff : Eye} label={c.status === "published" ? "إلغاء النشر" : "نشر"} />
                <IconBtn onClick={() => props.onDuplicate(c)} icon={Copy} label="تكرار" />
                <IconBtn onClick={() => props.onExport(c)} icon={Download} label="تصدير" />
                <IconBtn onClick={() => props.onDelete(c)} icon={Trash2} label="حذف" danger />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function IconBtn({ onClick, icon: Icon, label, danger }: { onClick: () => void; icon: any; label: string; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] transition ${
        danger
          ? "border-red-400/30 text-red-300 hover:bg-red-500/10"
          : "border-white/10 text-muted-foreground hover:border-gold/40 hover:text-gold"
      }`}
    >
      <Icon className="size-3" /> {label}
    </button>
  );
}

// ----- Campaign editor -----
function CampaignEditor({ value, registry, onCancel, onSave }: {
  value: Campaign;
  registry: ContentRegistryItem[];
  onCancel: () => void;
  onSave: (c: Campaign) => void;
}) {
  const [c, setC] = useState<Campaign>(value);
  useEffect(() => setC(value), [value.id]);

  const update = (patch: Partial<Campaign>) => setC(prev => ({ ...prev, ...patch }));
  const updateChapter = (idx: number, patch: Partial<CampaignChapter>) => {
    setC(prev => ({ ...prev, chapters: prev.chapters.map((ch, i) => i === idx ? { ...ch, ...patch } : ch) }));
  };
  const addChapter = () => setC(prev => ({
    ...prev,
    chapters: [...prev.chapters, { id: uid("ch"), title: "", order: prev.chapters.length + 1, activities: [] }],
  }));
  const removeChapter = (idx: number) => {
    if (!confirm("حذف هذا الفصل؟")) return;
    setC(prev => ({ ...prev, chapters: prev.chapters.filter((_, i) => i !== idx) }));
  };
  const addActivity = (chIdx: number) => {
    const a: CampaignActivity = { id: uid("act"), type: "multiple_choice", prompt: "", options: ["", ""], xpReward: 10, coinsReward: 5, heartsPenalty: 1 };
    updateChapter(chIdx, { activities: [...c.chapters[chIdx].activities, a] });
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-gold">{value.title ? "تحرير حملة" : "إضافة حملة"}</h2>
        <div className="flex gap-2">
          <button onClick={onCancel} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs">إلغاء</button>
          <button onClick={() => onSave(c)} className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-gold px-3 py-1.5 text-xs font-bold text-primary-foreground shadow-gold">
            <Save className="size-3.5" /> حفظ
          </button>
        </div>
      </div>

      <Section title="بيانات أساسية">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="المعرّف (id)"><Input value={c.id} onChange={v => update({ id: v })} /></Field>
          <Field label="الرابط (slug)"><Input value={c.slug ?? ""} onChange={v => update({ slug: v })} placeholder={slugify(c.title || "campaign")} /></Field>
          <Field label="العنوان *"><Input value={c.title} onChange={v => update({ title: v })} /></Field>
          <Field label="عنوان فرعي"><Input value={c.subtitle ?? ""} onChange={v => update({ subtitle: v })} /></Field>
          <Field label="الحقبة التاريخية"><Input value={c.historicalPeriod ?? ""} onChange={v => update({ historicalPeriod: v })} /></Field>
          <Field label="المنطقة على الخريطة"><Input value={c.mapRegion ?? ""} onChange={v => update({ mapRegion: v })} /></Field>
          <Field label="التصنيف"><Input value={c.category ?? ""} onChange={v => update({ category: v })} /></Field>
          <Field label="المدة التقديرية"><Input value={c.estimatedDuration ?? ""} onChange={v => update({ estimatedDuration: v })} /></Field>
          <Field label="الصعوبة">
            <Select value={c.difficulty ?? ""} onChange={v => update({ difficulty: (v || undefined) as any })}
              options={[["", "—"], ["easy", "سهل"], ["medium", "متوسط"], ["hard", "صعب"], ["legendary", "أسطوري"]]} />
          </Field>
          <Field label="الحالة">
            <Select value={c.status} onChange={v => update({ status: v as any })}
              options={[["draft", "مسودة"], ["published", "منشورة"]]} />
          </Field>
          <Field label="غلاف (URL)" wide><Input value={c.coverImage ?? ""} onChange={v => update({ coverImage: v })} /></Field>
          <Field label="الوسوم (مفصولة بفاصلة)" wide>
            <Input value={(c.tags ?? []).join(", ")} onChange={v => update({ tags: v.split(",").map(s => s.trim()).filter(Boolean) })} />
          </Field>
          <Field label="الوصف" wide><TextArea rows={3} value={c.description ?? ""} onChange={v => update({ description: v })} /></Field>
        </div>
      </Section>

      <Section title={`الفصول (${c.chapters.length})`}>
        <div className="space-y-3">
          {c.chapters.map((ch, ci) => (
            <details key={ch.id} className="rounded-lg border border-white/10 bg-black/30 p-3" open>
              <summary className="cursor-pointer text-sm">
                <span className="font-bold text-gold">فصل {ci + 1}</span> — {ch.title || "بدون عنوان"} · {ch.activities.length} نشاط
              </summary>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <Field label="العنوان *"><Input value={ch.title} onChange={v => updateChapter(ci, { title: v })} /></Field>
                <Field label="العنوان الفرعي"><Input value={ch.subtitle ?? ""} onChange={v => updateChapter(ci, { subtitle: v })} /></Field>
                <Field label="مقدمة" wide><TextArea rows={2} value={ch.introText ?? ""} onChange={v => updateChapter(ci, { introText: v })} /></Field>
                <Field label="نص تاريخي للقراءة" wide><TextArea rows={3} value={ch.historicalReadingText ?? ""} onChange={v => updateChapter(ci, { historicalReadingText: v })} /></Field>
                <Field label="فصل سابق مطلوب"><Input value={ch.unlockRequirement ?? ""} onChange={v => updateChapter(ci, { unlockRequirement: v })} placeholder="chapter id" /></Field>
                <Field label="الترتيب"><Input type="number" value={String(ch.order)} onChange={v => updateChapter(ci, { order: Number(v) || 1 })} /></Field>
              </div>
              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gold/80">الأنشطة</span>
                  <button onClick={() => addActivity(ci)} className="rounded-md border border-gold/40 px-2 py-1 text-[11px] text-gold">+ نشاط</button>
                </div>
                {ch.activities.map((a, ai) => (
                  <ActivityEditor
                    key={a.id}
                    a={a}
                    onChange={(next) => updateChapter(ci, { activities: ch.activities.map((x, i) => i === ai ? next : x) })}
                    onRemove={() => updateChapter(ci, { activities: ch.activities.filter((_, i) => i !== ai) })}
                  />
                ))}
              </div>
              <div className="mt-3 flex justify-end">
                <button onClick={() => removeChapter(ci)} className="text-[11px] text-red-300 hover:text-red-200">حذف الفصل</button>
              </div>
            </details>
          ))}
          <button onClick={addChapter} className="w-full rounded-lg border border-dashed border-gold/40 py-2 text-xs text-gold hover:bg-gold/5">
            + إضافة فصل
          </button>
        </div>
      </Section>

      <Section title="المكافآت النهائية وعناصر الفتح">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="XP">
            <Input type="number" value={String(c.finalRewards?.xp ?? "")} onChange={v => update({ finalRewards: { ...c.finalRewards, xp: Number(v) || 0 } })} />
          </Field>
          <Field label="عملات / دنانير">
            <Input type="number" value={String(c.finalRewards?.coins ?? "")} onChange={v => update({ finalRewards: { ...c.finalRewards, coins: Number(v) || 0 } })} />
          </Field>
          <Field label="معرّف الأثر"><Input value={c.finalRewards?.artifactId ?? ""} onChange={v => update({ finalRewards: { ...c.finalRewards, artifactId: v } })} /></Field>
          <Field label="معرّف الوسام"><Input value={c.finalRewards?.badgeId ?? ""} onChange={v => update({ finalRewards: { ...c.finalRewards, badgeId: v } })} /></Field>
          <Field label="معرّف الشخصية"><Input value={c.finalRewards?.figureId ?? ""} onChange={v => update({ finalRewards: { ...c.finalRewards, figureId: v } })} /></Field>
          <Field label="معرّف الإنجاز"><Input value={c.finalRewards?.achievementId ?? ""} onChange={v => update({ finalRewards: { ...c.finalRewards, achievementId: v } })} /></Field>
          <Field label="عناصر إضافية للفتح (IDs مفصولة بفاصلة)" wide>
            <Input
              value={(c.unlocks ?? []).join(", ")}
              onChange={v => update({ unlocks: v.split(",").map(s => s.trim()).filter(Boolean) })}
              placeholder="figure_salah_al_din, battle_hattin"
            />
          </Field>
        </div>
        {(c.unlocks ?? []).length > 0 && (
          <div className="mt-2 text-[11px] text-muted-foreground">
            {(() => {
              const known = new Set(registry.map(r => r.id));
              const missing = (c.unlocks ?? []).filter(id => !known.has(id));
              return missing.length
                ? <span className="text-amber-300">⚠️ غير موجود في سجل المحتوى: {missing.join("، ")}</span>
                : <span className="text-emerald-300">جميع عناصر الفتح موجودة في السجل.</span>;
            })()}
          </div>
        )}
      </Section>
    </section>
  );
}

function ActivityEditor({ a, onChange, onRemove }: {
  a: CampaignActivity;
  onChange: (a: CampaignActivity) => void;
  onRemove: () => void;
}) {
  const set = (patch: Partial<CampaignActivity>) => onChange({ ...a, ...patch });
  return (
    <div className="rounded-md border border-white/10 bg-black/40 p-3">
      <div className="grid gap-2 md:grid-cols-3">
        <Field label="النوع">
          <Select
            value={a.type}
            onChange={v => set({ type: v as CampaignQuestionType })}
            options={Object.entries(ACTIVITY_LABELS) as [string, string][]}
          />
        </Field>
        <Field label="XP"><Input type="number" value={String(a.xpReward ?? 10)} onChange={v => set({ xpReward: Number(v) || 0 })} /></Field>
        <Field label="عملات"><Input type="number" value={String(a.coinsReward ?? 5)} onChange={v => set({ coinsReward: Number(v) || 0 })} /></Field>
      </div>
      <div className="mt-2">
        <Field label="نص السؤال *"><TextArea rows={2} value={a.prompt} onChange={v => set({ prompt: v })} /></Field>
      </div>
      <div className="mt-2 grid gap-2 md:grid-cols-2">
        <Field label="نص توضيحي / قراءة"><TextArea rows={2} value={a.contextText ?? ""} onChange={v => set({ contextText: v })} /></Field>
        <Field label="الإجابة الصحيحة"><Input value={String(a.correctAnswer ?? "")} onChange={v => set({ correctAnswer: v })} /></Field>
        <Field label="خيارات (سطر لكل خيار)" wide>
          <TextArea
            rows={3}
            value={(a.options ?? []).join("\n")}
            onChange={v => set({ options: v.split("\n").map(s => s.trim()).filter(Boolean) })}
          />
        </Field>
        <Field label="تعليق عند الإجابة الصحيحة"><Input value={a.feedbackCorrect ?? ""} onChange={v => set({ feedbackCorrect: v })} /></Field>
        <Field label="تعليق عند الخطأ"><Input value={a.feedbackWrong ?? ""} onChange={v => set({ feedbackWrong: v })} /></Field>
        <Field label="تلميح"><Input value={a.hint ?? ""} onChange={v => set({ hint: v })} /></Field>
        <Field label="خسارة قلوب"><Input type="number" value={String(a.heartsPenalty ?? 1)} onChange={v => set({ heartsPenalty: Number(v) || 0 })} /></Field>
      </div>
      <div className="mt-2 flex justify-end">
        <button onClick={onRemove} className="text-[11px] text-red-300 hover:text-red-200">حذف النشاط</button>
      </div>
    </div>
  );
}

// ----- Registry panel -----
function RegistryPanel({ items, onSave, onDelete }: {
  items: ContentRegistryItem[];
  onSave: (i: ContentRegistryItem) => void;
  onDelete: (id: string) => void;
}) {
  const empty: ContentRegistryItem = { id: "", type: "figure", name: "" };
  const [draft, setDraft] = useState<ContentRegistryItem>(empty);
  const set = (p: Partial<ContentRegistryItem>) => setDraft(prev => ({ ...prev, ...p }));

  const grouped = useMemo(() => {
    const m = new Map<RegistryItemType, ContentRegistryItem[]>();
    items.forEach(i => { const arr = m.get(i.type) ?? []; arr.push(i); m.set(i.type, arr); });
    return m;
  }, [items]);

  return (
    <section className="space-y-4">
      <h2 className="font-display text-lg font-bold text-gold">سجل المحتوى ({items.length})</h2>

      <Section title="إضافة / تحديث عنصر">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="المعرّف *"><Input value={draft.id} onChange={v => set({ id: v })} placeholder="figure_salah_al_din" /></Field>
          <Field label="النوع *">
            <Select value={draft.type} onChange={v => set({ type: v as RegistryItemType })}
              options={Object.entries(TYPE_LABELS) as [string, string][]} />
          </Field>
          <Field label="الاسم *"><Input value={draft.name} onChange={v => set({ name: v })} /></Field>
          <Field label="العنوان الفرعي"><Input value={draft.subtitle ?? ""} onChange={v => set({ subtitle: v })} /></Field>
          <Field label="الحقبة"><Input value={draft.historicalPeriod ?? ""} onChange={v => set({ historicalPeriod: v })} /></Field>
          <Field label="الندرة">
            <Select value={draft.rarity ?? ""} onChange={v => set({ rarity: (v || undefined) as any })}
              options={[["", "—"], ["common", "عادي"], ["rare", "نادر"], ["epic", "ملحمي"], ["legendary", "أسطوري"]]} />
          </Field>
          <Field label="صورة (URL)" wide><Input value={draft.image ?? ""} onChange={v => set({ image: v })} /></Field>
          <Field label="الوصف" wide><TextArea rows={2} value={draft.description ?? ""} onChange={v => set({ description: v })} /></Field>
          <Field label="مصادر / ملاحظات تاريخية" wide><TextArea rows={2} value={draft.sourceNotes ?? ""} onChange={v => set({ sourceNotes: v })} /></Field>
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <button onClick={() => setDraft(empty)} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs">تفريغ</button>
          <button
            onClick={() => {
              if (!draft.id.trim() || !draft.name.trim()) return;
              onSave(draft);
              setDraft(empty);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-gold px-3 py-1.5 text-xs font-bold text-primary-foreground shadow-gold">
            <Save className="size-3.5" /> حفظ في السجل
          </button>
        </div>
      </Section>

      <Section title="عناصر السجل">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">السجل فارغ. أضف عناصر لتستطيع الحملات الإشارة إليها عبر المعرّفات.</p>
        ) : (
          <div className="space-y-3">
            {[...grouped.entries()].map(([type, arr]) => (
              <div key={type}>
                <h4 className="mb-1 text-xs font-bold text-gold/80">{TYPE_LABELS[type]} ({arr.length})</h4>
                <div className="grid gap-2 md:grid-cols-2">
                  {arr.map(i => (
                    <div key={i.id} className="flex items-start justify-between gap-2 rounded-md border border-white/10 bg-black/30 p-2 text-xs">
                      <div className="min-w-0">
                        <p className="font-bold">{i.name}</p>
                        <p className="truncate text-[10px] text-muted-foreground">{i.id}</p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <button onClick={() => setDraft(i)} className="text-gold hover:underline">تحرير</button>
                        <button onClick={() => onDelete(i.id)} className="text-red-300 hover:underline">حذف</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </section>
  );
}

// ----- Import panel -----
function ImportPanel({ onImported, notify }: {
  onImported: () => void;
  notify: (k: "ok" | "err" | "warn", m: string) => void;
}) {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<Campaign | null>(null);
  const [issues, setIssues] = useState<{ level: string; message: string }[]>([]);

  const runValidate = (): Campaign | null => {
    setIssues([]);
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { setIssues([{ level: "error", message: "JSON غير صالح." }]); return null; }
    const v = validateCampaign(parsed, knownRegistryIds());
    setIssues(v.issues);
    return v.ok && v.normalized ? v.normalized : null;
  };

  return (
    <section className="space-y-3">
      <h2 className="font-display text-lg font-bold text-gold">استيراد حملة JSON</h2>
      <TextArea rows={14} value={text} onChange={setText} placeholder='{"title":"…","chapters":[…]}' />
      <div className="flex flex-wrap gap-2">
        <button onClick={() => { const c = runValidate(); if (c) notify("ok", "JSON صالح."); }} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs">تحقّق</button>
        <button onClick={() => { const c = runValidate(); if (c) setPreview(c); }} className="rounded-lg border border-gold/40 px-3 py-1.5 text-xs text-gold">معاينة</button>
        <button
          onClick={() => {
            const c = runValidate();
            if (!c) { notify("err", "تعذّر الاستيراد: يوجد أخطاء."); return; }
            snapshotBackup("pre-import");
            upsertCampaign(c);
            setText(""); setPreview(null);
            onImported();
          }}
          className="rounded-lg bg-gradient-gold px-3 py-1.5 text-xs font-bold text-primary-foreground shadow-gold"
        >
          استيراد
        </button>
        <button onClick={() => { setText(""); setPreview(null); setIssues([]); }} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs">تفريغ</button>
      </div>

      {issues.length > 0 && (
        <div className="rounded-lg border border-white/10 bg-black/40 p-3 text-xs">
          {issues.map((i, k) => (
            <p key={k} className={i.level === "error" ? "text-red-300" : "text-amber-300"}>
              {i.level === "error" ? "✖" : "⚠"} {i.message}
            </p>
          ))}
        </div>
      )}

      {preview && (
        <Section title={`معاينة — ${preview.title}`}>
          <p className="text-xs text-muted-foreground">{preview.chapters.length} فصول · الحالة: {preview.status}</p>
          <pre className="mt-2 max-h-64 overflow-auto rounded bg-black/60 p-3 text-[10px] text-emerald-200">{JSON.stringify(preview, null, 2)}</pre>
        </Section>
      )}
    </section>
  );
}

// ----- Backup panel -----
function BackupPanel({ campaigns, registry, onSnapshot, onRefresh, notify }: {
  campaigns: Campaign[];
  registry: ContentRegistryItem[];
  onSnapshot: () => void;
  onRefresh: () => void;
  notify: (kind: "ok" | "err" | "warn", msg: string) => void;
}) {
  const backup = JSON.stringify({ campaigns, registry, at: new Date().toISOString() }, null, 2);
  const [busy, setBusy] = useState<"none" | "push" | "pull">("none");

  const handleMigrate = async () => {
    setBusy("push");
    const report = await pushAllToCloud();
    setBusy("none");
    if (report.errors.length) {
      notify("err", `فشل جزئي: ${report.errors.join(" | ")}`);
    } else {
      notify("ok", `تم رفع ${report.campaignsUploaded} حملة و ${report.registryUploaded} عنصر إلى السحابة.`);
    }
  };

  const handlePull = async () => {
    setBusy("pull");
    const res = await pullAllFromCloud();
    setBusy("none");
    onRefresh();
    if (res) notify("ok", `تم سحب ${res.campaigns} حملة و ${res.registry} عنصر من السحابة.`);
    else notify("err", "فشل الاتصال بالسحابة.");
  };

  return (
    <section className="space-y-4">
      <h2 className="font-display text-lg font-bold text-gold">تصدير ونسخ احتياطي</h2>

      <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/5 p-4">
        <h3 className="mb-2 text-sm font-bold text-emerald-200">المزامنة مع السحابة (Lovable Cloud)</h3>
        <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">
          تُحفظ التعديلات الجديدة تلقائيًا في السحابة. استخدم أزرار النقل أدناه لمرّة واحدة لنقل البيانات الموجودة في المتصفح إلى قاعدة البيانات،
          أو لسحب أحدث نسخة من السحابة إلى هذا المتصفح.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleMigrate}
            disabled={busy !== "none"}
            className="rounded-lg bg-emerald-500/20 px-3 py-1.5 text-xs font-bold text-emerald-100 ring-1 ring-emerald-400/40 disabled:opacity-50"
          >
            {busy === "push" ? "جاري الرفع…" : "⬆ رفع بيانات المتصفح إلى السحابة"}
          </button>
          <button
            onClick={handlePull}
            disabled={busy !== "none"}
            className="rounded-lg border border-emerald-400/40 px-3 py-1.5 text-xs text-emerald-100 disabled:opacity-50"
          >
            {busy === "pull" ? "جاري السحب…" : "⬇ سحب آخر نسخة من السحابة"}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={() => downloadJson("irth-campaigns.json", exportAllCampaigns())} className="rounded-lg border border-gold/40 px-3 py-1.5 text-xs text-gold">
          <FileJson className="me-1 inline size-3" /> تصدير كل الحملات
        </button>
        <button onClick={() => downloadJson("irth-registry.json", exportRegistry())} className="rounded-lg border border-gold/40 px-3 py-1.5 text-xs text-gold">
          <FileJson className="me-1 inline size-3" /> تصدير سجل المحتوى
        </button>
        <button onClick={() => downloadJson("irth-backup.json", backup)} className="rounded-lg bg-gradient-gold px-3 py-1.5 text-xs font-bold text-primary-foreground shadow-gold">
          <Download className="me-1 inline size-3" /> نسخة احتياطية كاملة
        </button>
        <button onClick={onSnapshot} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs">حفظ لقطة داخلية</button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        مفاتيح التخزين المحلية: {CAMPAIGNS_KEY}، {REGISTRY_KEY}، {BACKUPS_KEY}. مصدر الحقيقة الآن هو السحابة، والمتصفح يستخدم كذاكرة مؤقتة سريعة.
      </p>
    </section>
  );
}

// ----- Generic UI -----
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gold/20 bg-[#0f1a36]/40 p-4">
      <h3 className="mb-3 text-sm font-bold tracking-wide text-gold/80">{title}</h3>
      {children}
    </div>
  );
}
function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={`flex flex-col gap-1 text-xs ${wide ? "md:col-span-2" : ""}`}>
      <span className="text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
function Input({ value, onChange, type = "text", placeholder }: { value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      className="rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-foreground outline-none focus:border-gold/60" />
  );
}
function TextArea({ value, onChange, rows = 3, placeholder }: { value: string; onChange: (v: string) => void; rows?: number; placeholder?: string }) {
  return (
    <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} placeholder={placeholder}
      className="rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-foreground outline-none focus:border-gold/60" />
  );
}
function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-foreground outline-none focus:border-gold/60">
      {options.map(([v, l]) => <option key={v} value={v} className="bg-[#0a0f1e]">{l}</option>)}
    </select>
  );
}

function downloadJson(filename: string, content: string) {
  if (typeof window === "undefined") return;
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}
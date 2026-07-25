// ============================================================
// Admin · Unlock Integrity Audit
// ------------------------------------------------------------
// Scans every unlock reference in admin_campaigns (chapter
// rewards + core/supporting entity lists) and verifies that
// the referenced encyclopedia entry exists, is enabled, and
// matches the requested type.
//
// Goal: ZERO broken unlock references reach the player. The
// Museum hides anything unresolved from the UI; admins use
// this page to find and repair the underlying data so every
// unlock is openable from the Museum.
//
// Repair actions:
//   - Publish: flip enabled=true on entities that exist but
//     are hidden.
//   - Placeholder: create a minimal encyclopedia entry of the
//     requested type when nothing matches.
// ============================================================

import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, CheckCircle2, RefreshCcw, ShieldCheck,
  PlusCircle, Eye, Loader2,
} from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";
import { AdminGate } from "@/lib/admin-guard";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { supabase } from "@/integrations/supabase/client";
import { selectCampaignRows } from "@/lib/campaigns/entities";

export const Route = createFileRoute("/admin/unlock-integrity")({
  head: () => ({
    meta: [
      { title: "تدقيق سلامة المكتشفات — إرث" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => (
    <AdminGate>
      <AppShell>
        <Screen title="سلامة المكتشفات">
          <Breadcrumbs items={[{ label: "الإدارة", to: "/admin" }, { label: "سلامة المكتشفات" }]} />
          <UnlockIntegrityPage />
        </Screen>
      </AppShell>
    </AdminGate>
  ),
});

// ── Types ─────────────────────────────────────────────────────
type EntityType = "figure" | "artifact" | "city" | "battle" | "event" | "landmark" | "state" | string;

interface UnlockRef {
  raw: string;           // e.g. "artifact:dar-al-arqam-relic"
  type: EntityType;      // parsed type prefix
  slug: string;          // parsed slug
  source: string;        // human label of which campaign/chapter
}

interface EntityRow {
  id: string;
  slug: string;
  entity_type: string;
  enabled: boolean;
  title: string | null;
  metadata: any;
}

type Status = "ok" | "type-mismatch" | "unpublished" | "missing" | "respected";

interface AuditedRef extends UnlockRef {
  status: Status;
  matchSameType?: EntityRow;
  matchAnyType?: EntityRow[];
}

// ── Helpers ───────────────────────────────────────────────────
function parseRef(raw: string, source: string): UnlockRef | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  const idx = trimmed.indexOf(":");
  if (idx <= 0) return { raw: trimmed, type: "", slug: trimmed.toLowerCase(), source };
  return {
    raw: trimmed,
    type: trimmed.slice(0, idx).toLowerCase(),
    slug: trimmed.slice(idx + 1).toLowerCase(),
    source,
  };
}

function collectRefs(campaigns: Array<{ id: string; title: string | null; data: any }>): UnlockRef[] {
  const out: UnlockRef[] = [];
  for (const c of campaigns) {
    const label = c.title || c.id;
    const meta = c.data?.metadata ?? {};
    for (const r of meta.core_entities ?? []) {
      const p = parseRef(String(r), `${label} · جوهري`); if (p) out.push(p);
    }
    for (const r of meta.supporting_entities ?? []) {
      const p = parseRef(String(r), `${label} · مساند`); if (p) out.push(p);
    }
    const chapters = Array.isArray(c.data?.chapters) ? c.data.chapters : [];
    for (const ch of chapters) {
      const chLabel = ch?.title || ch?.id || "فصل";
      for (const r of ch?.rewards?.unlocks ?? []) {
        const p = parseRef(String(r), `${label} · ${chLabel}`); if (p) out.push(p);
      }
    }
  }
  return out;
}

// ── Page ──────────────────────────────────────────────────────
function UnlockIntegrityPage() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [refs, setRefs] = useState<UnlockRef[]>([]);
  const [entitiesBySlug, setEntitiesBySlug] = useState<Map<string, EntityRow[]>>(new Map());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [campaignsRes, entitiesRes] = await Promise.all([
        supabase.from("admin_campaigns").select("id,title,data"),
        supabase.from("encyclopedia_entities").select("id,slug,entity_type,enabled,title,metadata"),
      ]);
      const campaigns = selectCampaignRows((campaignsRes.data ?? []) as any[]);
      const allRefs = collectRefs(campaigns);
      // Dedupe by raw + source for clarity, keep first source per raw for tally.
      setRefs(allRefs);

      const m = new Map<string, EntityRow[]>();
      for (const e of (entitiesRes.data ?? []) as EntityRow[]) {
        const arr = m.get(e.slug) ?? [];
        arr.push(e); m.set(e.slug, arr);
      }
      setEntitiesBySlug(m);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const audited = useMemo<AuditedRef[]>(() => {
    const seen = new Map<string, AuditedRef>();
    for (const r of refs) {
      if (seen.has(r.raw)) continue;
      const matches = entitiesBySlug.get(r.slug) ?? [];
      let status: Status = "missing";
      let sameType: EntityRow | undefined;
      if (matches.length === 0) {
        status = "missing";
      } else {
        sameType = matches.find((m) => m.entity_type === r.type) ?? matches[0];
        const meta: any = sameType.metadata || {};
        const intentionallyHidden =
          meta.archived === true ||
          meta.hidden_duplicate === true ||
          (typeof meta.canonical_id === "string" && meta.canonical_id);
        if (sameType.entity_type !== r.type)      status = "type-mismatch";
        else if (sameType.enabled)                 status = "ok";
        else if (intentionallyHidden)              status = "respected";
        else                                       status = "unpublished";
      }
      seen.set(r.raw, { ...r, status, matchSameType: sameType, matchAnyType: matches });
    }
    return [...seen.values()].sort((a, b) => a.raw.localeCompare(b.raw));
  }, [refs, entitiesBySlug]);

  const tally = useMemo(() => {
    const t = { total: audited.length, ok: 0, unpublished: 0, mismatch: 0, missing: 0, respected: 0 };
    for (const a of audited) {
      if (a.status === "ok") t.ok++;
      else if (a.status === "unpublished") t.unpublished++;
      else if (a.status === "type-mismatch") t.mismatch++;
      else if (a.status === "respected") t.respected++;
      else t.missing++;
    }
    return t;
  }, [audited]);

  const publishAll = useCallback(async () => {
    setBusy("publish-all");
    try {
      const ids = audited
        .filter((a) => a.status === "unpublished" && a.matchSameType)
        .map((a) => a.matchSameType!.id);
      if (ids.length === 0) return;
      const { error } = await supabase
        .from("encyclopedia_entities")
        .update({ enabled: true })
        .in("id", ids);
      if (error) alert("فشل النشر الجماعي: " + error.message);
      await load();
    } finally { setBusy(null); }
  }, [audited, load]);

  const publishOne = useCallback(async (id: string) => {
    setBusy(id);
    try {
      const { error } = await supabase.from("encyclopedia_entities").update({ enabled: true }).eq("id", id);
      if (error) alert("فشل النشر: " + error.message);
      await load();
    } finally { setBusy(null); }
  }, [load]);

  const createPlaceholders = useCallback(async () => {
    setBusy("placeholders");
    try {
      const items = audited.filter((a) => a.status === "missing").map((a) => ({
        slug: a.slug,
        entity_type: a.type || "artifact",
        title: a.slug.replace(/-/g, " "),
        enabled: true,
        metadata: {
          placeholder: true,
          placeholder_reason: "unlock-integrity-repair",
          placeholder_source: a.source,
          created_via: "admin.unlock-integrity",
        } as any,
      }));
      if (items.length === 0) return;
      const { error } = await supabase.from("encyclopedia_entities").upsert(items, { onConflict: "slug" });
      if (error) alert("فشل إنشاء البطاقات المؤقتة: " + error.message);
      await load();
    } finally { setBusy(null); }
  }, [audited, load]);

  return (
    <div className="space-y-5 pb-24" dir="rtl">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] tracking-[0.32em] text-gold/80">سلامة المكتشفات</p>
          <h1 className="font-display text-xl font-bold">تدقيق روابط فتح المتحف</h1>
          <p className="mt-1 text-[12px] text-muted-foreground">
            يفحص كل عنصر يمكن فتحه من الحملات ويتأكد من قابلية فتحه من المتحف.
          </p>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-gold/30 bg-black/30 px-3 py-2 text-[12px] text-gold hover:bg-gold/10 disabled:opacity-50"
        >
          {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCcw className="size-4" />}
          إعادة الفحص
        </button>
      </header>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <Stat label="المجموع" value={tally.total} />
        <Stat label="سليم" value={tally.ok} tone="good" />
        <Stat label="غير منشور" value={tally.unpublished} tone={tally.unpublished ? "warn" : "good"} />
        <Stat label="نوع غير مطابق" value={tally.mismatch} tone={tally.mismatch ? "warn" : "good"} />
        <Stat label="مفقود" value={tally.missing} tone={tally.missing ? "danger" : "good"} />
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => void publishAll()}
          disabled={busy !== null || tally.unpublished === 0}
          className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-[12px] text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-50"
        >
          <ShieldCheck className="size-4" /> نشر كل غير المنشور ({tally.unpublished})
        </button>
        <button
          onClick={() => void createPlaceholders()}
          disabled={busy !== null || tally.missing === 0}
          className="inline-flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-200 hover:bg-amber-500/20 disabled:opacity-50"
        >
          <PlusCircle className="size-4" /> إنشاء بطاقات مؤقتة للمفقود ({tally.missing})
        </button>
      </div>

      {tally.ok === tally.total && tally.total > 0 && (
        <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-[12px] text-emerald-200">
          <CheckCircle2 className="size-4" />
          كل المكتشفات قابلة للفتح من المتحف ({tally.total} مرجعًا).
        </div>
      )}

      <section className="rounded-2xl border border-white/10 bg-surface/60">
        <header className="border-b border-white/10 px-4 py-2 text-[11px] tracking-[0.18em] text-gold/80">
          النتائج
        </header>
        {loading ? (
          <div className="grid place-items-center py-10 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : (
          <ul className="divide-y divide-white/5">
            {audited.map((a) => (
              <li key={a.raw} className="px-4 py-2.5 text-[12px]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusChip status={a.status} />
                      <code className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-[11px]">{a.raw}</code>
                    </div>
                    <p className="mt-1 truncate text-[11px] text-muted-foreground">
                      المصدر: {a.source}
                    </p>
                    {a.matchSameType && (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        المطابق: <span className="text-foreground/80">{a.matchSameType.title ?? a.matchSameType.slug}</span>
                        <span className="mx-1 opacity-60">·</span>
                        <span className="opacity-70">{a.matchSameType.entity_type}</span>
                        <span className={`mx-1 ${a.matchSameType.enabled ? "text-emerald-300" : "text-amber-300"}`}>
                          {a.matchSameType.enabled ? "منشور" : "غير منشور"}
                        </span>
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {a.status === "unpublished" && a.matchSameType && (
                      <button
                        onClick={() => void publishOne(a.matchSameType!.id)}
                        disabled={busy === a.matchSameType.id}
                        className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-50"
                      >
                        <ShieldCheck className="size-3" /> نشر
                      </button>
                    )}
                    {a.matchSameType && (
                      <a
                        href={`/encyclopedia/entity/${a.matchSameType.slug}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground"
                      >
                        <Eye className="size-3" /> فتح
                      </a>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "good" | "warn" | "danger" }) {
  const cls = tone === "good"
    ? "border-emerald-500/30 text-emerald-200"
    : tone === "warn"
      ? "border-amber-500/40 text-amber-200"
      : tone === "danger"
        ? "border-rose-500/40 text-rose-200"
        : "border-white/10 text-foreground";
  return (
    <div className={`rounded-2xl border ${cls} bg-black/30 px-3 py-2.5 text-center`}>
      <p className="font-display text-lg font-extrabold">{value}</p>
      <p className="text-[10px] tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}

function StatusChip({ status }: { status: Status }) {
  if (status === "ok") return (
    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-200">
      <CheckCircle2 className="size-3" /> سليم
    </span>
  );
  if (status === "unpublished") return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-200">
      <AlertTriangle className="size-3" /> غير منشور
    </span>
  );
  if (status === "type-mismatch") return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-200">
      <AlertTriangle className="size-3" /> نوع غير مطابق
    </span>
  );
  if (status === "respected") return (
    <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-[10px] text-sky-200">
      <ShieldCheck className="size-3" /> مخفي عمداً
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-[10px] text-rose-200">
      <AlertTriangle className="size-3" /> مفقود
    </span>
  );
}

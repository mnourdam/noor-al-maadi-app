// ============================================================
// Admin · Investigation Reward Reconciliation
// ------------------------------------------------------------
// Internal maintenance utility for the FROZEN "Investigation
// Completion & Rewards v2" pipeline.
//
// It never invents rewards: for every completion row it reads
// the *current* published reward block, applies the exact same
// caps the live RPC applies (XP ≤ 150, Dinars ≤ 50, Hearts ≤ 5)
// and grants only what is provably missing from the
// `applied_profile_deltas` ledger.
//
// Idempotency: each grant is keyed on a deterministic delta id
// derived from (user, investigation). Re-running the tool is a
// no-op — repeats surface in the "skipped" report, never as a
// second payment.
//
// Flow: Audit (read-only) → Dry run (exact preview) → Execute.
// ============================================================

import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
  Coins, Heart, Loader2, PlayCircle, RefreshCcw, ShieldCheck, Star, AlertTriangle,
} from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";
import { AdminGate } from "@/lib/admin-guard";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/investigation-rewards")({
  head: () => ({
    meta: [
      { title: "مطابقة مكافآت التحقيقات — إرث" },
      { name: "description", content: "أداة صيانة داخلية لمطابقة مكافآت التحقيقات غير الممنوحة بشكل آمن وقابل للتكرار." },
      { property: "og:title", content: "مطابقة مكافآت التحقيقات — إرث" },
      { property: "og:description", content: "أداة صيانة داخلية لمطابقة مكافآت التحقيقات." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => (
    <AdminGate>
      <AppShell>
        <Screen title="مطابقة مكافآت التحقيقات">
          <Breadcrumbs items={[{ label: "الإدارة", to: "/admin" }, { label: "مكافآت التحقيقات" }]} />
          <InvestigationRewardsPage />
        </Screen>
      </AppShell>
    </AdminGate>
  ),
});

type RowState = "pending" | "already_granted" | "already_backfilled" | "nothing_to_grant";

interface AuditRow {
  user_id: string;
  username: string | null;
  investigation_id: string;
  slug: string;
  title: string | null;
  completed_at: string;
  xp: number;
  dinars: number;
  hearts: number;
  state: RowState;
}

interface AuditPayload {
  ok: boolean;
  reason?: string;
  rows: AuditRow[];
  pending_count: number;
  granted_count: number;
  pending_users: number;
  pending_xp: number;
  pending_dinars: number;
  pending_hearts: number;
}

interface ReconcileRow {
  user_id: string;
  investigation_id?: string;
  slug: string;
  xp?: number;
  dinars?: number;
  hearts?: number;
  reason?: string;
}

interface ReconcilePayload {
  ok: boolean;
  reason?: string;
  dry_run: boolean;
  granted: ReconcileRow[];
  skipped: ReconcileRow[];
  users_affected: number;
  investigations_affected: number;
  total_xp: number;
  total_dinars: number;
  total_hearts: number;
}

const STATE_LABEL: Record<RowState, string> = {
  pending: "مكافأة مفقودة",
  already_granted: "مُمنوحة (المسار الحيّ)",
  already_backfilled: "مُمنوحة (مطابقة سابقة)",
  nothing_to_grant: "لا مكافأة مستحقة",
};

const STATE_CLASS: Record<RowState, string> = {
  pending: "border-amber-400/40 bg-amber-400/10 text-amber-200",
  already_granted: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  already_backfilled: "border-emerald-400/20 bg-emerald-400/5 text-emerald-200/80",
  nothing_to_grant: "border-white/10 bg-surface text-muted-foreground",
};

function InvestigationRewardsPage() {
  const [audit, setAudit] = useState<AuditPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<null | "preview" | "execute">(null);
  const [preview, setPreview] = useState<ReconcilePayload | null>(null);
  const [applied, setApplied] = useState<ReconcilePayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runAudit = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: e } = await (supabase.rpc as any)("admin_investigation_reward_audit");
      if (e) throw new Error(e.message);
      const payload = (data ?? {}) as AuditPayload;
      if (!payload.ok) throw new Error(payload.reason ?? "فشل التدقيق");
      setAudit({ ...payload, rows: Array.isArray(payload.rows) ? payload.rows : [] });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setAudit(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void runAudit(); }, [runAudit]);

  const runReconcile = useCallback(async (dryRun: boolean) => {
    setBusy(dryRun ? "preview" : "execute");
    setError(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: e } = await (supabase.rpc as any)(
        "admin_investigation_reward_reconcile",
        { p_dry_run: dryRun, p_user_ids: null },
      );
      if (e) throw new Error(e.message);
      const payload = (data ?? {}) as ReconcilePayload;
      if (!payload.ok) throw new Error(payload.reason ?? "فشل التنفيذ");
      payload.granted = Array.isArray(payload.granted) ? payload.granted : [];
      payload.skipped = Array.isArray(payload.skipped) ? payload.skipped : [];
      if (dryRun) { setPreview(payload); setApplied(null); }
      else { setApplied(payload); setPreview(null); await runAudit(); }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }, [runAudit]);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-gold/25 bg-surface p-4 text-[12px] leading-6 text-muted-foreground">
        <div className="mb-1 flex items-center gap-2 text-sm font-bold text-gold">
          <ShieldCheck className="size-4" /> أداة صيانة آمنة ومتكرّرة
        </div>
        تفحص هذه الأداة كل تحقيق مُنجز لم تُمنح مكافأته فعليًا، وتحسب المكافأة بالقواعد المحدودة
        النافذة حاليًا (خبرة ≤ 150، دنانير ≤ 50، قلوب ≤ 5)، وتستخدم نفس مفتاح المنح الثابت
        المستخدم في المسار الحيّ — لذا تشغيلها أكثر من مرة لا يمنح شيئًا مرتين.
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/5 p-3 text-[12px] text-red-200">
          <AlertTriangle className="size-4" /> {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => void runAudit()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-gold/40 bg-surface px-3 py-2 text-[12px] font-bold text-gold disabled:opacity-50"
        >
          {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCcw className="size-4" />} تدقيق
        </button>
        <button
          onClick={() => void runReconcile(true)}
          disabled={busy !== null}
          className="inline-flex items-center gap-2 rounded-xl border border-gold/40 bg-surface px-3 py-2 text-[12px] font-bold text-gold disabled:opacity-50"
        >
          {busy === "preview" ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />} معاينة دقيقة (بدون تنفيذ)
        </button>
        <button
          onClick={() => {
            if (!preview || preview.granted.length === 0) return;
            const ok = window.confirm(
              `سيتم منح ${preview.total_xp} خبرة و${preview.total_dinars} دينار و${preview.total_hearts} قلبًا لـ ${preview.users_affected} مستخدمًا. متابعة؟`,
            );
            if (ok) void runReconcile(false);
          }}
          disabled={busy !== null || !preview || preview.granted.length === 0}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-gold px-3 py-2 text-[12px] font-bold text-primary-foreground disabled:opacity-40"
        >
          {busy === "execute" ? <Loader2 className="size-4 animate-spin" /> : <PlayCircle className="size-4" />} تنفيذ المطابقة
        </button>
      </div>

      {audit && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Stat label="مكافآت مفقودة" value={audit.pending_count} />
          <Stat label="مستخدمون متأثرون" value={audit.pending_users} />
          <Stat label="خبرة مستحقة" value={audit.pending_xp} icon={<Star className="size-3" />} />
          <Stat label="دنانير مستحقة" value={audit.pending_dinars} icon={<Coins className="size-3" />} />
          <Stat label="قلوب مستحقة" value={audit.pending_hearts} icon={<Heart className="size-3" />} />
        </div>
      )}

      {preview && (
        <ResultBlock
          title="معاينة — ما سيُمنح بالضبط"
          tone="preview"
          payload={preview}
        />
      )}
      {applied && (
        <ResultBlock
          title="تقرير التنفيذ"
          tone="applied"
          payload={applied}
        />
      )}

      <section>
        <h2 className="font-display mb-2 text-sm font-bold">كل الإنجازات ({audit?.rows.length ?? 0})</h2>
        <div className="space-y-2">
          {(audit?.rows ?? []).map((r) => (
            <div
              key={`${r.user_id}:${r.investigation_id}`}
              className="rounded-2xl border border-white/10 bg-surface p-3 text-[12px]"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold">{r.title || r.slug}</span>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] ${STATE_CLASS[r.state]}`}>
                  {STATE_LABEL[r.state]}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-muted-foreground">
                <span>{r.username ? `@${r.username}` : r.user_id.slice(0, 8)}</span>
                <span><Star className="inline size-3" /> {r.xp}</span>
                <span><Coins className="inline size-3" /> {r.dinars}</span>
                <span><Heart className="inline size-3" /> {r.hearts}</span>
                <span dir="ltr">{new Date(r.completed_at).toISOString().slice(0, 10)}</span>
              </div>
            </div>
          ))}
          {!loading && (audit?.rows.length ?? 0) === 0 && (
            <p className="rounded-2xl border border-white/10 bg-surface p-4 text-center text-[12px] text-muted-foreground">
              لا توجد إنجازات تحقيقات مسجّلة.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: number; icon?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-surface p-3 text-center">
      <div className="font-display text-lg font-bold text-gold">
        {icon} {value.toLocaleString("en-US")}
      </div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

function ResultBlock({
  title, tone, payload,
}: { title: string; tone: "preview" | "applied"; payload: ReconcilePayload }) {
  return (
    <section
      className={`rounded-2xl border p-4 ${
        tone === "applied"
          ? "border-emerald-400/30 bg-emerald-400/5"
          : "border-gold/30 bg-gold/5"
      }`}
    >
      <h2 className="font-display mb-2 text-sm font-bold text-gold">{title}</h2>
      <p className="text-[12px] text-muted-foreground">
        مستخدمون: {payload.users_affected} · تحقيقات: {payload.investigations_affected} ·{" "}
        <Star className="inline size-3" /> {payload.total_xp} ·{" "}
        <Coins className="inline size-3" /> {payload.total_dinars} ·{" "}
        <Heart className="inline size-3" /> {payload.total_hearts}
      </p>
      {payload.granted.length > 0 && (
        <ul className="mt-2 space-y-1 text-[11px] text-foreground/90">
          {payload.granted.map((g, i) => (
            <li key={`g${i}`} dir="rtl">
              {g.slug} — {g.user_id.slice(0, 8)} · +{g.xp} خبرة · +{g.dinars} دينار · +{g.hearts} قلب
            </li>
          ))}
        </ul>
      )}
      {payload.skipped.length > 0 && (
        <>
          <p className="mt-3 text-[11px] font-bold text-muted-foreground">
            تم تخطّيها ({payload.skipped.length}) — حماية من المنح المزدوج
          </p>
          <ul className="mt-1 space-y-1 text-[11px] text-muted-foreground">
            {payload.skipped.map((s, i) => (
              <li key={`s${i}`}>{s.slug} — {s.reason}</li>
            ))}
          </ul>
        </>
      )}
      {payload.granted.length === 0 && payload.skipped.length === 0 && (
        <p className="mt-2 text-[11px] text-muted-foreground">لا يوجد ما يحتاج مطابقة — كل المكافآت ممنوحة.</p>
      )}
    </section>
  );
}

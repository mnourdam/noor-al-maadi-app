// ============================================================
// Investigations Source — Supabase-first with legacy fallback
// ------------------------------------------------------------
// Reads `public.investigations` from Supabase. Falls back to the
// legacy in-code registry only when Supabase has no enabled rows
// for the given slug, preserving old links and saved progress.
// ============================================================

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { onInvestigationPublished } from "@/lib/investigations/adminApi";

export type InvestigationDifficulty = "easy" | "medium" | "hard";

export interface InvestigationReward {
  hearts?: number;
  xp?: number;
  /** Canonical currency field (Phase B). */
  dinars?: number;
  /** @deprecated Legacy alias for `dinars`. Read via the shared
   * normalizer in `src/lib/investigations-normalize.ts`; new writes
   * must use `dinars`. */
  coins?: number;
  badge?: string;
  artifact?: string;
}

export type InvestigationStep =
  | { type: "briefing"; title?: string; text: string }
  | { type: "evidence"; id?: string; title?: string; text: string }
  | {
      type: "question";
      prompt: string;
      options: string[];
      correctAnswer: number;
      explanation?: string;
    }
  | {
      type: "decision";
      prompt: string;
      options: string[];
      correctAnswer?: number;
      explanation?: string;
    }
  | { type: "conclusion"; title?: string; text: string };

export interface InvestigationRow {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  difficulty: InvestigationDifficulty | string;
  reward: InvestigationReward;
  steps: InvestigationStep[];
  related_entities: string[];
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export function countQuestions(steps: InvestigationStep[]): number {
  return steps.filter((s) => s.type === "question" || s.type === "decision").length;
}

/** Hook: enabled investigations list — local-first, network refresh. */
export function useSupabaseInvestigations() {
  const [rows, setRows] = useState<InvestigationRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { ensureLocalSnapshotLoaded, localInvestigations } = await import("./local-first-store");
        await ensureLocalSnapshotLoaded();
        const local = localInvestigations() as unknown as InvestigationRow[];
        if (!cancelled && local.length > 0) setRows(local);
      } catch { /* ignore */ }

      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        setRows((prev) => prev ?? []);
        return;
      }

      try {
        // Player-facing reads MUST go through the security-invoker view
        // `investigations_public`, which excludes `draft_data` and other
        // admin-only lifecycle columns. The base table's SELECT policy
        // no longer grants those columns to anon/authenticated.
        const { data, error } = await supabase
          .from("investigations_public" as any)
          .select("*")
          .eq("enabled", true)
          .order("updated_at", { ascending: false });
        if (cancelled) return;
        if (error) {
          // Keep any local rows already set; only surface the error when we have nothing.
          setRows((prev) => prev ?? []);
          if (!rows) setError(error.message);
          return;
        }
        setRows((data ?? []) as unknown as InvestigationRow[]);
      } catch {
        setRows((prev) => prev ?? []);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { rows, error };
}

/** Hook: fetch single investigation by slug — local-first, network refresh. */
export function useSupabaseInvestigation(slug: string | undefined) {
  const [row, setRow] = useState<InvestigationRow | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) {
      setRow(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { ensureLocalSnapshotLoaded, localInvestigationBySlug } = await import("./local-first-store");
        await ensureLocalSnapshotLoaded();
        const local = localInvestigationBySlug(slug) as unknown as InvestigationRow | null;
        if (!cancelled && local) setRow(local);
      } catch { /* ignore */ }

      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        setRow((prev) => prev ?? null);
        return;
      }

      try {
        const { data, error } = await supabase
          .from("investigations_public" as any)
          .select("*")
          .eq("slug", slug)
          .maybeSingle();
        if (cancelled) return;
        if (error) {
          setRow((prev) => prev ?? null);
          if (!row) setError(error.message);
          return;
        }
        if (data) setRow(data as unknown as InvestigationRow);
        else setRow((prev) => prev ?? null);
      } catch {
        setRow((prev) => prev ?? null);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  return { row, error };
}

// ============================================================
// Investigations Source — Supabase-first with legacy fallback
// ------------------------------------------------------------
// Reads `public.investigations` from Supabase. Falls back to the
// legacy in-code registry only when Supabase has no enabled rows
// for the given slug, preserving old links and saved progress.
// ============================================================

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type InvestigationDifficulty = "easy" | "medium" | "hard";

export interface InvestigationReward {
  hearts?: number;
  xp?: number;
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

/** Hook: enabled investigations list (Supabase). */
export function useSupabaseInvestigations() {
  const [rows, setRows] = useState<InvestigationRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("investigations" as any)
        .select("*")
        .eq("enabled", true)
        .order("updated_at", { ascending: false });
      if (cancelled) return;
      if (error) {
        setError(error.message);
        setRows([]);
        return;
      }
      setRows((data ?? []) as unknown as InvestigationRow[]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { rows, error };
}

/** Hook: fetch single investigation by slug. */
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
      const { data, error } = await supabase
        .from("investigations" as any)
        .select("*")
        .eq("slug", slug)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        setError(error.message);
        setRow(null);
        return;
      }
      setRow((data ?? null) as unknown as InvestigationRow | null);
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return { row, error };
}

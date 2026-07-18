// ============================================================
// Global legacy investigation backfill trigger (Phase G1)
// ------------------------------------------------------------
// Mounted once at app root inside <ProfileProvider>. Whenever
// there is a signed-in session AND the local legacy array
// `profile.investigationsCompleted` is non-empty, enqueue ONE
// batched, idempotent server-side backfill.
//
// Runs on every SIGNED_IN / USER_UPDATED transition and any time
// the legacy array changes. The per-uid ledger inside
// `migrateLegacyInvestigationCompletions` guarantees repeated
// calls are cheap no-ops after the first successful batch.
// ============================================================

import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/lib/profile";
import { migrateLegacyInvestigationCompletions } from "@/lib/investigations/progress";

export function InvestigationLegacyBackfill() {
  const { profile } = useProfile();

  useEffect(() => {
    let alive = true;

    const run = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!alive) return;
        const uid = data.session?.user?.id;
        if (!uid) return;
        const legacy = Array.isArray(profile?.investigationsCompleted)
          ? (profile.investigationsCompleted as string[])
          : [];
        if (legacy.length === 0) return;
        await migrateLegacyInvestigationCompletions(legacy);
      } catch { /* offline / transient — retried on next mount */ }
    };
    void run();

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "USER_UPDATED" || event === "TOKEN_REFRESHED") {
        void run();
      }
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [profile?.investigationsCompleted]);

  return null;
}

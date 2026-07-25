// ============================================================
// Stories — unlock TRACE (diagnostic only, no behavior change)
// ------------------------------------------------------------
// Prints a full, single-story trace of every input that decides
// whether a story opens, plus WHICH branch produced the answer.
//
// Enable with either:
//   • URL:          /story/<id>?trace=unlock
//   • localStorage: irth.debug.unlock = "1"
//
// This module never mutates state and never changes the outcome —
// it only observes what the app already computed.
// ============================================================

import { supabase } from "@/integrations/supabase/client";
import { normalizeUnlockSpec } from "./normalize";
import { validateUnlockSpec } from "./validate";
import { evaluateStoryUnlock } from "./local";
import type { UnlockNode } from "./spec";

export function unlockTraceEnabled(): boolean {
  try {
    if (typeof localStorage !== "undefined" && localStorage.getItem("irth.debug.unlock") === "1") {
      return true;
    }
    if (typeof location !== "undefined") {
      return new URLSearchParams(location.search).get("trace") === "unlock";
    }
  } catch { /* ignore */ }
  return false;
}

type ServerBundle = { ok?: boolean; reason?: string } | null;

/** Explains, node by node, which leaf made the client evaluator say yes/no. */
function explainNode(
  node: UnlockNode,
  discovered: ReadonlySet<string>,
  depth = 1,
): { type: string; result: boolean; detail?: string; children?: unknown[] } {
  switch (node.type) {
    case "always":
      return { type: "always", result: true, detail: "unconditional branch" };
    case "entity_discovered":
      return {
        type: "entity_discovered",
        result: discovered.has(node.entity_id),
        detail: `entity_id=${node.entity_id} present_in_player_state=${discovered.has(node.entity_id)}`,
      };
    case "all":
    case "any": {
      const children = node.of.map((c) => explainNode(c, discovered, depth + 1));
      const result = node.type === "all"
        ? children.every((c) => c.result)
        : children.some((c) => c.result);
      return { type: node.type, result, children };
    }
    case "not": {
      const child = explainNode(node.child, discovered, depth + 1);
      return { type: "not", result: !child.result, children: [child] };
    }
    default:
      return { type: node.type, result: false, detail: "not evaluated by this trace helper" };
  }
}

export async function traceStoryUnlock(
  storyId: string,
  serverBundle: ServerBundle,
): Promise<void> {
  try {
    // ── 6. Where did playerState come from? ──────────────────
    const sources: string[] = [];
    let uid: string | null = null;
    try {
      const { data } = await supabase.auth.getSession();
      uid = data.session?.user?.id ?? null;
    } catch { /* ignore */ }
    const identity = uid ? `authenticated:${uid}` : "guest (no auth session, auth.uid() = NULL)";

    // Story row + spec, from whichever copy the client can see.
    let story: any = serverBundle && (serverBundle as any).story;
    if (story) sources.push("story:server(get_story_bundle_v2)");
    if (!story) {
      const { ensureLocalSnapshotLoaded, localStoryById } = await import("@/lib/local-first-store");
      await ensureLocalSnapshotLoaded();
      story = localStoryById(storyId);
      if (story) sources.push("story:offline-snapshot");
    }
    const rawSpec = story?.unlock_spec ?? null;
    const spec = normalizeUnlockSpec(rawSpec);
    const validity = validateUnlockSpec(spec);

    // ── 3/4. Player discovery ledger ─────────────────────────
    const discovered = new Set<string>();
    let discoverySource = "none";
    try {
      const { getLocalDiscoveries } = await import("@/lib/entityDiscoveries");
      const userKey = uid ?? "guest";
      Object.values(getLocalDiscoveries(userKey)).forEach((d) => d?.id && discovered.add(d.id));
      discoverySource = `localStorage(irth.entityDiscoveries.${userKey}.v1)`;
    } catch {
      discoverySource = "unavailable";
    }
    if (uid) {
      try {
        const { data } = await supabase
          .from("user_entity_discoveries")
          .select("entity_id")
          .eq("user_id", uid);
        (data ?? []).forEach((r: any) => r?.entity_id && discovered.add(String(r.entity_id)));
        discoverySource += " + server(user_entity_discoveries)";
      } catch { /* ignore */ }
    }
    sources.push(`discoveries:${discoverySource}`);

    // ── 5. Client evaluator result ───────────────────────────
    const clientResult = evaluateStoryUnlock(story, { discovered_entity_ids: discovered });
    const explanation = validity.ok ? explainNode(spec.expr, discovered) : { type: "invalid", result: false };

    const targetIds: string[] = [];
    JSON.stringify(rawSpec, (k, v) => {
      if (k === "entity_id" && typeof v === "string") targetIds.push(v);
      return v;
    });

    /* eslint-disable no-console */
    console.log("════════ IRTH UNLOCK TRACE ════════");
    console.log("1. story.id                 :", storyId);
    console.log("2. unlock_spec (raw)        :", JSON.stringify(rawSpec));
    console.log("   unlock_spec (normalized) :", JSON.stringify(spec), "valid:", validity.ok);
    console.log("3. entity_discoveries.length:", discovered.size);
    console.log("4. contains required ids    :", targetIds.map((id) => `${id} => ${discovered.has(id)}`).join(" | ") || "(no entity_discovered leaf)");
    console.log("5. evaluateStoryUnlock()    :", clientResult);
    console.log("   branch explanation       :", JSON.stringify(explanation));
    console.log("6. identity / playerState   :", identity, "| sources:", sources.join(", "));
    console.log("7. SERVER get_story_bundle_v2:", JSON.stringify({
      ok: serverBundle?.ok ?? null,
      reason: serverBundle?.reason ?? null,
    }));
    console.log("   VERDICT: reader opens when the SERVER says ok:true.",
      "client evaluator =", clientResult, "/ server =", serverBundle?.ok ?? "n/a",
      (serverBundle?.ok && !clientResult)
        ? "→ MISMATCH: the server unlocked a story the client evaluator considers locked."
        : "");
    console.log("═══════════════════════════════════");
    /* eslint-enable no-console */
  } catch (err) {
    console.warn("[unlock-trace] failed", err);
  }
}

/**
 * V16 — Stage 2 verification: is a `stories.last_updated` bump editorial?
 *
 * Only called for a stories-ONLY candidate (no count change, no editorial
 * child-collection change). Fetches the existing public editorial projection
 * `stories_snapshot_manifest_v2()`, hashes it canonically and compares it with
 * the locally applied fingerprint.
 *
 * Any failure (offline, timeout, RPC error, no WebCrypto) resolves to
 * "unknown" and MUST NOT raise the update banner.
 */
import { supabase } from "@/integrations/supabase/client";
import { storyEditorialFingerprint } from "./content-identity";
import {
  readStoryIdentity,
  withBenignTimestamp,
  writeStoryIdentity,
  type StoryContentIdentity,
} from "./content-identity-store";

export const STAGE2_TIMEOUT_MS = 8000;

export type Stage2Result = "changed" | "unchanged" | "unknown";

/** Fetch the manifest payload and hash it. `null` on any failure. */
export async function fetchStoryEditorialFingerprint(
  timeoutMs: number = STAGE2_TIMEOUT_MS,
): Promise<string | null> {
  try {
    const call = supabase.rpc("stories_snapshot_manifest_v2" as never, {} as never);
    const timeout = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), timeoutMs),
    );
    const res = (await Promise.race([call, timeout])) as
      | { data?: unknown; error?: { message?: string } | null }
      | null;
    if (!res || res.error || !res.data) return null;
    return await storyEditorialFingerprint(res.data);
  } catch {
    return null;
  }
}

/**
 * Verify a stories-only candidate. Persists the throttle marker always, and
 * the benign timestamp when the fingerprint proves nothing editorial changed.
 */
export async function verifyStoryEditorialChange(args: {
  candidateTimestamp: string | null;
  nowMs?: number;
  fetchFingerprint?: () => Promise<string | null>;
}): Promise<{ result: Stage2Result; identity: StoryContentIdentity }> {
  const now = args.nowMs ?? Date.now();
  const fetcher = args.fetchFingerprint ?? (() => fetchStoryEditorialFingerprint());

  let identity = readStoryIdentity();
  const serverFingerprint = await fetcher();

  // Throttle marker is recorded even on failure so a broken network cannot
  // turn Stage 2 into a hot loop.
  identity = { ...identity, last_verified_at: now };

  if (!serverFingerprint) {
    writeStoryIdentity(identity);
    return { result: "unknown", identity };
  }

  if (!identity.fingerprint) {
    // First observation on this install: adopt the server fingerprint as the
    // applied identity. Conservative — never a banner from an unknown base.
    identity = withBenignTimestamp(
      { ...identity, fingerprint: serverFingerprint },
      args.candidateTimestamp,
    );
    writeStoryIdentity(identity);
    return { result: "unchanged", identity };
  }

  if (identity.fingerprint === serverFingerprint) {
    identity = withBenignTimestamp(identity, args.candidateTimestamp);
    writeStoryIdentity(identity);
    return { result: "unchanged", identity };
  }

  writeStoryIdentity(identity);
  return { result: "changed", identity };
}

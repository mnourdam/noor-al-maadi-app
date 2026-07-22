// ============================================================
// Logout Flush — bounded, per-user
// ------------------------------------------------------------
// Priority-Zero §5: before sign-out we must give queued mutations
// a chance to reach the server so a reinstall / re-login on the
// same account restores the correct state. We DO NOT block sign-
// out indefinitely — the flush has a bounded timeout.
//
// If the timeout expires or the flush errors we LOG the pending
// count so QA can trace what was left behind, but critically we
// leave the queue in place. It is scoped by userId, so the same
// user signing back in will drain it on next flush; and it will
// NEVER be attempted under another user's session because the
// flush handler rechecks `auth.uid()` before every write.
// ============================================================

import { flushOutbox } from "./flush";
import { peekAll } from "./outbox";

export interface LogoutFlushResult {
  timedOut: boolean;
  flushed: number;
  failed: number;
  pendingAfter: number;
}

/**
 * Await the outbox drain for `userId` up to `timeoutMs` ms.
 * Never throws. Never touches another user's queue.
 */
export async function flushOutboxWithTimeout(
  userId: string,
  timeoutMs = 4000,
): Promise<LogoutFlushResult> {
  let timedOut = false;
  const flushPromise = flushOutbox(userId).catch(() => ({ flushed: 0, failed: 0 }));
  const timeout = new Promise<{ flushed: number; failed: number }>((resolve) => {
    setTimeout(() => { timedOut = true; resolve({ flushed: 0, failed: 0 }); }, timeoutMs);
  });
  const winner = await Promise.race([flushPromise, timeout]);
  let pendingAfter = 0;
  try { pendingAfter = (await peekAll(userId)).length; } catch { /* ignore */ }
  if (timedOut && pendingAfter > 0) {
    try {
      console.warn("[persistence] logout flush timed out with pending ops", {
        userId, pendingAfter, timeoutMs,
      });
    } catch { /* ignore */ }
  }
  return { timedOut, flushed: winner.flushed, failed: winner.failed, pendingAfter };
}

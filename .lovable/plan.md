# Identity, Auth, and Progression Lifecycle Hardening

## Bug 2: Identity Isolation / Logout (Critical)
**Root Cause:** The logout flow in `ProfileProvider` only resets in-memory state to defaults without forcing an immediate re-hydration from the Guest namespace, and the transition lifecycle between identities is not atomic across all stores.

**Implementation:**
1.  **Atomic Identity Reset:** Enhance `src/lib/identity/reset.ts` to be the central orchestrator for identity changes.
2.  **ProfileProvider Fix:** Update `logout` in `src/lib/profile.tsx` to use the atomic reset and ensure immediate re-hydration.
3.  **Strict Namespacing:** Verify that all personal data keys (XP, Dinars, Level, etc.) are included in `APP_ROOTS` and not in `SHARED_PREFIXES` in `src/lib/identity/partition.ts`.

## Bug 3: Google Auth Readiness Sync
**Root Cause:** A race condition where authenticated queries (like `get_my_profile`) start before the Supabase session is fully bridged and the identity namespace has switched.

**Implementation:**
1.  **Auth Readiness State:** Add a `readiness` state to `src/lib/identity/guard.ts` or a new `src/lib/identity/state.ts`.
2.  **Bridging Hardening:** Update `handleNativeAuthCallback` in `src/lib/native-auth.ts` to signal when the session bridge is complete AND the namespace has switched.
3.  **Query Guarding:** Update authenticated hooks (via `useAccount` or similar) to wait for `auth_ready` before triggering fetches.
4.  **Error Handling:** Improve classification of "Connection Errors" to distinguish between true network failure and auth race conditions.

## Bug 1: Canonical Campaign Completion Projection
**Root Cause:** Mismatch between UI (using `irth_campaign_progress`) and Unlock Engine (using a union of ledgers), coupled with potential ID vs. Slug normalization issues.

**Implementation:**
1.  **Canonical Projection:** Create a single authority for "is this campaign completed?" that normalizes ID/Slug and checks all valid sources (Local Progress, Sticky Ledger, Server Ledger, Profile).
2.  **Unified Writer:** Ensure that when a campaign is marked as completed, all relevant stores are updated in a single logical transaction, and events are dispatched to trigger unlock re-evaluation.
3.  **Slug/ID Normalization:** Enforce normalization in `src/lib/campaigns/progression.ts` and `src/lib/campaigns/completions.ts`.

## Verification Plan
1.  **Bug 2:** Test User -> Logout -> Guest flow. Verify zero data leakage for XP, Dinars, etc., and that the UI is truly Guest.
2.  **Bug 3:** Test Guest -> Google Login flow. Verify no "Connection Error" flashes and that profile hydration only starts after the session is ready.
3.  **Bug 1:** Test the Yarmouk -> Mada'in unlock path using an old completion record. Verify the unlock engine recognizes the completion immediately.

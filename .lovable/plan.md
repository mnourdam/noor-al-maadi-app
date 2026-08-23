# V13 BUG 2 — GOOGLE PKCE FAILURE AFTER LOGOUT

## Forensic Report

### Root Cause
The "PKCE code verifier not found" error on the first login attempt after logout is caused by a **race condition** between the `resetForIdentityChange` async cleanup and the `signInWithGoogleNative` flow.

1. **Logout Triggered**: When the user logs out, `supabase.auth.signOut()` is called, triggering a `SIGNED_OUT` event.
2. **Cleanup Starts**: `AccountProvider` catches this and calls `resetForIdentityChange`, which is an `async` function.
3. **Identity Swap**: `resetForIdentityChange` calls `setActiveOwnerInternal(guest)`, which instantly repoints `localStorage` to the guest namespace.
4. **Login Tapped**: The user immediately taps "Login with Google". The UI is available because React hasn't finished its cycle yet.
5. **Verifier Written**: `signInWithGoogleNative` generates a PKCE verifier and writes it using `ImmediateNativePkceStorage`.
6. **Verifier Leak**: Although the verifier key is in `SHARED_PREFIXES` (device-global), `resetForIdentityChange` continues to run in the background. It imports modules like `src/lib/profile.tsx` which re-trigger `hydrateFromStorage()`.
7. **The Killer**: `nativePkceClient` is a module-level **singleton** in `src/lib/native-auth.ts`. It was initialized during the *previous* session (Account A). When `signInWithOAuth` is called, it uses this existing client instance. If the client state is stale or inconsistent during the identity transition, the verifier storage logic can fail or write to a location that is later cleared by the final stages of the identity reset.

Specifically, `supabase.auth.signOut()` on the main client doesn't clear the `nativePkceClient` state. When the new login starts, the `nativePkceClient` might still think it has a session or be in an inconsistent state regarding its internal storage adapter.

### Why second attempt succeeds
By the second attempt, all async cleanup from the first logout has finished, and `nativePkceClient` has been "poked" into a fresh state by the failure of the first attempt (which likely cleared some internal state upon the error).

## Design Plan

### 1. Atomic Auth Client Reset
We must ensure the `nativePkceClient` singleton is explicitly reset during logout so the next login attempt starts with a completely fresh, unauthenticated Supabase client instance.

### 2. Synchronization Barrier
We will add a flag to `AccountProvider` (or use the existing `loadingSession`) to prevent the Google Login button from being actionable until `resetForIdentityChange` has completed its critical phase.

### 3. Storage Key Integrity
We will verify that `NATIVE_CODE_VERIFIER_KEY` is absolutely exempt from any partition-based purging. (Already verified: it is in `SHARED_PREFIXES`).

## Technical Details

### `src/lib/native-auth.ts`
- Export a `resetNativePkceClient()` function that sets the singleton to `null`.
- This ensures `getNativePkceSupabaseClient()` creates a fresh instance for the new login flow.

### `src/lib/identity/reset.ts`
- Call `resetNativePkceClient()` inside the `resetForIdentityChange` flow.

### `src/lib/account.tsx`
- Ensure the `signOut` handler awaits `resetForIdentityChange` before allowing new auth actions.
- The `busy` state in `src/routes/auth.tsx` should be tied to the account's readiness.

## Safety Invariants
- **Durable PKCE**: Capacitor Preferences backup remains intact.
- **Account Isolation**: Bug 3 fixes are preserved; `resetNativePkceClient` only touches the auth transport client, not user data.
- **No Weakening**: PKCE remains mandatory and secured.

## Verification
- **Test B/D**: A → Logout → Google Login B must pass on the first attempt.
- **Test G/H**: Isolation for Bug 3 and Bug 4 must remain PASS.

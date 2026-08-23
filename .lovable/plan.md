# Profile Data Isolation and Guest Partition Sanitization

The forensic audit of physical Android logout behavior has identified that the Guest storage partition (`guest:<device-id>`) is being polluted with authenticated user profile data (e.g., `loggedIn: true`, Account A's points and name). This occurs because `ProfileProvider` writes its current state to the active partition, and there is a race condition or incorrect adoption of state during the identity transition.

## Goals
- Prevent authenticated user profile data from ever being written to a Guest partition.
- Sanitize Guest partitions that have already been polluted with authenticated data.
- Ensure strict ownership-bound writes for profile data to prevent async races.
- Implement an invariant at the storage boundary to quarantine invalid profile writes.

## User Review Required

> [!IMPORTANT]
> This fix will automatically reset any Guest profile that has `loggedIn: true` set. If a user was playing as a guest and somehow their local data got marked as `loggedIn: true` without a real account, that specific local guest progress will be reset to default values to ensure security and data isolation.

## Technical Details

### 1. Storage Boundary Invariant
Modify `src/lib/identity/partition.ts` to add a validation check in `setItem`. If the key is `hakaya.profile.v2` and the active owner is a Guest, it will reject any value that has `loggedIn: true`.

### 2. Explicit Ownership in Profile Writes
Modify `src/lib/profile.tsx` to bind the `localStorage.setItem` call to the owner who was active when the profile state was current. This prevents an async update intended for Account A from landing in the Guest partition if the identity switched mid-operation.

### 3. Guest Partition Sanitization
Modify `hydrateFromStorage` in `src/lib/profile.tsx` to detect "pollution" (Guest owner + `loggedIn: true`). If detected, it will return `null` (forcing a reset to defaults) and trigger a cleanup of the physical key.

### 4. identity-changed sequencing
Refine `resetForIdentityChange` in `src/lib/identity/reset.ts` to ensure all in-flight profile writes are neutralized before the owner swap is finalized.

## Proposed Changes

### Storage Boundary
- **File:** `src/lib/identity/partition.ts`
- **Change:** Add `validateProfileWrite(owner, key, value)` to `proto.setItem`.
- **Logic:** If `owner.startsWith("guest:")` and `key === "hakaya.profile.v2"`, parse `value`. If `parsed.loggedIn === true`, block the write and record a `quarantine` diagnostic event.

### Profile Hydration & Sanitization
- **File:** `src/lib/profile.tsx`
- **Change:** Update `hydrateFromStorage`.
- **Logic:** After parsing, if `ownerAtHydrate.startsWith("guest:") && parsed.loggedIn === true`, then:
    1. Record `PROFILE_POLLUTION_DETECTED`.
    2. Remove the polluted physical key.
    3. Return `null`.

### Profile Write Guard
- **File:** `src/lib/profile.tsx`
- **Change:** Update the persistence `useEffect`.
- **Logic:** Capture the `activeOwner` at the time of the effect trigger. Ensure `localStorage.setItem` is only called if the owner is still active OR use an internal ref to track the owner for the current state.

### Identity Reset
- **File:** `src/lib/identity/reset.ts`
- **Change:** Add a more aggressive cleanup for the profile module during `resetForIdentityChange`.

// ============================================================
// Identity Partition — owner-scoped physical storage
// ------------------------------------------------------------
// ARCHITECTURAL RULE (mandatory):
//   No personal progression data may live under a global key.
//   Every personal key is physically stored as
//
//       <logicalKey>::owner=<ownerKey>
//
//   so `guest:<deviceId>`, `user:<A>` and `user:<B>` occupy three
//   completely disjoint namespaces on the same device.
//
// The partition is installed once, before any feature module touches
// storage, by patching `Storage.prototype` read/write methods. Feature
// code keeps using its familiar logical keys ("irth_campaign_progress",
// "hakaya.profile.v2", …) and is transparently isolated per identity.
// Switching identity is therefore atomic: it is a namespace swap, not a
// data migration, and it can never leak a byte across owners.
//
// Non-personal keys (device id, auth session, crash logs, admin content
// packs, bundled offline snapshot, audio settings) stay global on purpose.
// ============================================================

import { getActiveOwner, type OwnerKey } from "./owner";

export const OWNER_SEPARATOR = "::owner=";

/** Roots that identify app-owned keys. Everything else (3rd-party) is global. */
const APP_ROOTS = ["irth.", "irth_", "irth-", "hakaya.", "campaign-unlocks"];

/**
 * App keys that are DEVICE-level or CONTENT-level, never personal.
 * These stay unpartitioned so logout does not wipe the device, the
 * bundled content cache, or the crash diagnostics trail.
 */
const SHARED_PREFIXES = [
  // identity plumbing itself
  "irth.device.",
  "irth.identity.",
  // auth / oauth / native bridge flow
  "irth.authOrigin",
  "irth.google_auth",
  "irth.oauth_error",
  "irth.native-auth",
  "irth-native-auth",
  "irth.recovery-mode",
  "irth.pendingFcmToken",
  "irth.notification.permission.asked",
  // crash + diagnostics + debug
  "irth.crash.",
  "irth.diag.",
  "irth.debug.",
  "irth.audioDebug",
  "irth.cinematic.debug",
  "irth.boot-root-recovered",
  "irth.atlas.crash",
  "irth.atlas.trace",
  "irth.atlas.forceRemote",
  // device preferences / one-off device gates
  "irth_audio_settings",
  "irth.splash.",
  "irth-boot-splash",
  "irth.firstLaunch.",
  "irth.cinematic-opening.",
  "irth.tutorial.",
  "irth-first-time",
  // shared content caches (not personal)
  "irth.offline.snapshot",
  "irth-offline",
  "irth.story-covers.delta",
  "irth.stories.relations",
  "irth_admin_",
  "irth-admin",
  "irth_content_registry",
  "irth-campaigns",
  "irth-investigations",
  "irth-images-v1",
  // per-install crypto secrets
  "irth.stories.unlock.secret",
  "irth-default-unlock-secret",
];

/** True when the key holds data belonging to one specific player identity. */
export function isPersonalKey(key: string): boolean {
  if (!key) return false;
  if (key.includes(OWNER_SEPARATOR)) return false; // already physical
  if (!APP_ROOTS.some((r) => key.startsWith(r))) return false;

  // EXCEPTION: These specific Story keys are Logical Keys that belong to the player
  // but were previously being double-scoped in the component. We treat them
  // as personal so the partition engine handles the physical scoping.
  const personalStoryKeys = ["irth.stories.lockstate.", "irth.stories.unlock-celebrated."];
  if (personalStoryKeys.some((pk) => key.startsWith(pk))) return true;

  if (SHARED_PREFIXES.some((p) => key.startsWith(p))) return false;
  return true;
}

export function physicalKey(logicalKey: string, owner: OwnerKey): string {
  return `${logicalKey}${OWNER_SEPARATOR}${owner}`;
}

export function logicalKeyOf(physical: string): string {
  const i = physical.indexOf(OWNER_SEPARATOR);
  return i === -1 ? physical : physical.slice(0, i);
}

export function ownerOfPhysicalKey(physical: string): OwnerKey | null {
  const i = physical.indexOf(OWNER_SEPARATOR);
  return i === -1 ? null : physical.slice(i + OWNER_SEPARATOR.length);
}

let installed = false;
let mapping = true;

function mapKey(key: string): string {
  if (!mapping) return key;
  if (!isPersonalKey(key)) return key;
  const owner = getActiveOwner();
  const physical = physicalKey(key, owner);
  
  // V13 Physical Android Diagnostics - Profile read/write mapping
  if (key === "hakaya.profile.v2") {
    import("../diag-trace").then(m => {
      m.recordTrace("logout-audit", "storage-mapping", JSON.stringify({
        logical: key,
        owner: owner,
        physical: physical
      }));
    }).catch(() => {});
  }
  
  return physical;
}

/** Escape hatch used by the migration + owner-scoped bulk operations. */
function withoutMapping<T>(fn: () => T): T {
  const prev = mapping;
  mapping = false;
  try { return fn(); } finally { mapping = prev; }
}

const MIGRATED_FLAG = "irth.identity.partitionMigrated.v1";

/**
 * One-time move of legacy global personal keys into the namespace of the
 * identity that is active at first boot after the upgrade. Without this the
 * existing player would appear to lose all their progress.
 */
function migrateLegacyKeys(store: Storage, owner: OwnerKey): void {
  withoutMapping(() => {
    const log = (stage: string, detail?: string) => {
      import("../diag-trace").then(m => m.recordTrace("logout-audit", `migration:${stage}`, detail)).catch(() => {});
    };

    if (store.getItem(MIGRATED_FLAG) === owner) {
      log("skipped-already-migrated", owner);
      return;
    }

    log("start", owner);

    const legacy: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (k && isPersonalKey(k)) legacy.push(k);
    }

    for (const k of legacy) {
      const target = physicalKey(k, owner);
      const sourceExists = store.getItem(k) !== null;
      const targetExistsBefore = store.getItem(target) !== null;
      
      log("check", JSON.stringify({
        key: k,
        sourceExists,
        target: target,
        targetExistsBefore
      }));

      try {
        const v = store.getItem(k);
        let copyPerformed = false;
        if (v !== null && store.getItem(target) === null) {
          store.setItem(target, v);
          copyPerformed = true;
        }
        
        const removed = v !== null;
        if (removed) store.removeItem(k);

        log("result", JSON.stringify({
          key: k,
          copyPerformed,
          legacyRemoved: removed
        }));
      } catch (e) { 
        log("error", (e as Error).message);
      }
    }
    try { store.setItem(MIGRATED_FLAG, owner); } catch { /* ignore */ }
  });
}

/**
 * Install the partition. Idempotent; safe to call from every entry point.
 * MUST run before feature modules read or write storage.
 */
export function installIdentityPartition(): void {
  if (installed) return;
  if (typeof window === "undefined") return;
  const proto = (window as unknown as { Storage?: { prototype: Storage } }).Storage?.prototype;
  if (!proto) return;
  installed = true;

  // Resolve (and cache) the boot owner BEFORE patching so the resolution's
  // own storage reads cannot recurse through the mapper.
  const owner = withoutMapping(() => getActiveOwner());

  const getItem = proto.getItem;
  const setItem = proto.setItem;
  const removeItem = proto.removeItem;

  proto.getItem = function (this: Storage, key: string) {
    const logical = String(key);
    const mapped = mapKey(logical);
    const val = getItem.call(this, mapped);

    if (logical === "hakaya.profile.v2" && mapping) {
      const legacyVal = getItem.call(this, logical);
      const parseSafe = (v: string | null) => {
        if (!v) return null;
        try {
          const p = JSON.parse(v);
          return { name: p.name, loggedIn: p.loggedIn, points: p.points, dinars: p.dinars };
        } catch { return "error"; }
      };

      import("../diag-trace").then(m => {
        m.recordTrace("logout-audit", "profile-read", JSON.stringify({
          owner: getActiveOwner(),
          physical: mapped,
          exists: val !== null,
          data: parseSafe(val),
          legacyExists: legacyVal !== null,
          legacyData: parseSafe(legacyVal)
        }));
      }).catch(() => {});
    }
    return val;
  };

  proto.setItem = function (this: Storage, key: string, value: string) {
    const logical = String(key);
    const mapped = mapKey(logical);
    
    if (logical === "hakaya.profile.v2" && mapping) {
      const parseSafe = (v: string | null) => {
        if (!v) return null;
        try {
          const p = JSON.parse(v);
          return { name: p.name, loggedIn: p.loggedIn, points: p.points, dinars: p.dinars };
        } catch { return "error"; }
      };
      import("../diag-trace").then(m => {
        m.recordTrace("logout-audit", "profile-write", JSON.stringify({
          owner: getActiveOwner(),
          physical: mapped,
          data: parseSafe(value)
        }));
      }).catch(() => {});
    }
    return setItem.call(this, mapped, value);
  };

  proto.removeItem = function (this: Storage, key: string) {
    return removeItem.call(this, mapKey(String(key)));
  };

  try { migrateLegacyKeys(window.localStorage, owner); } catch { /* ignore */ }
}

/** Physical keys currently stored for one owner. */
export function ownedPhysicalKeys(owner: OwnerKey, store?: Storage): string[] {
  const s = store ?? (typeof window !== "undefined" ? window.localStorage : null);
  if (!s) return [];
  return withoutMapping(() => {
    const out: string[] = [];
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k && ownerOfPhysicalKey(k) === owner) out.push(k);
    }
    return out;
  });
}

/** Hard-delete every stored byte belonging to one owner (account deletion). */
export function purgeOwnerData(owner: OwnerKey): number {
  if (typeof window === "undefined") return 0;
  const stores = [window.localStorage, window.sessionStorage];
  let n = 0;
  for (const s of stores) {
    for (const k of ownedPhysicalKeys(owner, s)) {
      withoutMapping(() => { try { s.removeItem(k); n++; } catch { /* ignore */ } });
    }
  }
  return n;
}

/** Test-only. */
export function __uninstallPartitionForTests(): void {
  installed = false;
  mapping = true;
}

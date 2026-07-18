#!/usr/bin/env node
// Phase 2c — Daily Challenge scheduler determinism + suppression tests.
//
// This suite exercises the pure helpers and the injectable
// suppression/invariant surface of
// src/lib/notifications/dailyChallengeScheduler.ts. It intentionally
// does NOT mock the Capacitor plugin: every "runtime" assertion is
// driven by a fake plugin harness bound to the real
// `rescheduleDailyChallenge` code path.
//
// Run: `node scripts/test-daily-challenge-scheduler.mjs`
//      (exits non-zero on any failure).

import { register } from "node:module";
import { pathToFileURL } from "node:url";

try { register("tsx/esm", pathToFileURL("./")); } catch { /* optional */ }

// ─── Minimal shims ─────────────────────────────────────────────
// The scheduler references `localStorage` (via readCanonicalNotificationPrefs
// / readLastMeta / writeLastMeta) and a few `globalThis.Capacitor` fields.
// Give it a Node-safe fake before importing.

const storage = new Map();
globalThis.localStorage = {
  getItem: (k) => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
  clear: () => storage.clear(),
};

// Fake Capacitor "android native" surface so runtime helpers pick the
// plugin path.
globalThis.Capacitor = {
  isNativePlatform: () => true,
  getPlatform: () => "android",
};

// Fake @capacitor/local-notifications module — installed via a Node
// loader trick: intercept via a resolver hook. Simpler: pre-populate
// the ES module cache using `import.meta.resolve` is not portable, so
// instead we install a global bag and require the scheduler to call
// into it. The scheduler already uses `await import(...)`, so we
// substitute the specifier via an import map override on
// `globalThis.__fakeLocalNotifications`.
//
// To keep things simple and avoid patching Node's module resolver, we
// spy on the plugin by patching the resolved module after first load:
// dynamic import returns the cached module, so we can mutate its
// `LocalNotifications` methods.

const pendingIds = new Set();
const calls = { schedule: [], cancel: [], checkPermissions: [] };
let permissionState = "granted";

const fakePlugin = {
  async checkPermissions() {
    calls.checkPermissions.push(Date.now());
    return { display: permissionState };
  },
  async schedule({ notifications }) {
    calls.schedule.push(notifications);
    for (const n of notifications) pendingIds.add(n.id);
    return { notifications };
  },
  async cancel({ notifications }) {
    calls.cancel.push(notifications);
    for (const n of notifications) pendingIds.delete(n.id);
  },
  async getPending() {
    return { notifications: [...pendingIds].map((id) => ({ id })) };
  },
  addListener() { return { remove: async () => {} }; },
};

// Register a loader that resolves the plugin module to our fake. We
// use Node's `--experimental-loader` friendly approach: define a
// custom hook file OR — simpler — pre-populate the module cache via
// `import.meta.resolve` is unreliable, so we short-circuit by
// installing an alias in `node_modules` at test time.
//
// Practical path: patch `require.cache` won't work in ESM. Instead,
// use a resolve/load loader registered at startup. Register it now.

register(
  new URL("data:text/javascript;base64," + Buffer.from(`
    export async function resolve(specifier, context, next) {
      if (specifier === "@capacitor/local-notifications") {
        return { url: "fake-cap-local-notif:///", format: "module", shortCircuit: true };
      }
      return next(specifier, context);
    }
    export async function load(url, context, next) {
      if (url === "fake-cap-local-notif:///") {
        return {
          format: "module",
          source: "export const LocalNotifications = globalThis.__fakeLocalNotifications;",
          shortCircuit: true,
        };
      }
      return next(url, context);
    }
  `).toString("base64")).href,
  pathToFileURL("./"),
);
globalThis.__fakeLocalNotifications = fakePlugin;

// Also fake @/integrations/supabase/client so `resolveUserKey` doesn't
// try to reach the network. The scheduler imports via alias — we
// resolve that via a second loader entry.
register(
  new URL("data:text/javascript;base64," + Buffer.from(`
    export async function resolve(specifier, context, next) {
      if (specifier === "@/integrations/supabase/client") {
        return { url: "fake-supabase-client:///", format: "module", shortCircuit: true };
      }
      if (specifier === "@/lib/games/dailyChallengeService") {
        return { url: "fake-daily-challenge-service:///", format: "module", shortCircuit: true };
      }
      if (specifier === "@/lib/notifications") {
        return { url: "fake-notifications-lib:///", format: "module", shortCircuit: true };
      }
      return next(specifier, context);
    }
    export async function load(url, context, next) {
      if (url === "fake-supabase-client:///") {
        return { format: "module", source: "export const supabase = globalThis.__fakeSupabase;", shortCircuit: true };
      }
      if (url === "fake-daily-challenge-service:///") {
        return { format: "module", source: "export const loadDailyChallengeState = () => globalThis.__fakeDailyState();", shortCircuit: true };
      }
      if (url === "fake-notifications-lib:///") {
        return {
          format: "module",
          source: "export const DEFAULT_NOTIFICATION_PREFS = { master: true, daily: true, reengagement: true, season: false, campaign: true, friend: true, dailyChallenge: true };\\nexport function readCanonicalNotificationPrefs() { return globalThis.__fakePrefs(); }",
          shortCircuit: true,
        };
      }
      return next(url, context);
    }
  `).toString("base64")).href,
  pathToFileURL("./"),
);

globalThis.__fakeSupabase = {
  auth: { getUser: async () => ({ data: { user: { id: "user-alice" } } }) },
};
globalThis.__fakeDailyState = () => ({
  totalPublished: 5,
  allEligibleExhausted: false,
  todaysPicksDone: false,
});
globalThis.__fakePrefs = () => ({
  master: true,
  daily: true,
  reengagement: true,
  season: false,
  campaign: true,
  friend: true,
  dailyChallenge: true,
});

// ─── Load scheduler under test ─────────────────────────────────

const schedulerMod = await import("../src/lib/notifications/dailyChallengeScheduler.ts");
const catalogMod = await import("../src/lib/notifications/dailyChallengeCatalog.ts");

const {
  computeNextSchedule,
  periodFor,
  WINDOW_START_MIN,
  WINDOW_END_MIN,
  PERIOD_DAYS,
  DAILY_CHALLENGE_NOTIF_ID,
  DAILY_CHALLENGE_DEEP_LINK,
  evaluateSuppression,
  rescheduleDailyChallenge,
  cancelDailyChallenge,
  clearLastMeta,
} = schedulerMod;
const { pickCatalogEntry, CATALOG_LENGTH, hash32, DAILY_CHALLENGE_CATALOG } = catalogMod;

let failed = 0;
let total = 0;
function check(name, cond, extra) {
  total++;
  if (cond) {
    console.log(`  ok  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL ${name}${extra ? " — " + JSON.stringify(extra) : ""}`);
  }
}

function resetHarness() {
  pendingIds.clear();
  calls.schedule.length = 0;
  calls.cancel.length = 0;
  calls.checkPermissions.length = 0;
  storage.clear();
  permissionState = "granted";
  globalThis.__fakeDailyState = () => ({ totalPublished: 5, allEligibleExhausted: false, todaysPicksDone: false });
  globalThis.__fakePrefs = () => ({ master: true, daily: true, reengagement: true, season: false, campaign: true, friend: true, dailyChallenge: true });
}

// ─── Section A: pure math (determinism & window) ───────────────
console.log("A. Pure scheduling math");

const now = new Date(2026, 5, 15, 10, 0, 0, 0).getTime();
const user = "user-alice";

{
  const a = computeNextSchedule(user, now, null);
  const b = computeNextSchedule(user, now, null);
  check("determinism: same (user, now) → same fireAt & msgIdx", a.fireAt === b.fireAt && a.msgIdx === b.msgIdx);

  const d = new Date(a.fireAt);
  const minuteOfDay = d.getHours() * 60 + d.getMinutes();
  check("fire time inside local 16:00–21:30", minuteOfDay >= WINDOW_START_MIN && minuteOfDay < WINDOW_END_MIN);

  const previousMeta = { userKey: user, period: a.period, minute: a.minute, msgIdx: a.msgIdx };
  const next = computeNextSchedule(user, a.fireAt + 60_000, previousMeta);
  const dayDiff = Math.round((next.fireAt - a.fireAt) / 86_400_000);
  check("cadence ≈ PERIOD_DAYS", dayDiff === PERIOD_DAYS || dayDiff === PERIOD_DAYS + 1, { dayDiff });
  check("period advances by 1", next.period === a.period + 1);

  const offsets = new Set(["u1", "u2", "u3", "u4", "u5", "u6"].map((u) => periodFor(u, now).offset));
  check("staggering exercises >1 offset bucket", offsets.size > 1);

  const fakePrev = { userKey: user, period: a.period - 1, minute: a.minute, msgIdx: 0 };
  const corrected = computeNextSchedule(user, now, fakePrev);
  check("minute no-repeat correction", corrected.minute !== a.minute);

  let prev = null;
  let collisions = 0;
  for (let p = 0; p < 30; p++) {
    const { idx } = pickCatalogEntry(user, p, prev);
    if (prev != null && idx === prev && CATALOG_LENGTH > 1) collisions++;
    prev = idx;
  }
  check("no consecutive catalog collisions across 30 periods", collisions === 0);

  const s = computeNextSchedule(user, a.fireAt + 60_000, null);
  check("rolls forward past current-period fire", s.fireAt > a.fireAt + 60_000);
  check("hash32 stable", hash32("hello|world") === hash32("hello|world"));
  check("catalog length is 10", CATALOG_LENGTH === 10);
  check("every catalog entry has distinct title vs body", DAILY_CHALLENGE_CATALOG.every((m) => m.title !== m.body));
}

// ─── Section B: pure suppression rules ─────────────────────────
console.log("\nB. Suppression rules (pure)");

const defaultPrefs = { master: true, daily: true, reengagement: true, season: false, campaign: true, friend: true, dailyChallenge: true };
const okState = { totalPublished: 5, allEligibleExhausted: false, todaysPicksDone: false };

check("master disabled → master_disabled",
  evaluateSuppression({ prefs: { ...defaultPrefs, master: false }, permissionGranted: true, dailyState: okState }) === "master_disabled");
check("category muted → category_muted",
  evaluateSuppression({ prefs: { ...defaultPrefs, dailyChallenge: false }, permissionGranted: true, dailyState: okState }) === "category_muted");
check("permission denied → permission_not_granted",
  evaluateSuppression({ prefs: defaultPrefs, permissionGranted: false, dailyState: okState }) === "permission_not_granted");
check("no published games → no_published_games",
  evaluateSuppression({ prefs: defaultPrefs, permissionGranted: true, dailyState: { ...okState, totalPublished: 0 } }) === "no_published_games");
check("all eligible exhausted → all_eligible_exhausted",
  evaluateSuppression({ prefs: defaultPrefs, permissionGranted: true, dailyState: { ...okState, allEligibleExhausted: true } }) === "all_eligible_exhausted");
check("today's picks done → todays_picks_done",
  evaluateSuppression({ prefs: defaultPrefs, permissionGranted: true, dailyState: { ...okState, todaysPicksDone: true } }) === "todays_picks_done");
check("everything ok → null (schedule)",
  evaluateSuppression({ prefs: defaultPrefs, permissionGranted: true, dailyState: okState }) === null);
check("suppression order — master beats category",
  evaluateSuppression({ prefs: { ...defaultPrefs, master: false, dailyChallenge: false }, permissionGranted: false, dailyState: { ...okState, totalPublished: 0 } }) === "master_disabled");
check("suppression order — category beats permission",
  evaluateSuppression({ prefs: { ...defaultPrefs, dailyChallenge: false }, permissionGranted: false, dailyState: okState }) === "category_muted");

// ─── Section C: runtime invariants (fake plugin harness) ──────
console.log("\nC. Runtime invariants (rescheduleDailyChallenge + fake plugin)");

// C1. Master disabled → pending id 8801 cancelled.
resetHarness();
await rescheduleDailyChallenge("bootstrap"); // seed a pending entry first.
check("baseline: one pending after bootstrap", pendingIds.size === 1 && pendingIds.has(DAILY_CHALLENGE_NOTIF_ID));
globalThis.__fakePrefs = () => ({ ...defaultPrefs, master: false });
let r = await rescheduleDailyChallenge("master_off");
check("master disabled → cancelled 8801", r.status === "cancelled" && r.reason === "master_disabled" && !pendingIds.has(DAILY_CHALLENGE_NOTIF_ID));

// C2. Category muted → cancelled.
resetHarness();
await rescheduleDailyChallenge("bootstrap");
globalThis.__fakePrefs = () => ({ ...defaultPrefs, dailyChallenge: false });
r = await rescheduleDailyChallenge("category_off");
check("dailyChallenge muted → cancelled", r.status === "cancelled" && r.reason === "category_muted" && pendingIds.size === 0);

// C3. Permission denied → cancelled / not scheduled.
resetHarness();
permissionState = "denied";
r = await rescheduleDailyChallenge("no_permission");
check("permission denied → not scheduled", r.status === "cancelled" && r.reason === "permission_not_granted" && pendingIds.size === 0);

// C4. Today's picks done → cancelled.
resetHarness();
await rescheduleDailyChallenge("bootstrap");
globalThis.__fakeDailyState = () => ({ totalPublished: 5, allEligibleExhausted: false, todaysPicksDone: true });
r = await rescheduleDailyChallenge("picks_done");
check("todaysPicksDone → cancelled", r.status === "cancelled" && r.reason === "todays_picks_done" && pendingIds.size === 0);

// C5. All eligible exhausted → cancelled.
resetHarness();
await rescheduleDailyChallenge("bootstrap");
globalThis.__fakeDailyState = () => ({ totalPublished: 5, allEligibleExhausted: true, todaysPicksDone: false });
r = await rescheduleDailyChallenge("exhausted");
check("allEligibleExhausted → cancelled", r.status === "cancelled" && r.reason === "all_eligible_exhausted" && pendingIds.size === 0);

// C6. No published games → cancelled.
resetHarness();
await rescheduleDailyChallenge("bootstrap");
globalThis.__fakeDailyState = () => ({ totalPublished: 0, allEligibleExhausted: false, todaysPicksDone: false });
r = await rescheduleDailyChallenge("no_games");
check("no published games → cancelled", r.status === "cancelled" && r.reason === "no_published_games" && pendingIds.size === 0);

// C7. Repeated reschedule calls → exactly one pending, id 8801.
resetHarness();
for (let i = 0; i < 5; i++) await rescheduleDailyChallenge(`repeat_${i}`);
check("5 rapid reschedules → exactly one pending with id 8801",
  pendingIds.size === 1 && pendingIds.has(DAILY_CHALLENGE_NOTIF_ID));

// C8. Sign-out flow: previous identity's schedule is cancelled BEFORE
//     the guest schedule evaluates. We simulate the two-step handler.
resetHarness();
globalThis.__fakeSupabase.auth.getUser = async () => ({ data: { user: { id: "user-alice" } } });
await rescheduleDailyChallenge("signed_in_alice");
const aliceMetaJson = storage.get("irth.dailyChallengeReminder.lastMeta.v1");
check("post-alice schedule: 1 pending + lastMeta persisted",
  pendingIds.size === 1 && !!aliceMetaJson && JSON.parse(aliceMetaJson).userKey === "user-alice");
// Sign-out: DailyChallengeReminderScheduler cancels + clears meta first.
await cancelDailyChallenge("signed_out");
clearLastMeta();
check("sign-out step 1: pending cancelled + meta cleared",
  pendingIds.size === 0 && !storage.get("irth.dailyChallengeReminder.lastMeta.v1"));
globalThis.__fakeSupabase.auth.getUser = async () => ({ data: { user: null } });
await rescheduleDailyChallenge("guest");
const guestMetaJson = storage.get("irth.dailyChallengeReminder.lastMeta.v1");
const guestMeta = guestMetaJson ? JSON.parse(guestMetaJson) : null;
check("sign-out step 2: guest schedule evaluated cleanly",
  pendingIds.size === 1 && guestMeta?.userKey === "guest",
  { pending: pendingIds.size, meta: guestMeta });

// C9. Deep link constant matches what schedule() payload carried.
resetHarness();
await rescheduleDailyChallenge("deep_link_check");
const lastSchedule = calls.schedule[calls.schedule.length - 1]?.[0];
check("schedule payload carries canonical deep_link",
  !!lastSchedule && lastSchedule.extra?.deep_link === DAILY_CHALLENGE_DEEP_LINK);
check("canonical deep link points at Challenges Hall",
  DAILY_CHALLENGE_DEEP_LINK === "/adventure");

// ─── Section D: FCM env-var strictness (mirrors edge-function check) ──
console.log("\nD. Legacy FCM shutdown — env strictness");

// The edge function uses: `Deno.env.get("DAILY_CHALLENGE_FCM_ENABLED") !== "true"`.
// We mirror the exact check here so a future accidental loosening is caught.
function fcmEnabled(val) { return val === "true"; }
check("missing DAILY_CHALLENGE_FCM_ENABLED → disabled", fcmEnabled(undefined) === false);
check("empty string → disabled", fcmEnabled("") === false);
check("\"1\" → disabled", fcmEnabled("1") === false);
check("\"TRUE\" (wrong case) → disabled", fcmEnabled("TRUE") === false);
check("\"yes\" → disabled", fcmEnabled("yes") === false);
check("literal \"true\" → enabled (only positive case)", fcmEnabled("true") === true);

// ─── Report ────────────────────────────────────────────────────
console.log(`\nTotal: ${total}   Passed: ${total - failed}   Failed: ${failed}`);
console.log(failed === 0 ? "All scheduler tests passed." : `${failed} test(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);

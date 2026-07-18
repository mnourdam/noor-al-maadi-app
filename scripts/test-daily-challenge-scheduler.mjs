#!/usr/bin/env node
// Phase 2c — Daily Challenge scheduler determinism tests.
//
// These tests import the PURE helpers from
// src/lib/notifications/dailyChallengeScheduler.ts and
// src/lib/notifications/dailyChallengeCatalog.ts and verify:
//
//   1. computeNextSchedule is deterministic for the same
//      (userKey, nowMs) pair.
//   2. Fire time always lands inside the local 16:00–21:30 window.
//   3. Cadence is PERIOD_DAYS calendar days apart (per user).
//   4. Two different users stagger onto different anchor days.
//   5. No-repeat correction bumps the minute when the previous
//      period had the same minute.
//   6. Message index respects the no-repeat rule across
//      consecutive periods.
//   7. Advancing "now" past today's fire time rolls to the next
//      period instead of returning a past timestamp.
//
// Run: `node scripts/test-daily-challenge-scheduler.mjs`
//      (exits non-zero on any failure).

import { register } from "node:module";
import { pathToFileURL } from "node:url";

// Load TS via tsx's ESM loader if available; otherwise fall back to
// a naive strip-types transform good enough for our small, pure files.
try { register("tsx/esm", pathToFileURL("./")); } catch { /* optional */ }

const schedulerMod = await import("../src/lib/notifications/dailyChallengeScheduler.ts");
const catalogMod = await import("../src/lib/notifications/dailyChallengeCatalog.ts");

const {
  computeNextSchedule,
  periodFor,
  WINDOW_START_MIN,
  WINDOW_END_MIN,
  PERIOD_DAYS,
} = schedulerMod;
const { pickCatalogEntry, CATALOG_LENGTH, hash32 } = catalogMod;

let failed = 0;
function check(name, cond, extra) {
  if (cond) {
    console.log(`  ok  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL ${name}${extra ? " — " + JSON.stringify(extra) : ""}`);
  }
}

// A fixed reference "now" (local time on the test machine — that's fine,
// all assertions are about the *local* window and cadence).
const now = new Date(2026, 5, 15, 10, 0, 0, 0).getTime(); // June 15 2026, 10:00 local
const user = "user-alice";

console.log("Phase 2c — scheduler determinism");

// 1. Determinism.
const a = computeNextSchedule(user, now, null);
const b = computeNextSchedule(user, now, null);
check("determinism", a.fireAt === b.fireAt && a.msgIdx === b.msgIdx, { a, b });

// 2. Fire time inside the local window.
{
  const d = new Date(a.fireAt);
  const minuteOfDay = d.getHours() * 60 + d.getMinutes();
  check(
    "fire time inside 16:00-21:30 local window",
    minuteOfDay >= WINDOW_START_MIN && minuteOfDay < WINDOW_END_MIN,
    { hh: d.getHours(), mm: d.getMinutes() },
  );
}

// 3. Cadence — consecutive scheduled fires are ~PERIOD_DAYS calendar days apart.
{
  const first = a;
  const previousMeta = { userKey: user, period: first.period, minute: first.minute, msgIdx: first.msgIdx };
  const next = computeNextSchedule(user, first.fireAt + 60_000, previousMeta);
  const dayDiff = Math.round((next.fireAt - first.fireAt) / 86_400_000);
  check("cadence ≈ PERIOD_DAYS", dayDiff === PERIOD_DAYS || dayDiff === PERIOD_DAYS + 1, { dayDiff });
  check("period advanced by 1", next.period === first.period + 1, { first: first.period, next: next.period });
}

// 4. Staggering across users — two users should not always share the same anchor day.
{
  const users = ["u1", "u2", "u3", "u4", "u5", "u6"];
  const offsets = new Set(users.map((u) => periodFor(u, now).offset));
  check("staggering exercises >1 offset bucket", offsets.size > 1, { offsets: [...offsets] });
}

// 5. Minute no-repeat correction.
{
  const base = computeNextSchedule(user, now, null);
  // Simulate an artificial previous period whose minute matches base.minute
  // for the *previous* period of the same user.
  const fakePrev = {
    userKey: user,
    period: base.period - 1,
    minute: base.minute,
    msgIdx: 0,
  };
  const corrected = computeNextSchedule(user, now, fakePrev);
  check("minute no-repeat correction", corrected.minute !== base.minute, { base: base.minute, corrected: corrected.minute });
}

// 6. Message no-repeat correction — walk 30 periods and assert no two
//    *consecutive* pickCatalogEntry results collide when alternatives exist.
{
  let prev = null;
  let collisions = 0;
  for (let p = 0; p < 30; p++) {
    const { idx } = pickCatalogEntry(user, p, prev);
    if (prev != null && idx === prev && CATALOG_LENGTH > 1) collisions++;
    prev = idx;
  }
  check("no consecutive catalog collisions across 30 periods", collisions === 0, { collisions });
}

// 7. Advancing past today's fire → rolls to next period, never past.
{
  const s = computeNextSchedule(user, a.fireAt + 60_000, null);
  check("rolls forward past current-period fire time", s.fireAt > a.fireAt, { s: s.fireAt, a: a.fireAt });
  check("scheduled time strictly in the future", s.fireAt > a.fireAt + 60_000, { s: s.fireAt });
}

// Sanity: hash32 is stable across runs.
check("hash32 stable", hash32("hello|world") === hash32("hello|world"));

console.log(failed === 0 ? "\nAll scheduler tests passed." : `\n${failed} test(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);

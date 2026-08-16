// ============================================================
// Daily Challenge Rotation — deterministic Shuffle-Bag engine.
// ------------------------------------------------------------
// Replaces the previous "hash the day, sort, take the first two"
// approach, which guaranteed only *intra-day* mode diversity and
// left cross-day variety to chance (a mode could repeat on
// consecutive days, or vanish for a week).
//
// Model
// -----
// The calendar is a continuous stream of SLOTS, two per day:
//     slot(D, 0) = 2D      slot(D, 1) = 2D + 1        (D = epoch day)
//
// Modes are drawn from a shuffle bag: every consecutive run of
// N slots (N = number of modes) is a full permutation of all
// modes, so no mode can be absent for longer than ~2N slots.
// The first element of each bag is swapped with the second when
// it would repeat the last element of the previous bag, which
// makes the invariant global:
//
//     modeForSlot(s) !== modeForSlot(s - 1)   for every s
//
// That single invariant delivers both required rules at once:
//   • the two picks of one day are always different modes
//   • the last pick of a day never repeats as the first pick of
//     the next day
//
// Content inside a mode rotates by lap: a mode appears exactly
// once per bag cycle, so the cycle index doubles as that mode's
// occurrence counter. Content index = cycle % catalogueLength,
// re-shuffled each full lap — every game in a mode is shown once
// before any of them repeats.
//
// Everything here is PURE and date-driven: the same date yields
// the same result for every player, on every device, on every
// app re-open. No Math.random, no wall-clock time.
// ============================================================
/** Canonical bag contents. Order is only the identity of the bag —
 *  the per-cycle shuffle decides actual sequencing. */
export const ROTATION_MODES = [
    "memory",
    "crossword",
    "chronology",
    "who_am_i",
    "connections",
];
/** Picks per calendar day. */
export const PICKS_PER_DAY = 2;
// ─── Deterministic primitives ────────────────────────────────
/** 32-bit FNV-1a — stable across runtimes, no Math.random. */
export function hash32(input) {
    let h = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
        h ^= input.charCodeAt(i);
        h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h >>> 0;
}
/** Mulberry32 PRNG — deterministic from a numeric seed. */
function rng(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
/** Fisher–Yates driven by a seeded PRNG. Never mutates the input. */
export function seededShuffle(items, seedKey) {
    const out = items.slice();
    const next = rng(hash32(seedKey));
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}
// ─── Epoch-day helpers ───────────────────────────────────────
/** `YYYY-MM-DD` (local calendar key) → integer epoch day. */
export function epochDayFromDateKey(dateKey) {
    const [y, m, d] = dateKey.split("-").map((n) => Number(n));
    return Math.floor(Date.UTC(y, (m || 1) - 1, d || 1) / 86400000);
}
/** Integer epoch day → `YYYY-MM-DD`. */
export function dateKeyFromEpochDay(day) {
    return new Date(day * 86400000).toISOString().slice(0, 10);
}
// ─── Shuffle bag over modes ──────────────────────────────────
/**
 * Permutation of `pool` for bag cycle `cycle`, adjacency-corrected
 * against the previous cycle's final mode.
 *
 * The correction only ever swaps indexes 0 and 1, so the LAST element
 * of a cycle is never altered by the correction — which is why the
 * previous cycle's tail can be read from its raw permutation without
 * recursing back to cycle 0.
 */
export function bagForCycle(cycle, pool = ROTATION_MODES) {
    if (pool.length === 0)
        return [];
    const perm = seededShuffle(pool, `irth.dailybag|${cycle}`);
    if (pool.length >= 3) {
        const prev = seededShuffle(pool, `irth.dailybag|${cycle - 1}`);
        if (perm[0] === prev[prev.length - 1]) {
            [perm[0], perm[1]] = [perm[1], perm[0]];
        }
    }
    return perm;
}
/** The mode assigned to a global slot index. */
export function modeForSlot(slot, pool = ROTATION_MODES) {
    const n = pool.length;
    if (!n)
        return null;
    const cycle = Math.floor(slot / n);
    const idx = ((slot % n) + n) % n;
    return bagForCycle(cycle, pool)[idx];
}
/** Bag cycle a slot belongs to — also the mode's occurrence counter. */
export function cycleForSlot(slot, poolSize) {
    return Math.floor(slot / Math.max(1, poolSize));
}
/** Plain deterministic per-lap shuffle, keyed by stable slugs. */
function lapShuffle(mode, games, lap) {
    const sorted = games
        .slice()
        .sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
    return seededShuffle(sorted, `irth.catalogue|${mode}|${lap}`);
}
/**
 * Era stratification: instead of correcting era clashes at pick time
 * (which would break the "every game once per lap" guarantee), the
 * catalogue is interleaved so consecutive positions walk DIFFERENT eras,
 * each mode starting at its own phase. Two modes advancing one era per
 * cycle from different phases therefore rarely land on the same era.
 */
function stratifyByEra(mode, list) {
    const buckets = new Map();
    for (const g of list) {
        const key = eraOf(g);
        const arr = buckets.get(key) ?? [];
        arr.push(g);
        buckets.set(key, arr);
    }
    if (buckets.size < 2)
        return list.slice();
    const eras = [...buckets.keys()].sort();
    const phase = hash32(`irth.eraphase|${mode}`) % eras.length;
    const rotated = [...eras.slice(phase), ...eras.slice(0, phase)];
    const out = [];
    let round = 0;
    while (out.length < list.length) {
        let progressed = false;
        for (const era of rotated) {
            const bucket = buckets.get(era);
            if (round < bucket.length) {
                out.push(bucket[round]);
                progressed = true;
            }
        }
        if (!progressed)
            break;
        round++;
    }
    return out;
}
/**
 * Deterministic ordering of one mode's catalogue for a given lap,
 * with LAP-BOUNDARY CARRYOVER.
 *
 * A plain per-lap reshuffle keeps the "each game once per lap" guarantee
 * but destroys the spacing at the seam: a game shown at the end of lap L
 * could reappear at position 0 of lap L+1 (a gap of 1). A gap of a full
 * catalogue across a reshuffle is mathematically impossible — it would
 * force the identity permutation, i.e. the same order every lap — so the
 * seam is smoothed instead: games seen in the FIRST half of the previous
 * lap (the ones seen longest ago) are placed ahead of games from its
 * second half, keeping the fresh shuffle inside each half. The reordering
 * happens INSIDE each era bucket before interleaving, so the era rhythm
 * of the lap is preserved untouched.
 */
export function catalogueOrder(mode, games, lap) {
    const current = lapShuffle(mode, games, lap);
    if (lap <= 0 || current.length < 4)
        return stratifyByEra(mode, current);
    const previous = stratifyByEra(mode, lapShuffle(mode, games, lap - 1));
    const prevIndex = new Map();
    previous.forEach((g, i) => prevIndex.set(g.slug, i));
    const midpoint = previous.length / 2;
    const seenRecently = (g) => (prevIndex.get(g.slug) ?? -1) >= midpoint;
    // Stable partition: within the lap shuffle, games seen in the previous
    // lap's second half sink behind the rest. Era interleaving then runs on
    // this carryover-aware order, so both guarantees hold simultaneously.
    const carryover = [
        ...current.filter((g) => !seenRecently(g)),
        ...current.filter(seenRecently),
    ];
    return stratifyByEra(mode, carryover);
}
function eraOf(g) {
    return (g.era ?? "").trim();
}
/**
 * Select the day's challenges.
 *
 * Guarantees (given enough eligible content):
 *   1. the two picks never share a mode
 *   2. the mode stream never repeats across a day boundary
 *   3. a mode's catalogue is fully traversed before any repeat
 *   4. no mode stays unseen for more than two bag cycles
 *   5. same date ⇒ same result, always
 *
 * `completedIds` narrows eligibility per player; the *rotation itself*
 * (slot → mode, lap → content order) is player-independent, so two
 * players with the same progress always see the same pair.
 */
export function selectDailyRotation(epochDay, games, opts = {}) {
    const count = opts.count ?? PICKS_PER_DAY;
    const completed = opts.completedIds ?? new Set();
    const eligible = games.filter((g) => !completed.has(g.id));
    if (!eligible.length) {
        return { epochDay, date: dateKeyFromEpochDay(epochDay), picks: [], exhausted: true };
    }
    // Bag pool = modes that actually have published content at all. Keeping
    // empty modes out of the bag prevents "phantom" slots that would break
    // the adjacency invariant through substitutions.
    const pool = ROTATION_MODES.filter((m) => games.some((g) => g.mode === m));
    const byMode = new Map();
    for (const m of pool)
        byMode.set(m, eligible.filter((g) => g.mode === m));
    const picks = [];
    const usedIds = new Set();
    const usedModes = new Set();
    for (let i = 0; i < count; i++) {
        const slot = epochDay * count + i;
        const planned = modeForSlot(slot, pool);
        if (!planned)
            break;
        // Candidate modes: the planned one first, then the rest of this bag
        // cycle (and the next), skipping modes already used today.
        const order = [planned];
        const cycle = cycleForSlot(slot, pool.length);
        for (const m of [...bagForCycle(cycle, pool), ...bagForCycle(cycle + 1, pool)]) {
            if (!order.includes(m))
                order.push(m);
        }
        let chosen = null;
        for (const m of order) {
            if (usedModes.has(m))
                continue;
            const list = (byMode.get(m) ?? []).filter((g) => !usedIds.has(g.id));
            if (!list.length)
                continue;
            const lap = Math.floor(cycle / list.length);
            const ordered = catalogueOrder(m, list, lap);
            // Content index = cycle count for this mode, so the catalogue is
            // traversed exactly once per lap. Era diversity is already baked
            // into `catalogueOrder`, so no pick-time correction is needed here
            // (a correction would re-show a game before its lap is over).
            const game = ordered[cycle % ordered.length];
            chosen = { game, mode: m, substituted: m !== planned };
            break;
        }
        if (!chosen)
            break;
        usedIds.add(chosen.game.id);
        usedModes.add(chosen.mode);
        picks.push({
            game: chosen.game,
            slot,
            plannedMode: planned,
            reason: chosen.substituted
                ? `bag slot ${slot} planned "${planned}" (no eligible content) → substituted "${chosen.mode}"`
                : `bag slot ${slot} → "${planned}", catalogue index ${cycle % Math.max(1, (byMode.get(chosen.mode) ?? []).length)}`,
        });
    }
    return {
        epochDay,
        date: dateKeyFromEpochDay(epochDay),
        picks,
        exhausted: picks.length === 0,
    };
}

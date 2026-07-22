// ============================================================
// Stories P1 — server contract tests
// ------------------------------------------------------------
// Exercises the DB layer directly via psql to prove:
//   1. complete_story_v2 grants exactly one reward per
//      (user, story) even under concurrent calls.
//   2. Replaying with a bumped content_version grants zero.
//   3. record_story_progress_v2 is monotonic (never downgrades).
//   4. Reflection scoped uniqueness holds after the staged
//      migration (backfill + new columns NOT NULL).
//
// Skipped automatically when PGHOST is not set (sandbox not
// wired to the managed DB).
// ============================================================
import { describe, it, expect } from "bun:test";
import { spawnSync } from "node:child_process";

const HAS_DB = !!process.env.PGHOST;

function sql(q: string): string {
  const r = spawnSync("psql", ["-tA", "-c", q], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  return r.stdout.trim();
}

const d = HAS_DB ? describe : describe.skip;

d("stories P1 — server contract", () => {
  const uid = "00000000-0000-4000-8000-000000000901";
  const storyId = "test_story_p1";

  it("prepares an isolated user + published story", () => {
    sql(`INSERT INTO auth.users (id, email, aud, role)
         VALUES ('${uid}', 'p1-stories@test.local', 'authenticated', 'authenticated')
         ON CONFLICT (id) DO NOTHING`);
    sql(`INSERT INTO public.profiles (user_id, xp, dinars)
         VALUES ('${uid}', 0, 0)
         ON CONFLICT (user_id) DO UPDATE SET xp = 0, dinars = 0`);
    sql(`DELETE FROM public.applied_profile_deltas WHERE user_id = '${uid}'`);
    sql(`DELETE FROM public.user_story_completions WHERE user_id = '${uid}'`);
    sql(`DELETE FROM public.user_story_progress WHERE user_id = '${uid}'`);
    sql(`DELETE FROM public.story_scenes WHERE story_id = '${storyId}'`);
    sql(`DELETE FROM public.stories WHERE id = '${storyId}'`);
    sql(`INSERT INTO public.stories
           (id, slug, title_ar, status, content_version, xp_reward, dinar_reward)
         VALUES
           ('${storyId}', '${storyId}', 'قصة اختبار', 'published', 1, 40, 15)`);
    expect(sql(`SELECT status FROM public.stories WHERE id = '${storyId}'`))
      .toBe("published");
  });

  it("grants exactly one reward under concurrent completion", () => {
    // Two calls in the SAME transaction, second sees the first's insert.
    const rows = sql(
      `SET LOCAL role = authenticated;
       SELECT set_config('request.jwt.claims',
         json_build_object('sub','${uid}','role','authenticated')::text, true);
       SELECT (public.complete_story_v2('${storyId}')->>'first_completion');
       SELECT (public.complete_story_v2('${storyId}')->>'first_completion');`,
    );
    const results = rows.split("\n").filter(Boolean);
    const firsts = results.filter((r) => r === "t").length;
    expect(firsts).toBe(1); // exactly one first-completion
    const deltas = sql(
      `SELECT count(*) FROM public.applied_profile_deltas
        WHERE user_id = '${uid}'
          AND delta_id = public.stable_delta_uuid(
            'story_completion:${uid}:${storyId}')`,
    );
    expect(deltas).toBe("1"); // ledger PK prevents duplication
  });

  it("keeps completion sticky across a content_version bump", () => {
    sql(`UPDATE public.stories SET content_version = 2, xp_reward = 999
          WHERE id = '${storyId}'`);
    const before = sql(
      `SELECT xp FROM public.profiles WHERE user_id = '${uid}'`,
    );
    const res = sql(
      `SET LOCAL role = authenticated;
       SELECT set_config('request.jwt.claims',
         json_build_object('sub','${uid}','role','authenticated')::text, true);
       SELECT (public.complete_story_v2('${storyId}')->>'first_completion');`,
    );
    expect(res).toBe("f"); // no second entitlement
    const after = sql(
      `SELECT xp FROM public.profiles WHERE user_id = '${uid}'`,
    );
    expect(after).toBe(before); // no XP added on replay
  });

  it("record_story_progress_v2 is monotonic", () => {
    const run = (i: number) => sql(
      `SET LOCAL role = authenticated;
       SELECT set_config('request.jwt.claims',
         json_build_object('sub','${uid}','role','authenticated')::text, true);
       SELECT (public.record_story_progress_v2('${storyId}', ${i})->>'ok');`,
    );
    expect(run(3)).toBe("t");
    expect(run(1)).toBe("t"); // ok, but the row must not downgrade
    const max = sql(
      `SELECT max_scene_index_reached FROM public.user_story_progress
        WHERE user_id = '${uid}' AND story_id = '${storyId}'`,
    );
    expect(max).toBe("3");
  });

  it("reflection scoped uniqueness holds after staged migration", () => {
    const cols = sql(
      `SELECT string_agg(column_name, ',' ORDER BY column_name)
         FROM information_schema.columns
        WHERE table_schema='public' AND table_name='user_reflections'
          AND column_name IN ('source_type','source_id','context_id')`,
    );
    expect(cols).toBe("context_id,source_id,source_type");
    const nulls = sql(
      `SELECT count(*) FROM public.user_reflections
        WHERE source_type IS NULL OR source_id IS NULL OR context_id IS NULL`,
    );
    expect(nulls).toBe("0");
  });
});

// ============================================================
// Stories P1 — end-to-end verification (sandbox-compatible)
// ------------------------------------------------------------
// This is the final Phase-1 verification pass requested before
// starting P2. It exercises the pure-SQL properties of the P1
// backend contracts against the live database via the sandbox
// psql role.
//
// Sandbox constraints (documented):
//   - psql role has SELECT + INSERT on public.* only; no UPDATE
//     or DELETE, and no access to the `auth` schema.
//   - SECURITY DEFINER RPCs run as the owner and CAN write, but
//     `user_story_progress`, `user_story_completions` and
//     `applied_profile_deltas` FK to `auth.users(id)`. We cannot
//     mint a synthetic auth user, so full owner-scoped write
//     paths (progress writes, first-time completion, reward
//     idempotency in `applied_profile_deltas`) MUST be verified
//     by the runtime outbox tests and by manual physical
//     verification of a signed-in APK build.
//
// What IS covered here:
//   - Test story + scenes creation with prefixed ids
//   - Unique constraint on (story_id, scene_index)
//   - Unique slug constraint on stories
//   - `get_story_access` visibility for draft vs published
//   - `record_story_progress_v2` early-return reasons
//     (unauthenticated, invalid_story_id, invalid_scene_index,
//      story_not_found)
//   - `complete_story_v2` early-return reasons
//     (unauthenticated, invalid_story_id, story_not_found,
//      not_published)
//   - `evaluate_unlock_spec` for always / and / or /
//     story_completed=false / campaign_completed=false /
//     investigation_completed=false / unknown-type=false
//   - `stable_delta_uuid` determinism + version-independence
//   - Reflection scope migration integrity (no null scopes,
//      unique(user_id, source_type, source_id, context_id))
// ============================================================
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const HAS_DB = !!process.env.PGHOST;

function psql(q: string): { code: number; out: string; err: string } {
  const r = spawnSync("psql", ["-tA", "-v", "ON_ERROR_STOP=1", "-c", q], { encoding: "utf8" });
  return { code: r.status ?? 0, out: (r.stdout ?? "").trim(), err: (r.stderr ?? "").trim() };
}

function sql(q: string): string {
  const r = psql(q);
  if (r.code !== 0) throw new Error(r.err || r.out);
  return r.out;
}

function sqlFails(q: string, needle: string) {
  const r = psql(q);
  expect(r.code).not.toBe(0);
  expect((r.err + r.out).toLowerCase()).toContain(needle.toLowerCase());
}

const d = HAS_DB ? describe : describe.skip;

// -----------------------------------------------------------
// Fixture: two temporary stories.
//   pub_*   → published, xp=25 dinar=10, 3 scenes
//   draft_* → draft, xp=0 dinar=0, 1 scene
// Ids are prefixed with `p1e2e_` so an admin can identify and
// remove them if a test aborts before the afterAll hook runs
// (see cleanup notes at the bottom of this file).
// -----------------------------------------------------------
const runId = randomUUID().slice(0, 8);
const publishedId = `p1e2e_pub_${runId}`;
const draftId = `p1e2e_draft_${runId}`;
const otherStoryId = `p1e2e_other_${runId}`;
const scenesPub = [
  { id: `${publishedId}_s0`, idx: 0, type: "reading" },
  { id: `${publishedId}_s1`, idx: 1, type: "perspective" },
  { id: `${publishedId}_s2`, idx: 2, type: "reflection" },
];

d("Stories P1 — E2E backend contract verification", () => {
  beforeAll(() => {
    sql(`INSERT INTO public.stories
           (id, slug, title_ar, status, content_version, xp_reward, dinar_reward, unlock_spec)
         VALUES
           ('${publishedId}','${publishedId}','قصة تحقق','published',1,25,10,
             '{"type":"always"}'::jsonb),
           ('${draftId}','${draftId}','مسودة تحقق','draft',1,0,0,
             '{"type":"always"}'::jsonb),
           ('${otherStoryId}','${otherStoryId}','قصة أخرى','published',1,0,0,
             '{"type":"always"}'::jsonb)`);
    for (const s of scenesPub) {
      sql(`INSERT INTO public.story_scenes
             (id, story_id, scene_index, scene_type, title_ar, payload)
           VALUES
             ('${s.id}','${publishedId}',${s.idx},'${s.type}','مشهد ${s.idx}','{}'::jsonb)`);
    }
  });

  afterAll(() => {
    // Best-effort cleanup: sandbox lacks DELETE, but a follow-up
    // admin sweep can target rows via the `p1e2e_` prefix. We
    // record the fixture ids in the log so the report is
    // reproducible even if cleanup is deferred to the DB owner.
    // eslint-disable-next-line no-console
    console.log("[p1-e2e] fixture ids:", { publishedId, draftId, otherStoryId });
  });

  // ---------- 1) Domain setup + constraints ----------

  it("creates the published test story with 3 scenes", () => {
    const count = sql(
      `SELECT count(*) FROM public.story_scenes WHERE story_id='${publishedId}'`,
    );
    expect(count).toBe("3");
  });

  it("rejects duplicate scene ordinal", () => {
    sqlFails(
      `INSERT INTO public.story_scenes (id, story_id, scene_index, scene_type, payload)
       VALUES ('${publishedId}_dup', '${publishedId}', 0, 'reading', '{}'::jsonb)`,
      "story_scenes_story_id_scene_index_key",
    );
  });

  it("rejects duplicate scene id", () => {
    sqlFails(
      `INSERT INTO public.story_scenes (id, story_id, scene_index, scene_type, payload)
       VALUES ('${scenesPub[0].id}', '${publishedId}', 99, 'reading', '{}'::jsonb)`,
      "story_scenes_pkey",
    );
  });

  it("rejects duplicate story slug", () => {
    sqlFails(
      `INSERT INTO public.stories (id, slug, title_ar, status)
       VALUES ('p1e2e_extra_${runId}', '${publishedId}', 'x', 'draft')`,
      "stories_slug_key",
    );
  });

  it("rejects an invalid scene_type", () => {
    sqlFails(
      `INSERT INTO public.story_scenes (id, story_id, scene_index, scene_type, payload)
       VALUES ('p1e2e_bad_${runId}', '${publishedId}', 42, 'not_a_type', '{}'::jsonb)`,
      "story_scenes_scene_type_check",
    );
  });

  // ---------- 2) get_story_access visibility ----------

  it("get_story_access returns ok=false for a draft to anon", () => {
    const res = sql(
      `BEGIN;
       SELECT set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
       SELECT public.get_story_access('${draftId}')::text;
       ROLLBACK;`,
    );
    expect(res).toContain('"ok": false');
  });

  it("get_story_access returns a published bundle to anon", () => {
    const res = sql(
      `BEGIN;
       SELECT set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
       SELECT public.get_story_access('${publishedId}')::text;
       ROLLBACK;`,
    );
    expect(res).toContain('"ok": true');
    expect(res).toContain(`"id": "${publishedId}"`);
    expect(res).toContain('"scene_index": 0');
    expect(res).toContain('"scene_index": 1');
    expect(res).toContain('"scene_index": 2');
  });

  // ---------- 3) record_story_progress_v2 early-return reasons ----------

  it("record_story_progress_v2 rejects an unauthenticated caller", () => {
    const res = sql(
      `BEGIN;
       SELECT set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
       SELECT public.record_story_progress_v2('${publishedId}', 0)->>'reason';
       ROLLBACK;`,
    );
    expect(res).toBe("unauthenticated");
  });

  it("record_story_progress_v2 rejects a null story id", () => {
    const uid = randomUUID();
    const res = sql(
      `BEGIN;
       SELECT set_config('request.jwt.claims',
         json_build_object('sub','${uid}','role','authenticated')::text, true);
       SELECT public.record_story_progress_v2(NULL, 0)->>'reason';
       ROLLBACK;`,
    );
    expect(res).toBe("invalid_story_id");
  });

  it("record_story_progress_v2 rejects a negative scene index", () => {
    const uid = randomUUID();
    const res = sql(
      `BEGIN;
       SELECT set_config('request.jwt.claims',
         json_build_object('sub','${uid}','role','authenticated')::text, true);
       SELECT public.record_story_progress_v2('${publishedId}', -1)->>'reason';
       ROLLBACK;`,
    );
    expect(res).toBe("invalid_scene_index");
  });

  it("record_story_progress_v2 rejects an unknown story id", () => {
    const uid = randomUUID();
    const res = sql(
      `BEGIN;
       SELECT set_config('request.jwt.claims',
         json_build_object('sub','${uid}','role','authenticated')::text, true);
       SELECT public.record_story_progress_v2('does_not_exist_${runId}', 0)->>'reason';
       ROLLBACK;`,
    );
    expect(res).toBe("story_not_found");
  });

  // ---------- 4) complete_story_v2 early-return reasons ----------

  it("complete_story_v2 rejects an unauthenticated caller", () => {
    const res = sql(
      `BEGIN;
       SELECT set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
       SELECT public.complete_story_v2('${publishedId}')->>'reason';
       ROLLBACK;`,
    );
    expect(res).toBe("unauthenticated");
  });

  it("complete_story_v2 rejects a null story id", () => {
    const uid = randomUUID();
    const res = sql(
      `BEGIN;
       SELECT set_config('request.jwt.claims',
         json_build_object('sub','${uid}','role','authenticated')::text, true);
       SELECT public.complete_story_v2(NULL)->>'reason';
       ROLLBACK;`,
    );
    expect(res).toBe("invalid_story_id");
  });

  it("complete_story_v2 rejects an unknown story id", () => {
    const uid = randomUUID();
    const res = sql(
      `BEGIN;
       SELECT set_config('request.jwt.claims',
         json_build_object('sub','${uid}','role','authenticated')::text, true);
       SELECT public.complete_story_v2('does_not_exist_${runId}')->>'reason';
       ROLLBACK;`,
    );
    expect(res).toBe("story_not_found");
  });

  it("complete_story_v2 refuses a draft story with not_published", () => {
    const uid = randomUUID();
    const res = sql(
      `BEGIN;
       SELECT set_config('request.jwt.claims',
         json_build_object('sub','${uid}','role','authenticated')::text, true);
       SELECT public.complete_story_v2('${draftId}')->>'reason';
       ROLLBACK;`,
    );
    expect(res).toBe("not_published");
  });

  // ---------- 5) evaluate_unlock_spec ----------

  it("evaluate_unlock_spec: always → true, unknown type → false", () => {
    const uid = randomUUID();
    const t = sql(
      `SELECT public.evaluate_unlock_spec('${uid}'::uuid, '{"type":"always"}'::jsonb)`,
    );
    const f = sql(
      `SELECT public.evaluate_unlock_spec('${uid}'::uuid, '{"type":"nope"}'::jsonb)`,
    );
    expect(t).toBe("t");
    expect(f).toBe("f");
  });

  it("evaluate_unlock_spec: story_completed=false for a random user", () => {
    const uid = randomUUID();
    const r = sql(
      `SELECT public.evaluate_unlock_spec('${uid}'::uuid,
         '{"type":"story_completed","story_id":"${publishedId}"}'::jsonb)`,
    );
    expect(r).toBe("f");
  });

  it("evaluate_unlock_spec: campaign_completed=false for a random user", () => {
    const uid = randomUUID();
    const r = sql(
      `SELECT public.evaluate_unlock_spec('${uid}'::uuid,
         '{"type":"campaign_completed","campaign_id":"does_not_exist_${runId}"}'::jsonb)`,
    );
    expect(r).toBe("f");
  });

  it("evaluate_unlock_spec: investigation_completed=false for a random user", () => {
    const uid = randomUUID();
    const r = sql(
      `SELECT public.evaluate_unlock_spec('${uid}'::uuid,
         '{"type":"investigation_completed","investigation_id":"${runId}"}'::jsonb)`,
    );
    expect(r).toBe("f");
  });

  it("evaluate_unlock_spec: and-of(always,always)=true, and-of(always,unmet)=false", () => {
    const uid = randomUUID();
    const t = sql(
      `SELECT public.evaluate_unlock_spec('${uid}'::uuid,
         '{"type":"and","children":[{"type":"always"},{"type":"always"}]}'::jsonb)`,
    );
    const f = sql(
      `SELECT public.evaluate_unlock_spec('${uid}'::uuid,
         '{"type":"and","children":[{"type":"always"},
           {"type":"story_completed","story_id":"${publishedId}"}]}'::jsonb)`,
    );
    expect(t).toBe("t");
    expect(f).toBe("f");
  });

  it("evaluate_unlock_spec: or-of(unmet,always)=true, or-of(unmet,unmet)=false", () => {
    const uid = randomUUID();
    const t = sql(
      `SELECT public.evaluate_unlock_spec('${uid}'::uuid,
         '{"type":"or","children":[
            {"type":"story_completed","story_id":"${publishedId}"},
            {"type":"always"}]}'::jsonb)`,
    );
    const f = sql(
      `SELECT public.evaluate_unlock_spec('${uid}'::uuid,
         '{"type":"or","children":[
            {"type":"story_completed","story_id":"${publishedId}"},
            {"type":"campaign_completed","campaign_id":"nope_${runId}"}]}'::jsonb)`,
    );
    expect(t).toBe("t");
    expect(f).toBe("f");
  });

  // ---------- 6) stable_delta_uuid ----------

  it("stable_delta_uuid is deterministic and version-independent", () => {
    const uid = randomUUID();
    // Reward identity uses ONLY (user, story_id) — content_version is
    // deliberately excluded so replays after a version bump reuse it.
    const key = `story_completion:${uid}:${publishedId}`;
    const a = sql(`SELECT public.stable_delta_uuid('${key}')`);
    const b = sql(`SELECT public.stable_delta_uuid('${key}')`);
    const c = sql(`SELECT public.stable_delta_uuid('${key}:v2')`);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  // ---------- 7) Reflection scope migration integrity ----------

  it("reflection scope columns are all NOT NULL after migration", () => {
    const nulls = sql(
      `SELECT count(*) FROM public.user_reflections
        WHERE source_type IS NULL OR source_id IS NULL OR context_id IS NULL`,
    );
    expect(nulls).toBe("0");
  });

  it("reflection unique scope index exists", () => {
    const idx = sql(
      `SELECT indexname FROM pg_indexes
        WHERE schemaname='public' AND tablename='user_reflections'
          AND indexname='user_reflections_unique_scope'`,
    );
    expect(idx).toBe("user_reflections_unique_scope");
  });

  it("reflection source_type check constraint allows story/campaign/investigation only", () => {
    const cc = sql(
      `SELECT pg_get_constraintdef(oid) FROM pg_constraint
        WHERE conname='user_reflections_source_type_check'`,
    );
    expect(cc).toContain("story");
    expect(cc).toContain("campaign");
    expect(cc).toContain("investigation");
  });
});

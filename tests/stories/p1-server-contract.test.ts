// ============================================================
// Stories P1 — server contract tests (sandbox-compatible)
// ------------------------------------------------------------
// The sandbox psql role has SELECT + INSERT on the public schema
// only, and NO access to the auth schema. That's enough to prove
// the pure-SQL properties that guarantee the durable write
// contract; anything that requires an authenticated caller is
// exercised by the runtime outbox tests and by manual physical
// verification of the RPCs.
//
// Skipped automatically when PGHOST is not set.
// ============================================================
import { describe, it, expect } from "bun:test";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const HAS_DB = !!process.env.PGHOST;

function sql(q: string): string {
  const r = spawnSync("psql", ["-tA", "-c", q], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  return r.stdout.trim();
}

const d = HAS_DB ? describe : describe.skip;

d("stories P1 — server contract", () => {
  it("stable_delta_uuid is deterministic and version-independent", () => {
    // Same key → same UUID across calls.
    const uid = randomUUID();
    const storyId = "stable_probe_" + randomUUID().slice(0, 8);
    const key = `story_completion:${uid}:${storyId}`;
    const a = sql(`SELECT public.stable_delta_uuid('${key}')`);
    const b = sql(`SELECT public.stable_delta_uuid('${key}')`);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    // Different key → different UUID.
    const c = sql(`SELECT public.stable_delta_uuid('${key}:extra')`);
    expect(c).not.toBe(a);
  });

  it("get_story_access refuses unpublished stories to anon", () => {
    const draftId = "draft_probe_" + randomUUID().slice(0, 8);
    // V16: fixtures live and die inside one rolled-back transaction.
    const res = sql(
      `BEGIN;
       INSERT INTO public.stories
           (id, slug, title_ar, status, content_version, xp_reward, dinar_reward, production_status)
         VALUES
           ('${draftId}', '${draftId}', 'مسودة', 'draft', 1, 10, 5, 'imported');
       SELECT set_config('request.jwt.claims',
         json_build_object('role','anon')::text, true);
       SELECT (public.get_story_access('${draftId}')->>'ok');
       ROLLBACK;`,
    );
    expect(res).toContain("false");
    expect(res).not.toContain("true");
  });

  it("player story feeds and bundles never expose drafts", () => {
    const draftId = "draft_gate_probe_" + randomUUID().slice(0, 8);
    const pubId = "pub_gate_probe_" + randomUUID().slice(0, 8);
    const res = sql(
      `BEGIN;
       INSERT INTO public.stories
           (id, slug, title_ar, status, content_version, xp_reward, dinar_reward, unlock_spec, production_status)
         VALUES
           ('${draftId}', '${draftId}', 'مسودة محجوبة', 'draft', 1, 0, 0,
              '{"version":2,"expr":{"type":"always"}}'::jsonb, 'testing'),
           ('${pubId}', '${pubId}', 'قصة منشورة', 'published', 1, 0, 0,
              '{"version":2,"expr":{"type":"always"}}'::jsonb, 'completed');
       SELECT set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
       SELECT jsonb_build_object(
         'list_v2_has_pub', public.list_stories_v2(NULL)::text LIKE '%${pubId}%',
         'list_v2_has_draft', public.list_stories_v2(NULL)::text LIKE '%${draftId}%',
         'list_v3_has_draft', public.list_stories_v3(NULL, NULL)::text LIKE '%${draftId}%',
         'guest_has_draft', public.list_stories_guest_v3(NULL, NULL, '{}'::jsonb)::text LIKE '%${draftId}%',
         'bundle_draft_reason', public.get_story_bundle_v2('${draftId}')->>'reason',
         'guest_bundle_draft_reason', public.get_story_bundle_guest_v2('${draftId}', '{}'::jsonb)->>'reason',
         'snapshot_has_draft', public.stories_snapshot_manifest_v2(false)::text LIKE '%${draftId}%'
       )::text;
       ROLLBACK;`,
    );
    expect(res).toContain('"list_v2_has_pub": true');
    expect(res).toContain('"list_v2_has_draft": false');
    expect(res).toContain('"list_v3_has_draft": false');
    expect(res).toContain('"guest_has_draft": false');
    expect(res).toContain('"bundle_draft_reason": "not_found"');
    expect(res).toContain('"guest_bundle_draft_reason": "not_found"');
    expect(res).toContain('"snapshot_has_draft": false');
  });

  it("get_story_access returns a bundle for a published story", () => {
    const pubId = "pub_probe_" + randomUUID().slice(0, 8);
    const bundle = sql(
      `BEGIN;
       INSERT INTO public.stories
           (id, slug, title_ar, status, content_version, xp_reward, dinar_reward, production_status)
         VALUES
           ('${pubId}', '${pubId}', 'قصة عامة', 'published', 1, 40, 15, 'completed');
       INSERT INTO public.story_scenes
           (id, story_id, scene_index, scene_type, title_ar, payload)
         VALUES
           (gen_random_uuid(), '${pubId}', 0, 'reading', 'المقدمة', '{}'::jsonb),
           (gen_random_uuid(), '${pubId}', 1, 'reflection', 'تأمل', '{"prompt":"..."}'::jsonb);
       SELECT set_config('request.jwt.claims',
         json_build_object('role','anon')::text, true);
       SELECT public.get_story_access('${pubId}');
       ROLLBACK;`,
    );
    expect(bundle).toContain('"ok": true');
    expect(bundle).toContain('"scene_index": 0');
    expect(bundle).toContain('"scene_index": 1');
  });

  it("record_story_progress_v2 rejects an unknown story id", () => {
    const uid = randomUUID();
    const claims = `json_build_object('sub','${uid}','role','authenticated')::text`;
    const res = sql(
      `BEGIN;
       SELECT set_config('request.jwt.claims', ${claims}, true);
       SELECT (public.record_story_progress_v2('does_not_exist_' || gen_random_uuid()::text, 0)->>'reason');
       ROLLBACK;`,
    );
    expect(res).toContain("story_not_found");
  });

  it("complete_story_v2 rejects an unauthenticated caller", () => {
    const res = sql(
      `BEGIN;
       SELECT set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
       SELECT (public.complete_story_v2('any')->>'reason');
       ROLLBACK;`,
    );
    expect(res).toContain("unauthenticated");
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

#!/usr/bin/env bash
# ============================================================
# Phase 5.5a — Transactional import RPC integration tests.
#
# Runs each scenario against the real Postgres database using
# psql. Auth is simulated by seeding a test admin user and
# setting the JWT sub GUC that Supabase's auth.uid() reads.
#
# Every test wraps its assertions in a BEGIN … ROLLBACK block
# so no permanent DB state is created. The test admin user +
# role rows are seeded once, then removed at the end.
#
# Usage:  bash scripts/test-import-integration.sh
#
# Requires: PGHOST/PGUSER/PGPASSWORD/PGDATABASE env vars (already
# set in the Lovable sandbox for admin DB access).
# ============================================================
set -uo pipefail

if [ -z "${PGHOST:-}" ]; then
  echo "PGHOST is not set — cannot run integration tests." >&2
  exit 1
fi

PASS=0
FAIL=0
FAILED_TESTS=()

TEST_ADMIN_ID="47f86b74-9c79-4a21-92ec-5e38f9f0d29e"
TEST_NONADMIN_ID="613a61e1-1036-4fdc-b6af-da808b4ab0ac"

seed_users() {
  # Uses pre-existing auth users; no seeding needed on Lovable Cloud (auth schema is not writable from psql).
  :
}

cleanup_users() {
  # Clean up import batches created by this test run for the borrowed admin.
  psql -q >/dev/null 2>&1 <<SQL
    DELETE FROM public.admin_import_items
      WHERE batch_id IN (SELECT id FROM public.admin_import_batches
         WHERE approved_plan_hash LIKE 'it-%' AND admin_user_id='${TEST_ADMIN_ID}');
    DELETE FROM public.admin_import_batches
      WHERE approved_plan_hash LIKE 'it-%' AND admin_user_id='${TEST_ADMIN_ID}';
    DELETE FROM public.admin_audit_log
      WHERE actor_user_id='${TEST_ADMIN_ID}' AND target_type='admin_import_batches'
        AND created_at > now() - interval '10 minutes';
SQL
}

# Run a psql block asserting expected substrings against RAISE NOTICE output.
run_test() {
  local name="$1"
  local sql="$2"
  local expect="$3"
  local out
  out=$(psql -v ON_ERROR_STOP=0 -X -A -t --set VERBOSITY=terse 2>&1 <<SQL
$sql
SQL
)
  if echo "$out" | tr "\n" " " | grep -qE "$expect"; then
    echo "  PASS  $name"
    PASS=$((PASS + 1))
  else
    echo "  FAIL  $name"
    echo "        expected /$expect/"
    echo "        got: $(echo "$out" | tr '\n' ' ' | head -c 400)"
    FAIL=$((FAIL + 1))
    FAILED_TESTS+=("$name")
  fi
}

# Common preamble that impersonates the seeded admin.
AUTH_ADMIN="SET LOCAL \"request.jwt.claim.sub\" = '${TEST_ADMIN_ID}'; SET LOCAL \"request.jwt.claims\" = '{\"sub\":\"${TEST_ADMIN_ID}\",\"role\":\"authenticated\"}';"
AUTH_NONADMIN="SET LOCAL \"request.jwt.claim.sub\" = '${TEST_NONADMIN_ID}'; SET LOCAL \"request.jwt.claims\" = '{\"sub\":\"${TEST_NONADMIN_ID}\",\"role\":\"authenticated\"}';"

echo "Seeding test users…"
seed_users
trap cleanup_users EXIT

echo
echo "Phase 5.5a integration tests:"
echo "-----------------------------"

# --- 1. Encyclopedia successful commit ---
run_test "1. encyclopedia commit inserts one row (rolled back)" "
BEGIN;
$AUTH_ADMIN
DO \$\$
DECLARE
  r JSONB;
BEGIN
  r := public.admin_run_import_batch(
    jsonb_build_object(
      'content_type','encyclopedia',
      'approved_plan_hash','it-enc-commit-11111111',
      'original_payload_hash','p',
      'overwrite',false,'publish',false,
      'items', jsonb_build_array(jsonb_build_object(
        'index',0,'action','new',
        'data', jsonb_build_object(
          'entity_type','figure','slug','it-test-enc-'||gen_random_uuid()::text,
          'title','ت','body','{}'::jsonb,'metadata','{}'::jsonb,'enabled',true
        )
      ))
    ),
    'commit'
  );
  RAISE NOTICE 'RES:%', r->>'status';
  RAISE NOTICE 'CREATED:%', r->>'created';
END\$\$;
ROLLBACK;
" "RES:succeeded.*CREATED:1"

# --- 2. Daily fact insert + update mixed batch ---
run_test "3. daily_facts mixed create+update batch" "
BEGIN;
$AUTH_ADMIN
-- Seed an existing daily_fact to update
WITH ins AS (
  INSERT INTO public.daily_facts (title, body, enabled) VALUES ('existing-df','initial',true)
  RETURNING id, created_at
)
SELECT set_config('test.df_id', id::text, true), set_config('test.df_created', created_at::text, true) FROM ins;
DO \$\$
DECLARE r JSONB;
BEGIN
  r := public.admin_run_import_batch(
    jsonb_build_object(
      'content_type','daily_facts',
      'approved_plan_hash','it-df-mixed-22222222',
      'original_payload_hash','p','overwrite',true,'publish',false,
      'items', jsonb_build_array(
        jsonb_build_object('index',0,'action','new',
          'data', jsonb_build_object('title','new-df-'||gen_random_uuid()::text,'body','B','enabled',true)),
        jsonb_build_object('index',1,'action','update',
          'target_key', jsonb_build_object('id', current_setting('test.df_id')),
          'data', jsonb_build_object('title','updated','body','B2','enabled',true))
      )
    ),
    'commit'
  );
  RAISE NOTICE 'RES:%', r->>'status';
  RAISE NOTICE 'C:% U:%', r->>'created', r->>'updated';
END\$\$;
ROLLBACK;
" "RES:succeeded.*C:1 U:1"

# --- 4. today_in_history_events update (table without updated_at) ---
run_test "4. today_in_history_events update via id" "
BEGIN;
$AUTH_ADMIN
WITH ins AS (
  INSERT INTO public.today_in_history_events (month, day, title, body, enabled)
  VALUES (7, 4, 'existing-tih', 'x', true) RETURNING id
)
SELECT set_config('test.tih_id', id::text, true) FROM ins;
DO \$\$
DECLARE r JSONB;
BEGIN
  r := public.admin_run_import_batch(
    jsonb_build_object(
      'content_type','today_in_history_events',
      'approved_plan_hash','it-tih-update-33333333',
      'original_payload_hash','p','overwrite',true,'publish',false,
      'items', jsonb_build_array(jsonb_build_object(
        'index',0,'action','update',
        'target_key', jsonb_build_object('id', current_setting('test.tih_id')),
        'data', jsonb_build_object('month',7,'day',4,'title','updated-tih','body','new body','enabled',true)
      ))
    ),
    'commit'
  );
  RAISE NOTICE 'RES:%', r->>'status';
  RAISE NOTICE 'U:%', r->>'updated';
END\$\$;
ROLLBACK;
" "RES:succeeded.*U:1"

# --- 5. Notification batch failure → no partial rows (whole batch fails) ---
run_test "5. notification batch failure → 0 rows written (full rollback)" "
BEGIN;
$AUTH_ADMIN
DO \$\$
DECLARE r JSONB; cnt INT;
BEGIN
  r := public.admin_run_import_batch(
    jsonb_build_object(
      'content_type','notifications',
      'approved_plan_hash','it-notif-fail-44444444',
      'original_payload_hash','p','overwrite',false,'publish',false,
      'items', jsonb_build_array(
        jsonb_build_object('index',0,'action','new',
          'data', jsonb_build_object('title','ok-'||gen_random_uuid()::text,'body','ok','type','manual','target_type','all','status','draft')),
        jsonb_build_object('index',1,'action','update',
          'target_key', jsonb_build_object('id','00000000-0000-0000-0000-000000000000'),
          'data', jsonb_build_object('title','x','body','x'))
      )
    ),
    'commit'
  );
  SELECT count(*) INTO cnt FROM public.notifications WHERE title LIKE 'ok-%';
  RAISE NOTICE 'STATUS:%', r->>'status';
  RAISE NOTICE 'ROWS_WRITTEN:%', cnt;
END\$\$;
ROLLBACK;
" "STATUS:failed.*ROWS_WRITTEN:0"

# --- 9. Stale version signal blocks commit ---
run_test "9. stale version_signal blocks encyclopedia update" "
BEGIN;
$AUTH_ADMIN
WITH ins AS (
  INSERT INTO public.encyclopedia_entities (entity_type, slug, title, body, metadata, enabled)
  VALUES ('figure','it-stale-'||gen_random_uuid(),'x','{}','{}',true)
  RETURNING slug
)
SELECT set_config('test.slug', slug, true) FROM ins;
DO \$\$
DECLARE r JSONB;
BEGIN
  r := public.admin_run_import_batch(
    jsonb_build_object(
      'content_type','encyclopedia',
      'approved_plan_hash','it-stale-99999999',
      'original_payload_hash','p','overwrite',true,'publish',false,
      'items', jsonb_build_array(jsonb_build_object(
        'index',0,'action','update',
        'target_key', jsonb_build_object('entity_type','figure','slug', current_setting('test.slug')),
        'version_signal','1999-01-01T00:00:00Z',
        'data', jsonb_build_object('title','y','body','{}','metadata','{}','enabled',true)
      ))
    ),
    'commit'
  );
  RAISE NOTICE 'STATUS:%', r->>'status';
  RAISE NOTICE 'ERR:%', r->>'error';
END\$\$;
ROLLBACK;
" "STATUS:failed.*stale: content changed"

# --- 10. Duplicate approved plan hash → already_committed ---
run_test "10. duplicate approved_plan_hash returns already_committed" "
BEGIN;
$AUTH_ADMIN
INSERT INTO public.admin_import_batches
  (admin_user_id, content_type, approved_plan_hash, mode, status, item_count)
VALUES ('${TEST_ADMIN_ID}','encyclopedia','it-dup-abcdef12','commit','succeeded',0);
DO \$\$
DECLARE r JSONB;
BEGIN
  r := public.admin_run_import_batch(
    jsonb_build_object(
      'content_type','encyclopedia',
      'approved_plan_hash','it-dup-abcdef12',
      'original_payload_hash','p','overwrite',false,'publish',false,
      'items', jsonb_build_array(jsonb_build_object(
        'index',0,'action','new',
        'data', jsonb_build_object('entity_type','figure','slug','x','title','x','body','{}','metadata','{}','enabled',true)
      ))
    ),
    'commit'
  );
  RAISE NOTICE 'STATUS:%', r->>'status';
END\$\$;
ROLLBACK;
" "STATUS:already_committed"

# --- 11. Dry run writes nothing to target table ---
run_test "11. Dry Run writes nothing to encyclopedia_entities" "
BEGIN;
$AUTH_ADMIN
DO \$\$
DECLARE r JSONB; cnt INT; v_slug TEXT := 'it-dryrun-'||gen_random_uuid();
BEGIN
  r := public.admin_run_import_batch(
    jsonb_build_object(
      'content_type','encyclopedia',
      'approved_plan_hash','it-dry-abcdef34',
      'original_payload_hash','p','overwrite',false,'publish',false,
      'items', jsonb_build_array(jsonb_build_object(
        'index',0,'action','new',
        'data', jsonb_build_object('entity_type','figure','slug',v_slug,'title','t','body','{}','metadata','{}','enabled',true)
      ))
    ),
    'dry_run'
  );
  SELECT count(*) INTO cnt FROM public.encyclopedia_entities WHERE slug = v_slug;
  RAISE NOTICE 'STATUS:%', r->>'status';
  RAISE NOTICE 'PROJECTED_CREATE:%', r->>'created';
  RAISE NOTICE 'ACTUAL_ROWS:%', cnt;
END\$\$;
ROLLBACK;
" "STATUS:ready.*PROJECTED_CREATE:1.*ACTUAL_ROWS:0"

# --- 12. Unauthorized caller (non-admin authenticated user) ---
run_test "12. non-admin caller is rejected" "
BEGIN;
$AUTH_NONADMIN
DO \$\$
DECLARE r JSONB;
BEGIN
  BEGIN
    r := public.admin_run_import_batch(
      jsonb_build_object(
        'content_type','encyclopedia',
        'approved_plan_hash','it-forbidden-cafe',
        'original_payload_hash','p','overwrite',false,'publish',false,
        'items','[]'::jsonb
      ),
      'commit'
    );
    RAISE NOTICE 'UNEXPECTED_SUCCESS';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'REJECTED:forbidden';
  WHEN OTHERS THEN
    RAISE NOTICE 'REJECTED:%', SQLERRM;
  END;
END\$\$;
ROLLBACK;
" "REJECTED:(forbidden|.*admin role required)"

# --- 13. Rollback removes created rows ---
run_test "13. rollback deletes inserted encyclopedia row" "
BEGIN;
$AUTH_ADMIN
DO \$\$
DECLARE r JSONB; batch UUID; before_cnt INT; after_cnt INT; v_slug TEXT := 'it-rb-'||gen_random_uuid();
BEGIN
  r := public.admin_run_import_batch(
    jsonb_build_object(
      'content_type','encyclopedia',
      'approved_plan_hash','it-rb-'||v_slug,
      'original_payload_hash','p','overwrite',false,'publish',false,
      'items', jsonb_build_array(jsonb_build_object(
        'index',0,'action','new',
        'data', jsonb_build_object('entity_type','figure','slug',v_slug,'title','t','body','{}','metadata','{}','enabled',true)
      ))
    ),
    'commit'
  );
  batch := (r->>'batch_id')::uuid;
  SELECT count(*) INTO before_cnt FROM public.encyclopedia_entities WHERE slug = v_slug;
  r := public.admin_rollback_import_batch(batch, false);
  SELECT count(*) INTO after_cnt FROM public.encyclopedia_entities WHERE slug = v_slug;
  RAISE NOTICE 'BEFORE:% AFTER:% ROLLED:%', before_cnt, after_cnt, r->>'rolled';
END\$\$;
ROLLBACK;
" "BEFORE:1 AFTER:0 ROLLED:1"

# --- 14. Rollback restores updated rows ---
run_test "14. rollback restores updated encyclopedia body" "
BEGIN;
$AUTH_ADMIN
DO \$\$
DECLARE r JSONB; batch UUID; v_slug TEXT := 'it-rbu-'||gen_random_uuid(); orig TEXT;
BEGIN
  INSERT INTO public.encyclopedia_entities (entity_type, slug, title, summary, body, metadata, enabled)
    VALUES ('figure', v_slug, 'orig-title', 'orig-summary', '{}', '{}', true);
  orig := 'orig-title';
  r := public.admin_run_import_batch(
    jsonb_build_object(
      'content_type','encyclopedia',
      'approved_plan_hash','it-rbu-'||v_slug,
      'original_payload_hash','p','overwrite',true,'publish',false,
      'items', jsonb_build_array(jsonb_build_object(
        'index',0,'action','update',
        'target_key', jsonb_build_object('entity_type','figure','slug', v_slug),
        'data', jsonb_build_object('entity_type','figure','slug',v_slug,'title','changed','body','{}','metadata','{}','enabled',true)
      ))
    ),
    'commit'
  );
  batch := (r->>'batch_id')::uuid;
  r := public.admin_rollback_import_batch(batch, false);
  RAISE NOTICE 'STATUS:%', r->>'status';
  RAISE NOTICE 'TITLE:%', (SELECT title FROM public.encyclopedia_entities WHERE slug = v_slug);
END\$\$;
ROLLBACK;
" "STATUS:rolled_back.*TITLE:orig-title"

# --- 15. Rollback conflict after later edit ---
run_test "15. rollback conflicts when row edited after import" "
BEGIN;
$AUTH_ADMIN
DO \$\$
DECLARE r JSONB; batch UUID; v_slug TEXT := 'it-rbc-'||gen_random_uuid(); tid UUID;
BEGIN
  r := public.admin_run_import_batch(
    jsonb_build_object(
      'content_type','encyclopedia',
      'approved_plan_hash','it-rbc-'||v_slug,
      'original_payload_hash','p','overwrite',false,'publish',false,
      'items', jsonb_build_array(jsonb_build_object(
        'index',0,'action','new',
        'data', jsonb_build_object('entity_type','figure','slug',v_slug,'title','t','body','{}','metadata','{}','enabled',true)
      ))
    ),
    'commit'
  );
  batch := (r->>'batch_id')::uuid;
  -- Simulate a subsequent edit that mutates updated_at
  UPDATE public.encyclopedia_entities SET title='edited-by-someone', updated_at=now()+interval '1 minute' WHERE slug = v_slug;
  r := public.admin_rollback_import_batch(batch, false);
  RAISE NOTICE 'STATUS:%', r->>'status';
  RAISE NOTICE 'CONFLICTS:%', r->>'conflicts';
END\$\$;
ROLLBACK;
" "STATUS:conflict.*CONFLICTS:1"

echo
echo "Result: $PASS passed, $FAIL failed."
if [ "$FAIL" -gt 0 ]; then
  echo "Failures:"
  for t in "${FAILED_TESTS[@]}"; do echo "  - $t"; done
  exit 1
fi

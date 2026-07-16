#!/usr/bin/env bash
# ============================================================
# Phase 5.5b — Nested-transactional investigation integration
# tests. Runs against the live database. Every test wraps its
# writes in BEGIN … ROLLBACK so no permanent rows are created.
#
# The tests exercise:
#   * validator (per required scenario)
#   * stable-ID merger
#   * removal-safety opt-in
#   * atomic commit / rollback
#   * dry-run isolation
#   * duplicate-plan-hash idempotency
#   * unauthorized caller rejection
# ============================================================
set -uo pipefail

if [ -z "${PGHOST:-}" ]; then
  echo "PGHOST is not set — cannot run integration tests." >&2
  exit 1
fi

PASS=0; FAIL=0; FAILED_TESTS=()
TEST_ADMIN_ID="47f86b74-9c79-4a21-92ec-5e38f9f0d29e"
TEST_NONADMIN_ID="613a61e1-1036-4fdc-b6af-da808b4ab0ac"

AUTH_ADMIN="SET LOCAL \"request.jwt.claim.sub\" = '${TEST_ADMIN_ID}'; SET LOCAL \"request.jwt.claims\" = '{\"sub\":\"${TEST_ADMIN_ID}\",\"role\":\"authenticated\"}';"
AUTH_NONADMIN="SET LOCAL \"request.jwt.claim.sub\" = '${TEST_NONADMIN_ID}'; SET LOCAL \"request.jwt.claims\" = '{\"sub\":\"${TEST_NONADMIN_ID}\",\"role\":\"authenticated\"}';"

cleanup() {
  psql -q >/dev/null 2>&1 <<SQL
    DELETE FROM public.admin_import_items WHERE batch_id IN
      (SELECT id FROM public.admin_import_batches WHERE approved_plan_hash LIKE 'it-inv-%' AND admin_user_id='${TEST_ADMIN_ID}');
    DELETE FROM public.admin_import_batches
      WHERE approved_plan_hash LIKE 'it-inv-%' AND admin_user_id='${TEST_ADMIN_ID}';
    DELETE FROM public.admin_audit_log
      WHERE actor_user_id='${TEST_ADMIN_ID}' AND target_type='admin_import_batches'
        AND created_at > now() - interval '15 minutes';
SQL
}
trap cleanup EXIT

run_test() {
  local name="$1" sql="$2" expect="$3" out
  out=$(psql -v ON_ERROR_STOP=0 -X -A -t --set VERBOSITY=terse 2>&1 <<SQL
$sql
SQL
)
  if echo "$out" | tr "\n" " " | grep -qE "$expect"; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name"
    echo "        expected /$expect/"
    echo "        got: $(echo "$out" | tr '\n' ' ' | head -c 500)"
    FAIL=$((FAIL+1)); FAILED_TESTS+=("$name")
  fi
}

# Reusable investigation payload builders in SQL. Every test builds its own
# unique slug so parallel runs don't collide.

VALID_INV_ITEM='jsonb_build_object(
  '"'"'index'"'"',0,'"'"'action'"'"','"'"'new'"'"',
  '"'"'data'"'"', jsonb_build_object(
    '"'"'slug'"'"', v_slug,
    '"'"'title'"'"','"'"'قضية تجريبية'"'"',
    '"'"'difficulty'"'"','"'"'easy'"'"',
    '"'"'reward'"'"', jsonb_build_object('"'"'xp'"'"',30,'"'"'dinars'"'"',10),
    '"'"'related_entities'"'"','"'"'[]'"'"'::jsonb,
    '"'"'steps'"'"', jsonb_build_array(
      jsonb_build_object('"'"'type'"'"','"'"'briefing'"'"','"'"'text'"'"','"'"'مقدمة قصيرة'"'"'),
      jsonb_build_object('"'"'type'"'"','"'"'question'"'"','"'"'prompt'"'"','"'"'ما هو الجواب؟'"'"',
                         '"'"'options'"'"', jsonb_build_array('"'"'أ'"'"','"'"'ب'"'"','"'"'ج'"'"'),
                         '"'"'correctAnswer'"'"',1),
      jsonb_build_object('"'"'type'"'"','"'"'conclusion'"'"','"'"'text'"'"','"'"'خاتمة قصيرة'"'"')
    )
  )
)'

echo
echo "Phase 5.5b integration tests:"
echo "-----------------------------"

# --- 1. Create one complete investigation ---
run_test "1. create one complete investigation" "
BEGIN;
$AUTH_ADMIN
DO \$\$
DECLARE r JSONB; v_slug TEXT := 'it-inv-c1-'||replace(gen_random_uuid()::text,'-','');
BEGIN
  r := public.admin_run_import_batch(
    jsonb_build_object(
      'content_type','investigations',
      'approved_plan_hash','it-inv-c1-'||v_slug,
      'original_payload_hash','p','overwrite',false,'publish',false,
      'items', jsonb_build_array($VALID_INV_ITEM)
    ),
    'commit'
  );
  RAISE NOTICE 'RES:%', r->>'status';
  RAISE NOTICE 'CREATED:%', r->>'created';
END\$\$;
ROLLBACK;
" "RES:succeeded.*CREATED:1"

# --- 2. Create a batch with multiple investigations ---
run_test "2. batch with multiple investigations" "
BEGIN;
$AUTH_ADMIN
DO \$\$
DECLARE r JSONB; v_slug TEXT;
BEGIN
  v_slug := 'it-inv-m1-'||replace(gen_random_uuid()::text,'-','');
  r := public.admin_run_import_batch(
    jsonb_build_object(
      'content_type','investigations',
      'approved_plan_hash','it-inv-multi-'||v_slug,
      'original_payload_hash','p','overwrite',false,'publish',false,
      'items', jsonb_build_array(
        jsonb_build_object('index',0,'action','new','data', jsonb_build_object(
          'slug','it-inv-ma-'||replace(gen_random_uuid()::text,'-',''),
          'title','ق1','difficulty','easy','reward','{}'::jsonb,'related_entities','[]'::jsonb,
          'steps', jsonb_build_array(
            jsonb_build_object('type','question','prompt','س1','options', jsonb_build_array('أ','ب'),'correctAnswer',0)
          ))),
        jsonb_build_object('index',1,'action','new','data', jsonb_build_object(
          'slug','it-inv-mb-'||replace(gen_random_uuid()::text,'-',''),
          'title','ق2','difficulty','medium','reward','{}'::jsonb,'related_entities','[]'::jsonb,
          'steps', jsonb_build_array(
            jsonb_build_object('type','question','prompt','س2','options', jsonb_build_array('ص','د'),'correctAnswer',1)
          )))
      )
    ),
    'commit'
  );
  RAISE NOTICE 'RES:%', r->>'status';
  RAISE NOTICE 'CREATED:%', r->>'created';
END\$\$;
ROLLBACK;
" "RES:succeeded.*CREATED:2"

# --- 3. Update investigation preserves question IDs (stable-ID protection) ---
run_test "3. update preserves question IDs" "
BEGIN;
$AUTH_ADMIN
DO \$\$
DECLARE r JSONB; v_id UUID; v_slug TEXT; before_qid TEXT; after_qid TEXT;
BEGIN
  v_slug := 'it-inv-sid-'||replace(gen_random_uuid()::text,'-','');
  -- seed
  INSERT INTO public.investigations (slug,title,difficulty,steps,reward,related_entities)
  VALUES (v_slug,'orig','easy',
    jsonb_build_array(
      jsonb_build_object('type','question','id','q-stable-abc','prompt','ما الجواب؟',
                         'options', jsonb_build_array('أ','ب'),'correctAnswer',0)
    ),'{}'::jsonb,'[]'::jsonb)
  RETURNING id INTO v_id;
  before_qid := (SELECT (steps->0->>'id') FROM public.investigations WHERE id = v_id);

  -- update WITHOUT sending the id — merger should carry it forward via prompt match
  r := public.admin_run_import_batch(
    jsonb_build_object(
      'content_type','investigations',
      'approved_plan_hash','it-inv-sid-'||v_slug,
      'original_payload_hash','p','overwrite',true,'publish',false,
      'items', jsonb_build_array(
        jsonb_build_object('index',0,'action','update',
          'target_key', jsonb_build_object('id', v_id::text),
          'data', jsonb_build_object(
            'slug', v_slug,'title','updated-title','difficulty','easy',
            'reward','{}'::jsonb,'related_entities','[]'::jsonb,
            'steps', jsonb_build_array(
              jsonb_build_object('type','question','prompt','ما الجواب؟',
                                 'options', jsonb_build_array('أ','ب','ج'),'correctAnswer',0)
            )
          ))
      )
    ),
    'commit'
  );
  after_qid := (SELECT (steps->0->>'id') FROM public.investigations WHERE id = v_id);
  RAISE NOTICE 'RES:%', r->>'status';
  RAISE NOTICE 'STABLE:%', (before_qid = after_qid);
  RAISE NOTICE 'QID:%', after_qid;
END\$\$;
ROLLBACK;
" "RES:succeeded.*STABLE:t.*QID:q-stable-abc"

# --- 4. Reorder questions without reminting IDs ---
run_test "4. reorder preserves IDs" "
BEGIN;
$AUTH_ADMIN
DO \$\$
DECLARE r JSONB; v_id UUID; v_slug TEXT; q1_before TEXT; q2_before TEXT; q1_after TEXT; q2_after TEXT;
BEGIN
  v_slug := 'it-inv-reord-'||replace(gen_random_uuid()::text,'-','');
  INSERT INTO public.investigations (slug,title,difficulty,steps,reward,related_entities)
  VALUES (v_slug,'orig','easy',
    jsonb_build_array(
      jsonb_build_object('type','question','id','q-alpha','prompt','P1','options', jsonb_build_array('a','b'),'correctAnswer',0),
      jsonb_build_object('type','question','id','q-beta','prompt','P2','options', jsonb_build_array('c','d'),'correctAnswer',1)
    ),'{}'::jsonb,'[]'::jsonb)
  RETURNING id INTO v_id;
  q1_before := 'q-alpha'; q2_before := 'q-beta';

  r := public.admin_run_import_batch(
    jsonb_build_object(
      'content_type','investigations',
      'approved_plan_hash','it-inv-reord-'||v_slug,
      'original_payload_hash','p','overwrite',true,'publish',false,
      'items', jsonb_build_array(
        jsonb_build_object('index',0,'action','update',
          'target_key', jsonb_build_object('id', v_id::text),
          'data', jsonb_build_object(
            'slug', v_slug,'title','same','difficulty','easy',
            'reward','{}'::jsonb,'related_entities','[]'::jsonb,
            'steps', jsonb_build_array(
              jsonb_build_object('type','question','prompt','P2','options', jsonb_build_array('c','d'),'correctAnswer',1),
              jsonb_build_object('type','question','prompt','P1','options', jsonb_build_array('a','b'),'correctAnswer',0)
            )
          ))
      )
    ),
    'commit'
  );
  q1_after := (SELECT (steps->0->>'id') FROM public.investigations WHERE id = v_id);
  q2_after := (SELECT (steps->1->>'id') FROM public.investigations WHERE id = v_id);
  RAISE NOTICE 'RES:%', r->>'status';
  RAISE NOTICE 'REORDERED:%', (q1_after = 'q-beta' AND q2_after = 'q-alpha');
END\$\$;
ROLLBACK;
" "RES:succeeded.*REORDERED:t"

# --- 5. Add a new question with a fresh ID ---
run_test "5. new question gets fresh id" "
BEGIN;
$AUTH_ADMIN
DO \$\$
DECLARE r JSONB; v_id UUID; v_slug TEXT; new_qid TEXT;
BEGIN
  v_slug := 'it-inv-add-'||replace(gen_random_uuid()::text,'-','');
  INSERT INTO public.investigations (slug,title,difficulty,steps,reward,related_entities)
  VALUES (v_slug,'orig','easy',
    jsonb_build_array(
      jsonb_build_object('type','question','id','q-existing','prompt','P1','options', jsonb_build_array('a','b'),'correctAnswer',0)
    ),'{}'::jsonb,'[]'::jsonb)
  RETURNING id INTO v_id;

  r := public.admin_run_import_batch(
    jsonb_build_object(
      'content_type','investigations',
      'approved_plan_hash','it-inv-add-'||v_slug,
      'original_payload_hash','p','overwrite',true,'publish',false,
      'items', jsonb_build_array(
        jsonb_build_object('index',0,'action','update',
          'target_key', jsonb_build_object('id', v_id::text),
          'data', jsonb_build_object(
            'slug', v_slug,'title','xx','difficulty','easy',
            'reward','{}'::jsonb,'related_entities','[]'::jsonb,
            'steps', jsonb_build_array(
              jsonb_build_object('type','question','prompt','P1','options', jsonb_build_array('a','b'),'correctAnswer',0),
              jsonb_build_object('type','question','prompt','BRAND_NEW','options', jsonb_build_array('x','y'),'correctAnswer',1)
            )
          ))
      )
    ),
    'commit'
  );
  new_qid := (SELECT (steps->1->>'id') FROM public.investigations WHERE id = v_id);
  RAISE NOTICE 'RES:%', r->>'status';
  RAISE NOTICE 'HAS_UUID:%', (new_qid ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\$');
  RAISE NOTICE 'FIRST_STABLE:%', ((SELECT steps->0->>'id' FROM public.investigations WHERE id = v_id) = 'q-existing');
END\$\$;
ROLLBACK;
" "RES:succeeded.*HAS_UUID:t.*FIRST_STABLE:t"

# --- 6. Duplicate question ID → full batch failure ---
run_test "6. duplicate question id → failed" "
BEGIN;
$AUTH_ADMIN
DO \$\$
DECLARE r JSONB; v_slug TEXT := 'it-inv-dup-'||replace(gen_random_uuid()::text,'-','');
BEGIN
  r := public.admin_run_import_batch(
    jsonb_build_object(
      'content_type','investigations',
      'approved_plan_hash','it-inv-dup-'||v_slug,
      'original_payload_hash','p','overwrite',false,'publish',false,
      'items', jsonb_build_array(
        jsonb_build_object('index',0,'action','new','data', jsonb_build_object(
          'slug', v_slug,'title','xx','difficulty','easy','reward','{}'::jsonb,'related_entities','[]'::jsonb,
          'steps', jsonb_build_array(
            jsonb_build_object('type','question','id','same-id','prompt','P1','options', jsonb_build_array('a','b'),'correctAnswer',0),
            jsonb_build_object('type','question','id','same-id','prompt','P2','options', jsonb_build_array('c','d'),'correctAnswer',1)
          )))
      )
    ),
    'commit'
  );
  RAISE NOTICE 'STATUS:%', r->>'status';
  RAISE NOTICE 'ERR:%', r->>'error';
END\$\$;
ROLLBACK;
" "STATUS:failed.*duplicated"

# --- 7. Empty question prompt → rollback ---
run_test "7. empty prompt → failed" "
BEGIN;
$AUTH_ADMIN
DO \$\$
DECLARE r JSONB; v_slug TEXT := 'it-inv-emp-'||replace(gen_random_uuid()::text,'-','');
BEGIN
  r := public.admin_run_import_batch(
    jsonb_build_object(
      'content_type','investigations',
      'approved_plan_hash','it-inv-emp-'||v_slug,
      'original_payload_hash','p','overwrite',false,'publish',false,
      'items', jsonb_build_array(
        jsonb_build_object('index',0,'action','new','data', jsonb_build_object(
          'slug', v_slug,'title','xx','difficulty','easy','reward','{}'::jsonb,'related_entities','[]'::jsonb,
          'steps', jsonb_build_array(
            jsonb_build_object('type','question','prompt','','options', jsonb_build_array('a','b'),'correctAnswer',0)
          )))
      )
    ),
    'commit'
  );
  RAISE NOTICE 'STATUS:%', r->>'status';
  RAISE NOTICE 'ERR:%', r->>'error';
END\$\$;
ROLLBACK;
" "STATUS:failed.*prompt is required"

# --- 8. Invalid options (only 1) → rollback ---
run_test "8. invalid options count → failed" "
BEGIN;
$AUTH_ADMIN
DO \$\$
DECLARE r JSONB; v_slug TEXT := 'it-inv-opt-'||replace(gen_random_uuid()::text,'-','');
BEGIN
  r := public.admin_run_import_batch(
    jsonb_build_object(
      'content_type','investigations',
      'approved_plan_hash','it-inv-opt-'||v_slug,
      'original_payload_hash','p','overwrite',false,'publish',false,
      'items', jsonb_build_array(
        jsonb_build_object('index',0,'action','new','data', jsonb_build_object(
          'slug', v_slug,'title','xx','difficulty','easy','reward','{}'::jsonb,'related_entities','[]'::jsonb,
          'steps', jsonb_build_array(
            jsonb_build_object('type','question','prompt','P','options', jsonb_build_array('only-one'),'correctAnswer',0)
          )))
      )
    ),
    'commit'
  );
  RAISE NOTICE 'STATUS:%', r->>'status';
  RAISE NOTICE 'ERR:%', r->>'error';
END\$\$;
ROLLBACK;
" "STATUS:failed.*options must have >= 2"

# --- 9. Missing correctAnswer → rollback ---
run_test "9. missing correctAnswer → failed" "
BEGIN;
$AUTH_ADMIN
DO \$\$
DECLARE r JSONB; v_slug TEXT := 'it-inv-noc-'||replace(gen_random_uuid()::text,'-','');
BEGIN
  r := public.admin_run_import_batch(
    jsonb_build_object(
      'content_type','investigations',
      'approved_plan_hash','it-inv-noc-'||v_slug,
      'original_payload_hash','p','overwrite',false,'publish',false,
      'items', jsonb_build_array(
        jsonb_build_object('index',0,'action','new','data', jsonb_build_object(
          'slug', v_slug,'title','xx','difficulty','easy','reward','{}'::jsonb,'related_entities','[]'::jsonb,
          'steps', jsonb_build_array(
            jsonb_build_object('type','question','prompt','P','options', jsonb_build_array('a','b'))
          )))
      )
    ),
    'commit'
  );
  RAISE NOTICE 'STATUS:%', r->>'status';
  RAISE NOTICE 'ERR:%', r->>'error';
END\$\$;
ROLLBACK;
" "STATUS:failed.*correctAnswer is required"

# --- 10. Invalid reward (negative) → rollback ---
run_test "10. invalid reward → failed" "
BEGIN;
$AUTH_ADMIN
DO \$\$
DECLARE r JSONB; v_slug TEXT := 'it-inv-rw-'||replace(gen_random_uuid()::text,'-','');
BEGIN
  r := public.admin_run_import_batch(
    jsonb_build_object(
      'content_type','investigations',
      'approved_plan_hash','it-inv-rw-'||v_slug,
      'original_payload_hash','p','overwrite',false,'publish',false,
      'items', jsonb_build_array(
        jsonb_build_object('index',0,'action','new','data', jsonb_build_object(
          'slug', v_slug,'title','xx','difficulty','easy',
          'reward', jsonb_build_object('xp', -50),
          'related_entities','[]'::jsonb,
          'steps', jsonb_build_array(
            jsonb_build_object('type','question','prompt','P','options', jsonb_build_array('a','b'),'correctAnswer',0)
          )))
      )
    ),
    'commit'
  );
  RAISE NOTICE 'STATUS:%', r->>'status';
  RAISE NOTICE 'ERR:%', r->>'error';
END\$\$;
ROLLBACK;
" "STATUS:failed.*reward.xp is out of range"

# --- 11. Broken related entity → blocked ---
run_test "11. unresolved related entity → failed" "
BEGIN;
$AUTH_ADMIN
DO \$\$
DECLARE r JSONB; v_slug TEXT := 'it-inv-rel-'||replace(gen_random_uuid()::text,'-','');
BEGIN
  r := public.admin_run_import_batch(
    jsonb_build_object(
      'content_type','investigations',
      'approved_plan_hash','it-inv-rel-'||v_slug,
      'original_payload_hash','p','overwrite',false,'publish',false,
      'items', jsonb_build_array(
        jsonb_build_object('index',0,'action','new','data', jsonb_build_object(
          'slug', v_slug,'title','xx','difficulty','easy','reward','{}'::jsonb,
          'related_entities', jsonb_build_array(jsonb_build_object('id','00000000-0000-0000-0000-000000000000','label','ghost')),
          'steps', jsonb_build_array(
            jsonb_build_object('type','question','prompt','P','options', jsonb_build_array('a','b'),'correctAnswer',0)
          )))
      )
    ),
    'commit'
  );
  RAISE NOTICE 'STATUS:%', r->>'status';
  RAISE NOTICE 'ERR:%', r->>'error';
END\$\$;
ROLLBACK;
" "STATUS:failed.*unresolved or disabled"

# --- 12. Failure after a good parent write → zero partial rows ---
run_test "12. later item fails → 0 rows written" "
BEGIN;
$AUTH_ADMIN
DO \$\$
DECLARE r JSONB; cnt INT; v_slug_ok TEXT; v_slug_bad TEXT;
BEGIN
  v_slug_ok  := 'it-inv-part-ok-'||replace(gen_random_uuid()::text,'-','');
  v_slug_bad := 'it-inv-part-bad-'||replace(gen_random_uuid()::text,'-','');
  r := public.admin_run_import_batch(
    jsonb_build_object(
      'content_type','investigations',
      'approved_plan_hash','it-inv-part-'||v_slug_ok,
      'original_payload_hash','p','overwrite',false,'publish',false,
      'items', jsonb_build_array(
        jsonb_build_object('index',0,'action','new','data', jsonb_build_object(
          'slug', v_slug_ok,'title','ok','difficulty','easy','reward','{}'::jsonb,'related_entities','[]'::jsonb,
          'steps', jsonb_build_array(
            jsonb_build_object('type','question','prompt','P','options', jsonb_build_array('a','b'),'correctAnswer',0)
          ))),
        jsonb_build_object('index',1,'action','new','data', jsonb_build_object(
          'slug', v_slug_bad,'title','bad','difficulty','easy','reward','{}'::jsonb,'related_entities','[]'::jsonb,
          'steps', jsonb_build_array(
            jsonb_build_object('type','question','prompt','','options', jsonb_build_array('a','b'),'correctAnswer',0)
          )))
      )
    ),
    'commit'
  );
  SELECT count(*) INTO cnt FROM public.investigations WHERE slug IN (v_slug_ok, v_slug_bad);
  RAISE NOTICE 'STATUS:%', r->>'status';
  RAISE NOTICE 'ROWS_WRITTEN:%', cnt;
END\$\$;
ROLLBACK;
" "STATUS:failed.*ROWS_WRITTEN:0"

# --- 13. Stale version signal ---
run_test "13. stale version signal → failed" "
BEGIN;
$AUTH_ADMIN
DO \$\$
DECLARE r JSONB; v_id UUID; v_slug TEXT := 'it-inv-stale-'||replace(gen_random_uuid()::text,'-','');
BEGIN
  INSERT INTO public.investigations (slug,title,difficulty,steps,reward,related_entities)
    VALUES (v_slug,'x','easy',
      jsonb_build_array(jsonb_build_object('type','question','id','q1','prompt','P','options', jsonb_build_array('a','b'),'correctAnswer',0)),
      '{}'::jsonb,'[]'::jsonb) RETURNING id INTO v_id;
  r := public.admin_run_import_batch(
    jsonb_build_object(
      'content_type','investigations',
      'approved_plan_hash','it-inv-stale-'||v_slug,
      'original_payload_hash','p','overwrite',true,'publish',false,
      'items', jsonb_build_array(
        jsonb_build_object('index',0,'action','update',
          'target_key', jsonb_build_object('id', v_id::text),
          'version_signal','1999-01-01T00:00:00Z',
          'data', jsonb_build_object(
            'slug', v_slug,'title','yy','difficulty','easy','reward','{}'::jsonb,'related_entities','[]'::jsonb,
            'steps', jsonb_build_array(
              jsonb_build_object('type','question','prompt','P','options', jsonb_build_array('a','b'),'correctAnswer',0)
            )
          ))
      )
    ),
    'commit'
  );
  RAISE NOTICE 'STATUS:%', r->>'status';
  RAISE NOTICE 'ERR:%', r->>'error';
END\$\$;
ROLLBACK;
" "STATUS:failed.*stale: content changed"

# --- 14. Duplicate plan hash → already_committed ---
run_test "14. duplicate approved_plan_hash → already_committed" "
BEGIN;
$AUTH_ADMIN
INSERT INTO public.admin_import_batches
  (admin_user_id, content_type, approved_plan_hash, mode, status, item_count)
VALUES ('${TEST_ADMIN_ID}','investigations','it-inv-dup-hash-9999','commit','succeeded',0);
DO \$\$
DECLARE r JSONB; v_slug TEXT := 'it-inv-dh-'||replace(gen_random_uuid()::text,'-','');
BEGIN
  r := public.admin_run_import_batch(
    jsonb_build_object(
      'content_type','investigations',
      'approved_plan_hash','it-inv-dup-hash-9999',
      'original_payload_hash','p','overwrite',false,'publish',false,
      'items', jsonb_build_array($VALID_INV_ITEM)
    ),
    'commit'
  );
  RAISE NOTICE 'STATUS:%', r->>'status';
END\$\$;
ROLLBACK;
" "STATUS:already_committed"

# --- 15. Dry Run writes nothing ---
run_test "15. dry_run writes zero rows" "
BEGIN;
$AUTH_ADMIN
DO \$\$
DECLARE r JSONB; cnt INT; v_slug TEXT := 'it-inv-dry-'||replace(gen_random_uuid()::text,'-','');
BEGIN
  r := public.admin_run_import_batch(
    jsonb_build_object(
      'content_type','investigations',
      'approved_plan_hash','it-inv-dry-'||v_slug,
      'original_payload_hash','p','overwrite',false,'publish',false,
      'items', jsonb_build_array($VALID_INV_ITEM)
    ),
    'dry_run'
  );
  SELECT count(*) INTO cnt FROM public.investigations WHERE slug = v_slug;
  RAISE NOTICE 'STATUS:%', r->>'status';
  RAISE NOTICE 'PROJECTED:%', r->>'created';
  RAISE NOTICE 'ACTUAL:%', cnt;
END\$\$;
ROLLBACK;
" "STATUS:ready.*PROJECTED:1.*ACTUAL:0"

# --- 16. Rollback removes created investigation ---
run_test "16. rollback deletes created investigation" "
BEGIN;
$AUTH_ADMIN
DO \$\$
DECLARE r JSONB; batch UUID; before_cnt INT; after_cnt INT; v_slug TEXT := 'it-inv-rb-'||replace(gen_random_uuid()::text,'-','');
BEGIN
  r := public.admin_run_import_batch(
    jsonb_build_object(
      'content_type','investigations',
      'approved_plan_hash','it-inv-rb-'||v_slug,
      'original_payload_hash','p','overwrite',false,'publish',false,
      'items', jsonb_build_array($VALID_INV_ITEM)
    ),
    'commit'
  );
  batch := (r->>'batch_id')::uuid;
  SELECT count(*) INTO before_cnt FROM public.investigations WHERE slug = v_slug;
  r := public.admin_rollback_import_batch(batch, false);
  SELECT count(*) INTO after_cnt FROM public.investigations WHERE slug = v_slug;
  RAISE NOTICE 'BEFORE:% AFTER:% ROLLED:%', before_cnt, after_cnt, r->>'rolled';
END\$\$;
ROLLBACK;
" "BEFORE:1 AFTER:0 ROLLED:1"

# --- 17. Rollback restores updated investigation content ---
run_test "17. rollback restores updated steps" "
BEGIN;
$AUTH_ADMIN
DO \$\$
DECLARE r JSONB; batch UUID; v_id UUID; v_slug TEXT := 'it-inv-rbu-'||replace(gen_random_uuid()::text,'-','');
  orig_title TEXT; after_title TEXT;
BEGIN
  INSERT INTO public.investigations (slug,title,difficulty,steps,reward,related_entities)
  VALUES (v_slug,'orig','easy',
    jsonb_build_array(jsonb_build_object('type','question','id','q1','prompt','P','options', jsonb_build_array('a','b'),'correctAnswer',0)),
    '{}'::jsonb,'[]'::jsonb)
  RETURNING id INTO v_id;
  orig_title := 'orig';
  r := public.admin_run_import_batch(
    jsonb_build_object(
      'content_type','investigations',
      'approved_plan_hash','it-inv-rbu-'||v_slug,
      'original_payload_hash','p','overwrite',true,'publish',false,
      'items', jsonb_build_array(
        jsonb_build_object('index',0,'action','update',
          'target_key', jsonb_build_object('id', v_id::text),
          'data', jsonb_build_object(
            'slug', v_slug,'title','changed-title','difficulty','easy','reward','{}'::jsonb,'related_entities','[]'::jsonb,
            'steps', jsonb_build_array(
              jsonb_build_object('type','question','prompt','P','options', jsonb_build_array('a','b'),'correctAnswer',0)
            )
          ))
      )
    ),
    'commit'
  );
  batch := (r->>'batch_id')::uuid;
  r := public.admin_rollback_import_batch(batch, false);
  after_title := (SELECT title FROM public.investigations WHERE id = v_id);
  RAISE NOTICE 'STATUS:%', r->>'status';
  RAISE NOTICE 'TITLE:%', after_title;
END\$\$;
ROLLBACK;
" "STATUS:rolled_back.*TITLE:orig"

# --- 18. Rollback conflict after later edit ---
run_test "18. rollback conflicts after later edit" "
BEGIN;
$AUTH_ADMIN
DO \$\$
DECLARE r JSONB; batch UUID; v_slug TEXT := 'it-inv-rbc-'||replace(gen_random_uuid()::text,'-','');
BEGIN
  r := public.admin_run_import_batch(
    jsonb_build_object(
      'content_type','investigations',
      'approved_plan_hash','it-inv-rbc-1-'||v_slug,
      'original_payload_hash','p','overwrite',false,'publish',false,
      'items', jsonb_build_array($VALID_INV_ITEM)
    ),
    'commit'
  );
  batch := (r->>'batch_id')::uuid;
  PERFORM pg_sleep(0.05);
  PERFORM public.admin_run_import_batch(
    jsonb_build_object(
      'content_type','investigations',
      'approved_plan_hash','it-inv-rbc-2-'||v_slug,
      'original_payload_hash','p','overwrite',true,'publish',false,
      'items', jsonb_build_array(
        jsonb_build_object('index',0,'action','update',
          'target_key', jsonb_build_object('id', (SELECT id::text FROM public.investigations WHERE slug=v_slug)),
          'data', jsonb_build_object(
            'slug', v_slug,'title','edited-elsewhere','difficulty','easy','reward','{}'::jsonb,'related_entities','[]'::jsonb,
            'steps', jsonb_build_array(
              jsonb_build_object('type','question','prompt','ما هو الجواب؟','options', jsonb_build_array('أ','ب','ج'),'correctAnswer',1)
            )
          ))
      )
    ),
    'commit'
  );
  r := public.admin_rollback_import_batch(batch, false);
  RAISE NOTICE 'STATUS:%', r->>'status';
  RAISE NOTICE 'CONFLICTS:%', r->>'conflicts';
END\$\$;
ROLLBACK;
" "STATUS:conflict.*CONFLICTS:1"

# --- 19. Unauthorized caller rejected ---
run_test "19. non-admin caller rejected" "
BEGIN;
$AUTH_NONADMIN
DO \$\$
DECLARE r JSONB;
BEGIN
  BEGIN
    r := public.admin_run_import_batch(
      jsonb_build_object(
        'content_type','investigations',
        'approved_plan_hash','it-inv-forbidden-abc',
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

# --- 20. Removal without allow_removals is blocked ---
run_test "20. removing a step id without opt-in → failed" "
BEGIN;
$AUTH_ADMIN
DO \$\$
DECLARE r JSONB; v_id UUID; v_slug TEXT := 'it-inv-rm-'||replace(gen_random_uuid()::text,'-','');
BEGIN
  INSERT INTO public.investigations (slug,title,difficulty,steps,reward,related_entities)
  VALUES (v_slug,'x','easy',
    jsonb_build_array(
      jsonb_build_object('type','question','id','keeper','prompt','K','options', jsonb_build_array('a','b'),'correctAnswer',0),
      jsonb_build_object('type','question','id','goner', 'prompt','G','options', jsonb_build_array('c','d'),'correctAnswer',1)
    ),'{}'::jsonb,'[]'::jsonb)
  RETURNING id INTO v_id;
  r := public.admin_run_import_batch(
    jsonb_build_object(
      'content_type','investigations',
      'approved_plan_hash','it-inv-rm-'||v_slug,
      'original_payload_hash','p','overwrite',true,'publish',false,
      'metadata', jsonb_build_object('allow_removals', false),
      'items', jsonb_build_array(
        jsonb_build_object('index',0,'action','update',
          'target_key', jsonb_build_object('id', v_id::text),
          'data', jsonb_build_object(
            'slug', v_slug,'title','xx','difficulty','easy','reward','{}'::jsonb,'related_entities','[]'::jsonb,
            'steps', jsonb_build_array(
              jsonb_build_object('type','question','id','keeper','prompt','K','options', jsonb_build_array('a','b'),'correctAnswer',0)
            )
          ))
      )
    ),
    'commit'
  );
  RAISE NOTICE 'STATUS:%', r->>'status';
  RAISE NOTICE 'ERR:%', r->>'error';
END\$\$;
ROLLBACK;
" "STATUS:failed.*without explicit allow_removals"

echo
echo "Result: $PASS passed, $FAIL failed."
if [ "$FAIL" -gt 0 ]; then
  echo "Failures:"
  for t in "${FAILED_TESTS[@]}"; do echo "  - $t"; done
  exit 1
fi

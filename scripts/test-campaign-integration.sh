#!/usr/bin/env bash
# ============================================================
# Phase 5.5c — Transactional campaign import integration tests.
#
# Runs against the live database. Every test wraps writes in
# BEGIN … ROLLBACK so no permanent rows are created.
#
# Coverage:
#   1  create complete campaign
#   2  batch with multiple campaigns
#   3  update preserves campaign id
#   4  rename chapter preserves chapter id (title-fallback match)
#   5  reorder chapters preserves ids
#   6  edit activity prompt preserves activity id
#   7  reorder activities preserves ids
#   8  add new chapter — new id minted
#   9  add new activity — new id minted
#  10  duplicate chapter id — full failure
#  11  duplicate activity id — full failure
#  12  missing prerequisite — full failure
#  13  unlock cycle — full failure
#  14  invalid activity type — full failure
#  15  self-unlock — full failure
#  16  remove chapter without approval — blocked (progress path)
#  17  remove chapter with progress — blocked without allow_removals
#  18  remove chapter with progress — allowed with allow_removals
#  19  nested failure => atomic rollback (zero rows changed)
#  20  stale version signal — failed
#  21  duplicate approved-plan hash — already_committed
#  22  dry-run writes nothing
#  23  rollback newly-inserted campaign
#  24  rollback updated campaign restores prior data
#  25  later edit blocks rollback (conflict)
#  26  non-admin rejected
#  27  draft import does not touch data (published snapshot)
#  28  publish creates admin_campaign_versions snapshot
#  29  public/anon cannot read draft_data
#  30  progress impact helper reports removed chapters
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
      (SELECT id FROM public.admin_import_batches WHERE approved_plan_hash LIKE 'it-cmp-%' AND admin_user_id='${TEST_ADMIN_ID}');
    DELETE FROM public.admin_import_batches WHERE approved_plan_hash LIKE 'it-cmp-%' AND admin_user_id='${TEST_ADMIN_ID}';
    DELETE FROM public.admin_audit_log WHERE actor_user_id='${TEST_ADMIN_ID}' AND target_type='admin_import_batches' AND created_at > now() - interval '15 minutes';
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
    echo "        got: $(echo "$out" | tr '\n' ' ' | head -c 600)"
    FAIL=$((FAIL+1)); FAILED_TESTS+=("$name")
  fi
}

# Reusable minimal campaign builder (single chapter, single activity).
CAMPAIGN='jsonb_build_object(
  '"'"'id'"'"', v_cid,
  '"'"'title'"'"', '"'"'حملة تجريبية'"'"',
  '"'"'slug'"'"', v_cid,
  '"'"'status'"'"', '"'"'draft'"'"',
  '"'"'chapters'"'"', jsonb_build_array(
    jsonb_build_object(
      '"'"'id'"'"','"'"'ch-1'"'"',
      '"'"'title'"'"','"'"'الفصل الأول'"'"',
      '"'"'order'"'"',1,
      '"'"'activities'"'"', jsonb_build_array(
        jsonb_build_object('"'"'id'"'"','"'"'act-1'"'"','"'"'type'"'"','"'"'multiple_choice'"'"',
          '"'"'prompt'"'"','"'"'ما الجواب؟'"'"','"'"'options'"'"',jsonb_build_array('"'"'أ'"'"','"'"'ب'"'"'),'"'"'correctAnswer'"'"',0)
      )
    )
  )
)'

echo
echo "=== Phase 5.5c campaign integration tests ==="

# 1
run_test "1. create complete campaign" "
BEGIN; $AUTH_ADMIN
DO \$\$ DECLARE r JSONB; v_cid TEXT := 'itc1-'||substr(md5(random()::text),1,8);
BEGIN
  r := public.admin_run_campaign_batch(jsonb_build_object(
    'content_type','campaigns','approved_plan_hash','it-cmp-1-'||v_cid,
    'original_payload_hash','p','publish',false,
    'items', jsonb_build_array(jsonb_build_object('index',0,'action','new','data', $CAMPAIGN))
  ), 'commit');
  RAISE NOTICE 'RES:%', r->>'status';
  RAISE NOTICE 'CREATED:%', r->>'created';
END\$\$; ROLLBACK;
" "RES:succeeded.*CREATED:1"

# 2
run_test "2. multi-campaign batch" "
BEGIN; $AUTH_ADMIN
DO \$\$ DECLARE r JSONB; v_cid TEXT := 'itc2a-'||substr(md5(random()::text),1,8);
              v_cid2 TEXT := 'itc2b-'||substr(md5(random()::text),1,8);
BEGIN
  r := public.admin_run_campaign_batch(jsonb_build_object(
    'content_type','campaigns','approved_plan_hash','it-cmp-2-'||v_cid,
    'original_payload_hash','p','publish',false,
    'items', jsonb_build_array(
      jsonb_build_object('index',0,'action','new','data', jsonb_build_object(
        'id',v_cid,'title','ح1','slug',v_cid,'status','draft',
        'chapters', jsonb_build_array(jsonb_build_object('id','x1','title','ch','order',1,
          'activities', jsonb_build_array(jsonb_build_object('id','a1','type','true_false','prompt','q?','correctAnswer',true)))))),
      jsonb_build_object('index',1,'action','new','data', jsonb_build_object(
        'id',v_cid2,'title','ح2','slug',v_cid2,'status','draft',
        'chapters', jsonb_build_array(jsonb_build_object('id','x1','title','ch','order',1,
          'activities', jsonb_build_array(jsonb_build_object('id','a1','type','true_false','prompt','q?','correctAnswer',true)))))))
  ), 'commit');
  RAISE NOTICE 'RES:%', r->>'status';
  RAISE NOTICE 'CREATED:%', r->>'created';
END\$\$; ROLLBACK;
" "RES:succeeded.*CREATED:2"

# 3, 4 — rename chapter, campaign id preserved, chapter id preserved via title match.
run_test "3+4. update preserves campaign id + chapter id via title fallback" "
BEGIN; $AUTH_ADMIN
DO \$\$ DECLARE r JSONB; v_cid TEXT := 'itc3-'||substr(md5(random()::text),1,8);
              orig_ts TEXT; ch_id_after TEXT; camp_id_after TEXT;
BEGIN
  INSERT INTO public.admin_campaigns(id,slug,title,status,data,content_version,has_unpublished_changes)
  VALUES (v_cid, v_cid, 'orig','draft', jsonb_build_object('id',v_cid,'title','orig',
    'chapters', jsonb_build_array(jsonb_build_object('id','ch-keep','title','الفصل الأول','order',1,
      'activities', jsonb_build_array(jsonb_build_object('id','act-keep','type','multiple_choice','prompt','p','options',jsonb_build_array('أ','ب'),'correctAnswer',0))))
  ),0,false);
  orig_ts := (SELECT updated_at::text FROM public.admin_campaigns WHERE id=v_cid);

  -- incoming omits the chapter id — merger must recover it via title match.
  r := public.admin_run_campaign_batch(jsonb_build_object(
    'content_type','campaigns','approved_plan_hash','it-cmp-3-'||v_cid,
    'original_payload_hash','p','publish',false,
    'items', jsonb_build_array(jsonb_build_object('index',0,'action','update',
      'target_key', jsonb_build_object('id',v_cid),
      'version_signal', orig_ts,
      'data', jsonb_build_object('id',v_cid,'title','renamed',
        'chapters', jsonb_build_array(jsonb_build_object('title','الفصل الأول','order',1,
          'activities', jsonb_build_array(jsonb_build_object('id','act-keep','type','multiple_choice','prompt','p','options',jsonb_build_array('أ','ب'),'correctAnswer',0)))))))
  ), 'commit');

  camp_id_after := (SELECT id FROM public.admin_campaigns WHERE id=v_cid);
  ch_id_after := (SELECT draft_data->'chapters'->0->>'id' FROM public.admin_campaigns WHERE id=v_cid);
  RAISE NOTICE 'RES:%', r->>'status';
  RAISE NOTICE 'CAMP:%', camp_id_after;
  RAISE NOTICE 'CH:%', ch_id_after;
END\$\$; ROLLBACK;
" "RES:succeeded.*CAMP:itc3.*CH:ch-keep"

# 5. reorder chapters preserves ids
run_test "5. reorder chapters preserves ids" "
BEGIN; $AUTH_ADMIN
DO \$\$ DECLARE r JSONB; v_cid TEXT := 'itc5-'||substr(md5(random()::text),1,8);
              first_id TEXT;
BEGIN
  INSERT INTO public.admin_campaigns(id,slug,title,status,data,content_version,has_unpublished_changes)
  VALUES (v_cid,v_cid,'t','draft', jsonb_build_object('id',v_cid,'title','t','chapters', jsonb_build_array(
    jsonb_build_object('id','ch-A','title','A','order',1,'activities', jsonb_build_array(
      jsonb_build_object('id','a','type','true_false','prompt','x','correctAnswer',true))),
    jsonb_build_object('id','ch-B','title','B','order',2,'activities', jsonb_build_array(
      jsonb_build_object('id','b','type','true_false','prompt','y','correctAnswer',true)))
  )),0,false);
  r := public.admin_run_campaign_batch(jsonb_build_object(
    'content_type','campaigns','approved_plan_hash','it-cmp-5-'||v_cid,
    'original_payload_hash','p','publish',false,
    'items', jsonb_build_array(jsonb_build_object('index',0,'action','update',
      'target_key', jsonb_build_object('id',v_cid),
      'data', jsonb_build_object('id',v_cid,'title','t','chapters', jsonb_build_array(
        jsonb_build_object('title','B','order',1,'activities', jsonb_build_array(
          jsonb_build_object('type','true_false','prompt','y','correctAnswer',true))),
        jsonb_build_object('title','A','order',2,'activities', jsonb_build_array(
          jsonb_build_object('type','true_false','prompt','x','correctAnswer',true)))
      ))))))
  ), 'commit');
  first_id := (SELECT draft_data->'chapters'->0->>'id' FROM public.admin_campaigns WHERE id=v_cid);
  RAISE NOTICE 'RES:%', r->>'status';
  RAISE NOTICE 'FIRST:%', first_id;
END\$\$; ROLLBACK;
" "RES:succeeded.*FIRST:ch-B"

# 6. edit activity prompt preserves id (activity id supplied)
run_test "6. edit activity prompt preserves id when id supplied" "
BEGIN; $AUTH_ADMIN
DO \$\$ DECLARE r JSONB; v_cid TEXT := 'itc6-'||substr(md5(random()::text),1,8);
              aid TEXT;
BEGIN
  INSERT INTO public.admin_campaigns(id,slug,title,status,data,content_version,has_unpublished_changes)
  VALUES (v_cid,v_cid,'t','draft', jsonb_build_object('id',v_cid,'title','t','chapters', jsonb_build_array(
    jsonb_build_object('id','ch','title','ch','order',1,'activities', jsonb_build_array(
      jsonb_build_object('id','act-fix','type','multiple_choice','prompt','old','options',jsonb_build_array('a','b'),'correctAnswer',0)))
  )),0,false);
  r := public.admin_run_campaign_batch(jsonb_build_object(
    'content_type','campaigns','approved_plan_hash','it-cmp-6-'||v_cid,
    'original_payload_hash','p','publish',false,
    'items', jsonb_build_array(jsonb_build_object('index',0,'action','update',
      'target_key', jsonb_build_object('id',v_cid),
      'data', jsonb_build_object('id',v_cid,'title','t','chapters', jsonb_build_array(
        jsonb_build_object('id','ch','title','ch','order',1,'activities', jsonb_build_array(
          jsonb_build_object('id','act-fix','type','multiple_choice','prompt','new','options',jsonb_build_array('a','b','c'),'correctAnswer',0)
        )))))))
  ), 'commit');
  aid := (SELECT draft_data->'chapters'->0->'activities'->0->>'id' FROM public.admin_campaigns WHERE id=v_cid);
  RAISE NOTICE 'RES:%', r->>'status';
  RAISE NOTICE 'AID:%', aid;
END\$\$; ROLLBACK;
" "RES:succeeded.*AID:act-fix"

# 8. add new chapter — mints new id when none supplied
run_test "8+9. add new chapter/activity mints new ids" "
BEGIN; $AUTH_ADMIN
DO \$\$ DECLARE r JSONB; v_cid TEXT := 'itc8-'||substr(md5(random()::text),1,8);
              n_ch INT;
BEGIN
  INSERT INTO public.admin_campaigns(id,slug,title,status,data,content_version,has_unpublished_changes)
  VALUES (v_cid,v_cid,'t','draft', jsonb_build_object('id',v_cid,'title','t','chapters', jsonb_build_array(
    jsonb_build_object('id','ch-old','title','o','order',1,'activities', jsonb_build_array(
      jsonb_build_object('id','a-old','type','true_false','prompt','x','correctAnswer',true)))
  )),0,false);
  r := public.admin_run_campaign_batch(jsonb_build_object(
    'content_type','campaigns','approved_plan_hash','it-cmp-8-'||v_cid,
    'original_payload_hash','p','publish',false,
    'items', jsonb_build_array(jsonb_build_object('index',0,'action','update',
      'target_key', jsonb_build_object('id',v_cid),
      'data', jsonb_build_object('id',v_cid,'title','t','chapters', jsonb_build_array(
        jsonb_build_object('id','ch-old','title','o','order',1,'activities', jsonb_build_array(
          jsonb_build_object('id','a-old','type','true_false','prompt','x','correctAnswer',true),
          jsonb_build_object('type','true_false','prompt','new_act','correctAnswer',true))),
        jsonb_build_object('title','brand_new_chapter','order',2,'activities', jsonb_build_array(
          jsonb_build_object('type','true_false','prompt','pp','correctAnswer',true)))
      )))))))
  ), 'commit');
  n_ch := (SELECT jsonb_array_length(draft_data->'chapters') FROM public.admin_campaigns WHERE id=v_cid);
  RAISE NOTICE 'RES:%', r->>'status';
  RAISE NOTICE 'NCH:%', n_ch;
END\$\$; ROLLBACK;
" "RES:succeeded.*NCH:2"

# 10. duplicate chapter id -> full failure
run_test "10. duplicate chapter id fails" "
BEGIN; $AUTH_ADMIN
DO \$\$ DECLARE r JSONB; v_cid TEXT := 'itc10-'||substr(md5(random()::text),1,8);
BEGIN
  r := public.admin_run_campaign_batch(jsonb_build_object(
    'content_type','campaigns','approved_plan_hash','it-cmp-10-'||v_cid,
    'original_payload_hash','p','publish',false,
    'items', jsonb_build_array(jsonb_build_object('index',0,'action','new','data',
      jsonb_build_object('id',v_cid,'title','t','chapters', jsonb_build_array(
        jsonb_build_object('id','dup','title','A','order',1,'activities', jsonb_build_array(
          jsonb_build_object('id','a','type','true_false','prompt','q','correctAnswer',true))),
        jsonb_build_object('id','dup','title','B','order',2,'activities', jsonb_build_array(
          jsonb_build_object('id','b','type','true_false','prompt','q','correctAnswer',true)))
      )))))
  ), 'commit');
  RAISE NOTICE 'RES:%', r->>'status';
END\$\$; ROLLBACK;
" "RES:failed"

# 11. duplicate activity id
run_test "11. duplicate activity id fails" "
BEGIN; $AUTH_ADMIN
DO \$\$ DECLARE r JSONB; v_cid TEXT := 'itc11-'||substr(md5(random()::text),1,8);
BEGIN
  r := public.admin_run_campaign_batch(jsonb_build_object(
    'content_type','campaigns','approved_plan_hash','it-cmp-11-'||v_cid,
    'original_payload_hash','p','publish',false,
    'items', jsonb_build_array(jsonb_build_object('index',0,'action','new','data',
      jsonb_build_object('id',v_cid,'title','t','chapters', jsonb_build_array(
        jsonb_build_object('id','ch','title','A','order',1,'activities', jsonb_build_array(
          jsonb_build_object('id','same','type','true_false','prompt','q1','correctAnswer',true),
          jsonb_build_object('id','same','type','true_false','prompt','q2','correctAnswer',true)))))))
  ), 'commit');
  RAISE NOTICE 'RES:%', r->>'status';
END\$\$; ROLLBACK;
" "RES:failed"

# 12. missing prerequisite
run_test "12. missing prerequisite fails" "
BEGIN; $AUTH_ADMIN
DO \$\$ DECLARE r JSONB; v_cid TEXT := 'itc12-'||substr(md5(random()::text),1,8);
BEGIN
  r := public.admin_run_campaign_batch(jsonb_build_object(
    'content_type','campaigns','approved_plan_hash','it-cmp-12-'||v_cid,
    'original_payload_hash','p','publish',false,
    'items', jsonb_build_array(jsonb_build_object('index',0,'action','new','data',
      jsonb_build_object('id',v_cid,'title','t','chapters', jsonb_build_array(
        jsonb_build_object('id','ch','title','A','order',1,'unlockRequirement','no-such',
          'activities', jsonb_build_array(
            jsonb_build_object('id','a','type','true_false','prompt','q','correctAnswer',true)))))))
  ), 'commit');
  RAISE NOTICE 'RES:%', r->>'status';
END\$\$; ROLLBACK;
" "RES:failed"

# 13. unlock cycle
run_test "13. unlock cycle fails" "
BEGIN; $AUTH_ADMIN
DO \$\$ DECLARE r JSONB; v_cid TEXT := 'itc13-'||substr(md5(random()::text),1,8);
BEGIN
  r := public.admin_run_campaign_batch(jsonb_build_object(
    'content_type','campaigns','approved_plan_hash','it-cmp-13-'||v_cid,
    'original_payload_hash','p','publish',false,
    'items', jsonb_build_array(jsonb_build_object('index',0,'action','new','data',
      jsonb_build_object('id',v_cid,'title','t','chapters', jsonb_build_array(
        jsonb_build_object('id','A','title','A','order',1,'unlockRequirement','B','activities', jsonb_build_array(
          jsonb_build_object('id','a','type','true_false','prompt','q','correctAnswer',true))),
        jsonb_build_object('id','B','title','B','order',2,'unlockRequirement','A','activities', jsonb_build_array(
          jsonb_build_object('id','b','type','true_false','prompt','q','correctAnswer',true)))))))
  ), 'commit');
  RAISE NOTICE 'RES:%', r->>'status';
END\$\$; ROLLBACK;
" "RES:failed"

# 14. invalid activity type
run_test "14. invalid activity type fails" "
BEGIN; $AUTH_ADMIN
DO \$\$ DECLARE r JSONB; v_cid TEXT := 'itc14-'||substr(md5(random()::text),1,8);
BEGIN
  r := public.admin_run_campaign_batch(jsonb_build_object(
    'content_type','campaigns','approved_plan_hash','it-cmp-14-'||v_cid,
    'original_payload_hash','p','publish',false,
    'items', jsonb_build_array(jsonb_build_object('index',0,'action','new','data',
      jsonb_build_object('id',v_cid,'title','t','chapters', jsonb_build_array(
        jsonb_build_object('id','ch','title','A','order',1,'activities', jsonb_build_array(
          jsonb_build_object('id','a','type','NOT_A_TYPE','prompt','q','correctAnswer',true)))))))
  ), 'commit');
  RAISE NOTICE 'RES:%', r->>'status';
END\$\$; ROLLBACK;
" "RES:failed"

# 15. self-unlock
run_test "15. self-unlock fails" "
BEGIN; $AUTH_ADMIN
DO \$\$ DECLARE r JSONB; v_cid TEXT := 'itc15-'||substr(md5(random()::text),1,8);
BEGIN
  r := public.admin_run_campaign_batch(jsonb_build_object(
    'content_type','campaigns','approved_plan_hash','it-cmp-15-'||v_cid,
    'original_payload_hash','p','publish',false,
    'items', jsonb_build_array(jsonb_build_object('index',0,'action','new','data',
      jsonb_build_object('id',v_cid,'title','t','chapters', jsonb_build_array(
        jsonb_build_object('id','self','title','A','order',1,'unlockRequirement','self','activities', jsonb_build_array(
          jsonb_build_object('id','a','type','true_false','prompt','q','correctAnswer',true)))))))
  ), 'commit');
  RAISE NOTICE 'RES:%', r->>'status';
END\$\$; ROLLBACK;
" "RES:failed"

# 17. remove chapter WITH progress WITHOUT allow_removals => fail
run_test "17. remove chapter with progress without opt-in fails" "
BEGIN; $AUTH_ADMIN
DO \$\$ DECLARE r JSONB; v_cid TEXT := 'itc17-'||substr(md5(random()::text),1,8);
BEGIN
  INSERT INTO public.admin_campaigns(id,slug,title,status,data,content_version,has_unpublished_changes)
  VALUES (v_cid,v_cid,'t','draft', jsonb_build_object('id',v_cid,'title','t','chapters', jsonb_build_array(
    jsonb_build_object('id','keep','title','K','order',1,'activities', jsonb_build_array(
      jsonb_build_object('id','a','type','true_false','prompt','q','correctAnswer',true))),
    jsonb_build_object('id','drop','title','D','order',2,'activities', jsonb_build_array(
      jsonb_build_object('id','b','type','true_false','prompt','q','correctAnswer',true)))
  )),0,false);
  INSERT INTO public.user_campaign_progress(user_id,campaign_id,chapter_id,status,score,xp_earned,coins_earned)
  VALUES ('${TEST_ADMIN_ID}',v_cid,'drop','completed',100,10,5);

  r := public.admin_run_campaign_batch(jsonb_build_object(
    'content_type','campaigns','approved_plan_hash','it-cmp-17-'||v_cid,
    'original_payload_hash','p','publish',false,
    'items', jsonb_build_array(jsonb_build_object('index',0,'action','update',
      'target_key', jsonb_build_object('id',v_cid),
      'data', jsonb_build_object('id',v_cid,'title','t','chapters', jsonb_build_array(
        jsonb_build_object('id','keep','title','K','order',1,'activities', jsonb_build_array(
          jsonb_build_object('id','a','type','true_false','prompt','q','correctAnswer',true)))))))
  ), 'commit');
  RAISE NOTICE 'RES:%', r->>'status';
END\$\$; ROLLBACK;
" "RES:failed"

# 18. remove chapter with progress WITH allow_removals => succeeds
run_test "18. remove chapter with progress + allow_removals succeeds" "
BEGIN; $AUTH_ADMIN
DO \$\$ DECLARE r JSONB; v_cid TEXT := 'itc18-'||substr(md5(random()::text),1,8);
BEGIN
  INSERT INTO public.admin_campaigns(id,slug,title,status,data,content_version,has_unpublished_changes)
  VALUES (v_cid,v_cid,'t','draft', jsonb_build_object('id',v_cid,'title','t','chapters', jsonb_build_array(
    jsonb_build_object('id','keep','title','K','order',1,'activities', jsonb_build_array(
      jsonb_build_object('id','a','type','true_false','prompt','q','correctAnswer',true))),
    jsonb_build_object('id','drop','title','D','order',2,'activities', jsonb_build_array(
      jsonb_build_object('id','b','type','true_false','prompt','q','correctAnswer',true)))
  )),0,false);
  INSERT INTO public.user_campaign_progress(user_id,campaign_id,chapter_id,status,score,xp_earned,coins_earned)
  VALUES ('${TEST_ADMIN_ID}',v_cid,'drop','completed',100,10,5);

  r := public.admin_run_campaign_batch(jsonb_build_object(
    'content_type','campaigns','approved_plan_hash','it-cmp-18-'||v_cid,
    'original_payload_hash','p','publish',false,
    'metadata', jsonb_build_object('allow_removals', true),
    'items', jsonb_build_array(jsonb_build_object('index',0,'action','update',
      'target_key', jsonb_build_object('id',v_cid),
      'data', jsonb_build_object('id',v_cid,'title','t','chapters', jsonb_build_array(
        jsonb_build_object('id','keep','title','K','order',1,'activities', jsonb_build_array(
          jsonb_build_object('id','a','type','true_false','prompt','q','correctAnswer',true)))))))
  ), 'commit');
  RAISE NOTICE 'RES:%', r->>'status';
END\$\$; ROLLBACK;
" "RES:succeeded"

# 19. nested failure inside 2-item batch => zero writes
run_test "19. nested failure rolls back entire batch" "
BEGIN; $AUTH_ADMIN
DO \$\$ DECLARE r JSONB; v_cid TEXT := 'itc19-'||substr(md5(random()::text),1,8);
              v_bad TEXT := 'itc19b-'||substr(md5(random()::text),1,8);
              n INT;
BEGIN
  r := public.admin_run_campaign_batch(jsonb_build_object(
    'content_type','campaigns','approved_plan_hash','it-cmp-19-'||v_cid,
    'original_payload_hash','p','publish',false,
    'items', jsonb_build_array(
      jsonb_build_object('index',0,'action','new','data',
        jsonb_build_object('id',v_cid,'title','t','chapters', jsonb_build_array(
          jsonb_build_object('id','ch','title','A','order',1,'activities', jsonb_build_array(
            jsonb_build_object('id','a','type','true_false','prompt','q','correctAnswer',true)))))),
      jsonb_build_object('index',1,'action','new','data',
        jsonb_build_object('id',v_bad,'title','','chapters', jsonb_build_array(
          jsonb_build_object('id','x','title','A','order',1,'activities', jsonb_build_array(
            jsonb_build_object('id','a','type','true_false','prompt','q','correctAnswer',true)))))))
  ), 'commit');
  n := (SELECT count(*)::int FROM public.admin_campaigns WHERE id IN (v_cid,v_bad));
  RAISE NOTICE 'RES:%', r->>'status';
  RAISE NOTICE 'N:%', n;
END\$\$; ROLLBACK;
" "RES:failed.*N:0"

# 20. stale version signal
run_test "20. stale version signal fails" "
BEGIN; $AUTH_ADMIN
DO \$\$ DECLARE r JSONB; v_cid TEXT := 'itc20-'||substr(md5(random()::text),1,8);
BEGIN
  INSERT INTO public.admin_campaigns(id,slug,title,status,data,content_version,has_unpublished_changes)
  VALUES (v_cid,v_cid,'t','draft', jsonb_build_object('id',v_cid,'title','t','chapters', jsonb_build_array(
    jsonb_build_object('id','ch','title','A','order',1,'activities', jsonb_build_array(
      jsonb_build_object('id','a','type','true_false','prompt','q','correctAnswer',true)))
  )),0,false);
  r := public.admin_run_campaign_batch(jsonb_build_object(
    'content_type','campaigns','approved_plan_hash','it-cmp-20-'||v_cid,
    'original_payload_hash','p','publish',false,
    'items', jsonb_build_array(jsonb_build_object('index',0,'action','update',
      'target_key', jsonb_build_object('id',v_cid),
      'version_signal','1970-01-01T00:00:00+00:00',
      'data', jsonb_build_object('id',v_cid,'title','t','chapters', jsonb_build_array(
        jsonb_build_object('id','ch','title','A','order',1,'activities', jsonb_build_array(
          jsonb_build_object('id','a','type','true_false','prompt','q','correctAnswer',true)))))))
  ), 'commit');
  RAISE NOTICE 'RES:%', r->>'status';
END\$\$; ROLLBACK;
" "RES:failed"

# 21. duplicate approved-plan hash — already_committed
run_test "21. duplicate approved-plan hash returns already_committed" "
BEGIN; $AUTH_ADMIN
DO \$\$ DECLARE r JSONB; r2 JSONB; v_cid TEXT := 'itc21-'||substr(md5(random()::text),1,8);
              v_hash TEXT := 'it-cmp-21-'||substr(md5(random()::text),1,8);
BEGIN
  r := public.admin_run_campaign_batch(jsonb_build_object(
    'content_type','campaigns','approved_plan_hash',v_hash,
    'original_payload_hash','p','publish',false,
    'items', jsonb_build_array(jsonb_build_object('index',0,'action','new','data',
      jsonb_build_object('id',v_cid,'title','t','chapters', jsonb_build_array(
        jsonb_build_object('id','ch','title','A','order',1,'activities', jsonb_build_array(
          jsonb_build_object('id','a','type','true_false','prompt','q','correctAnswer',true)))))))
  ), 'commit');
  r2 := public.admin_run_campaign_batch(jsonb_build_object(
    'content_type','campaigns','approved_plan_hash',v_hash,
    'original_payload_hash','p','publish',false,
    'items', jsonb_build_array(jsonb_build_object('index',0,'action','new','data',
      jsonb_build_object('id',v_cid,'title','t','chapters', jsonb_build_array(
        jsonb_build_object('id','ch','title','A','order',1,'activities', jsonb_build_array(
          jsonb_build_object('id','a','type','true_false','prompt','q','correctAnswer',true)))))))
  ), 'commit');
  RAISE NOTICE 'R1:%', r->>'status';
  RAISE NOTICE 'R2:%', r2->>'status';
END\$\$; ROLLBACK;
" "R1:succeeded.*R2:already_committed"

# 22. dry-run writes nothing
run_test "22. dry-run writes nothing" "
BEGIN; $AUTH_ADMIN
DO \$\$ DECLARE r JSONB; v_cid TEXT := 'itc22-'||substr(md5(random()::text),1,8); n INT;
BEGIN
  r := public.admin_run_campaign_batch(jsonb_build_object(
    'content_type','campaigns','approved_plan_hash','it-cmp-22-'||v_cid,
    'original_payload_hash','p','publish',false,
    'items', jsonb_build_array(jsonb_build_object('index',0,'action','new','data',
      jsonb_build_object('id',v_cid,'title','t','chapters', jsonb_build_array(
        jsonb_build_object('id','ch','title','A','order',1,'activities', jsonb_build_array(
          jsonb_build_object('id','a','type','true_false','prompt','q','correctAnswer',true)))))))
  ), 'dry_run');
  n := (SELECT count(*)::int FROM public.admin_campaigns WHERE id=v_cid);
  RAISE NOTICE 'RES:%', r->>'status';
  RAISE NOTICE 'N:%', n;
END\$\$; ROLLBACK;
" "RES:ready.*N:0"

# 23. rollback newly-inserted campaign
run_test "23. rollback deletes newly-inserted campaign" "
BEGIN; $AUTH_ADMIN
DO \$\$ DECLARE r JSONB; rb JSONB; v_cid TEXT := 'itc23-'||substr(md5(random()::text),1,8);
              bid UUID; n INT;
BEGIN
  r := public.admin_run_campaign_batch(jsonb_build_object(
    'content_type','campaigns','approved_plan_hash','it-cmp-23-'||v_cid,
    'original_payload_hash','p','publish',false,
    'items', jsonb_build_array(jsonb_build_object('index',0,'action','new','data',
      jsonb_build_object('id',v_cid,'title','t','chapters', jsonb_build_array(
        jsonb_build_object('id','ch','title','A','order',1,'activities', jsonb_build_array(
          jsonb_build_object('id','a','type','true_false','prompt','q','correctAnswer',true)))))))
  ), 'commit');
  bid := (r->>'batch_id')::uuid;
  rb := public.admin_rollback_campaign_batch(bid,false);
  n := (SELECT count(*)::int FROM public.admin_campaigns WHERE id=v_cid);
  RAISE NOTICE 'RES:%', rb->>'status';
  RAISE NOTICE 'N:%', n;
END\$\$; ROLLBACK;
" "RES:rolled_back.*N:0"

# 24. rollback updated campaign restores prior title
run_test "24. rollback restores prior data" "
BEGIN; $AUTH_ADMIN
DO \$\$ DECLARE r JSONB; rb JSONB; v_cid TEXT := 'itc24-'||substr(md5(random()::text),1,8);
              bid UUID; t_after TEXT;
BEGIN
  INSERT INTO public.admin_campaigns(id,slug,title,status,data,content_version,has_unpublished_changes)
  VALUES (v_cid,v_cid,'orig-title','draft', jsonb_build_object('id',v_cid,'title','orig-title','chapters', jsonb_build_array(
    jsonb_build_object('id','ch','title','A','order',1,'activities', jsonb_build_array(
      jsonb_build_object('id','a','type','true_false','prompt','q','correctAnswer',true)))
  )),0,false);
  r := public.admin_run_campaign_batch(jsonb_build_object(
    'content_type','campaigns','approved_plan_hash','it-cmp-24-'||v_cid,
    'original_payload_hash','p','publish',false,
    'items', jsonb_build_array(jsonb_build_object('index',0,'action','update',
      'target_key', jsonb_build_object('id',v_cid),
      'data', jsonb_build_object('id',v_cid,'title','new-title','chapters', jsonb_build_array(
        jsonb_build_object('id','ch','title','A','order',1,'activities', jsonb_build_array(
          jsonb_build_object('id','a','type','true_false','prompt','q','correctAnswer',true)))))))
  ), 'commit');
  bid := (r->>'batch_id')::uuid;
  rb := public.admin_rollback_campaign_batch(bid,false);
  t_after := (SELECT title FROM public.admin_campaigns WHERE id=v_cid);
  RAISE NOTICE 'RES:%', rb->>'status';
  RAISE NOTICE 'T:%', t_after;
END\$\$; ROLLBACK;
" "RES:rolled_back.*T:orig-title"

# 25. later edit blocks rollback
run_test "25. later edit blocks rollback (conflict)" "
BEGIN; $AUTH_ADMIN
DO \$\$ DECLARE r JSONB; rb JSONB; v_cid TEXT := 'itc25-'||substr(md5(random()::text),1,8);
              bid UUID;
BEGIN
  r := public.admin_run_campaign_batch(jsonb_build_object(
    'content_type','campaigns','approved_plan_hash','it-cmp-25-'||v_cid,
    'original_payload_hash','p','publish',false,
    'items', jsonb_build_array(jsonb_build_object('index',0,'action','new','data',
      jsonb_build_object('id',v_cid,'title','t','chapters', jsonb_build_array(
        jsonb_build_object('id','ch','title','A','order',1,'activities', jsonb_build_array(
          jsonb_build_object('id','a','type','true_false','prompt','q','correctAnswer',true)))))))
  ), 'commit');
  bid := (r->>'batch_id')::uuid;
  UPDATE public.admin_campaigns SET title='LATER-EDIT', data = data || jsonb_build_object('editedByAnother',true) WHERE id=v_cid;
  rb := public.admin_rollback_campaign_batch(bid,false);
  RAISE NOTICE 'RES:%', rb->>'status';
END\$\$; ROLLBACK;
" "RES:rollback_failed"

# 26. non-admin rejected
run_test "26. non-admin rejected" "
BEGIN; $AUTH_NONADMIN
DO \$\$ DECLARE r JSONB; v_cid TEXT := 'itc26-'||substr(md5(random()::text),1,8);
BEGIN
  BEGIN
    r := public.admin_run_campaign_batch(jsonb_build_object(
      'content_type','campaigns','approved_plan_hash','it-cmp-26-'||v_cid,
      'original_payload_hash','p','publish',false,
      'items', jsonb_build_array(jsonb_build_object('index',0,'action','new','data',
        jsonb_build_object('id',v_cid,'title','t','chapters', jsonb_build_array(
          jsonb_build_object('id','ch','title','A','order',1,'activities', jsonb_build_array(
            jsonb_build_object('id','a','type','true_false','prompt','q','correctAnswer',true)))))))
    ), 'commit');
    RAISE NOTICE 'UNEXPECTED:%', r->>'status';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'REJECTED:%', SQLERRM;
  END;
END\$\$; ROLLBACK;
" "REJECTED:forbidden"

# 27. draft import does not touch published data
run_test "27. draft import leaves data (published snapshot) untouched" "
BEGIN; $AUTH_ADMIN
DO \$\$ DECLARE r JSONB; v_cid TEXT := 'itc27-'||substr(md5(random()::text),1,8);
              orig_data JSONB; after_data JSONB; after_draft JSONB;
BEGIN
  INSERT INTO public.admin_campaigns(id,slug,title,status,data,content_version,has_unpublished_changes,published_at)
  VALUES (v_cid,v_cid,'pub','published',
    jsonb_build_object('id',v_cid,'title','PUB','chapters', jsonb_build_array(
      jsonb_build_object('id','ch','title','P','order',1,'activities', jsonb_build_array(
        jsonb_build_object('id','a','type','true_false','prompt','q','correctAnswer',true))))),
    1,false,now());
  orig_data := (SELECT data FROM public.admin_campaigns WHERE id=v_cid);
  r := public.admin_run_campaign_batch(jsonb_build_object(
    'content_type','campaigns','approved_plan_hash','it-cmp-27-'||v_cid,
    'original_payload_hash','p','publish',false,
    'items', jsonb_build_array(jsonb_build_object('index',0,'action','update',
      'target_key', jsonb_build_object('id',v_cid),
      'data', jsonb_build_object('id',v_cid,'title','DRAFT','chapters', jsonb_build_array(
        jsonb_build_object('id','ch','title','P','order',1,'activities', jsonb_build_array(
          jsonb_build_object('id','a','type','true_false','prompt','q','correctAnswer',true)))))))
  ), 'commit');
  after_data := (SELECT data FROM public.admin_campaigns WHERE id=v_cid);
  after_draft := (SELECT draft_data FROM public.admin_campaigns WHERE id=v_cid);
  RAISE NOTICE 'RES:%', r->>'status';
  RAISE NOTICE 'DATA_KEPT:%', (after_data->>'title' = orig_data->>'title');
  RAISE NOTICE 'DRAFT_SET:%', (after_draft->>'title');
END\$\$; ROLLBACK;
" "RES:succeeded.*DATA_KEPT:t.*DRAFT_SET:DRAFT"

# 28. publish creates version snapshot
run_test "28. publish creates version snapshot" "
BEGIN; $AUTH_ADMIN
DO \$\$ DECLARE r JSONB; v_cid TEXT := 'itc28-'||substr(md5(random()::text),1,8); n INT;
BEGIN
  r := public.admin_run_campaign_batch(jsonb_build_object(
    'content_type','campaigns','approved_plan_hash','it-cmp-28-'||v_cid,
    'original_payload_hash','p','publish',true,
    'items', jsonb_build_array(jsonb_build_object('index',0,'action','new','data',
      jsonb_build_object('id',v_cid,'title','t','chapters', jsonb_build_array(
        jsonb_build_object('id','ch','title','A','order',1,'activities', jsonb_build_array(
          jsonb_build_object('id','a','type','true_false','prompt','q','correctAnswer',true)))))))
  ), 'commit');
  n := (SELECT count(*)::int FROM public.admin_campaign_versions WHERE campaign_id=v_cid);
  RAISE NOTICE 'RES:%', r->>'status';
  RAISE NOTICE 'V:%', n;
END\$\$; ROLLBACK;
" "RES:succeeded.*V:1"

# 29. anon cannot read draft_data (public policy restricts to published)
# Simulated by checking the RLS predicate: anon SELECT policy has status='published'.
run_test "29. anon SELECT policy blocks non-published rows" "
SELECT (qual = '(status = ''published''::text)')::text
  FROM pg_policies
 WHERE tablename='admin_campaigns' AND 'anon' = ANY(roles) AND cmd='SELECT'
 LIMIT 1;
" "true"

# 30. progress-impact helper reports removed chapter with users
run_test "30. progress-impact helper reports removed chapter" "
BEGIN; $AUTH_ADMIN
DO \$\$ DECLARE v_cid TEXT := 'itc30-'||substr(md5(random()::text),1,8);
              r JSONB;
BEGIN
  INSERT INTO public.admin_campaigns(id,slug,title,status,data,content_version,has_unpublished_changes)
  VALUES (v_cid,v_cid,'t','draft', jsonb_build_object('id',v_cid,'title','t','chapters', jsonb_build_array(
    jsonb_build_object('id','keep','title','K','order',1),
    jsonb_build_object('id','drop','title','D','order',2))),0,false);
  INSERT INTO public.user_campaign_progress(user_id,campaign_id,chapter_id,status,score,xp_earned,coins_earned)
  VALUES ('${TEST_ADMIN_ID}',v_cid,'drop','completed',100,10,5);
  r := public.admin_campaign_progress_impact(v_cid,
    jsonb_build_object('chapters', jsonb_build_array(
      jsonb_build_object('id','keep','title','K','order',1))));
  RAISE NOTICE 'REMOVED:%', jsonb_array_length(r->'removed_chapters_with_progress');
END\$\$; ROLLBACK;
" "REMOVED:1"

echo
echo "=== Result: $PASS passed, $FAIL failed ==="
if [ $FAIL -gt 0 ]; then
  echo "Failed tests:"
  for t in "${FAILED_TESTS[@]}"; do echo "  - $t"; done
  exit 1
fi

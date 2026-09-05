-- V17-08 — Server-side emblem equip authority
-- ------------------------------------------------------------
-- 1. public.emblem_catalog  : the enforced unlock rule per emblem
-- 2. emblem_is_equippable_v1: single authority for "may this user equip X"
-- 3. get_my_emblem_state_v1 : the SAME counts the client gate reads
-- 4. sync_my_public_stats   : avatar_id is validated instead of only clamped.
--    Every other behaviour (V17-04 streak authority, admin_balance_grants,
--    xp/dinars/hearts/stat sync, grants, security, search_path) is preserved
--    byte-for-byte from the live definition.

CREATE TABLE IF NOT EXISTS public.emblem_catalog (
  emblem_id   text PRIMARY KEY,
  unlock_kind text NOT NULL CHECK (unlock_kind IN ('default','campaign_count','museum_count','coming_soon')),
  threshold   integer,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- RPC-only: no direct Data API access. SECURITY DEFINER functions read it.
GRANT ALL ON public.emblem_catalog TO service_role;
ALTER TABLE public.emblem_catalog ENABLE ROW LEVEL SECURITY;

INSERT INTO public.emblem_catalog (emblem_id, unlock_kind, threshold) VALUES
  ('banner_rashidun','default',NULL),
  ('banner_umayyad','default',NULL),
  ('banner_abbasid','default',NULL),
  ('banner_andalus','default',NULL),
  ('banner_ayyubid','default',NULL),
  ('banner_ottoman','default',NULL),
  ('crescent_star','default',NULL),
  ('calligraphy','default',NULL),
  ('star','default',NULL),
  ('sword','default',NULL),
  ('shield','default',NULL),
  ('scroll','default',NULL),
  ('book','default',NULL),
  ('scholar','default',NULL),
  ('explorer','default',NULL),
  ('cartographer','default',NULL),
  ('museum_curator','default',NULL),
  ('historian','default',NULL),
  ('horseman','default',NULL),
  ('mosque','default',NULL),
  ('castle','default',NULL),
  ('compass','default',NULL),
  ('astrolabe','default',NULL),
  ('ink_pot','default',NULL),
  ('reed_pen','default',NULL),
  ('parchment_stack','default',NULL),
  ('wax_seal','default',NULL),
  ('bound_folio','campaign_count',1),
  ('illuminated_page','coming_soon',NULL),
  ('writing_desk_kit','default',NULL),
  ('paper_maker_screen','default',NULL),
  ('book_stand','default',NULL),
  ('library_ladder','museum_count',25),
  ('codex_chained','coming_soon',NULL),
  ('encyclopedia_stack','campaign_count',5),
  ('compass_dividers','default',NULL),
  ('brass_astrolabe','coming_soon',NULL),
  ('celestial_globe','coming_soon',NULL),
  ('water_clock','default',NULL),
  ('sundial_portable','default',NULL),
  ('balance_scale','default',NULL),
  ('mortar_pestle','default',NULL),
  ('alembic','coming_soon',NULL),
  ('glass_vial_set','default',NULL),
  ('hourglass_bronze','default',NULL),
  ('qibla_compass','coming_soon',NULL),
  ('surveyor_rod','default',NULL),
  ('scimitar','coming_soon',NULL),
  ('spear_lance','default',NULL),
  ('war_bow','coming_soon',NULL),
  ('arrow_quiver','default',NULL),
  ('dagger_khanjar','coming_soon',NULL),
  ('battle_axe','default',NULL),
  ('mace_flanged','default',NULL),
  ('chain_mail','coming_soon',NULL),
  ('helm_conical','default',NULL),
  ('round_shield_leather','coming_soon',NULL),
  ('saddle_ornate','campaign_count',8),
  ('stirrup_pair','default',NULL),
  ('scholar_robe','coming_soon',NULL),
  ('explorer_kit','default',NULL),
  ('cartographer_tools','coming_soon',NULL),
  ('curator_gloves','museum_count',40),
  ('historian_desk','coming_soon',NULL),
  ('horseman_bridle','coming_soon',NULL),
  ('merchant_scales','default',NULL),
  ('poet_diwan','coming_soon',NULL),
  ('physician_kit','coming_soon',NULL),
  ('astronomer_kit','coming_soon',NULL),
  ('judge_seal','coming_soon',NULL),
  ('preacher_pulpit','coming_soon',NULL),
  ('caravan_pack','default',NULL),
  ('minaret_tower','coming_soon',NULL),
  ('mihrab_niche','coming_soon',NULL),
  ('desert_fortress','default',NULL),
  ('caravanserai','coming_soon',NULL),
  ('souk_gate','default',NULL),
  ('madrasa','coming_soon',NULL),
  ('observatory_dome','coming_soon',NULL),
  ('hammam','default',NULL),
  ('sabil_fountain','default',NULL),
  ('oasis_palm','default',NULL),
  ('lighthouse_pharos','coming_soon',NULL),
  ('horseshoe_arch','coming_soon',NULL),
  ('geometric_panel','default',NULL),
  ('muqarnas_fragment','coming_soon',NULL),
  ('incense_burner','default',NULL),
  ('crescent_medallion','coming_soon',NULL),
  ('eight_point_star','default',NULL),
  ('royal_tughra','coming_soon',NULL),
  ('signet_ring','coming_soon',NULL),
  ('persian_carpet','museum_count',50),
  ('silk_bolt','default',NULL),
  ('ceramic_tile','default',NULL),
  ('brass_lantern','default',NULL),
  ('gold_dinar_coin','coming_soon',NULL),
  ('silver_dirham_coin','default',NULL),
  ('trade_ledger','default',NULL),
  ('merchant_seal_stamp','coming_soon',NULL),
  ('spice_chest','coming_soon',NULL),
  ('saffron_pouch','default',NULL),
  ('date_basket','default',NULL),
  ('frankincense_resin','default',NULL),
  ('myrrh_bundle','default',NULL),
  ('coffee_dallah','museum_count',60),
  ('dhow_ship','coming_soon',NULL),
  ('anchor_stone','default',NULL),
  ('kamal_navigator','coming_soon',NULL),
  ('mariners_astrolabe','coming_soon',NULL),
  ('pearl_diver_basket','coming_soon',NULL),
  ('water_skin_qirba','default',NULL),
  ('wind_rose_chart','coming_soon',NULL),
  ('star_chart_manuscript','coming_soon',NULL),
  ('silk_road_map','campaign_count',10),
  ('mathematics_treatise','coming_soon',NULL),
  ('medical_herbarium','coming_soon',NULL),
  ('arabian_horse_portrait','coming_soon',NULL),
  ('falcon_hood','coming_soon',NULL),
  ('desert_rose_crystal','museum_count',30),
  ('camel_saddlebag','default',NULL),
  ('water_clock_jazari','coming_soon',NULL),
  ('pigeon_letter_case','coming_soon',NULL),
  ('banner_prophetic','coming_soon',NULL),
  ('banner_seljuk','coming_soon',NULL),
  ('banner_zengid','coming_soon',NULL),
  ('banner_mamluk','coming_soon',NULL),
  ('ayyubid_eagle','coming_soon',NULL),
  ('mamluk_blazon','coming_soon',NULL),
  ('seljuk_star_tile','museum_count',70),
  ('caliph_throne','coming_soon',NULL),
  ('royal_firman','coming_soon',NULL),
  ('diwan_register','coming_soon',NULL),
  ('kharaj_scroll','coming_soon',NULL),
  ('waqf_deed','coming_soon',NULL),
  ('mazalim_petition','coming_soon',NULL),
  ('hisba_manual','default',NULL),
  ('muhtasib_staff','coming_soon',NULL),
  ('bayt_al_mal_chest','coming_soon',NULL),
  ('province_map','coming_soon',NULL),
  ('barid_horn','default',NULL),
  ('postal_satchel','default',NULL),
  ('vizier_khilaa','coming_soon',NULL),
  ('tiraz_textile','museum_count',80),
  ('hajj_mahmal','coming_soon',NULL),
  ('minbar_panel','museum_count',90),
  ('mosque_lamp','coming_soon',NULL),
  ('fresco_fragment','museum_count',100)
ON CONFLICT (emblem_id) DO UPDATE
  SET unlock_kind = EXCLUDED.unlock_kind,
      threshold   = EXCLUDED.threshold,
      updated_at  = now();

-- ------------------------------------------------------------
-- Equip authority. Real ledgers only; no second progression system.
--   campaign_count -> public.user_campaign_completions
--   museum_count   -> public.user_collection
-- The emblem a player already wears is ALWAYS allowed, so no legacy
-- owner (including the 1,134 legacy `kaaba` profiles) is ever stripped.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.emblem_is_equippable_v1(p_uid uuid, p_emblem text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_kind text;
  v_threshold integer;
  v_current text;
BEGIN
  IF p_uid IS NULL OR p_emblem IS NULL OR length(p_emblem) = 0 THEN
    RETURN false;
  END IF;

  SELECT avatar_id INTO v_current FROM public.profiles WHERE id = p_uid;
  IF v_current IS NOT NULL AND v_current = p_emblem THEN
    RETURN true;  -- legacy / already-equipped ownership is preserved
  END IF;

  SELECT unlock_kind, threshold INTO v_kind, v_threshold
    FROM public.emblem_catalog WHERE emblem_id = p_emblem;

  IF v_kind IS NULL THEN
    RETURN false;               -- unknown id
  ELSIF v_kind = 'default' THEN
    RETURN true;
  ELSIF v_kind = 'coming_soon' THEN
    RETURN false;               -- not implemented; cannot be forged
  ELSIF v_kind = 'campaign_count' THEN
    RETURN (SELECT count(DISTINCT campaign_id) FROM public.user_campaign_completions
             WHERE user_id = p_uid) >= COALESCE(v_threshold, 2147483647);
  ELSIF v_kind = 'museum_count' THEN
    RETURN (SELECT count(*) FROM public.user_collection
             WHERE user_id = p_uid) >= COALESCE(v_threshold, 2147483647);
  END IF;

  RETURN false;
END;
$fn$;

REVOKE ALL ON FUNCTION public.emblem_is_equippable_v1(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.emblem_is_equippable_v1(uuid, text) TO authenticated;

-- ------------------------------------------------------------
-- The counts the client evaluator uses, so client copy and server
-- enforcement can never disagree.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_emblem_state_v1()
RETURNS TABLE (campaigns_completed integer, museum_items integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT
    (SELECT count(DISTINCT campaign_id)::int FROM public.user_campaign_completions WHERE user_id = auth.uid()),
    (SELECT count(*)::int FROM public.user_collection WHERE user_id = auth.uid())
  WHERE auth.uid() IS NOT NULL;
$fn$;

REVOKE ALL ON FUNCTION public.get_my_emblem_state_v1() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_emblem_state_v1() TO authenticated;

-- ------------------------------------------------------------
-- sync_my_public_stats — LIVE definition, single semantic change:
-- avatar_id is refused (leaving the current emblem untouched) when the
-- server does not consider it owned. Refusal is silent so an unrelated
-- stat sync / offline replay is never blocked.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_my_public_stats(p_stats jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  v_xp int;
  v_dinars int;
  v_current_avatar text;
  v_avatar text;
  g record;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;

  SELECT LEAST(GREATEST(COALESCE((p_stats->>'xp')::int, xp), 0), 100000000),
         LEAST(GREATEST(COALESCE((p_stats->>'dinars')::int, dinars), 0), 100000000),
         avatar_id
    INTO v_xp, v_dinars, v_current_avatar
    FROM public.profiles WHERE id = uid FOR UPDATE;

  -- An admin adjustment stays pending until the client demonstrably knows
  -- about it (pushed value has caught up to the expected value). Until then
  -- the stale client push is corrected up to the expected value instead of
  -- erasing the adjustment. Safety valve: grants older than 7 days expire.
  FOR g IN
    SELECT * FROM public.admin_balance_grants
     WHERE user_id = uid AND consumed_at IS NULL
     ORDER BY created_at
  LOOP
    IF g.field = 'xp' THEN
      IF v_xp < g.expected_value THEN
        v_xp := g.expected_value;
      ELSE
        UPDATE public.admin_balance_grants SET consumed_at = now() WHERE id = g.id;
      END IF;
    ELSE
      IF v_dinars < g.expected_value THEN
        v_dinars := g.expected_value;
      ELSE
        UPDATE public.admin_balance_grants SET consumed_at = now() WHERE id = g.id;
      END IF;
    END IF;
    IF g.created_at < now() - interval '7 days' THEN
      UPDATE public.admin_balance_grants SET consumed_at = now() WHERE id = g.id;
    END IF;
  END LOOP;

  -- V17-08: server-side emblem authority.
  v_avatar := NULLIF(LEFT(p_stats->>'avatar_id', 64), '');
  IF v_avatar IS NOT NULL
     AND v_avatar IS DISTINCT FROM v_current_avatar
     AND NOT public.emblem_is_equippable_v1(uid, v_avatar) THEN
    v_avatar := NULL;  -- refused: keep the emblem the player already owns
  END IF;

  UPDATE public.profiles SET
    bio                 = COALESCE(LEFT(NULLIF(p_stats->>'bio',''), 500), bio),
    title               = COALESCE(LEFT(NULLIF(p_stats->>'title',''), 100), title),
    level               = LEAST(GREATEST(COALESCE((p_stats->>'level')::int, level), 0), 999),
    xp                  = v_xp,
    dinars              = v_dinars,
    hearts              = LEAST(GREATEST(COALESCE((p_stats->>'hearts')::int, hearts), 0), 5),
    -- V17-04B: `streak` intentionally NOT assigned here. The ledger
    -- (public.user_streak_days) via record_streak_activity_v16 is the only
    -- writer of the streak mirror. A client-supplied p_stats->>'streak' is
    -- ignored.
    campaigns_completed = LEAST(GREATEST(COALESCE((p_stats->>'campaigns_completed')::int, campaigns_completed), 0), 100000),
    artifacts_collected = LEAST(GREATEST(COALESCE((p_stats->>'artifacts_collected')::int, artifacts_collected), 0), 100000),
    discovery_pct       = LEAST(GREATEST(COALESCE((p_stats->>'discovery_pct')::int, discovery_pct), 0), 100),
    favorite_state_id   = COALESCE(NULLIF(p_stats->>'favorite_state_id',''),  favorite_state_id),
    favorite_figure_id  = COALESCE(NULLIF(p_stats->>'favorite_figure_id',''), favorite_figure_id),
    avatar_id           = COALESCE(v_avatar, avatar_id),
    last_active         = now()
  WHERE id = uid;
END;
$function$;
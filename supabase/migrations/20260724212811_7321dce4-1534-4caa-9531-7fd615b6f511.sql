
-- Ensure production_status has a safe default so legacy editors and any
-- future INSERT path cannot violate the NOT NULL constraint.
ALTER TABLE public.stories
  ALTER COLUMN production_status SET DEFAULT 'writing'::public.story_production_status;

-- Backfill any historically-NULL rows defensively (no-op if column enforced NOT NULL already).
UPDATE public.stories SET production_status = 'writing'
WHERE production_status IS NULL;

-- Update admin_upsert_story to include production_status in the INSERT (using the
-- column default when not supplied) and to preserve the existing value on UPDATE
-- unless the caller explicitly supplies a new one.
CREATE OR REPLACE FUNCTION public.admin_upsert_story(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid  uuid := auth.uid();
  v_id   text := NULLIF(p_payload->>'id','');
  v_slug text := NULLIF(p_payload->>'slug','');
  v_prod public.story_production_status := NULL;
  v_row  public.stories;
BEGIN
  IF v_uid IS NULL OR NOT public.is_content_editor() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_id IS NULL OR v_slug IS NULL THEN
    RAISE EXCEPTION 'invalid_payload:id_and_slug_required';
  END IF;
  IF v_id !~ '^[a-z0-9_-]{3,80}$' THEN
    RAISE EXCEPTION 'invalid_id_format';
  END IF;

  IF (p_payload ? 'production_status')
     AND NULLIF(p_payload->>'production_status','') IS NOT NULL THEN
    v_prod := (p_payload->>'production_status')::public.story_production_status;
  END IF;

  INSERT INTO public.stories AS s (
    id, slug, title_ar, title_en, summary_ar, summary_en,
    world_slug, era, display_order, unlock_spec,
    cover_media_id, xp_reward, dinar_reward, metadata,
    production_status
  ) VALUES (
    v_id,
    v_slug,
    COALESCE(p_payload->>'title_ar', ''),
    NULLIF(p_payload->>'title_en',''),
    NULLIF(p_payload->>'summary_ar',''),
    NULLIF(p_payload->>'summary_en',''),
    NULLIF(p_payload->>'world_slug',''),
    NULLIF(p_payload->>'era',''),
    COALESCE((p_payload->>'display_order')::integer, 0),
    COALESCE(p_payload->'unlock_spec', '{"type":"always"}'::jsonb),
    NULLIF(p_payload->>'cover_media_id','')::uuid,
    COALESCE((p_payload->>'xp_reward')::integer, 0),
    COALESCE((p_payload->>'dinar_reward')::integer, 0),
    COALESCE(p_payload->'metadata', '{}'::jsonb),
    COALESCE(v_prod, 'writing'::public.story_production_status)
  )
  ON CONFLICT (id) DO UPDATE SET
    slug              = EXCLUDED.slug,
    title_ar          = EXCLUDED.title_ar,
    title_en          = EXCLUDED.title_en,
    summary_ar        = EXCLUDED.summary_ar,
    summary_en        = EXCLUDED.summary_en,
    world_slug        = EXCLUDED.world_slug,
    era               = EXCLUDED.era,
    display_order     = EXCLUDED.display_order,
    unlock_spec       = EXCLUDED.unlock_spec,
    cover_media_id    = EXCLUDED.cover_media_id,
    xp_reward         = EXCLUDED.xp_reward,
    dinar_reward      = EXCLUDED.dinar_reward,
    metadata          = EXCLUDED.metadata,
    production_status = COALESCE(v_prod, s.production_status),
    updated_at        = now()
  RETURNING * INTO v_row;
  RETURN jsonb_build_object('ok', true, 'story', to_jsonb(v_row));
END;
$function$;

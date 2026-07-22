
CREATE OR REPLACE FUNCTION public.admin_set_artifact_rarity(
  _ids uuid[],
  _rarity text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
  _actor_email text;
  _row record;
  _old text;
  _updated int := 0;
  _skipped int := 0;
  _items jsonb := '[]'::jsonb;
BEGIN
  IF _actor IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_role(_actor, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Forbidden: admin role required' USING ERRCODE = '42501';
  END IF;
  IF _rarity NOT IN ('common','rare','epic','legendary') THEN
    RAISE EXCEPTION 'Invalid rarity: %', _rarity USING ERRCODE = '22023';
  END IF;
  IF _ids IS NULL OR array_length(_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('updated',0,'skipped',0,'items','[]'::jsonb);
  END IF;

  SELECT email INTO _actor_email FROM auth.users WHERE id = _actor;

  FOR _row IN
    SELECT id, entity_type, slug, title, metadata, enabled
    FROM public.encyclopedia_entities
    WHERE id = ANY(_ids)
  LOOP
    IF _row.entity_type <> 'artifact' THEN
      _skipped := _skipped + 1;
      _items := _items || jsonb_build_object('id',_row.id,'ok',false,'reason','not_artifact');
      CONTINUE;
    END IF;

    _old := COALESCE(_row.metadata->>'rarity','');

    UPDATE public.encyclopedia_entities
    SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('rarity', _rarity),
        updated_at = now()
    WHERE id = _row.id;

    _updated := _updated + 1;
    _items := _items || jsonb_build_object(
      'id', _row.id, 'slug', _row.slug, 'title', _row.title,
      'ok', true, 'old', _old, 'new', _rarity,
      'changed', (_old IS DISTINCT FROM _rarity)
    );
  END LOOP;

  INSERT INTO public.admin_audit_log(actor_id, actor_email, action, detail)
  VALUES (
    _actor, _actor_email, 'artifact_rarity_set',
    jsonb_build_object('rarity', _rarity, 'requested', array_length(_ids,1),
                       'updated', _updated, 'skipped', _skipped, 'items', _items)
  );

  RETURN jsonb_build_object('updated',_updated,'skipped',_skipped,'items',_items);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_artifact_rarity(uuid[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_artifact_rarity(uuid[], text) TO authenticated;

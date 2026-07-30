CREATE TABLE public.user_campaign_intros (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  campaign_id TEXT NOT NULL,
  intro_version INTEGER NOT NULL DEFAULT 1,
  story_id TEXT,
  status TEXT NOT NULL DEFAULT 'started' CHECK (status IN ('started','completed','skipped')),
  last_scene_index INTEGER NOT NULL DEFAULT 0,
  first_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, campaign_id, intro_version)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_campaign_intros TO authenticated;
GRANT ALL ON public.user_campaign_intros TO service_role;

ALTER TABLE public.user_campaign_intros ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own campaign intros"
  ON public.user_campaign_intros FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.record_campaign_intro_v1(
  p_campaign_id TEXT,
  p_intro_version INTEGER DEFAULT 1,
  p_story_id TEXT DEFAULT NULL,
  p_status TEXT DEFAULT 'started',
  p_last_scene_index INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_version INTEGER := GREATEST(1, COALESCE(p_intro_version, 1));
  v_scene INTEGER := GREATEST(0, COALESCE(p_last_scene_index, 0));
  v_row public.user_campaign_intros;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;
  IF p_campaign_id IS NULL OR btrim(p_campaign_id) = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_campaign_id');
  END IF;
  IF COALESCE(p_status, '') NOT IN ('started','completed','skipped') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_status');
  END IF;

  INSERT INTO public.user_campaign_intros AS t (
    user_id, campaign_id, intro_version, story_id, status, last_scene_index,
    resolved_at
  ) VALUES (
    v_uid, btrim(p_campaign_id), v_version, NULLIF(btrim(COALESCE(p_story_id,'')), ''),
    p_status, v_scene,
    CASE WHEN p_status = 'started' THEN NULL ELSE now() END
  )
  ON CONFLICT (user_id, campaign_id, intro_version) DO UPDATE
  SET
    story_id = COALESCE(t.story_id, EXCLUDED.story_id),
    status = CASE
      WHEN t.status = 'completed' THEN 'completed'
      WHEN EXCLUDED.status = 'completed' THEN 'completed'
      WHEN t.status = 'skipped' THEN 'skipped'
      ELSE EXCLUDED.status
    END,
    last_scene_index = GREATEST(t.last_scene_index, EXCLUDED.last_scene_index),
    resolved_at = CASE
      WHEN t.resolved_at IS NOT NULL THEN t.resolved_at
      WHEN EXCLUDED.status IN ('completed','skipped') THEN now()
      ELSE NULL
    END,
    updated_at = now()
  RETURNING t.* INTO v_row;

  RETURN jsonb_build_object(
    'ok', true,
    'campaign_id', v_row.campaign_id,
    'intro_version', v_row.intro_version,
    'story_id', v_row.story_id,
    'status', v_row.status,
    'last_scene_index', v_row.last_scene_index,
    'first_started_at', v_row.first_started_at,
    'resolved_at', v_row.resolved_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.list_my_campaign_intros()
RETURNS TABLE (
  campaign_id TEXT,
  intro_version INTEGER,
  story_id TEXT,
  status TEXT,
  last_scene_index INTEGER,
  first_started_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT campaign_id, intro_version, story_id, status, last_scene_index,
         first_started_at, resolved_at
  FROM public.user_campaign_intros
  WHERE user_id = auth.uid()
  ORDER BY updated_at DESC
  LIMIT 2000;
$$;

REVOKE ALL ON FUNCTION public.record_campaign_intro_v1(TEXT, INTEGER, TEXT, TEXT, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_my_campaign_intros() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_campaign_intro_v1(TEXT, INTEGER, TEXT, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_campaign_intros() TO authenticated;
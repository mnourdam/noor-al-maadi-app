-- ============================================================
-- P6 Step 1 — Reactions ("استزدتُ")
-- ------------------------------------------------------------
-- Source of truth: public.social_reactions.
-- Denormalized cache: public.stories.reaction_count (trigger-maintained).
-- Anchor abstraction is deliberately generic so Encyclopedia
-- (and future educational anchors) reuse the same table + RPC.
-- Toggle is exposed as a single RPC: toggle_reaction_v2.
-- ============================================================

-- 1) Anchor enum (extend later via ALTER TYPE ... ADD VALUE)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'social_anchor_type') THEN
    CREATE TYPE public.social_anchor_type AS ENUM ('story');
  END IF;
END$$;

-- 2) Reactions table (single primitive: استزدتُ)
CREATE TABLE IF NOT EXISTS public.social_reactions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  anchor_type  public.social_anchor_type NOT NULL,
  anchor_id    UUID NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, anchor_type, anchor_id)
);

CREATE INDEX IF NOT EXISTS social_reactions_anchor_idx
  ON public.social_reactions (anchor_type, anchor_id);
CREATE INDEX IF NOT EXISTS social_reactions_user_idx
  ON public.social_reactions (user_id);

-- 3) GRANTs — counts are public per §4.3, so SELECT to authenticated.
--    No anon grant: guests cannot see reactor identities or toggle.
GRANT SELECT, INSERT, DELETE ON public.social_reactions TO authenticated;
GRANT ALL ON public.social_reactions TO service_role;

-- 4) RLS — auth.uid() owns rows; reads are open to authenticated.
ALTER TABLE public.social_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reactions_select_authenticated"
  ON public.social_reactions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "reactions_insert_own"
  ON public.social_reactions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "reactions_delete_own"
  ON public.social_reactions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 5) Denormalized counter on stories (cache only — never source of truth)
ALTER TABLE public.stories
  ADD COLUMN IF NOT EXISTS reaction_count INTEGER NOT NULL DEFAULT 0;

-- 6) Trigger — keeps stories.reaction_count in sync. Anchor-agnostic
--    dispatch: today only 'story' updates a target table; new anchor
--    types add an ELSIF branch here without touching the RPC contract.
CREATE OR REPLACE FUNCTION public.social_reactions_sync_counter()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_anchor public.social_anchor_type;
  v_id     UUID;
  v_delta  INTEGER;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_anchor := NEW.anchor_type;
    v_id     := NEW.anchor_id;
    v_delta  := 1;
  ELSIF TG_OP = 'DELETE' THEN
    v_anchor := OLD.anchor_type;
    v_id     := OLD.anchor_id;
    v_delta  := -1;
  ELSE
    RETURN NULL;
  END IF;

  IF v_anchor = 'story' THEN
    UPDATE public.stories
       SET reaction_count = GREATEST(0, COALESCE(reaction_count, 0) + v_delta)
     WHERE id = v_id;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS social_reactions_sync_counter_ins ON public.social_reactions;
DROP TRIGGER IF EXISTS social_reactions_sync_counter_del ON public.social_reactions;

CREATE TRIGGER social_reactions_sync_counter_ins
  AFTER INSERT ON public.social_reactions
  FOR EACH ROW EXECUTE FUNCTION public.social_reactions_sync_counter();

CREATE TRIGGER social_reactions_sync_counter_del
  AFTER DELETE ON public.social_reactions
  FOR EACH ROW EXECUTE FUNCTION public.social_reactions_sync_counter();

-- 7) Single-operation toggle RPC. Idempotent, atomic, one call site.
--    Returns { active, count } derived from the source of truth after
--    the mutation. Enforces anchor existence for 'story'.
CREATE OR REPLACE FUNCTION public.toggle_reaction_v2(
  p_anchor_type public.social_anchor_type,
  p_anchor_id   UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_exists BOOLEAN;
  v_active BOOLEAN;
  v_count  INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  -- Anchor existence check per type.
  IF p_anchor_type = 'story' THEN
    IF NOT EXISTS (SELECT 1 FROM public.stories WHERE id = p_anchor_id) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'anchor_not_found');
    END IF;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.social_reactions
     WHERE user_id = v_uid
       AND anchor_type = p_anchor_type
       AND anchor_id   = p_anchor_id
  ) INTO v_exists;

  IF v_exists THEN
    DELETE FROM public.social_reactions
     WHERE user_id = v_uid
       AND anchor_type = p_anchor_type
       AND anchor_id   = p_anchor_id;
    v_active := false;
  ELSE
    INSERT INTO public.social_reactions (user_id, anchor_type, anchor_id)
    VALUES (v_uid, p_anchor_type, p_anchor_id)
    ON CONFLICT (user_id, anchor_type, anchor_id) DO NOTHING;
    v_active := true;
  END IF;

  -- Count from source of truth, not from the cache.
  SELECT COUNT(*)::INT
    INTO v_count
    FROM public.social_reactions
   WHERE anchor_type = p_anchor_type
     AND anchor_id   = p_anchor_id;

  RETURN jsonb_build_object(
    'ok',     true,
    'active', v_active,
    'count',  v_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.toggle_reaction_v2(public.social_anchor_type, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.toggle_reaction_v2(public.social_anchor_type, UUID) TO authenticated;

-- 8) Rebuild function — recomputes the denormalized cache from the
--    source of truth. Idempotent; safe to run any time a drift is
--    suspected. Admin/service_role only.
CREATE OR REPLACE FUNCTION public.rebuild_reaction_counters()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stories INTEGER;
BEGIN
  WITH truth AS (
    SELECT anchor_id, COUNT(*)::INT AS c
      FROM public.social_reactions
     WHERE anchor_type = 'story'
     GROUP BY anchor_id
  )
  UPDATE public.stories s
     SET reaction_count = COALESCE(t.c, 0)
    FROM (
      SELECT s2.id, COALESCE(truth.c, 0) AS c
        FROM public.stories s2
        LEFT JOIN truth ON truth.anchor_id = s2.id
    ) AS t
   WHERE s.id = t.id
     AND s.reaction_count IS DISTINCT FROM t.c;

  GET DIAGNOSTICS v_stories = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'stories_updated', v_stories);
END;
$$;

REVOKE ALL ON FUNCTION public.rebuild_reaction_counters() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rebuild_reaction_counters() TO service_role;

-- 9) Batch helper — fetch { count, active } for a set of anchors in
--    a single round-trip. Reads counts from the source of truth so
--    even a stale cache never leaks into the client.
CREATE OR REPLACE FUNCTION public.get_reactions_for_anchors_v2(
  p_anchor_type public.social_anchor_type,
  p_anchor_ids  UUID[]
)
RETURNS TABLE (anchor_id UUID, count INTEGER, active BOOLEAN)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    a.id AS anchor_id,
    COALESCE(c.c, 0)::INT AS count,
    COALESCE(mine.active, false) AS active
  FROM unnest(p_anchor_ids) AS a(id)
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::INT AS c
      FROM public.social_reactions r
     WHERE r.anchor_type = p_anchor_type
       AND r.anchor_id   = a.id
  ) c ON true
  LEFT JOIN LATERAL (
    SELECT true AS active
      FROM public.social_reactions r
     WHERE r.anchor_type = p_anchor_type
       AND r.anchor_id   = a.id
       AND r.user_id     = auth.uid()
     LIMIT 1
  ) mine ON true;
$$;

REVOKE ALL ON FUNCTION public.get_reactions_for_anchors_v2(public.social_anchor_type, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_reactions_for_anchors_v2(public.social_anchor_type, UUID[]) TO authenticated;
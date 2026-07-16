-- ============================================================
-- user_entity_discoveries — per-user encyclopedia read ledger
-- Distinct from user_collection (ownership/awards).
-- ============================================================

CREATE TABLE public.user_entity_discoveries (
  user_id              uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_id            uuid        NOT NULL REFERENCES public.encyclopedia_entities(id) ON DELETE CASCADE,
  entity_slug          text        NOT NULL,
  entity_type          text        NOT NULL,
  source               text,
  first_discovered_at  timestamptz NOT NULL DEFAULT now(),
  last_viewed_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, entity_id)
);

CREATE INDEX user_entity_discoveries_user_idx
  ON public.user_entity_discoveries (user_id);
CREATE INDEX user_entity_discoveries_user_slug_idx
  ON public.user_entity_discoveries (user_id, entity_slug);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_entity_discoveries TO authenticated;
GRANT ALL ON public.user_entity_discoveries TO service_role;

ALTER TABLE public.user_entity_discoveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_discoveries_select"
  ON public.user_entity_discoveries
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "own_discoveries_insert"
  ON public.user_entity_discoveries
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own_discoveries_update"
  ON public.user_entity_discoveries
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own_discoveries_delete"
  ON public.user_entity_discoveries
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.investigation_qa_status (
  investigation_id uuid PRIMARY KEY REFERENCES public.investigations(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'needs_review'
    CHECK (status IN ('needs_review','in_review','golden','needs_rebuild')),
  note text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.investigation_qa_status TO authenticated;
GRANT ALL ON public.investigation_qa_status TO service_role;

ALTER TABLE public.investigation_qa_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "qa_status_editor_read" ON public.investigation_qa_status
  FOR SELECT TO authenticated USING (public.is_content_editor());
CREATE POLICY "qa_status_editor_insert" ON public.investigation_qa_status
  FOR INSERT TO authenticated WITH CHECK (public.is_content_editor());
CREATE POLICY "qa_status_editor_update" ON public.investigation_qa_status
  FOR UPDATE TO authenticated USING (public.is_content_editor()) WITH CHECK (public.is_content_editor());
CREATE POLICY "qa_status_admin_delete" ON public.investigation_qa_status
  FOR DELETE TO authenticated USING (public.is_content_admin());

CREATE OR REPLACE FUNCTION public.admin_set_investigation_qa_status(
  p_id uuid,
  p_status text,
  p_note text DEFAULT NULL
) RETURNS public.investigation_qa_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.investigation_qa_status;
BEGIN
  IF NOT public.is_content_editor() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF p_status NOT IN ('needs_review','in_review','golden','needs_rebuild') THEN
    RAISE EXCEPTION 'invalid status %', p_status;
  END IF;

  INSERT INTO public.investigation_qa_status (investigation_id, status, note, updated_by, updated_at)
  VALUES (p_id, p_status, p_note, auth.uid(), now())
  ON CONFLICT (investigation_id) DO UPDATE
    SET status = EXCLUDED.status,
        note = COALESCE(EXCLUDED.note, public.investigation_qa_status.note),
        updated_by = auth.uid(),
        updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_investigation_qa_status()
RETURNS SETOF public.investigation_qa_status
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.investigation_qa_status
  WHERE public.is_content_editor();
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_investigation_qa_status(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_investigation_qa_status() TO authenticated;
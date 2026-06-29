
WITH refs AS (
  SELECT jsonb_array_elements_text(COALESCE(data->'metadata'->'core_entities','[]'::jsonb)) AS ref
    FROM public.admin_campaigns
  UNION ALL
  SELECT jsonb_array_elements_text(COALESCE(data->'metadata'->'supporting_entities','[]'::jsonb))
    FROM public.admin_campaigns
  UNION ALL
  SELECT jsonb_array_elements_text(COALESCE(ch->'rewards'->'unlocks','[]'::jsonb))
    FROM public.admin_campaigns,
         jsonb_array_elements(COALESCE(data->'chapters','[]'::jsonb)) ch
),
parsed AS (
  SELECT DISTINCT
    NULLIF(
      CASE WHEN position(':' IN ref) > 0
           THEN substring(ref FROM position(':' IN ref) + 1)
           ELSE ref
      END, '') AS slug
  FROM refs
),
to_enable AS (
  SELECT e.id, e.slug, e.entity_type
  FROM public.encyclopedia_entities e
  JOIN parsed p ON p.slug = e.slug
  WHERE e.enabled = false
),
updated AS (
  UPDATE public.encyclopedia_entities e
     SET enabled = true,
         updated_at = now(),
         metadata = COALESCE(metadata,'{}'::jsonb)
           || jsonb_build_object(
                'auto_published_at', to_jsonb(now()),
                'auto_published_reason','unlock-integrity-repair'
              )
    FROM to_enable t
   WHERE e.id = t.id
  RETURNING e.slug, e.entity_type
)
INSERT INTO public.admin_audit_log (action, detail, reason)
SELECT 'unlock-integrity-repair',
       jsonb_build_object(
         'enabled_count', (SELECT count(*) FROM updated),
         'entities', COALESCE((SELECT jsonb_agg(jsonb_build_object('slug', slug, 'type', entity_type)) FROM updated), '[]'::jsonb)
       ),
       'auto-enabled entities referenced by campaign unlocks';

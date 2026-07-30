UPDATE public.admin_campaigns SET data = jsonb_set(data, '{section_key}', to_jsonb(v.key), true), updated_at = now()
FROM (VALUES
  ('div_mqz2e3px','prophetic'),
  ('div_mqz2eoss','rashidun'),
  ('div_ms0d1toq','umayyad'),
  ('div_ms0d2my0','abbasid'),
  ('div_mqz2lt38','andalus'),
  ('div_ms0d35dj','crusades'),
  ('div_mqz30tgc','mongols_mamluks'),
  ('div_ms0d3foe','ottoman')
) AS v(id, key)
WHERE public.admin_campaigns.id = v.id AND public.admin_campaigns.data->>'kind' = 'divider';
update public.admin_campaigns
set data = jsonb_set(
      jsonb_set(
        jsonb_set(coalesce(data,'{}'::jsonb), '{section_key}', '"prophetic"'::jsonb, true),
        '{intro_story_id}', '"story_mecca_before_the_conquest"'::jsonb, true),
      '{intro_version}', '1'::jsonb, true),
    updated_at = now()
where id = 'conquest-of-makkah-campaign';
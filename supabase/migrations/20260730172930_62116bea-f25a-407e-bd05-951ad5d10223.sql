UPDATE public.stories
SET tags = array_append(tags, 'campaign-intro'),
    updated_at = now()
WHERE metadata->>'kind' = 'campaign_intro'
  AND NOT ('campaign-intro' = ANY(tags));

UPDATE public.admin_campaigns c
SET data = c.data - 'intro_story_id',
    updated_at = now()
WHERE c.data ? 'intro_story_id'
  AND NOT EXISTS (
    SELECT 1 FROM public.stories s WHERE s.id = c.data->>'intro_story_id'
  );
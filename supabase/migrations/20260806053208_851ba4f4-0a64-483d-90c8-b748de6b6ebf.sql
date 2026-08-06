create or replace function public.get_content_manifest()
returns table (
  collection text,
  total_count bigint,
  last_updated timestamp with time zone
) 
language sql
stable
security definer
set search_path = public
as $$
  -- Encyclopedia
  select 'encyclopedia_entities'::text, count(*), max(updated_at) 
  from public.encyclopedia_entities 
  where enabled = true
  
  union all
  
  -- Campaigns
  select 'admin_campaigns'::text, count(*), max(updated_at) 
  from public.admin_campaigns
  
  union all
  
  -- Investigations
  select 'investigations'::text, count(*), max(updated_at) 
  from public.investigations 
  where enabled = true
  
  union all
  
  -- Stories core
  select 'stories'::text, count(*), max(updated_at) 
  from public.stories 
  where status = 'published'
  
  union all
  
  -- Story Scenes
  select 'story_scenes'::text, count(*), max(updated_at) 
  from public.story_scenes
  
  union all
  
  -- Story Media
  select 'story_media'::text, count(*), max(updated_at) 
  from public.story_media 
  where verified = true
  
  union all
  
  -- Atlas
  select 'atlas_entities'::text, count(*), max(updated_at) 
  from public.atlas_entities 
  where status = 'published' and aps_verified = true
$$;

grant execute on function public.get_content_manifest() to anon, authenticated;

SELECT 
  world_slug, 
  COUNT(*) as count 
FROM public.investigations 
GROUP BY world_slug;

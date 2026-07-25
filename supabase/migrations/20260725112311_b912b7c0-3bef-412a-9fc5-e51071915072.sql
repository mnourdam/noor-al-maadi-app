update public.admin_campaigns
set key_art_path = id || '/key-art-v1.jpg',
    updated_at = now()
where id in (
  'muawiya-and-state-building',
  'umayyad-siege-of-constantinople',
  'arabization-and-reforms-of-abd-almalik',
  'conquest-of-sindh-and-transoxiana',
  'umayyad-golden-age'
);
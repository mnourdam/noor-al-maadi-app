update public.admin_campaigns
set key_art_path = id || '/key-art-v1.jpg',
    updated_at = now()
where id in (
  'ridda-wars-campaign',
  'futuh-iraq',
  'futuh-al-sham',
  'great-conquests-yarmouk-qadisiyyah',
  'madain-and-nihawand'
);
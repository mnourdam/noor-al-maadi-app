update public.admin_campaigns
set key_art_path = id || '/key-art-v1.jpg',
    updated_at = now()
where id in (
  'conquest-of-egypt',
  'uthman-and-quran-standardization',
  'martyrdom-of-umar-and-caliphate-of-uthman',
  'ali-and-the-great-fitnah',
  'rise-of-the-umayyad-state'
);
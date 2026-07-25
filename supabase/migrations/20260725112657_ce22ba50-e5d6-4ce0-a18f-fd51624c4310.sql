UPDATE public.admin_campaigns
SET key_art_path        = id || '/key-art-v1.jpg',
    key_art_square_path = id || '/key-art-square-v1.jpg',
    key_art_credit      = COALESCE(key_art_credit, 'Irth Campaign Key Art Style v1'),
    key_art_source      = COALESCE(key_art_source, 'irth-internal:key-art-batch-7')
WHERE id IN (
  'battle-of-tours',
  'fall-of-umayyads',
  'founding-of-abbasid-state',
  'baghdad-capital-of-the-world',
  'harun-alrashid',
  'almamun-translation-movement'
);
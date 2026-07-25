UPDATE public.admin_campaigns SET
  key_art_path = id || '/key-art-v1.jpg',
  key_art_square_path = id || '/key-art-square-v1.jpg'
WHERE id IN (
  'peak-of-umayyad-power',
  'conquest-of-al-andalus',
  'abd-al-rahman-al-dakhil',
  'umayyad-caliphate-in-al-andalus',
  'cordoba-golden-age'
);
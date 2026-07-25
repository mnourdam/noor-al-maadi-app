UPDATE public.admin_campaigns
SET key_art_square_path = split_part(key_art_path, '/', 1) || '/key-art-square-v1.jpg',
    updated_at = now()
WHERE key_art_path IS NOT NULL
  AND key_art_square_path IS NULL;
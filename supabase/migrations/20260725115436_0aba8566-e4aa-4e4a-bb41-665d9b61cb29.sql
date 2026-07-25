UPDATE public.admin_campaigns
SET key_art_path = id || '/key-art-v1.jpg',
    key_art_square_path = id || '/key-art-square-v1.jpg',
    key_art_credit = 'Irth Campaign Key Art Style v1'
WHERE id IN ('al-zahir-baybars-and-the-revival-of-islamic-power','mamluk-sultanate','rise-of-the-ottoman-state','ottoman-expansion-anatolia-balkans','battle-of-kosovo');
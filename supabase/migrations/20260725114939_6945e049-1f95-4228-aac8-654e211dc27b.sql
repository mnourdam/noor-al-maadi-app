UPDATE public.admin_campaigns
SET key_art_path = id || '/key-art-v1.jpg',
    key_art_square_path = id || '/key-art-square-v1.jpg',
    key_art_credit = 'Irth Campaign Key Art Style v1'
WHERE id IN ('taifa-kings','fall-of-toledo','battle-of-zallaqa','fall-of-al-andalus','crusades-beginning-danger');
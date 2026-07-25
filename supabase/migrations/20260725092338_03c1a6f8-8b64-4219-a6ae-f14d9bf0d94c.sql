ALTER TABLE public.admin_campaigns
  ADD COLUMN IF NOT EXISTS key_art_path        text,
  ADD COLUMN IF NOT EXISTS key_art_square_path text,
  ADD COLUMN IF NOT EXISTS key_art_credit      text,
  ADD COLUMN IF NOT EXISTS key_art_source      text;

COMMENT ON COLUMN public.admin_campaigns.key_art_path        IS 'Storage path in campaign-key-art bucket (16:9 hero). Never store signed URLs — resolve at runtime.';
COMMENT ON COLUMN public.admin_campaigns.key_art_square_path IS 'Storage path in campaign-key-art bucket (1:1 square derivative).';

-- ============================================================
-- 1) Extend the frozen anchor enum with 'comment' (additive).
-- ============================================================
ALTER TYPE public.social_anchor_type ADD VALUE IF NOT EXISTS 'comment';

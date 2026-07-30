
INSERT INTO public.stories (
  id, slug, title_ar, summary_ar, world_slug, era, display_order, status,
  content_version, unlock_spec, xp_reward, dinar_reward, category, rarity,
  production_status, lock_visibility, historical_confidence,
  hijri_start_year, hijri_end_year, time_precision, length_class, tags,
  snapshot_tier, published_at, metadata
) VALUES (
  'story_intro_conquest_of_makkah',
  'intro-conquest-of-makkah',
  'فتح مكة — الافتتاحية',
  'افتتاحية سينمائية قصيرة تسبق حملة فتح مكة.',
  'prophetic', 'prophetic', 9000, 'published',
  1, '{"type":"always"}'::jsonb, 0, 0, 'event', 'standard',
  'completed', 'visible', 'established',
  8, 8, 'year', 'short', ARRAY['campaign-intro','conquest-of-makkah-campaign'],
  'standard', now(),
  jsonb_build_object('kind','campaign_intro','campaign_id','conquest-of-makkah-campaign')
)
ON CONFLICT (id) DO UPDATE SET
  title_ar = EXCLUDED.title_ar, status = 'published', tags = EXCLUDED.tags,
  metadata = EXCLUDED.metadata, updated_at = now();

WITH m(ord, sha, bytes) AS (
  VALUES
    (1,'8074e30f1ee7dfba59328d7d8583e8e9a728bf5a2dfd01b1fb66e219f4923739',69488),
    (2,'d647a3019af662c4f7dea080c87e32b074c976ef094f73f04e1961516a66bad7',55174),
    (3,'d96a3cfdf3bb4c31e9a185185dfcdfed78f11a7414a8a6cc1d09cd8eef47446c',76230),
    (4,'8f4db58be8cbaaee4bfd547ba40aa8efa599e81b6dd6f73bc06650bb900a8082',70018),
    (5,'df7510db447e783f836929404b025a4634bc464f8a81cdc3df3018400269db30',112426),
    (6,'0afe347a7984d5f40a17bd281195b9bcf0d2f1ab5311870a5e1aacac95af4e0c',66632)
)
INSERT INTO public.story_media (
  id, story_id, kind, storage_bucket, storage_path, mime_type, byte_size,
  width, height, checksum_sha256, preset, processing_version, verified,
  verified_at, owner_scope, metadata
)
SELECT
  ('00000000-0000-4000-8000-0000000000' || lpad(m.ord::text, 2, '0'))::uuid,
  'story_intro_conquest_of_makkah', 'scene', 'story-media',
  'story.scene.v1/v1/' || left(m.sha, 2) || '/' || m.sha || '.webp',
  'image/webp', m.bytes, 893, 1403, m.sha, 'story.scene.v1', 1, true,
  now(), 'story',
  jsonb_build_object('quality', 0.76, 'degraded', false, 'scene_order', m.ord)
FROM m
ON CONFLICT (id) DO UPDATE SET
  storage_path = EXCLUDED.storage_path,
  checksum_sha256 = EXCLUDED.checksum_sha256,
  byte_size = EXCLUDED.byte_size,
  verified = true, updated_at = now();

UPDATE public.stories
   SET cover_media_id = '00000000-0000-4000-8000-000000000001'::uuid
 WHERE id = 'story_intro_conquest_of_makkah';

WITH s(idx, title_ar, body_ar, caption_ar) AS (
  VALUES
    (0, 'مكة — السنة الثامنة',
        'وادٍ بين جبالٍ عارية، وبيتٌ حجريّ في وسطه. مدينةٌ تعرف أن شيئًا قادم، ولا تعرف متى.',
        'الثامنة للهجرة.'),
    (1, 'ليلةٌ نُقض فيها العهد',
        'صلحُ الحديبية انكسر في ليلة واحدة. وقبل الفجر خرج راكبٌ إلى المدينة يحمل الخبر.',
        'ما عاد الهدوء ممكنًا.'),
    (2, 'عشرة آلاف نار',
        'في مرّ الظهران اشتعلت آلاف النيران دفعةً واحدة. نظرت قريش إلى الأفق... وفهمت.',
        'أقرب جيشٍ رأته مكة في تاريخها.'),
    (3, 'أربعة طرق إلى الوادي',
        'دخل الجيش من أربع جهات في فجرٍ واحد. والأمر كان واحدًا: لا قتال إلا على من قاتل.',
        'فتحٌ بلا معركة تُذكر.'),
    (4, 'حول البيت',
        'طاف الفتح حول بيتٍ حاصرته الأصنام قرونًا... فسقطت واحدًا بعد واحد.',
        'عودة المكان إلى معناه.'),
    (5, 'كلمة واحدة',
        'وأمام أهل مكة، كان يملك ثأر عشرين عامًا. فاختار كلمةً أخرى.',
        'من هنا تبدأ حملتك.')
)
INSERT INTO public.story_scenes (
  id, story_id, scene_index, scene_type, title_ar, payload, primary_media_id, schema_version
)
SELECT
  'scene_intro_conquest_of_makkah_' || s.idx,
  'story_intro_conquest_of_makkah',
  s.idx, 'reveal', s.title_ar,
  jsonb_build_object(
    'template', 'cinematic',
    'body_ar', s.body_ar,
    'caption_ar', s.caption_ar,
    'transition', CASE WHEN s.idx = 0 THEN 'fade' ELSE 'dissolve' END
  ),
  ('00000000-0000-4000-8000-0000000000' || lpad((s.idx + 1)::text, 2, '0'))::uuid,
  2
FROM s
ON CONFLICT (id) DO UPDATE SET
  title_ar = EXCLUDED.title_ar,
  payload = EXCLUDED.payload,
  primary_media_id = EXCLUDED.primary_media_id,
  updated_at = now();

UPDATE public.admin_campaigns
   SET data = data
        || jsonb_build_object('intro_story_id', 'story_intro_conquest_of_makkah')
        || jsonb_build_object('intro_version', 1)
 WHERE id = 'conquest-of-makkah-campaign';

-- ============================================================
-- Reference Story enrichment: "وفاة النبي ﷺ"
-- Rewrites metadata + scenes for the flagship story wfaa-alnby-raq7.
-- Idempotent: safe to re-run; scenes are DELETEd then re-inserted.
-- ============================================================

DO $$
DECLARE
  v_story_id text := 'wfaa-alnby-raq7';
  v_cover uuid := 'f6e9f74d-4923-4464-be4e-174e5ab111e8';
  v_img_a uuid := '7b05d640-7746-45bc-aa5b-846b872bbe2a';
  v_img_b uuid := '3edd3dd8-ff45-4e66-8209-0890274633cf';
  v_metadata jsonb;
BEGIN
  -- Guard: story must exist
  IF NOT EXISTS (SELECT 1 FROM public.stories WHERE id = v_story_id) THEN
    RAISE EXCEPTION 'reference story % not found', v_story_id;
  END IF;

  v_metadata := jsonb_build_object(
    'chapter', 'السيرة النبوية — الفصل الأخير',
    'tags', jsonb_build_array('سيرة','النبي محمد','المدينة','السنة الحادية عشرة','وفاة'),
    'reading_time_minutes', 6,
    'curated_by', 'محررو إرث',
    'hijri_year', 11,
    'gregorian_year', 632,
    'location', jsonb_build_object('ar','المدينة المنورة','en','Madinah'),
    'references', jsonb_build_object(
      'primary', jsonb_build_array(
        jsonb_build_object(
          'title','صحيح البخاري — كتاب المغازي، باب مرض النبي ﷺ ووفاته',
          'author','محمد بن إسماعيل البخاري',
          'year','256هـ'),
        jsonb_build_object(
          'title','صحيح مسلم — كتاب الفضائل، باب في وفاة النبي ﷺ',
          'author','مسلم بن الحجاج',
          'year','261هـ'),
        jsonb_build_object(
          'title','السيرة النبوية لابن هشام — ذكر مرض رسول الله ﷺ ووفاته',
          'author','عبد الملك بن هشام',
          'year','213هـ')
      ),
      'secondary', jsonb_build_array(
        jsonb_build_object(
          'title','البداية والنهاية — المجلد الخامس',
          'author','ابن كثير الدمشقي',
          'year','774هـ'),
        jsonb_build_object(
          'title','تاريخ الرسل والملوك — الطبري',
          'author','محمد بن جرير الطبري',
          'year','310هـ'),
        jsonb_build_object(
          'title','الرحيق المختوم',
          'author','صفي الرحمن المباركفوري',
          'year','1979م')
      ),
      'notes','رُوجعت الروايات على الصحيحين وسيرة ابن هشام؛ حُذفت الأخبار الضعيفة والشاذة.'
    ),
    'relations', jsonb_build_object(
      'encyclopedia_entities', jsonb_build_array(
        '49e1a213-353d-4ef3-bfae-07cb709f4cdc',  -- المدينة المنورة (city)
        '332bb410-1315-4e72-b80c-236e79dd1157',  -- أبو بكر الصديق (figure)
        'e3f5ea2a-49fc-4994-a87f-f0acca03232d'   -- عائشة رضي الله عنها (figure)
      ),
      'worlds', jsonb_build_array('prophetic')
    ),
    'sensitivity', jsonb_build_object(
      'no_face_depiction', true,
      'reverence_notice','لا تُصوَّر ملامح النبي ﷺ في أي مشهد.'
    )
  );

  -- 1) Enrich the story row + attach cover + bump content_version
  UPDATE public.stories
     SET title_ar        = 'وفاة النبي ﷺ',
         title_en        = 'The Passing of the Prophet ﷺ',
         summary_ar      = 'الأيام الأخيرة من حياة رسول الله ﷺ في المدينة المنورة: بداية المرض، خطبته الأخيرة، لحظاته مع عائشة وأبي بكر، ثم انتقاله إلى الرفيق الأعلى. رواية موثّقة من الصحيحين وابن هشام.',
         summary_en      = 'The final days of the Prophet Muhammad ﷺ in Madinah — from the onset of illness to his last sermon, his final moments with Aisha and Abu Bakr, and his passing. Sourced from Bukhari, Muslim and Ibn Hisham.',
         world_slug      = 'prophetic',
         era             = '11هـ / 632م',
         display_order   = 1,
         xp_reward       = 120,
         dinar_reward    = 80,
         cover_media_id  = v_cover,
         unlock_spec     = '{"type":"always"}'::jsonb,
         metadata        = v_metadata,
         content_version = GREATEST(content_version, 1) + 1,
         status          = 'published',
         published_at    = COALESCE(published_at, now())
   WHERE id = v_story_id;

  -- 2) Replace scenes: wipe + re-insert 6 authored scenes
  DELETE FROM public.story_scenes WHERE story_id = v_story_id;

  INSERT INTO public.story_scenes
    (id, story_id, scene_index, scene_type, title_ar, title_en, primary_media_id, payload)
  VALUES
    -- Scene 1 — reading (layout A): the illness begins
    ('scene_01_almrd',  v_story_id, 0, 'reading',
     'بداية المرض', 'The Illness Begins', v_img_a,
     jsonb_build_object(
       'body_ar', 'في أواخر صفر من السنة الحادية عشرة للهجرة، عاد النبي ﷺ من جنازة في البقيع وقد أصابه صداع شديد. اشتدّ عليه الوجع في بيت ميمونة، ثم استأذن أزواجه أن يُمَرَّض في بيت عائشة، فأَذِنَّ له. خرج بين رجلين تخُطّ قدماه الأرض حتى دخل بيتها.',
       'caption_ar', 'من صحيح البخاري، كتاب المغازي.',
       'transition', 'dissolve'
     )),

    -- Scene 2 — perspective (layout B): Aisha remembers
    ('scene_02_aisha', v_story_id, 1, 'perspective',
     'من عين عائشة', 'From Aisha''s Eyes', v_img_b,
     jsonb_build_object(
       'speaker_ar', 'عائشة أم المؤمنين رضي الله عنها',
       'body_ar', 'كان ﷺ إذا اشتكى منَّا الإنسانُ مسحه بيمينه، فلما ثقل جعلتُ أمسح عنه بيده، رجاءَ بركتها. رأيتُه يقول: «مع الذين أنعم الله عليهم من النبيّين والصدّيقين والشهداء والصالحين»، فعلمتُ أنه خُيِّر فاختار.',
       'transition', 'blur'
     )),

    -- Scene 3 — document (layout D): last sermon quoted
    ('scene_03_alkhtba', v_story_id, 2, 'document',
     'الوصية الأخيرة', 'The Last Counsel', v_img_a,
     jsonb_build_object(
       'template','quote',
       'quote_ar','«الصلاةَ الصلاةَ، وما ملكت أيمانُكم».',
       'body_ar','في آخر ساعاته، خرج ﷺ إلى الناس معصوبَ الرأس، فجلس على المنبر وقال ما قال، وكانت آخرَ وصيّةٍ يُبلّغها لأمّته: تعظيمُ الصلاة، والرفقُ بمن تحت اليد. ثم رجع إلى بيته، ولم يخرج بعدها.',
       'caption_ar','رواه أحمد وابن ماجه بإسناد صحيح.',
       'transition','paper'
     )),

    -- Scene 4 — reading (layout A): final moments
    ('scene_04_alshfa', v_story_id, 3, 'reading',
     'اللحظات الأخيرة', 'The Final Moments', v_img_b,
     jsonb_build_object(
       'body_ar','دخل عبد الرحمن بن أبي بكر ومعه سواك، فنظر إليه النبي ﷺ، فأخذته عائشة فقضمته وطيّبته له، فاستنّ به. كان بين يديه رَكوةٌ فيها ماء، يُدخل يديه فيمسح بهما وجهه ويقول: «لا إله إلا الله، إنّ للموت سكرات».',
       'caption_ar','متفق عليه من حديث عائشة.',
       'transition','dissolve'
     )),

    -- Scene 5 — reveal (layout C): the passing
    ('scene_05_alrfyq', v_story_id, 4, 'reveal',
     'إلى الرفيق الأعلى', 'To the Highest Companion', v_img_a,
     jsonb_build_object(
       'body_ar','رفع ﷺ إصبعه، وشخص بصره نحو سقف البيت، وسُمِعت شفتاه تتحرّكان بكلمات هامسة: «مع الذين أنعم الله عليهم… اللهم الرفيقَ الأعلى». مالت يده. سكن النَّفَس. كان ذلك يوم الاثنين، ضحى ربيع الأول، سنة إحدى عشرة.',
       'caption_ar','من صحيح البخاري، كتاب الرقاق.',
       'transition','blur'
     )),

    -- Scene 6 — reflection (layout F): a prompt to the reader
    ('scene_06_altamul', v_story_id, 5, 'reflection',
     'ما بقي منه ﷺ', 'What Remains of Him ﷺ', NULL,
     jsonb_build_object(
       'template','quote',
       'prompt_ar','ماذا تركَ فيك النبيُّ ﷺ اليوم؟ اكتبْ خاطرةً قصيرة تحفظها لنفسك، لا للنشر.',
       'body_ar','قال أبو بكر رضي الله عنه لأصحابه: «مَن كان يعبدُ محمدًا فإنّ محمدًا قد مات، ومَن كان يعبدُ اللهَ فإنّ اللهَ حيٌّ لا يموت». مات الرجل، وبقيت الرسالة. ما الأثر الذي تحمله أنت منها؟',
       'transition','calm'
     ));

  RAISE NOTICE 'reference story % enriched: 6 scenes, cover attached, published', v_story_id;
END $$;
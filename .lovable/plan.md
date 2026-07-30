# افتتاحيات الحملات + خلفيات صوتية حسب القسم — تصميم معماري (بدون تنفيذ)

## 1) تدقيق البنية الحالية

**الصوت** — `src/lib/audioManager.ts` فيه بالفعل نظام طبقات:
`AmbienceLayer = "global" | "campaign" | "investigation"` مع `startCrossfade()` (~1500ms)، تخفيف لكل طبقة (`LAYER_ATTENUATION`)، إعدادات محفوظة (`irth_audio_settings`)، احترام الكتم/الوضع الصامت (`deviceAllowsAudio`)، ووضع Android فائق الاستقرار. لكن مصدر الحملة ثابت: `CAMPAIGN_AMBIENCE_SRC = "/audio/campaign-ambient.mp3"`، و`AudioInitializer.tsx` يختار الطبقة من المسار فقط (`layerForRoute`). لا يوجد أي ربط بالقسم.

**الحملات** — `Campaign` فيها `worldSlug?` و`era?` (اختياريان أصلًا). الدخول عبر `campaigns.imported.$id.index.tsx` ثم `...chapter.$chapter.tsx`. التقدم في `importedCampaignProgress` + `campaignLedger`.

**القصص** — Story Engine كامل: `StoryPlayer.tsx` (مشاهد، انتقالات، Reflection، RewardMoment)، `fetchStoryAccess` / `recordStoryProgress` / `completeStory`، `list_stories_v3` (منشور فقط)، `unlock_spec` v2، استيراد/تصدير v2، أغلفة أوفلاين. جدول `stories` فيه `metadata jsonb`.

**العزل** — `src/lib/identity/*` يوفّر `physicalKey(logicalKey, owner)` وتقسيم localStorage تلقائيًا.

## 2) التصميم المقترح

```text
Campaign.sectionKey ─► SECTION_AUDIO_THEMES ─► audioManager.setAmbienceLayer("campaign", themeId)
Campaign.intro_story_id ─► stories(kind='campaign_intro') ─► StoryPlayer (introMode)
CampaignIntroState (owner-partitioned) ─► يقرر: تشغيل تلقائي / دخول مباشر / استئناف
```

طبقتان جديدتان فقط، لا نظام قصص موازٍ:

- `src/lib/audio/campaignThemes.ts` — خريطة قسم → ملف صوتي + `CampaignAudioThemeManager` رقيق فوق `audioManager`.
- `src/lib/campaigns/intro/*` — `resolve.ts` (أي افتتاحية؟), `state.ts` (سجل المشاهدة), `flags.ts`.

### الخلفية الصوتية
الأقسام الثمانية المعتمدة تُربط بمفاتيح العوالم الحالية: prophetic, rashidun, umayyad, abbasid, andalus, crusades, mongols-mamluks (mamluk-sultanate)، ottoman. يُشتق `sectionKey` من `campaign.worldSlug` مع خريطة تطبيع، وOverride اختياري لاحق `campaign.audio_theme_id?`.

توسعة `audioManager` (إضافية فقط): `setCampaignTheme(themeId | null)` تُبدّل مصدر مسار طبقة `campaign` **مع crossfade** بدل قطع/تشغيل ملفين. إن كان `themeId` نفسه ⇒ no-op كامل (لا إعادة تشغيل عند التنقل بين حملتين من نفس القسم). لا ملف للقسم ⇒ لا صوت حملة (تبقى الطبقة العامة كما هي اليوم). لا تُوضع روابط داخل الفصول أو الأنشطة إطلاقًا.

### الافتتاحية
- توسعة `stories`: `kind` ضمن `metadata` أو عمود جديد `story_kind text not null default 'standalone'`. المفضّل: عمود مع default ⇒ كل الصفوف الحالية standalone تلقائيًا.
- `list_stories_v3` وكل قوائم/بحث اللاعب تُصفّي `story_kind = 'standalone'`. الإدارة فقط ترى `campaign_intro`.
- `campaign_intro`: لا شروط فتح مستقلة (تُتجاهل `unlock_spec`)، لا XP/دنانير/مقتنيات، لا `user_story_completions`، لا يدخل Journey ولا Related Stories.
- `StoryPlayer` يقبل `mode?: "standalone" | "campaign_intro"` — في وضع intro: يُخفى Reward/Journey، ويظهر «تخطي والبدء» دائمًا و«ابدأ الحملة» في المشهد الأخير، والخروج يستدعي `onIntroResolved(reason)`.

## 3) الجداول والحقول الجديدة

```sql
alter table public.stories
  add column if not exists story_kind text not null default 'standalone'
  check (story_kind in ('standalone','campaign_intro'));

create table public.campaign_intro_states (
  user_id uuid not null,
  campaign_id text not null,
  intro_story_id uuid not null,
  status text not null check (status in ('started','completed','skipped')),
  last_scene_index int not null default 0,
  first_started_at timestamptz not null default now(),
  resolved_at timestamptz,
  primary key (user_id, campaign_id)
);
-- GRANT SELECT,INSERT,UPDATE,DELETE ... TO authenticated;  GRANT ALL ... TO service_role;
-- RLS: user_id = auth.uid() لكل السياسات (لا anon).
```

ربط الحملة: `campaigns.intro_story_id uuid null` (أو حقل اختياري في JSON الحملة `intro_story_id?: string | null` لمسار الاستيراد). كلاهما اختياري تمامًا.

الضيف: نفس الشكل في localStorage تحت مفتاح `irth.campaign.intro.v1` مقسّم بالهوية.

## 4) خطة التوافق الخلفي

- كل الحقول الجديدة اختيارية وذات default ⇒ لا Migration إجباري لأي JSON قديم.
- Import/Export v2 للقصص: يُضاف `story_kind` للمخرجات؛ غيابه في الاستيراد ⇒ `standalone`.
- Export الحملات: يُضاف `intro_story_id` فقط عند وجوده (لا مفاتيح فارغة جديدة في Golden Templates الحالية).
- `admin_validate_*` تقبل الحقلين ولا تشترطهما.

## 5) الأوفلاين

- ملفات الأقسام الصوتية تُبنى ضمن `public/audio/sections/<section>.mp3` (mono 64kbps) local-first مثل مؤثرات التحقيقات؛ فشل التحميل ⇒ الطبقة تُعلَّم failed مرة واحدة وتستمر الحملة بصمت.
- مشاهد الافتتاحية ووسائطها تدخل نفس Offline Snapshot ومسار أغلفة القصص. وسائط ناقصة أوفلاين ⇒ لا تشغيل تلقائي للافتتاحية؛ الحملة تُفتح مباشرة ويُسجَّل تشخيص، ولا يُكتب أي سجل مشاهدة.
- كتابات `campaign_intro_states` تمر عبر Outbox الحالي (`src/lib/offline/outbox.ts`).

## 6) عزل الهوية

- المفتاح المحلي يمر عبر `physicalKey()` تلقائيًا ⇒ لا تسريب Guest/A/B.
- `resetForIdentityChange()` يُضاف إليه مسح كاش الافتتاحيات في الذاكرة، وإيقاف الافتتاحية الجارية فورًا والعودة إلى صفحة الحملة دون كتابة أي سجل للهوية الجديدة.
- كل كتابة تمر بـ `runOwned()` ⇒ استجابة متأخرة بعد تبديل الحساب تُهمَل.

## 7) مخططات الحالات الحرجة

| الحالة | السلوك |
|---|---|
| حملة بلا افتتاحية | دخول مباشر، صفر استعلامات إضافية |
| أول دخول لحملة لها افتتاحية | تشغيل تلقائي، كتابة `started` قبل المشهد الأول |
| «تخطي والبدء» من المشهد الأول | `skipped` فورًا، بلا نافذة تأكيد، انتقال للحملة |
| إغلاق التطبيق في المنتصف | يبقى `started`؛ العودة تستأنف من `last_scene_index` مع بقاء التخطي |
| مشاهدة كاملة | `completed` عند «ابدأ الحملة»، ثم الفصل الأول |
| إعادة مشاهدة يدوية | `replay=1`: لا كتابة، لا مكافآت، لا تغيير للسجل |
| حذف الافتتاحية بعد الربط | resolve يعيد null ⇒ حملة عادية + تشخيص |
| وسائط غير متاحة أوفلاين | تخطٍّ صامت، لا سجل |
| تعطيل Flag أثناء المشاهدة | الجلسة الحالية تُكمل (استقرار جلسة) ولا تشغيل جديد بعدها |
| تسجيل خروج/تبديل حساب | إغلاق فوري + عدم كتابة عبر الهوية الجديدة |
| Deep Link للحملة | نفس منطق أول دخول (يحترم السجل) |
| ضغط سريع مكرر على «ابدأ» | حارس `resolvingRef` + كتابة Idempotent (upsert بمفتاح مركّب) |

الرجوع (Android Back) أثناء الافتتاحية = إغلاق الافتتاحية والعودة لصفحة الحملة عبر Overlay Stack الحالي — **لا يُكمل الحملة ولا يغيّر أي تقدم**.

## 8) نقاط التكامل الحسّاسة (تأثير مقصود = صفر)

Campaign routing (نقطة قرار واحدة قبل التنقل للفصل) · شروط فتح الحملات (بلا تغيير) · Campaign progress/الاستئناف (بلا تغيير) · Story Renderer (وضع إضافي) · Story progress (لا يُكتب لـ intro) · Import/Export v2 (حقول اختيارية) · Offline Snapshot (إضافة مجموعة) · Identity Isolation (مفاتيح مقسّمة) · Android Back (Overlay) · Audio Manager (API إضافي) · مؤثرات الأنشطة (طبقة SFX منفصلة، غير متأثرة) · Memory Engine (لا مساس بالخطط) · Deep Links (بلا تغيير).

## 9) الملفات التي ستتغيّر

جديدة: `src/lib/audio/campaignThemes.ts` · `src/lib/campaigns/intro/{flags,resolve,state,types}.ts` · `src/components/campaigns/CampaignIntroGate.tsx` · اختبارات `tests/campaigns/intro-state.test.ts`, `tests/audio/section-themes.test.ts`.

معدَّلة (إضافات فقط): `src/lib/audioManager.ts` · `src/components/AudioInitializer.tsx` · `src/types/campaign.ts` · `src/routes/campaigns.imported.$id.index.tsx` (زر ثانوي «إعادة مشاهدة الافتتاحية» + بوابة الدخول) · `src/routes/campaigns.imported.$id.chapter.$chapter.tsx` (تثبيت ثيم القسم) · `src/components/stories/player/StoryPlayer.tsx` (وضع intro) · `src/lib/stories/{summary,admin,import-v2}.ts` (تمرير `story_kind`) · `src/lib/identity/reset.ts` · `src/lib/offline-snapshot.ts` · واجهة إدارة القصص لعرض النوع والربط.

Migration واحدة: عمود `story_kind`، عمود `intro_story_id`، جدول `campaign_intro_states` + GRANT + RLS.

## 10) اختبارات القبول

1. Flags مطفأة ⇒ لا استعلامات جديدة، لا عمود جديد مقروء، سلوك الحملات والقصص مطابق بايت-لبايت لسلوك اليوم (اختبار لقطة على مسار الدخول).
2. الافتتاحية تظهر مرة واحدة لكل (لاعب × حملة) في الحالتين completed/skipped.
3. إعادة المشاهدة لا تغيّر السجل ولا التقدم ولا المكافآت.
4. `campaign_intro` لا يظهر في `/stories` ولا البحث ولا Journey ولا Related.
5. لا XP/دنانير/مقتنيات من الافتتاحية (فحص السجلات بعد المشاهدة).
6. تبديل الحساب أثناء الافتتاحية: لا تسريب سجل، A ≠ B ≠ Guest.
7. الانتقال بين حملتين من نفس القسم لا يعيد تشغيل الموسيقى؛ من قسم مختلف يعمل crossfade بلا تراكب.
8. الكتم/مستوى الصوت/الوضع الصامت يحكم الثيم كما يحكم الطبقات الحالية.
9. قسم بلا ملف صوتي ⇒ حملة صامتة بلا أخطاء.
10. حذف القصة المرتبطة ⇒ الحملة تعمل، تشخيص فقط، بلا Crash.
11. Android Back ورجوع النظام أثناء الافتتاحية لا يغيّران أي تقدم.
12. Import/Export قديم بدون الحقول الجديدة يمر Dry Run وApply بنجاح.

## إثبات الرجوع الآمن

`FEATURE_CAMPAIGN_INTROS` و`FEATURE_CAMPAIGN_AUDIO_THEMES` كلٌ منهما Build (`VITE_…`) + Runtime (مفتاح localStorage) على نمط `src/lib/memory/flags.ts`. عند الإطفاء: بوابة الافتتاحية تعيد `null` قبل أي استعلام أو قراءة سجل، و`CampaignAudioThemeManager` لا يستدعي شيئًا فيبقى `CAMPAIGN_AMBIENCE_SRC` الحالي هو مصدر طبقة الحملة. المسارات القديمة تبقى كما هي حرفيًا — الإضافات كلها خلف شرط الـFlag، لا استبدال لأي مسار قائم.

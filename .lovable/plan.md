# افتتاحيات الحملات + موسيقى الأقسام — الخطة النهائية (Rev 2، قبل التنفيذ)

كل ملاحظاتك الأربع + الملاحظات الأصغر مدمجة أدناه. ما لم يُذكر هنا يبقى كما في Rev 1.

## 1) قسم الحملة: حقل صريح، لا استنتاج

**ملغى نهائيًا**: أي اشتقاق من `worldSlug` أو `era` أو `state`. لا خريطة تطبيع.

القيم الثمانية المعتمدة (نهائية، مغلقة):

```ts
export type CampaignSectionKey =
  | "prophetic" | "rashidun" | "umayyad" | "abbasid"
  | "andalus" | "crusades" | "mongols_mamluks" | "ottoman";
```

مصدر الحقيقة = نفس ما تستخدمه واجهة `/campaigns` للتقسيم اليوم: صفوف **Section Divider** (`src/lib/campaigns/entities.ts`) المرتّبة على `chronological_order`. لذلك:

- `CampaignSectionDivider.sectionKey?: CampaignSectionKey` — يُؤلَّف مرة واحدة على الفاصل (ثمانية فواصل فقط تحمله).
- الحملة ترث `section_key` من الفاصل الذي تنتمي إليه في نفس التجميع الذي ترسمه الصفحة الآن — تجميع واحد، لا تصنيف ثانٍ.
- `Campaign.sectionKey?: CampaignSectionKey` — **Override صريح اختياري** للحالات الشاذة (حملة زنكية داخل قسم الحروب الصليبية مثلًا). أولوية القرار: `campaign.sectionKey` ← `divider.sectionKey` ← `null`.
- `null` ⇒ لا موسيقى قسم (الطبقة العامة كما اليوم). لا تخمين إطلاقًا.
- دالة واحدة `resolveCampaignSection(campaign, dividerIndex)` في `src/lib/campaigns/sections.ts` هي المستهلك الوحيد؛ أي قراءة أخرى ممنوعة.
- `era` / `worldSlug` / `state` لا تتغيّر ولا تُقرأ في هذا المسار.

أدوات الإدارة: حقل اختيار للفاصل + Override في محرر الحملة، وتقرير «حملات بلا قسم» في `/admin/campaign-order`.

## 2) دورة حياة الصوت — Campaign Context هو المالك

المالك مكوّن واحد `CampaignAudioScope` يُركَّب في **layout مسار الحملة** (`src/routes/campaigns.tsx` → فرع `imported/$id`)، لا في صفحة الفصل.

```text
/campaigns (قائمة)          → layer=campaign، theme=null (الوضع الحالي حرفيًا)
        │
        ▼ فتح حملة
/campaigns/imported/$id     → mount CampaignAudioScope
                              resolveCampaignSection() → setCampaignTheme("abbasid")
                              crossfade 1500ms من global/الثيم السابق
        │
        ▼ CampaignIntroGate يفتح الافتتاحية (نفس الشجرة، overlay)
StoryPlayer (introMode)     → لا لمس للصوت إطلاقًا. الموسيقى مستمرة كما هي.
        │
        ▼ «ابدأ الحملة» أو «تخطي والبدء»
/campaigns/imported/$id/chapter/$c
                            → نفس الـScope (لم يُفكَّك) ⇒ setCampaignTheme نفس القيمة ⇒ no-op تام
                              لا إعادة تشغيل، لا فجوة، لا إعادة تحميل للمصدر
        │
        ▼ الانتقال إلى حملة أخرى من نفس القسم
                            → themeId متطابق ⇒ no-op، الصوت يستمر بلا انقطاع
        ▼ حملة من قسم آخر
                            → crossfade إلى الملف الجديد (لا تراكب، مؤقّت واحد)
        ▼ مغادرة سياق الحملة كليًا (خروج من layout)
                            → unmount ⇒ setCampaignTheme(null) + العودة إلى global بـcrossfade
```

- الافتتاحية **لا تملك** الصوت ولا تبدأه ولا توقفه؛ هي مستهلك سلبي. لذلك يستحيل أن تُعرض بلا موسيقى قسمها.
- إن فُتحت الافتتاحية عبر Deep Link مباشر، فالـScope يُركَّب قبلها في نفس الشجرة (layout أعلى)، فالترتيب مضمون.
- API الجديد على `audioManager` (إضافي فقط): `setCampaignTheme(themeId: string | null)` — يُبدّل مصدر مسار طبقة `campaign` بـcrossfade، no-op عند التطابق. `setAmbienceLayer` كما هو.
- الملفات: `public/audio/sections/<section_key>.mp3` (mono 64kbps) local-first. ملف مفقود ⇒ `failed` مرة واحدة + صمت، بلا أخطاء.
- الكتم / مستويات الصوت / الوضع الصامت / Android ultra-stable: تُطبَّق من المسار الحالي بلا استثناء.

## 3) `intro_version`

الربط على الحملة:

```ts
intro_story_id?: string | null;
intro_version?: number;   // default 1
```

السجل يحمل `intro_version int not null default 1`، والمفتاح يصبح `(user_id, campaign_id, intro_version)`.

قرار العرض:
- يوجد سجل بنفس `campaign_id` **و** نفس `intro_version` بحالة `completed`/`skipped` ⇒ دخول مباشر.
- `intro_version` أعلى من كل سجلات اللاعب ⇒ افتتاحية جديدة، تُعرض مرة واحدة.
- تغيير `intro_story_id` بلا رفع الإصدار ⇒ **لا** إعادة عرض (قرار مقصود).
- رفع الإصدار = فعل إداري يدوي بحت؛ لا شيء في النظام يرفعه تلقائيًا (لا تعديل نص، ولا استبدال صورة، ولا إعادة استيراد).
- السجلات القديمة تبقى؛ لا حذف، فالتاريخ محفوظ.

## 4) Local-first للتسجيل

قاعدة صارمة: **لا انتظار للشبكة قبل أي انتقال**.

عند «تخطي والبدء» أو «ابدأ الحملة»:
1. `resolvingRef` يمنع النقر المكرر (حارس متزامن قبل أي await).
2. كتابة السجل المحلي فورًا (متزامنة، مقسّمة بالهوية عبر `physicalKey`).
3. `navigate()` فورًا — نفس الإطار، لا Promise شبكي في الطريق.
4. إدراج مهمة Outbox (`src/lib/offline/outbox.ts`) للمزامنة.
5. عند عودة الاتصال: `upsert` idempotent على `(user_id, campaign_id, intro_version)`، «الأقوى يفوز» بترتيب `completed > skipped > started` حتى لا تتراجع الحالة.

`last_scene_index`: كتابة محلية فورية عند كل مشهد، ومزامنة **debounced ~4s + عند الإغلاق/الخروج/إخفاء الصفحة فقط** ⇒ كتابة خادمية واحدة تقريبًا لكل افتتاحية بدل ثماني.

## 5) Kill Switch خادمي حقيقي

جدول `app_config` (key/value jsonb، قراءة عامة للمنشور، كتابة للأدمن فقط) هو المرجع:

- `campaign_intros.enabled`, `campaign_audio_themes.enabled`.
- يُقرأ مرة عند الإقلاع، يُخزَّن في كاش محلي مع TTL ويدخل Offline Snapshot.
- أوفلاين / فشل القراءة ⇒ آخر قيمة معروفة، وإن لم توجد فالافتراضي `false` للميزتين الجديدتين (فشل آمن).
- `VITE_…` يبقى Build-flag للطوارئ فقط. مفتاح localStorage يبقى **أداة تطوير محلية لا غير**، ولا يستطيع تفعيل ميزة أطفأها الخادم.
- الإطفاء الخادمي: لا استعلام، لا قراءة سجل، لا `setCampaignTheme` ⇒ السلوك الحالي حرفيًا.

## 6) جلب الافتتاحية بمعزل عن `list_stories_v3`

`get_campaign_intro_story(p_story_id uuid)` — دالة SECURITY DEFINER مستقلة:
- تُرجع القصة + مشاهدها + وسائطها **فقط** إذا `story_kind = 'campaign_intro'` و`status = 'published'`.
- تتجاهل `unlock_spec` تمامًا (الافتتاحية ليست محتوى مقفولًا)، ولا تكتب تقدمًا ولا تمنح مكافآت.
- تعمل للضيف والمسجَّل، ولا تسرّب أي قصة عادية (فحص النوع أولًا).
- غير موجودة / مسودة / محذوفة ⇒ ترجع `null` ⇒ **الحملة تُفتح مباشرة** + تشخيص، بلا أي خطأ للاعب.

## 7) استبعاد `campaign_intro` من كل سطح Stories

ليس القوائم فقط، بل: `list_stories_v3` · البحث · عدّادات `/stories` والفلاتر · إحصائيات العوالم والقصص · Journey · Related Stories · Achievements المرتبطة بالقصص · Offline covers pack · Export العام. الاستبعاد يُطبَّق في **الدوال الخادمية نفسها** (`status='published' AND story_kind='standalone'`) لا في الواجهة، فلا يمكن نسيان سطح.

زر «إعادة مشاهدة الافتتاحية» يظهر فقط عند: الميزة مفعّلة خادميًا + القصة موجودة ومنشورة من النوع الصحيح + وسائطها متاحة (محليًا أو عبر الشبكة). غير ذلك ⇒ الزر غائب تمامًا. الإعادة لا تكتب سجلًا ولا تغيّر إصدارًا ولا تمنح شيئًا.

## 8) Migration واحدة

```sql
alter table public.stories add column if not exists story_kind text not null default 'standalone'
  check (story_kind in ('standalone','campaign_intro'));

create table public.campaign_intro_states (
  user_id uuid not null,
  campaign_id text not null,
  intro_version int not null default 1,
  intro_story_id uuid not null,
  status text not null check (status in ('started','completed','skipped')),
  last_scene_index int not null default 0,
  first_started_at timestamptz not null default now(),
  resolved_at timestamptz,
  primary key (user_id, campaign_id, intro_version)
);
grant select, insert, update, delete on public.campaign_intro_states to authenticated;
grant all on public.campaign_intro_states to service_role;
alter table public.campaign_intro_states enable row level security;
-- كل السياسات: user_id = auth.uid()  (بلا anon)

create table public.app_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
grant select on public.app_config to anon, authenticated;
grant all on public.app_config to service_role;
alter table public.app_config enable row level security;
-- select للجميع، الكتابة عبر has_role(auth.uid(),'admin') فقط
```

`intro_story_id` / `intro_version` / `section_key` تُخزَّن داخل `admin_campaigns.data` (اختيارية، بلا Migration للحملات).

## 9) الملفات

جديدة: `src/lib/campaigns/sections.ts` · `src/lib/audio/campaignThemes.ts` · `src/lib/campaigns/intro/{types,resolve,state,sync,flags}.ts` · `src/components/campaigns/{CampaignAudioScope,CampaignIntroGate}.tsx` · `src/lib/config/appConfig.ts` · اختبارات `tests/campaigns/{intro-state,section-resolution}.test.ts`, `tests/audio/section-lifecycle.test.ts`.

معدَّلة (إضافات فقط): `src/lib/audioManager.ts` · `src/components/AudioInitializer.tsx` · `src/routes/campaigns.tsx` (تركيب الـScope) · `campaigns.imported.$id.index.tsx` · `campaigns.imported.$id.chapter.$chapter.tsx` · `src/types/campaign.ts` · `src/lib/campaigns/entities.ts` · `StoryPlayer.tsx` (وضع intro) · دوال/واجهات إدارة القصص والحملات · `src/lib/identity/reset.ts` · `src/lib/offline-snapshot.ts` · `src/lib/offline/outbox.ts`.

## 10) القبول (إضافة على قائمة Rev 1)

13. لا يوجد أي قراءة لـ`worldSlug`/`era` في مسار حل القسم (اختبار ثابت على الاستيراد).
14. الموسيقى تبدأ عند فتح صفحة الحملة، وتستمر بلا انقطاع ولا إعادة تشغيل عبر: الافتتاحية → الفصل → فصل آخر؛ ولا تتوقف إلا عند مغادرة سياق الحملة.
15. رفع `intro_version` يعيد العرض مرة واحدة فقط؛ تعديل نص/صورة بلا رفع الإصدار لا يعيده.
16. الانتقال بعد التخطي يحدث في نفس الإطار مع الشبكة مقطوعة، والسجل يُزامَن لاحقًا مرة واحدة.
17. الافتتاحية الواحدة تنتج ≤ 2 كتابة خادمية إجمالًا.
18. إطفاء `app_config` خادميًا يعطّل الميزة حتى لو كان مفتاح localStorage مفعّلًا.
19. `get_campaign_intro_story` ترفض أي `story_kind='standalone'` وأي مسودة.
20. مقارنة عدّادات `/stories` قبل/بعد إدخال افتتاحيات = صفر فرق.

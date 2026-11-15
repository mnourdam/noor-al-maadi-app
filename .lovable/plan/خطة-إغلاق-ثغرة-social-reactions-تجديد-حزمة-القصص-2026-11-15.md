# خطة: إغلاق ثغرة social_reactions + تجديد حزمة القصص

## الحالة الفعلية (تم التحقق قراءةً فقط)
- سياسة `reactions_select_authenticated`: SELECT لـ authenticated بشرط `true` — مؤكد، أي مستخدم يقرأ كل التفاعلات.
- صلاحيات authenticated على الجدول: SELECT + TRUNCATE (لا INSERT/UPDATE/DELETE). anon: لا شيء.
- الدوال `toggle_reaction_v2` و`list_comments_v2` و`social_reactions_sync_counter` كلها SECURITY DEFINER، فلا تتأثر بتضييق السياسة → العدّ و"قلبي" يستمران.
- الـ migrations من نوع Supabase SQL بمعرّفات زمنية (`supabase/migrations/`, 278 ملفاً، آخرها 20260905143448). أداة التطبيق تطبّق migration واحدة فقط ولا تعيد تشغيل القديمة.
- bucket `story-media` خاص (public=false) — مؤكد.

## الجزء 1: إصلاح الصلاحيات
Migration واحدة صغيرة فقط، لا تلمس أي صف:
```sql
REVOKE TRUNCATE ON public.social_reactions FROM authenticated;
DROP POLICY IF EXISTS reactions_select_authenticated ON public.social_reactions;
CREATE POLICY reactions_select_own ON public.social_reactions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
```
- قبل التطبيق: فحص أن الواجهة لا تقرأ الجدول مباشرة لصفوف الآخرين (البحث في الكود)، وحفظ تعريف السياسة الحالية كخط رجوع.
- الرجوع (عند الحاجة فقط، migration منفصلة):
  `DROP POLICY reactions_select_own ...; CREATE POLICY reactions_select_authenticated ... USING (true); GRANT TRUNCATE ... TO authenticated;`
- التحقق بعده: `has_table_privilege` (TRUNCATE=false)، `pg_policies`، عدد الصفوف قبل/بعد مطابق، تجربة قلب/إلغاء قلب وعرض العدد على تعليق كمستخدم مسجّل، والـ linter.

## الجزء 2: تجديد حزمة القصص
الآلية الموجودة: `npm run release:android:prepare` → `scripts/build-story-media-pack.mjs` + توليد المحتوى، تقرأ `SUPABASE_SERVICE_ROLE_KEY` من البيئة فقط، تنزّل الصور من الـ bucket الخاص بالطلب الإداري (لا روابط عامة)، تحوّلها WebP في `public/story-media/` وتكتب `manifest.json` بالبصمات، ثم تختم `release/story-artifact-approval.json` آخراً.
- التنفيذ: تشغيل نفس السكربت في البيئة التي يتوفر فيها المفتاح كسرّ بناء (لا يُطبع ولا يُكتب في ملف). لن يتغير الـ bucket ولا يصبح عاماً.
- إثبات الاكتمال: عدد القصص/المشاهد/الصور، صفر صور مفقودة، تطابق sha256 لكل ملف مع manifest، تطابق بصمة manifest مع ختم الموافقة، اختبار رفض عند العبث، وعمر الحزمة 0 يوم.
- لا تعديل لمنطق التطبيق أو الحزم أو أرقام الإصدار.

## ما أنفذه مباشرة بعد الموافقة
- كتابة وتطبيق migration الجزء 1 والتحقق منها.
- تشغيل سكربت الحزمة إن كان المفتاح متاحاً كسرّ في بيئة التنفيذ، والتحقق من البصمات.

## ما يحتاج موافقتك/قرارك
- الموافقة على هذه الخطة (تغيير صلاحيات قاعدة الإنتاج — البيئة نفسها تخدم المعاينة والنشر).
- إن لم يكن المفتاح متاحاً لي، يجب تشغيل الأمر على جهاز الإصدار عندك؛ لا أستطيع ولن أطلب قيمته.
- لا نشر في أي خطوة.

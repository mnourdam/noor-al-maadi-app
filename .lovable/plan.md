# Memory Engine — محرك تثبيت المعلومات (تصميم فقط)

طبقة Runtime مستقلة تعرض للاعب أحيانًا **عنصر مراجعة واحدًا** (ReviewItem) مأخوذًا من محتوى أتمّه سابقًا — بدأ اليوم بالحملات، وينمو لاحقًا للتحقيقات والقصص والموسوعة والتحديات — دون أي تعديل على الحملات أو الفصول أو الأنشطة أو منطق التقدم أو الـGolden Template. تعطيل الطبقة عبر flag واحد يُعيد السلوك 100% لما هو عليه الآن.

الاسم: **Memory Engine** (سابقًا Review Engine) — يعكس أنه ليس مجرد مراجعة، بل محرك تثبيت متعدد الأنماط (مراجعات، تكرار متباعد، تذكيرات، تحديات لاحقًا).

---

## 1) المبدأ الأساس: نربط بالمعلومة، لا بالحملة

الوحدة الذرية = **ReviewItem** بمعرّف مستقر مستقل عن المصدر:

```ts
type SourceType = "campaign" | "investigation" | "story" | "museum" | "daily_challenge";

interface ReviewItem {
  id: string;                 // hash(source_type + source_id + local_ref) — مستقر
  sourceType: SourceType;
  sourceId: string;           // campaignId / investigationId / storyId / ...
  localRef: string;           // activityId / questionId / factId داخل المصدر
  kind: "mcq" | "true_false" | "ordering" | "matching" | "fill_blank";
  prompt: string;
  options?: string[];
  correctAnswer: unknown;
  originalXp: number;         // لحساب مكافأة المراجعة
  era?: string;
  tags?: string[];
}
```

أي مزوّد مستقبلي (Story/Investigation) يُنتج نفس الشكل — المحرك لا يعرف ولا يهتم بمصدر العنصر.

---

## 2) البنية (Modules)

```
src/lib/memory/
  types.ts                    ReviewItem, Attempt, ScheduleDecision, Provider
  providers/
    index.ts                  registerProvider(), listItemsForOwner()
    campaignProvider.ts       المزود الأول (قراءة فقط من campaignStorage)
    # مستقبلًا: storyProvider.ts, investigationProvider.ts, museumProvider.ts
  bank.ts                     تجميع العناصر من كل المزودين + كاش
  eligibility.ts              فلترة عناصر مؤهلة للاعب الحالي
  scheduler.ts                قرار deterministic بموقع الحقن
  selector.ts                 اختيار عنصر واحد بأولويات + منع تكرار
  spacing.ts                  حساب next-due عبر SM-2 مبسّط
  history.ts                  attempts + due dates (partitioned per owner)
  rewards.ts                  حساب XP المتغير
  index.ts                    الواجهة العامة

src/components/memory/
  ReviewActivity.tsx          يُقدَّم كـ Activity كامل داخل نفس Renderer
  ReviewActivityCard.tsx      عرض السؤال والخيارات
```

---

## 3) الحقن: كـ Runtime Activity، لا Overlay

**المبدأ**: الفصل يبقى في JSON كما هو. عند تشغيل الفصل نبني نسخة runtime من `chapter.activities` تُضاف فيها **Injected Activities** في مواقع محسوبة. JSON الأصلي لا يُلمس، ولا يُحفظ Injected في `completedActivityIds` ولا في أي storage للحملات.

```ts
// داخل play/chapter runtime فقط:
const runtimeActivities = injectReviewActivities(chapter.activities, {
  campaignId, chapterId, ownerKey, dateKey,
});
// runtimeActivities: (Activity | InjectedReviewActivity)[]
```

`InjectedReviewActivity` يحمل علامة `__injected: true` ومعرّف مؤقت `review:<itemId>`. `ActivityRenderer` يعرف هذا النوع الواحد الجديد ويستدعي `<ReviewActivity/>`. لا Overlay، لا تعديل على Navigation/Hearts/Focus/Back. تفاعلات النشاط تمر عبر نفس دورة الحياة الحالية.

**ماذا يتغير في محرك الحملات؟** لا شيء في بيانات الحملة. فقط `ActivityRenderer` يضيف حالة واحدة: `if (activity.type === "__memory_review__") return <ReviewActivity/>;`. هذا التعديل الوحيد المسموح خارج `src/lib/memory/` — سطر case واحد.

**الحماية**:
- `completeActivity` و `claimActivityReward` و `recordActivity` لا تُستدعى للـInjected.
- `currentIdx` يحسب على `runtimeActivities.length` لكن `allDone` يحسب على الأنشطة الأصلية فقط — لا تأثير على شرط إكمال الفصل.
- لو عُطّل الـflag: `injectReviewActivities` تُرجع المصفوفة الأصلية كما هي.

---

## 4) الجدولة (Deterministic Scheduler)

لا احتمالات. القاعدة:

- عنصر مراجعة يُحقن **قبل** كل نشاط رقمه من مضاعفات 4 داخل الفصل (4، 8، 12، ...)، بشرط:
  - ليس أول نشاط في الفصل.
  - ليس آخر نشاط في الفصل.
  - يوجد على الأقل عنصر مؤهل واحد **حان موعده** (due) للاعب.
- حد أعلى **مراجعة واحدة لكل فصل** (لو الفصل يحوي 16 نشاطًا: تُحقن عند 4 فقط، ثم تُتخطى البقية).
- حد أعلى **5 مراجعات يوميًا** عبر كل الفصول.

المرجع في القرار = `runtimeActivities` قبل الحقن، بحيث يبقى موقع الحقن ثابتًا حتى لو اختلف تقدم اللاعب.

---

## 5) الاختيار (Selector)

ترتيب صارم:

1. عناصر **due** (تجاوزت `nextDueAt`) ومن ضمنها أخطاء سابقة (`lastAttemptCorrect=false`) لها الأولوية.
2. الأقدم مراجعة (`lastReviewedAt` أبعد زمنيًا).
3. البقية من العناصر التي لم تُراجَع بعد.

قواعد منع التكرار:
- لا نفس `itemId` قبل `nextDueAt`.
- لا نفس `sourceId` في آخر 3 مراجعات (تنويع الحملات/المصادر).
- لا نفس `kind` مرتين متتاليتين إن أمكن.

لو لا يوجد أي عنصر مؤهل → لا حقن (بصمت).

---

## 6) التكرار المتباعد (Spaced Repetition)

نموذج SM-2 مبسّط لكل عنصر:

```
correctStreak = 0, 1, 2, 3, 4, ...
interval (أيام) = [2, 4, 7, 14, 30, 60, 120]

- إجابة صحيحة: correctStreak++, nextDueAt = now + interval[min(streak, 6)]
- إجابة خاطئة: correctStreak = 0, nextDueAt = now + 2 أيام
- تخطي: لا يعدّل الجدولة، يُسجَّل كـ "seen"
```

النتيجة العملية:
- صح متتالٍ ⇒ 2د → 4د → 7د → 14د → 30د → 60د → 120د.
- خطأ ⇒ يرجع بعد يومين.
- عناصر متأخرة (overdue) تُقدَّم تلقائيًا في الأولوية 1.

---

## 7) الواجهة (UX)

- الـReviewActivity تبدو كأي نشاط، بشارة صغيرة أعلى البطاقة: **«مراجعة»** فقط، بدون ذكر اسم الحملة.
- بعد الإجابة يظهر السطر: **«تمت مراجعة معلومة من: عام الحزن»** — بعد الكشف عن الإجابة، لا قبلها. أيقونة صغيرة تكفي إن كان الاسم قد يكشف الجواب.
- زر «تخطي» متاح بدون عقوبة.
- زر «متابعة» يعيد الـRenderer للنشاط التالي في `runtimeActivities`.

---

## 8) المكافآت (XP متغيّرة)

```
xp = clamp( round(originalXp * 0.25), 3, 10 )
```

- صحيحة: منح `xp` عبر `awardXp({ source: "memory_review", itemId })`.
- خاطئة/تخطي: صفر XP، لا خصم قلوب، لا أثر على تقدم الحملة.

المكافأة تمر عبر مسار XP العام الموجود مسبقًا — لا مسار جديد للحملات.

---

## 9) التخزين (History)

مفتاح واحد `irth.memory.history.v1` يمر تلقائيًا عبر Identity Partition (`::owner=user:<id>` أو `guest:<id>`).

```ts
interface MemoryHistory {
  items: {
    [itemId: string]: {
      lastReviewedAt: string;
      lastAttemptCorrect: boolean;
      correctStreak: number;
      totalAttempts: number;
      nextDueAt: string;
      sourceType: SourceType;
      sourceId: string;
    };
  };
  attempts: Array<{ itemId, correct, at }>;  // آخر 500 FIFO
  daily: { [dateKey: string]: number };
}
```

- **لا كتابة** في `game_progress`, `user_campaign_progress`, `campaignStorage`, أو أي جدول تقدم موجود.
- مزامنة سحابية (`user_memory_attempts`) خارج نطاق هذه المرحلة.

---

## 10) المزوّدون (Providers Pattern)

الواجهة الوحيدة:

```ts
interface ReviewProvider {
  sourceType: SourceType;
  listItemsForOwner(ownerKey: string): Promise<ReviewItem[]>;
}
```

اليوم مسجّل واحد فقط: `campaignProvider` يقرأ الحملات المكتملة ويستخرج الأنشطة المؤهلة (mcq/true_false/ordering/matching/fill_blank) التي **سبق أن أنهاها اللاعب**، مع تخطي reading/reflection/decision بلا correctAnswer.

المستقبل: `storyProvider`, `investigationProvider`, `museumProvider`, `dailyChallengeProvider` — يُضاف كل واحد بسطر `registerProvider()` دون أي تعديل في `bank/scheduler/selector/spacing/history`.

---

## 11) ضمانات عدم الكسر

1. **Kill switch**: `VITE_FEATURE_MEMORY_ENGINE=false` ⇒ `injectReviewActivities` تُعيد المصفوفة الأصلية ⇒ صفر تغيير.
2. **معماريًا** لا يكتب المحرك في أي storage للحملات — الملف الوحيد الذي يكتب هو `history.ts` بمفتاحه الخاص.
3. `chapter.activities` غير معدَّلة، `completedActivityIds` لا تحوي أي `review:*`، `allDone` يحسب على الأصل فقط.
4. Offline-safe: البنك محلي، History محلي، مرور عبر Identity Partition.
5. Golden Template و Import/Export و admin_run_campaign_batch لا يمسّها.
6. اختبارات وحدة:
   - `scheduler`: المواقع 4/8/12، حد يومي، حد لكل فصل.
   - `selector`: أولوية due/wrong، منع تكرار source/kind.
   - `spacing`: منحنى SM-2 المبسّط، سلوك بعد خطأ.
   - `campaignProvider`: يستبعد غير المؤهلة، يحترم "سبق حلها".
   - snapshot: ملفات `campaignStorage/*` لم تُلمس، `ActivityRenderer` يحوي case واحدًا فقط للنوع الجديد.

---

## 12) خارج نطاق هذه المرحلة

- مزودو Story/Investigation/Museum/DailyChallenge.
- مزامنة سحابية.
- إشعارات "لديك 5 مراجعات مستحقّة اليوم".
- تحليلات ذاكرة (heatmap للنسيان).

---

## نقاط تحتاج قرارك قبل التنفيذ

1. الحد اليومي: **5 مراجعات/يوم** — مناسب؟
2. موقع الحقن: **مضاعفات 4** — أم تفضّل «مرة واحدة في منتصف الفصل» فقط؟
3. صيغة XP: `clamp(originalXp * 0.25, 3, 10)` — تعديل الحدود؟
4. الشارة أثناء السؤال: كلمة **«مراجعة»** فقط — أم أيقونة صامتة تمامًا حتى بعد الكشف؟

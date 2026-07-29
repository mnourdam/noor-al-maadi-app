# Memory Engine — محرك تثبيت المعلومات (تصميم فقط، v2)

طبقة Runtime مستقلة تعرض للاعب أحيانًا **عنصر مراجعة واحدًا** (ReviewItem) مأخوذًا من محتوى أتمّه سابقًا — تبدأ بالحملات وتنمو لاحقًا للتحقيقات والقصص والموسوعة والتحديات — دون أي تعديل على بيانات الحملات، منطق التقدم، شرط إكمال الفصل، أو Golden Template. تعطّل الطبقة بمفتاحين (Build + Runtime) وتعود التجربة 100% لما هي عليه.

الاسم: **Memory Engine** (سابقًا Review Engine).

---

## 1) الوحدة الذرية: ReviewItem مرتبط بالمعلومة

```ts
type SourceType = "campaign" | "investigation" | "story" | "museum" | "daily_challenge";

interface ReviewItem {
  id: string;               // hash(sourceType + sourceId + localRef) — مستقر
  sourceType: SourceType;
  sourceId: string;
  sourceLabel: string;      // "عام الحزن" — يعرض بعد الإجابة فقط
  localRef: string;
  kind: "mcq" | "true_false" | "ordering" | "matching" | "fill_blank";
  prompt: string;
  options?: string[];
  correctAnswer: unknown;
  originalXp: number;       // قد يكون 0 → يُطبّق fallback
  era?: string;
  tags?: string[];
}
```

---

## 2) البنية

```
src/lib/memory/
  types.ts
  flags.ts                  # buildFlag && runtimeFlag
  providers/
    index.ts                # registerProvider() / listItemsForOwner()
    campaignProvider.ts
  bank.ts                   # تجميع + كاش
  eligibility.ts            # neverReviewed => فوري
  scheduler.ts              # قرار موضع الحقن (deterministic)
  selector.ts               # اختيار عنصر واحد + منع تكرار
  spacing.ts                # SM-2 مبسّط
  history.ts                # attempts + due (partitioned per owner)
  rewards.ts                # XP + Idempotency
  plan.ts                   # RuntimeChapterPlan + persistence + TTL
  index.ts

src/components/memory/
  ReviewActivity.tsx
  ReviewActivityCard.tsx
```

---

## 3) RuntimeChapterPlan — الأساس الذي يمنع الكسر

**قاعدة صارمة: التنقّل والاستئناف لا يعتمدان على Index داخل runtimeActivities، بل على معرّفات الأنشطة الأصلية.**

```ts
interface RuntimeChapterPlan {
  version: 1;
  campaignId: string;
  chapterId: string;
  ownerKey: string;                          // "user:<id>" | "guest:<id>"
  originalActivityIds: string[];             // مصدر الحقيقة للتقدم والإكمال
  insertionAfterActivityId: string | null;   // مثال: "activity-3" | null إذا لا مراجعة
  reviewItemId: string | null;               // مُثبّت عند إنشاء الخطة
  reviewSnapshot: ReviewItem | null;         // نسخة مجمّدة من السؤال (للعرض المستقر)
  reviewAttemptId: string | null;            // UUID للـIdempotency
  createdAt: string;
  planKey: string;                           // hash(campaignId+chapterId+ownerKey)
}
```

- **يُنشأ مرة واحدة** عند دخول الفصل، ويُحفظ في `irth.memory.plan.<planKey>` (يمر عبر Identity Partition).
- **يُعاد استخدامه** عند إعادة الفتح/التحديث/الاستئناف.
- **لا يتغير** حتى لو تبدّل بنك المراجعات، تجاوز اللاعب منتصف الليل، أو أتمّ حملة أخرى.
- **يُحذف** فقط عند إكمال الفصل، أو مغادرته نهائيًا، أو تغيير الهوية.
- **الاستئناف**: يعتمد `currentActivityId` (أصلي)، ثم يُوسّع محليًا للـruntime عبر تطبيق الخطة على `chapter.activities`.

`runtimeActivities` تُبنى دائمًا من:

```
originalActivityIds.map(id => chapter.activities[id])
  .then(insertReviewAfter(insertionAfterActivityId, reviewSnapshot))
```

`allDone` و`completedActivityIds` يُحسبان على `originalActivityIds` **حصريًا**.

---

## 4) اختيار مرة واحدة، تجميد أبدي داخل الجلسة

- عند إنشاء الخطة: يستدعى `selector.pickForChapter(ownerKey, chapterCtx)` مرة **واحدة**.
- الناتج (`reviewItemId` + `reviewSnapshot` + `reviewAttemptId`) يُخزَّن في الخطة.
- أي إعادة Render/Reload/يوم جديد/إجابة في تبويب آخر → لا إعادة اختيار.
- إذا أعاد Selector `null` وقت إنشاء الخطة → لا مراجعة في هذا الفصل (نهائيًا).

---

## 5) التأهيل (Eligibility)

```
eligibleNow(item):
  - إذا لم يُراجع قبل الآن ⇒ true (neverReviewed = eligibleImmediately)
  - إذا nextDueAt <= now ⇒ true
  - غير ذلك ⇒ false
```

ترتيب الأولويات في Selector:
1. أخطاء سابقة حان موعدها (`lastAttemptCorrect === false && due`).
2. متأخّرة عن موعدها (`overdue`).
3. لم تُراجع سابقًا.
4. مستحقّات بحسب الأقدمية.

منع التكرار:
- لا نفس `itemId` قبل `nextDueAt`.
- لا نفس `sourceId` في آخر 3 مراجعات.
- لا نفس `kind` مرتين متتاليتين إن أمكن.

---

## 6) الجدولة (Scheduler)

**القاعدة**: مراجعة واحدة كحد أقصى لكل فصل، تُحقن بعد **إكمال 3 أنشطة أصلية ناجحة**، بشرط ألا يكون النشاط الثالث هو الأخير في الفصل.

```
insertionAfterActivityId =
  originalActivityIds[2]                      // بعد النشاط الثالث
  إذا originalActivityIds.length >= 4         // ≥ نشاط إضافي بعده
  وإلا: null                                  // لا مراجعة
```

قيود عالمية:
- **حد يومي: 3 مراجعات/يوم/مالك** (عبر `history.daily[dateKey]`).
- إذا تجاوز الحد وقت إنشاء الخطة → `reviewItemId = null`.
- الحساب اليومي بتوقيت الجهاز، مفتاح `YYYY-MM-DD`.

---

## 7) Spaced Repetition

```
intervals = [2, 4, 7, 14, 30, 60, 120] days

correct:  correctStreak++; nextDueAt = now + intervals[min(streak, 6)]
wrong:    correctStreak = 0; nextDueAt = now + 2 days
skip:     seen count فقط، لا تعديل جدولة
```

---

## 8) UX

- شارة **«مراجعة»** فقط أثناء السؤال (بدون اسم المصدر).
- بعد الكشف عن الإجابة: **«تمت مراجعة معلومة من حملة: عام الحزن»**.
- زر «تخطي» متاح — 0 XP، لا يعدّل الجدولة.
- «متابعة» يُرجع الـRenderer للنشاط الأصلي التالي.

---

## 9) XP + Idempotency

```
raw = originalXp && originalXp > 0 ? round(originalXp * 0.25) : 5
xp  = clamp(raw, 3, 10)
```

- المنح يمر عبر `awardXp({ source: "memory_review", attemptId: plan.reviewAttemptId })`.
- `history.grantedAttemptIds: Set<string>` يمنع المنح المزدوج (نفس `attemptId` = no-op).
- إعادة فتح شاشة النتيجة، Reload، Realtime، أي مسار — لا يمنح مرة ثانية.
- خطأ/تخطي: 0 XP، لا خصم قلوب، لا أثر على تقدم الحملة.

---

## 10) Feature Flags — مستويان

```ts
// src/lib/memory/flags.ts
export function memoryEnabled(): boolean {
  return BUILD_FLAG && RUNTIME_FLAG.current();
}
```

- **Build**: `VITE_FEATURE_MEMORY_ENGINE` (حماية أساسية، تحتاج APK لتعطيله).
- **Runtime**: قيمة مقروءة من `admin_feature_flags` (أو `app_config`) وتُكاش محليًا. Kill switch فوري بدون إصدار جديد.
- عند `false`:
  - `injectReviewActivities` تُرجع القائمة الأصلية كما هي.
  - `plan.reviewItemId` يُتعامل معه كأنه `null`.
  - Selector/Bank/History لا تُستدعى.

---

## 11) التخزين

- `irth.memory.history.v1` — attempts + due + daily counter + grantedAttemptIds.
- `irth.memory.plan.<planKey>` — خطة كل فصل نشط.
- كلاهما يمر عبر Identity Partition (`::owner=user:<id>`).
- **لا كتابة** في `game_progress`, `user_campaign_progress`, `campaignStorage`, أو أي جدول تقدم.

---

## 12) التغيير الوحيد خارج `src/lib/memory/` و`src/components/memory/`

- سطر واحد في `ActivityRenderer`:
  ```ts
  if (activity.__memoryReview) return <ReviewActivity plan={plan} />;
  ```
- سطر واحد في مكوّن تشغيل الفصل يستدعي `ensurePlan(...)` عند الدخول ويطبّق الخطة قبل تمرير القائمة للـRenderer.
- سطر واحد في مسار إكمال الفصل يستدعي `plan.clear(planKey)`.

لا تعديل على شرط الإكمال، لا على Hearts، لا على Navigation، لا على Import/Export.

---

## 13) مخططات التدفق (7 سيناريوهات حرجة)

### أ) بدء الفصل
```
enterChapter(campaignId, chapterId)
  ├─ planKey = hash(campaignId, chapterId, ownerKey)
  ├─ existing = loadPlan(planKey)
  ├─ if existing: use it (لا اختيار جديد)
  └─ else:
       ├─ memoryEnabled? ─── no ── plan = {reviewItemId:null}
       ├─ dailyCount >= 3? ─ yes ─ plan = {reviewItemId:null}
       ├─ insertionAfter = originalActivityIds[2] if len>=4 else null
       ├─ item = selector.pickForChapter(ownerKey)
       ├─ if !item OR insertionAfter==null: reviewItemId=null
       └─ save plan {reviewItemId, reviewSnapshot, reviewAttemptId=uuid()}
  → build runtimeActivities من originalActivityIds + insertion
  → currentActivityId = first original not-completed
```

### ب) إغلاق التطبيق قبل المراجعة
```
- الخطة محفوظة، الأنشطة الأصلية المكتملة محفوظة كالمعتاد.
- عند الفتح: نفس الخطة تُقرأ، نفس السؤال، نفس الموضع.
- لا اختيار جديد. لا تغيّر في السؤال حتى لو تغيّر البنك.
```

### ج) إغلاق أثناء المراجعة (السؤال ظاهر ولم يُجب)
```
- المراجعة ليست في completedActivityIds (المحرك لا يكتبها أصلًا).
- history.attempts لم يُسجَّل بعد.
- عند الفتح: الخطة نفسها، السؤال نفسه، موضعه نفسه.
- currentActivityId يشير للنشاط الأصلي السابق (activity-3)؛ الـRenderer
  يعرض المراجعة بعده لأنها في runtimeActivities.
- لا خصم قلوب، لا XP.
```

### د) فتح التطبيق في اليوم التالي (بدون إتمام الفصل)
```
- الخطة لم تُحذف (نُبقي TTL 7 أيام على الأقل، ولا نحذف بعبور منتصف الليل).
- نفس reviewItemId يُعرض. dailyCount الجديد لا يؤثر لأن الاختيار تم أمس.
- إذا أجاب اليوم: history.daily[today]++ (يُحسب لليوم الحالي).
```

### هـ) تعطيل الـFeature Flag وسط فصل (Runtime kill switch)
```
- عند إعادة بناء runtimeActivities في الـRender التالي:
    memoryEnabled()==false → نتجاهل plan.reviewItemId ونعرض القائمة الأصلية فقط.
- إذا كان اللاعب داخل شاشة المراجعة لحظة التعطيل:
    نُظهر «متابعة» تلقائيًا (auto-skip بلا خصم) ثم ننتقل للنشاط الأصلي التالي.
- الخطة تبقى محفوظة (كي لا نُعيد الاختيار لو أُعيد التفعيل قبل إكمال الفصل).
- التقدم الأصلي غير متأثر إطلاقًا.
```

### و) إجابة صحيحة ثم إعادة تحميل الشاشة
```
onCorrect:
  ├─ history.record(itemId, correct=true, at=now)
  ├─ spacing.update → nextDueAt
  ├─ if !grantedAttemptIds.has(plan.reviewAttemptId):
  │     awardXp(...); grantedAttemptIds.add(plan.reviewAttemptId)
  └─ mark plan.reviewCompleted = true (in plan, not in completedActivityIds)

Reload بعد ذلك:
  - plan.reviewCompleted==true → ReviewActivity تعرض شاشة النتيجة الجاهزة أو
    ينتقل الـRenderer فورًا للنشاط الأصلي التالي (سلوك ثابت بحسب UX).
  - awardXp لن يُنفَّذ (Idempotency عبر attemptId).
```

### ز) تسجيل خروج/تبديل حساب وسط الفصل
```
resetForIdentityChange (المسار المعتمد):
  ├─ يُلغي كل خطط الذاكرة من الحالة (الملفات في localStorage تبقى
  │  لكن ضمن partition المالك القديم — غير مقروءة للمالك الجديد).
  ├─ Query cache تُمسح.
  └─ Realtime تُلغى.

المالك الجديد يدخل نفس الفصل:
  - planKey مختلف (يعتمد ownerKey).
  - خطة جديدة، سؤال جديد، dailyCount خاص به.
  - تقدم الحملات ينحدر من مصدره الأصلي (server أو campaignStorage
    الخاص بالمالك)، غير متأثر بالمحرك.
```

---

## 14) اختبارات الوحدة قبل التنفيذ

- `plan.ensurePlan`: idempotent، يعيد نفس الخطة، لا يعيد الاختيار.
- `plan.clear`: يمسح فقط عند الإكمال/المغادرة النهائية.
- `scheduler`: insertion بعد النشاط الثالث فقط، لا يظهر إذا len<4، لا يظهر إذا daily>=3.
- `selector`: أولوية wrong→overdue→neverReviewed→oldest، منع تكرار source/kind.
- `spacing`: منحنى الفواصل + إعادة التصفير بعد الخطأ.
- `rewards`: fallback 5، clamp [3,10]، Idempotency عبر attemptId.
- `flags`: build=false OR runtime=false ⇒ لا حقن.
- `identity`: تبديل الهوية = مفتاح خطة جديد، لا تسرّب.
- `snapshot`: `completedActivityIds` لا يحوي `review:*`، `allDone` يحسب على الأصل.

---

## 15) خارج النطاق

Story/Investigation/Museum/DailyChallenge providers, مزامنة سحابية، إشعارات مراجعات مستحقة، تحليلات heatmap.

---

هذه الخطة v2 تلبّي القرارات السبعة المعتمدة: `RuntimeChapterPlan` بمعرّفات أصلية، تجميد السؤال، `neverReviewed=eligible`، Build+Runtime flags، Idempotency، حد 3/يوم، حقن بعد النشاط الثالث، XP fallback 5، شارة صامتة قبل الإجابة.

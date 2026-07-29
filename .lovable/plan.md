# Review Engine — طبقة مراجعة مستوحاة من Duolingo (تصميم فقط)

طبقة Runtime مستقلة تعرض أحيانًا **سؤال مراجعة واحد** مأخوذ من حملات أتمّها اللاعب، دون أي تعديل على الحملات أو الفصول أو الأنشطة أو منطق التقدم أو الـGolden Template. إذا عُطّلت الطبقة عبر feature flag واحد يعود النظام لسلوكه الحالي بالكامل.

---

## 1) الحدود المعمارية (Isolation Contract)

**لا يمس** الـReview Engine أيًا مما يلي:
- ملفات JSON للحملات / الفصول / الأنشطة.
- `campaignStorage`, `campaignReconciliation`, `admin_run_campaign_batch`, Import/Export.
- `ActivityRenderer`, ترتيب الأنشطة، `currentIdx`, `completedActivityIds`.
- منطق `claimActivityReward` واحتساب إكمال الفصل/الحملة.
- Offline Snapshot و Golden Template.

**نقطة الاتصال الوحيدة**: مكوّن Overlay جديد يُركَّب داخل `campaigns.imported.$id.chapter.$chapter.tsx` **بين** انتهاء نشاط ناجح وعرض النشاط التالي. لا يستهلك أي API من محرك الحملات سوى القراءة (`campaign.id`, `chapter.id`, `activity.id`) لأغراض إشارة التوقيت.

Kill switch: `VITE_FEATURE_REVIEW_ENGINE` + مفتاح Runtime في إعدادات اللاعب. إيقافه = عودة سطر واحد شرطي إلى null، لا يتغير أي سلوك آخر.

---

## 2) البنية (Modules)

جميعها تحت `src/lib/review/` — معزولة، بدون استيراد من `campaignStorage` عدا الأنواع.

```
src/lib/review/
  types.ts              ReviewItem, ReviewAttempt, ReviewDecision
  bank.ts               بناء بنك الأسئلة من الحملات المكتملة (قراءة فقط)
  eligibility.ts        فلترة: مكتملة + سبق حلها + قابلة للمراجعة
  scheduler.ts          متى يُعرض سؤال (قرار حقن/تخطي)
  selector.ts           اختيار سؤال واحد بالأولويات + منع التكرار
  history.ts            سجل المراجعات (partitioned per owner)
  telemetry.ts          XP grant عبر مسار مستقل عن claimActivityReward
  index.ts              واجهة عامة: pickReviewForMoment(), recordAttempt()

src/components/review/
  ReviewOverlay.tsx     شاشة مودال منفصلة تمامًا عن ActivityRenderer
  ReviewQuestionCard.tsx  عرض SSOT-only للأنواع المدعومة
```

---

## 3) بنك الأسئلة (Read-Only Projection)

- يُبنى **مرة واحدة** بعد boot من `getCompletedCampaigns()` (يعرفها `campaignStorage` مسبقًا).
- لكل حملة مكتملة نمرّ على `chapters[].activities[]` ونستخرج فقط الأنشطة التي:
  - نوعها ضمن قائمة بيضاء: `mcq`, `true_false`, `ordering`, `matching`, `fill_blank`.
  - لها `correctAnswer` موثوق (يعبر `admin_validate_activity_shape`).
  - **مسجَّلة كـ completed في `completedActivityIds` للاعب الحالي** (ضمان "سبق أن حلها").
- **مستبعد**: reading, reflection, decision-only, open-text, و أي نشاط تأملي بدون تحقق.

المخرج: `ReviewItem[]` مع `{ campaignId, chapterId, activityId, kind, prompt, options, correctIndex, era }` — snapshot immutable في الذاكرة، يُعاد بناؤه فقط عند إكمال حملة جديدة.

---

## 4) نقاط الحقن (Injection Points)

الحقن **بعد** لحظة النجاح في نشاط داخل الفصل الحالي، قبل الانتقال للنشاط التالي. لا يُحقن أبدًا:
- في أول نشاط بالفصل.
- في آخر نشاط بالفصل (لتفادي الخلط مع شاشة الإكمال).
- إذا لم يُكمل اللاعب أي حملة سابقة.
- إذا الفصل الحالي هو أول فصل في أول حملة يبدأها اللاعب.

معدل الحقن (Scheduler):
- حد أعلى **سؤال مراجعة واحد لكل فصل**.
- حد أعلى **3 أسئلة مراجعة يوميًا**.
- Cooldown: لا حقن قبل مرور ≥ 3 أنشطة صحيحة منذ آخر مراجعة.
- احتمال أساسي 25% لكل نشاط مؤهّل، يُعدَّل بـ decay إذا تجاوز اللاعب حصته اليومية.
- deterministic seed: `hash(ownerKey + dateKey + campaignId + chapterId + activityId)` لضمان الثبات ومنع اللعب على العشوائية.

---

## 5) الاختيار (Selector Priorities)

بترتيب صارم، لا عشوائية بسيطة:

1. **أخطاء سابقة**: أسئلة سُجّل لها attempt خاطئ في `review.history` ولم تُصحّح بعد.
2. **الأقدم مراجعة**: `lastReviewedAt` الأبعد زمنيًا (spaced repetition خفيف).
3. **البقية** مع منع تكرار قريب:
   - لا تكرار نفس `activityId` خلال 14 يومًا.
   - لا تكرار نفس `campaignId` خلال آخر 3 مراجعات (تنويع المصادر).
   - لا تكرار نفس `chapterId` مرتين متتاليتين.

Fallback: إن كانت كل الأسئلة في cooldown يُتخطى الحقن بصمت.

---

## 6) التخزين (History)

- مفتاح واحد فقط: `irth.review.history.v1` — يمرّ عبر Identity Partition تلقائيًا فيصبح `...::owner=user:<id>` أو `...::owner=guest:<id>`.
- شكل السجل:
  ```ts
  {
    attempts: Array<{ itemKey, correct, at, campaignId, chapterId }>,
    dailyCount: { [dateKey]: number },
    lastAt: string
  }
  ```
- Cap: آخر 500 attempt، truncation FIFO.
- **لا** يُكتب في `game_progress` ولا `user_campaign_progress` ولا أي جدول تقدم موجود.
- (اختياري لاحقًا) جدول `user_review_attempts` منفصل تمامًا — خارج نطاق هذه المرحلة.

---

## 7) المكافآت

- إجابة صحيحة: `+5 XP` عبر `awardXp({ source: "review" })` — مسار موجود مستقل عن `claimActivityReward`.
- إجابة خاطئة: لا خصم قلوب، لا أثر على التقدم، تُسجَّل فقط في history لأولوية اختيار مستقبلي.
- **تخطي/إغلاق**: مسموح، بدون عقوبة، يُحسب كـ "seen but not answered".

---

## 8) الواجهة (UX)

- Overlay فوق شاشة الفصل، خلفية مموّهة، بادج ذهبي: «مراجعة سريعة من حملة سابقة».
- يذكر مصدر السؤال: «من حملة: عام الحزن».
- زر «تخطي» ظاهر دائمًا.
- بعد الإجابة: تغذية راجعة قصيرة + زر «متابعة الفصل».
- لا تعديل على `ActivityRenderer` — يُعرض الـOverlay فوقه.

---

## 9) ضمانات عدم الكسر (Safety Contract)

1. **Feature Flag**: تعطيله يُرجع `pickReviewForMoment()` فارغة → Overlay لا يُعرض → صفر تغيير سلوكي.
2. **بدون كتابة في حالة الحملات**: يستحيل معماريًا لأن الملف الوحيد الذي يكتب هو `history.ts` بمفتاحه الخاص.
3. **بدون تعديل ترتيب/عدد الأنشطة**: `chapter.activities` لا يُلمس، ولا `currentIdx`, ولا `completedActivityIds`.
4. **بدون تأثير على شرط إكمال الفصل/الحملة**: `allDone` لا يعتمد على أي state من Review.
5. **Offline-safe**: البنك يُبنى من بيانات محلية أصلاً، والـhistory محلية.
6. **Identity-safe**: يمر تلقائيًا عبر Storage Partition الحالي.
7. **اختبارات وحدة**:
   - `scheduler` يحترم الحدود اليومية والcooldown.
   - `selector` يحترم الأولويات ومنع التكرار.
   - `bank` يستبعد الأنشطة غير المؤهلة.
   - snapshot test يثبت أن ملفات `campaignStorage` لم تُلمس.

---

## 10) خارج نطاق هذه المرحلة

- مراجعات من التحقيقات/القصص.
- Spaced repetition متقدم (SM-2).
- مزامنة history للسحابة.
- مراجعات في نهاية اليوم / إشعارات.

---

## نقاط تحتاج قرارك قبل التنفيذ

1. الحد اليومي: 3 مراجعات/يوم — مقبول؟
2. مكافأة XP الثابتة: 5 — أم متغيرة حسب صعوبة السؤال الأصلي؟
3. هل نبدأ محلي فقط الآن، ونؤجل مزامنة `user_review_attempts` للسحابة لمرحلة لاحقة؟

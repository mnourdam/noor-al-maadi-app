import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useSearch, useNavigate, notFound } from "@tanstack/react-router";
import { z } from "zod";
import {
  ArrowRight, Sparkles, Check, X, Lock, MapPin, Quote, Lightbulb,
  Scroll, Compass, Gem, BookOpen, Search, GitBranch, ListOrdered, Trophy,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import {
  getFlagshipChapter, ARTIFACTS, CHARACTERS, type FlagshipStage,
} from "@/lib/data";
import { useProfile } from "@/lib/profile";

const searchSchema = z.object({ id: z.string() });

export const Route = createFileRoute("/play/chapter")({
  validateSearch: searchSchema,
  component: ChapterPlayer,
  notFoundComponent: () => (
    <AppShell>
      <div className="px-5 pt-20 text-center text-muted-foreground">الفصل غير موجود.</div>
    </AppShell>
  ),
  errorComponent: () => (
    <AppShell>
      <div className="px-5 pt-20 text-center text-muted-foreground">تعذّر تحميل الفصل.</div>
    </AppShell>
  ),
});

const KIND_LABEL: Record<FlagshipStage["kind"], string> = {
  scene: "مشهد",
  investigation: "تحقيق",
  decision: "قرار",
  timeline: "ترتيب الزمن",
  discovery: "اكتشاف",
};

const KIND_ICON: Record<FlagshipStage["kind"], React.ComponentType<{ className?: string }>> = {
  scene: BookOpen,
  investigation: Search,
  decision: GitBranch,
  timeline: ListOrdered,
  discovery: Gem,
};

function ChapterPlayer() {
  const { id } = useSearch({ from: "/play/chapter" });
  const navigate = useNavigate();
  const chapter = getFlagshipChapter(id);
  if (!chapter) throw notFound();

  const { profile, completeMission, findArtifact, unlockCharacter } = useProfile();
  const [stageIdx, setStageIdx] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const [finished, setFinished] = useState(false);

  const stage = chapter.stages[stageIdx];
  const isLast = stageIdx === chapter.stages.length - 1;

  // After last stage continue, grant chapter rewards + complete mission, then show finale
  const finishChapter = () => {
    // Grant all chapter-level artifacts/characters (discovery stages also call grants,
    // but useProfile guards against duplicates — safe to call again)
    chapter.rewards.artifactIds?.forEach((a) => findArtifact(a));
    chapter.rewards.characterIds?.forEach((c) => unlockCharacter(c));
    completeMission(chapter.missionId, chapter.rewards.points);
    setFinished(true);
  };

  const onContinue = () => {
    setTransitioning(false);
    if (isLast) {
      finishChapter();
    } else {
      setStageIdx((i) => i + 1);
    }
  };

  return (
    <AppShell>
      <div className="px-5 pt-6 pb-10">
        {/* === HEADER === */}
        <Link to="/campaigns/$era" params={{ era: "ayyubid" }} className="flex items-center gap-1 text-xs text-muted-foreground">
          <ArrowRight className="size-3.5" /> حملة صلاح الدين
        </Link>

        <ChapterHeader
          chapter={chapter}
          stageIdx={stageIdx}
          finished={finished}
        />

        {/* === STAGE BODY === */}
        {!finished ? (
          transitioning ? (
            <StageTransition
              chapter={chapter}
              stageIdx={stageIdx}
              isLast={isLast}
              onContinue={onContinue}
            />
          ) : (
            <StageRenderer
              key={`${chapter.id}-${stageIdx}`}
              stage={stage}
              onCompleteStage={() => {
                // Discovery stages grant their refId here too (immediate)
                if (stage.kind === "discovery" && stage.refId) {
                  if (stage.subtype === "artifact" || stage.subtype === "document") findArtifact(stage.refId);
                  if (stage.subtype === "character") unlockCharacter(stage.refId);
                }
                setTransitioning(true);
              }}
            />
          )
        ) : (
          <ChapterFinale
            chapter={chapter}
            onBack={() => navigate({ to: "/campaigns/$era", params: { era: "ayyubid" } })}
          />
        )}
      </div>
    </AppShell>
  );
}

// ============================================================
// HEADER + PROGRESS DOTS
// ============================================================
function ChapterHeader(props: { chapter: ReturnType<typeof getFlagshipChapter> & {}; stageIdx: number; finished: boolean }) {
  const { chapter, stageIdx, finished } = props;
  return (
    <div className="mt-3">
      <div className="flex items-center gap-2 text-[10px] tracking-widest text-gold/80">
        <span>الفصل {toArDigit(chapter.index)}</span>
        <span className="text-muted-foreground">·</span>
        <span>{chapter.era}</span>
      </div>
      <h1 className="font-display mt-1 text-2xl font-bold leading-snug shimmer-text">{chapter.title}</h1>
      <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
        <MapPin className="size-3 text-gold/70" /> {chapter.setting}
      </p>

      {/* progress dots */}
      <div className="mt-4 flex items-center gap-1.5">
        {chapter.stages.map((s, i) => {
          const done = finished || i < stageIdx;
          const active = !finished && i === stageIdx;
          return (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-all ${
                done ? "bg-gradient-gold" : active ? "bg-gold/50" : "bg-white/10"
              }`}
            />
          );
        })}
      </div>
      <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>المرحلة {toArDigit(Math.min(stageIdx + 1, chapter.stages.length))} من {toArDigit(chapter.stages.length)}</span>
        <span className="text-gold/80">{finished ? "اكتمل" : KIND_LABEL[chapter.stages[stageIdx].kind]}</span>
      </div>
    </div>
  );
}

// ============================================================
// STAGE RENDERER
// ============================================================
function StageRenderer(props: { stage: FlagshipStage; onCompleteStage: () => void }) {
  const { stage, onCompleteStage } = props;
  const Icon = KIND_ICON[stage.kind];

  return (
    <div className="animate-curtain mt-5">
      <div className="mb-3 flex items-center gap-2 text-[11px] text-gold/80">
        <Icon className="size-3.5" /> {KIND_LABEL[stage.kind]}
      </div>

      {stage.kind === "scene" && <SceneStage stage={stage} onContinue={onCompleteStage} />}
      {stage.kind === "investigation" && <InvestigationStage stage={stage} onContinue={onCompleteStage} />}
      {stage.kind === "decision" && <DecisionStage stage={stage} onContinue={onCompleteStage} />}
      {stage.kind === "timeline" && <TimelineStage stage={stage} onContinue={onCompleteStage} />}
      {stage.kind === "discovery" && <DiscoveryStage stage={stage} onContinue={onCompleteStage} />}
    </div>
  );
}

// ---------- SCENE ----------
function SceneStage(props: { stage: Extract<FlagshipStage, { kind: "scene" }>; onContinue: () => void }) {
  return (
    <div className="parchment-dark relative overflow-hidden rounded-3xl border border-gold/30 p-6">
      <div className="absolute inset-0 arabesque-bg" aria-hidden />
      <div className="relative">
        <h2 className="font-display text-lg font-bold text-gold">{props.stage.title}</h2>
        <div className="gold-divider my-4" />
        <div className="space-y-4 text-[14px] leading-loose">
          {props.stage.body.map((p, i) => (
            <p key={i} style={{ animation: `reveal .55s ease-out ${i * 0.12}s both` }}
              className={i === 0 ? "first-letter:font-display first-letter:text-3xl first-letter:font-bold first-letter:text-gold first-letter:me-1" : ""}>
              {p}
            </p>
          ))}
        </div>
        <button onClick={props.onContinue} className="mt-6 w-full rounded-2xl bg-gradient-gold py-3.5 text-sm font-bold text-primary-foreground shadow-gold">
          متابعة المهمة ←
        </button>
      </div>
    </div>
  );
}

// ---------- INVESTIGATION ----------
function InvestigationStage(props: { stage: Extract<FlagshipStage, { kind: "investigation" }>; onContinue: () => void }) {
  const { stage } = props;
  const [shown, setShown] = useState(1);
  const [picked, setPicked] = useState<number | null>(null);

  const correct = picked !== null && picked === stage.answerIndex;
  return (
    <div className="rounded-3xl border border-gold/30 bg-surface p-5">
      <h2 className="font-display text-lg font-bold">{stage.title}</h2>
      <p className="mt-1 text-xs text-muted-foreground">{stage.question}</p>

      {/* Clues board */}
      <div className="mt-4 space-y-2">
        {stage.clues.slice(0, shown).map((c, i) => (
          <div key={i} className="animate-reveal flex items-start gap-2 rounded-2xl border border-gold/20 bg-background/40 p-3 text-[13px]">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-gold/15 text-[10px] font-bold text-gold">{toArDigit(i + 1)}</span>
            <p className="leading-relaxed">{c}</p>
          </div>
        ))}
        {shown < stage.clues.length && picked === null && (
          <button
            onClick={() => setShown((s) => Math.min(s + 1, stage.clues.length))}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-gold/30 py-2.5 text-xs text-gold"
          >
            <Lightbulb className="size-3.5" /> اكشف دليلًا آخر ({toArDigit(stage.clues.length - shown)} متبقّ)
          </button>
        )}
      </div>

      {/* Options */}
      <div className="mt-5 grid grid-cols-2 gap-2">
        {stage.options.map((opt, i) => {
          const isPicked = picked === i;
          const isAnswer = i === stage.answerIndex;
          const reveal = picked !== null;
          return (
            <button
              key={i}
              disabled={picked !== null}
              onClick={() => setPicked(i)}
              className={`rounded-2xl border p-3 text-right text-[13px] transition ${
                !reveal
                  ? "border-white/10 bg-background/40 hover:border-gold/40"
                  : isAnswer
                    ? "border-gold/60 bg-gold/15 text-foreground"
                    : isPicked
                      ? "border-destructive/60 bg-destructive/10 text-foreground"
                      : "border-white/5 opacity-60"
              }`}
            >
              {opt}
            </button>
          );
        })}
      </div>

      {picked !== null && (
        <div className={`mt-4 rounded-2xl border p-3 text-[12px] ${correct ? "border-gold/40 bg-gold/10" : "border-destructive/40 bg-destructive/10"}`}>
          <div className="flex items-center gap-1.5 text-[11px] font-bold">
            {correct ? <Check className="size-3.5 text-gold" /> : <X className="size-3.5 text-destructive" />}
            {correct ? "إجابة صحيحة" : "إجابة غير دقيقة"}
          </div>
          <p className="mt-1 leading-relaxed text-foreground/90">{stage.explanation}</p>
        </div>
      )}

      {picked !== null && (
        <button onClick={props.onContinue} className="mt-5 w-full rounded-2xl bg-gradient-gold py-3.5 text-sm font-bold text-primary-foreground shadow-gold">
          متابعة المهمة ←
        </button>
      )}
    </div>
  );
}

// ---------- DECISION ----------
function DecisionStage(props: { stage: Extract<FlagshipStage, { kind: "decision" }>; onContinue: () => void }) {
  const { stage } = props;
  const [pickedIdx, setPickedIdx] = useState<number | null>(null);
  const picked = pickedIdx !== null ? stage.choices[pickedIdx] : null;

  return (
    <div className="parchment-dark relative overflow-hidden rounded-3xl border border-gold/30 p-5">
      <div className="absolute inset-0 arabesque-bg" aria-hidden />
      <div className="relative">
        <p className="text-[10px] tracking-widest text-gold/80">{stage.setting}</p>
        <h2 className="font-display mt-1 text-lg font-bold">{stage.title}</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-foreground/90">{stage.scene}</p>

        <div className="mt-5 space-y-2">
          {stage.choices.map((c, i) => {
            const isPicked = pickedIdx === i;
            const reveal = pickedIdx !== null;
            return (
              <button
                key={i}
                disabled={pickedIdx !== null}
                onClick={() => setPickedIdx(i)}
                className={`block w-full rounded-2xl border p-3 text-right text-[13px] transition ${
                  !reveal
                    ? "border-white/10 bg-background/40 hover:border-gold/40"
                    : c.correct
                      ? "border-gold/60 bg-gold/15"
                      : isPicked
                        ? "border-destructive/40 bg-destructive/10 opacity-90"
                        : "border-white/5 opacity-50"
                }`}
              >
                <div className="flex items-start gap-2">
                  <span className={`grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-bold ${reveal && c.correct ? "bg-gradient-gold text-primary-foreground" : "bg-white/10 text-foreground"}`}>
                    {String.fromCharCode(0x0623 + i)}
                  </span>
                  <span>{c.label}</span>
                </div>
                {reveal && isPicked && (
                  <p className="mt-2 pr-8 text-[11px] text-muted-foreground">{c.outcome}</p>
                )}
              </button>
            );
          })}
        </div>

        {picked && (
          <div className="mt-4 rounded-2xl border border-gold/30 bg-background/40 p-3 text-[12px]">
            <p className="text-[10px] font-bold text-gold">ما حدث فعلًا</p>
            <p className="mt-1 leading-relaxed text-foreground/90">{stage.note}</p>
          </div>
        )}

        {picked && (
          <button onClick={props.onContinue} className="mt-5 w-full rounded-2xl bg-gradient-gold py-3.5 text-sm font-bold text-primary-foreground shadow-gold">
            متابعة المهمة ←
          </button>
        )}
      </div>
    </div>
  );
}

// ---------- TIMELINE ----------
function TimelineStage(props: { stage: Extract<FlagshipStage, { kind: "timeline" }>; onContinue: () => void }) {
  const { stage } = props;
  // Shuffled pool of events to pick from
  const shuffled = useMemo(() => {
    const arr = [...stage.events];
    // deterministic shuffle by id hash to avoid SSR mismatch
    arr.sort((a, b) => (a.id + a.label).length - (b.id + b.label).length || a.id.localeCompare(b.id));
    // swap a few to make it feel random
    for (let i = 0; i < arr.length - 1; i += 2) [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
    return arr;
  }, [stage]);
  const [picked, setPicked] = useState<typeof stage.events>([]);
  const [submitted, setSubmitted] = useState(false);

  const available = shuffled.filter((e) => !picked.includes(e));
  const correctOrder = [...stage.events].sort((a, b) => a.year - b.year);

  const submit = () => setSubmitted(true);
  const reset = () => { setPicked([]); setSubmitted(false); };

  const compare = (i: number) => picked[i]?.id === correctOrder[i]?.id;
  const allCorrect = submitted && picked.every((_, i) => compare(i));

  return (
    <div className="rounded-3xl border border-gold/30 bg-surface p-5">
      <h2 className="font-display text-lg font-bold">{stage.title}</h2>
      <p className="mt-1 text-xs text-muted-foreground">{stage.instruction}</p>

      {/* Answer slots */}
      <div className="mt-4 space-y-2">
        {Array.from({ length: stage.events.length }).map((_, i) => {
          const ev = picked[i];
          const ok = submitted && ev && compare(i);
          const bad = submitted && ev && !compare(i);
          return (
            <div key={i} className={`flex items-center gap-2 rounded-2xl border p-3 text-[13px] ${
              ok ? "border-gold/50 bg-gold/10" : bad ? "border-destructive/40 bg-destructive/10" : "border-white/10 bg-background/30"
            }`}>
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-gold/15 text-[10px] font-bold text-gold">
                {toArDigit(i + 1)}
              </span>
              {ev ? (
                <button
                  onClick={() => !submitted && setPicked(picked.filter((_, j) => j !== i))}
                  className="flex-1 text-right disabled:opacity-100"
                  disabled={submitted}
                >
                  <span>{ev.label}</span>
                  {submitted && (
                    <span className="me-2 text-[10px] text-muted-foreground">({ev.year})</span>
                  )}
                </button>
              ) : (
                <span className="flex-1 text-muted-foreground">— اختر حدثًا —</span>
              )}
              {ok && <Check className="size-3.5 text-gold" />}
              {bad && <X className="size-3.5 text-destructive" />}
            </div>
          );
        })}
      </div>

      {/* Available pool */}
      {!submitted && available.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-[10px] tracking-widest text-muted-foreground">الأحداث المتاحة</p>
          <div className="flex flex-wrap gap-2">
            {available.map((e) => (
              <button
                key={e.id}
                onClick={() => setPicked([...picked, e])}
                className="rounded-full border border-white/15 bg-background/40 px-3 py-1.5 text-[12px] hover:border-gold/40"
              >
                {e.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {submitted && (
        <div className={`mt-4 rounded-2xl border p-3 text-[12px] ${allCorrect ? "border-gold/40 bg-gold/10" : "border-destructive/30 bg-destructive/10"}`}>
          <p className="text-[11px] font-bold">{allCorrect ? "ترتيب صحيح" : "ترتيب جزئي — تأمل التواريخ"}</p>
          {!allCorrect && (
            <ol className="mt-2 list-decimal space-y-0.5 pr-5 text-foreground/80">
              {correctOrder.map((e) => (
                <li key={e.id}>{e.label} <span className="text-[10px] text-muted-foreground">({e.year})</span></li>
              ))}
            </ol>
          )}
        </div>
      )}

      <div className="mt-5 grid grid-cols-2 gap-2">
        {!submitted ? (
          <>
            <button onClick={reset} className="rounded-2xl border border-white/15 py-2.5 text-xs text-muted-foreground">إعادة</button>
            <button
              disabled={picked.length !== stage.events.length}
              onClick={submit}
              className="rounded-2xl bg-gradient-gold py-2.5 text-xs font-bold text-primary-foreground shadow-gold disabled:opacity-40"
            >
              تأكيد الترتيب
            </button>
          </>
        ) : (
          <button onClick={props.onContinue} className="col-span-2 rounded-2xl bg-gradient-gold py-3.5 text-sm font-bold text-primary-foreground shadow-gold">
            متابعة المهمة ←
          </button>
        )}
      </div>
    </div>
  );
}

// ---------- DISCOVERY ----------
function DiscoveryStage(props: { stage: Extract<FlagshipStage, { kind: "discovery" }>; onContinue: () => void }) {
  const { stage } = props;
  const meta =
    stage.subtype === "artifact" || stage.subtype === "document"
      ? ARTIFACTS.find((a) => a.id === stage.refId)
      : stage.subtype === "character"
        ? CHARACTERS.find((c) => c.id === stage.refId)
        : null;

  return (
    <div className="relative overflow-hidden rounded-3xl border border-gold/40 bg-gradient-to-br from-amber-900/30 via-surface to-stone-900/30 p-6">
      <div className="particle-field" aria-hidden />
      <div className="relative text-center">
        <p className="text-[10px] tracking-[0.3em] text-gold">{stage.subtype === "character" ? "كشف بطاقة" : stage.subtype === "document" ? "وثيقة" : "أثرٌ نادر"}</p>
        <div className="reward-burst mx-auto mt-3 grid size-20 place-items-center rounded-3xl bg-background/60 text-4xl shadow-gold ring-gold-soft">
          {stage.icon}
        </div>
        <h2 className="font-display mt-3 text-xl font-bold shimmer-text">{stage.title}</h2>
        <p className="mx-auto mt-2 max-w-sm text-[12px] leading-relaxed text-muted-foreground">{stage.subtitle}</p>

        {stage.body && (
          <div className="parchment-dark mt-4 rounded-2xl border border-gold/20 p-4 text-right text-[12px] leading-relaxed">
            {stage.body}
          </div>
        )}

        {meta && (
          <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-gold/30 bg-background/40 px-3 py-1 text-[10px] text-gold">
            <Sparkles className="size-3" /> أُضيف إلى مجموعتك
          </div>
        )}

        <button onClick={props.onContinue} className="mt-6 w-full rounded-2xl bg-gradient-gold py-3.5 text-sm font-bold text-primary-foreground shadow-gold">
          متابعة المهمة ←
        </button>
      </div>
    </div>
  );
}

// ============================================================
// STAGE TRANSITION
// ============================================================
function StageTransition(props: {
  chapter: NonNullable<ReturnType<typeof getFlagshipChapter>>;
  stageIdx: number;
  isLast: boolean;
  onContinue: () => void;
}) {
  const completedStage = props.chapter.stages[props.stageIdx];
  const nextStage = !props.isLast ? props.chapter.stages[props.stageIdx + 1] : null;
  const NextIcon = nextStage ? KIND_ICON[nextStage.kind] : Trophy;
  return (
    <div className="animate-curtain mt-5 overflow-hidden rounded-3xl border border-gold/40 bg-gradient-to-b from-amber-900/20 via-surface to-stone-900/20 p-6 text-center">
      <div className="reward-burst mx-auto grid size-14 place-items-center rounded-full bg-gradient-gold text-2xl shadow-gold">
        <Check className="size-6 text-primary-foreground" />
      </div>
      <p className="mt-3 text-[10px] tracking-[0.3em] text-gold">اكتملت المرحلة</p>
      <h3 className="font-display mt-1 text-lg font-bold">{KIND_LABEL[completedStage.kind]} · {props.stageIdx + 1}/{props.chapter.stages.length}</h3>

      <div className="gold-divider my-5" />

      {nextStage ? (
        <>
          <p className="text-[10px] tracking-widest text-muted-foreground">المرحلة التالية</p>
          <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-gold/30 bg-background/40 px-3 py-1.5 text-[12px] text-gold">
            <NextIcon className="size-3.5" />
            <span>{KIND_LABEL[nextStage.kind]}</span>
          </div>
        </>
      ) : (
        <>
          <p className="text-[10px] tracking-widest text-muted-foreground">يبقى ختام الفصل…</p>
          <p className="mt-2 text-[12px] text-foreground/80">{props.chapter.finaleLine}</p>
        </>
      )}

      <button onClick={props.onContinue} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-gold py-3.5 text-sm font-bold text-primary-foreground shadow-gold animate-gold-pulse">
        <Sparkles className="size-4" /> {props.isLast ? "اختم الفصل" : "تابع المهمة"}
      </button>
    </div>
  );
}

// ============================================================
// FINALE
// ============================================================
function ChapterFinale(props: { chapter: NonNullable<ReturnType<typeof getFlagshipChapter>>; onBack: () => void }) {
  const { chapter } = props;
  const grantedArtifacts = (chapter.rewards.artifactIds ?? []).map((id) => ARTIFACTS.find((a) => a.id === id)).filter(Boolean);
  const grantedCharacters = (chapter.rewards.characterIds ?? []).map((id) => CHARACTERS.find((c) => c.id === id)).filter(Boolean);

  return (
    <div className="animate-curtain mt-5 overflow-hidden rounded-3xl border border-gold/50 bg-gradient-to-br from-amber-900/30 via-surface to-stone-900/30 p-6 text-center">
      <div className="particle-field" aria-hidden />
      <div className="relative">
        <div className="mx-auto grid size-16 place-items-center rounded-full bg-gradient-gold text-3xl shadow-gold animate-stamp">🏆</div>
        <p className="mt-3 text-[10px] tracking-[0.3em] text-gold">ختام الفصل</p>
        <h2 className="font-display mt-1 text-2xl font-bold shimmer-text">{chapter.finaleTitle}</h2>
        <p className="mx-auto mt-2 max-w-sm text-[12px] text-muted-foreground">{chapter.finaleLine}</p>

        {chapter.quote && (
          <blockquote className="mx-auto mt-4 max-w-sm rounded-2xl border-r-2 border-gold/60 bg-background/40 px-3 py-2 text-right">
            <Quote className="mb-1 size-3 text-gold/70" />
            <p className="font-display text-[12px] italic">«{chapter.quote}»</p>
            {chapter.quoteBy && <p className="mt-1 text-[10px] text-gold/80">— {chapter.quoteBy}</p>}
          </blockquote>
        )}

        <div className="gold-divider my-5" />

        <div className="space-y-2 text-right">
          <RewardRow label="نقاط الفصل" value={`+${toArDigit(chapter.rewards.points)} نقطة`} icon="⭐" />
          {grantedArtifacts.map((a) => (
            <RewardRow key={a!.id} label={a!.typeLabel} value={a!.name} icon={a!.icon} />
          ))}
          {grantedCharacters.map((c) => (
            <RewardRow key={c!.id} label="شخصية" value={c!.name} icon={c!.avatar} />
          ))}
        </div>

        <div className="mt-6 grid grid-cols-2 gap-2">
          <Link
            to="/collection"
            className="rounded-2xl border border-gold/40 px-3 py-2.5 text-xs text-gold transition hover:bg-gold/10"
          >
            افتح أرشيفك
          </Link>
          <button
            onClick={props.onBack}
            className="rounded-2xl bg-gradient-gold px-3 py-2.5 text-xs font-bold text-primary-foreground shadow-gold"
          >
            عُد إلى الحملة
          </button>
        </div>
      </div>
    </div>
  );
}

function RewardRow(props: { label: string; value: string; icon: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-gold/20 bg-background/40 p-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gold/15 text-xl">{props.icon}</span>
      <div className="min-w-0 flex-1 text-right">
        <p className="text-[10px] tracking-widest text-gold/80">{props.label}</p>
        <p className="font-display text-sm font-bold">{props.value}</p>
      </div>
      <Check className="size-4 text-gold" />
    </div>
  );
}

function toArDigit(n: number) {
  return n.toLocaleString("ar-EG");
}
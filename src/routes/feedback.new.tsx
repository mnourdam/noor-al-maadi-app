import { createFileRoute, useNavigate, useSearch, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { z } from "zod";
import { AppShell, Screen } from "@/components/AppShell";
import { FEEDBACK_CATEGORIES, type FeedbackCategory } from "@/lib/feedback/types";
import { captureRouteContext, parseCtxParam } from "@/lib/feedback/context";
import { createIssue } from "@/lib/feedback/api";
import { ChevronLeft, Send, MapPin } from "lucide-react";

const searchSchema = z.object({ ctx: z.string().optional(), category: z.string().optional() });

export const Route = createFileRoute("/feedback/new")({
  head: () => ({ meta: [{ title: "مساهمة جديدة — إرث" }] }),
  validateSearch: (s) => searchSchema.parse(s),
  component: FeedbackNew,
});

function FeedbackNew() {
  const search = useSearch({ from: "/feedback/new" });
  const navigate = useNavigate();
  const ctx = useMemo(() => {
    const base = parseCtxParam(search.ctx);
    // merge live route info as fallbacks
    return { ...captureRouteContext(), ...base };
  }, [search.ctx]);

  const [category, setCategory] = useState<FeedbackCategory | null>(
    (search.category as FeedbackCategory) ?? null,
  );
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!category || !title.trim() || !description.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const id = await createIssue({
        category,
        title: title.trim(),
        description: description.trim(),
        context: ctx,
      });
      await navigate({ to: "/feedback/$id", params: { id } });
    } catch (err) {
      setError((err as Error).message || "تعذّر الإرسال");
      setSubmitting(false);
    }
  }

  const contextChips = buildContextChips(ctx);

  return (
    <AppShell>
      <Screen title="مساهمة جديدة" subtitle="ساعدنا على تطوير إرث">
        <div className="mb-4">
          <Link to="/feedback" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-gold">
            <ChevronLeft className="size-3.5" /> رسائلي
          </Link>
        </div>

        {!category ? (
          <div>
            <p className="mb-3 text-sm text-muted-foreground">اختر نوع المساهمة</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {FEEDBACK_CATEGORIES.map((c) => {
                const Icon = c.icon;
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setCategory(c.key)}
                    className="group flex items-start gap-3 rounded-2xl border border-white/10 bg-surface/60 p-4 text-right transition hover:border-gold/40 hover:bg-gold/5"
                  >
                    <div className={`grid size-11 shrink-0 place-items-center rounded-xl ${c.accentBg} ${c.accent}`}>
                      <Icon className="size-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-display text-sm font-bold text-foreground">{c.label}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{c.hint}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <button
              type="button"
              onClick={() => setCategory(null)}
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-gold"
            >
              <ChevronLeft className="size-3" /> تغيير النوع
            </button>

            {contextChips.length > 0 && (
              <div className="rounded-2xl border border-white/10 bg-background/40 p-3">
                <p className="mb-2 inline-flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
                  <MapPin className="size-3" /> السياق المرفق
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {contextChips.map((c) => (
                    <span key={c} className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-muted-foreground">
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-bold text-muted-foreground">العنوان</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                placeholder="لخّص المساهمة في جملة"
                className="w-full rounded-xl border border-white/10 bg-background/60 px-3 py-2.5 text-sm text-foreground outline-none focus:border-gold/50"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold text-muted-foreground">التفاصيل</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={5000}
                rows={8}
                placeholder="اشرح المساهمة بالتفصيل — ما لاحظته، ما تقترحه، أو المعلومة الصحيحة."
                className="w-full resize-y rounded-xl border border-white/10 bg-background/60 px-3 py-2.5 text-sm leading-relaxed text-foreground outline-none focus:border-gold/50"
              />
              <p className="mt-1 text-[10px] text-muted-foreground/70">{description.length} / 5000</p>
            </div>

            {error && (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !title.trim() || !description.trim()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gold px-4 py-3 text-sm font-bold text-slate-950 disabled:opacity-50 hover:bg-gold/90"
            >
              <Send className="size-4" />
              {submitting ? "جاري الإرسال…" : (category ? (FEEDBACK_CATEGORIES.find((c) => c.key === category)?.submitLabel ?? "إرسال المساهمة") : "إرسال المساهمة")}
            </button>
            <p className="text-center text-[11px] text-muted-foreground/80">
              شكراً لمساهمتك في بناء أفضل منصة للتاريخ الإسلامي.
            </p>
          </form>
        )}
      </Screen>
    </AppShell>
  );
}

function buildContextChips(ctx: Record<string, unknown>): string[] {
  const chips: string[] = [];
  if (ctx.title) chips.push(`من: ${String(ctx.title)}`);
  else if (ctx.route) chips.push(`من: ${String(ctx.route)}`);
  if (ctx.encyclopedia_entity_id || ctx.entity_id) chips.push(`كيان: ${String(ctx.encyclopedia_entity_id ?? ctx.entity_id)}`);
  if (ctx.campaign_id) chips.push(`حملة: ${String(ctx.campaign_id)}`);
  if (ctx.atlas_entity_id) chips.push(`أطلس: ${String(ctx.atlas_entity_id)}`);
  if (ctx.investigation_id) chips.push(`تحقيق: ${String(ctx.investigation_id)}`);
  if (ctx.museum_item_id) chips.push(`متحف: ${String(ctx.museum_item_id)}`);
  if (ctx.platform) chips.push(`منصة: ${String(ctx.platform)}`);
  return chips;
}

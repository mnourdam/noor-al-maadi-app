import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import { AppShell, Screen } from "@/components/AppShell";
import { getIssueThread, markIssueRead, rateIssue, replyToIssue } from "@/lib/feedback/api";
import { CATEGORY_MAP, STATUS_LABELS, type FeedbackIssue, type FeedbackMessage } from "@/lib/feedback/types";
import { supabase } from "@/integrations/supabase/client";
import { useFeedbackPresence } from "@/lib/feedback/usePresence";
import { FeedbackPresenceBadge } from "@/components/feedback/FeedbackPresenceBadge";
import { ChevronLeft, Send, MapPin, Sparkles, ThumbsUp, ThumbsDown, Check } from "lucide-react";

export const Route = createFileRoute("/feedback/$id")({
  head: () => ({ meta: [{ title: "محادثة المساهمة — إرث" }] }),
  component: FeedbackThread,
});

function FeedbackThread() {
  const { id } = useParams({ from: "/feedback/$id" });
  const [issue, setIssue] = useState<FeedbackIssue | null>(null);
  const [messages, setMessages] = useState<FeedbackMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  const { otherOnline, otherTyping, markTyping } = useFeedbackPresence({
    issueId: id,
    role: "player",
    userId,
  });

  const load = useCallback(async () => {
    try {
      const { issue, messages } = await getIssueThread(id);
      setIssue(issue);
      setMessages(messages);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
    void markIssueRead(id).catch(() => {});
  }, [id, load]);

  // Realtime — refresh on new messages or status changes.
  useEffect(() => {
    const channel = supabase
      .channel(`feedback-thread-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "feedback_messages", filter: `issue_id=eq.${id}` }, () => { void load(); })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "feedback_issues", filter: `id=eq.${id}` }, () => { void load(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id, load]);

  async function onSend(e: React.FormEvent) {
    e.preventDefault();
    const body = reply.trim();
    if (!body) return;
    setSending(true);
    try {
      await replyToIssue(id, body, false);
      setReply("");
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  const cat = issue ? CATEGORY_MAP[issue.category] : null;
  const st = issue ? STATUS_LABELS[issue.status] : null;
  const contextChips = useMemo(() => (issue ? buildContextChips(issue.context) : []), [issue]);

  return (
    <AppShell>
      <Screen title="محادثة المساهمة" subtitle="حوارك مع فريق إرث">
        <div className="mb-4">
          <Link to="/feedback" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-gold">
            <ChevronLeft className="size-3.5" /> رسائلي
          </Link>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-white/10 bg-surface/40 p-6 text-center text-sm text-muted-foreground">جاري التحميل…</div>
        ) : error || !issue ? (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
            {error ?? "تعذّر العثور على المحادثة"}
          </div>
        ) : (
          <>
            <div className="rounded-2xl border border-white/10 bg-surface/60 p-4">
              <div className="flex items-start gap-3">
                {cat && (
                  <div className={`grid size-10 shrink-0 place-items-center rounded-xl ${cat.accentBg} ${cat.accent}`}>
                    <cat.icon className="size-4" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-display text-base font-bold text-foreground">{issue.title}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    {st && (
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${st.chip}`}>
                        <span className={`size-1.5 rounded-full ${st.dot}`} />
                        {st.label}
                      </span>
                    )}
                    {cat && <span>{cat.label}</span>}
                    <span>·</span>
                    <span>{new Date(issue.created_at).toLocaleDateString("ar", { day: "numeric", month: "short", year: "numeric" })}</span>
                  </div>
                  <div className="mt-2">
                    <FeedbackPresenceBadge
                      viewerRole="player"
                      otherOnline={otherOnline}
                      otherTyping={otherTyping}
                    />
                  </div>
                </div>
              </div>
              {contextChips.length > 0 && (
                <div className="mt-3 border-t border-white/5 pt-3">
                  <p className="mb-1.5 inline-flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground">
                    <MapPin className="size-3" /> السياق
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {contextChips.map((c) => (
                      <span key={c} className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-muted-foreground">{c}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <ul className="my-4 space-y-3">
              {messages.map((m) => (
                <MessageBubble key={m.id} message={m} reporterId={issue.reporter_id ?? null} />
              ))}

            </ul>

            {issue.status === "closed" ? (
              <RatingPanel
                issueId={issue.id}
                initialRating={issue.player_rating ?? null}
                onRated={() => void load()}
              />
            ) : (
              <form onSubmit={onSend} className="rounded-2xl border border-white/10 bg-surface/60 p-3">
                <textarea
                  value={reply}
                  onChange={(e) => { setReply(e.target.value); markTyping(); }}
                  rows={3}
                  maxLength={5000}
                  placeholder="اكتب ردك…"
                  className="w-full resize-none rounded-xl border border-white/10 bg-background/60 p-3 text-sm leading-relaxed text-foreground outline-none focus:border-gold/50"
                />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="text-[10px] text-muted-foreground/70">{reply.length} / 5000</p>
                  <button
                    type="submit"
                    disabled={sending || !reply.trim()}
                    className="inline-flex items-center gap-2 rounded-xl bg-gold px-3 py-2 text-xs font-bold text-slate-950 disabled:opacity-50 hover:bg-gold/90"
                  >
                    <Send className="size-3.5" />
                    {sending ? "جاري الإرسال…" : "إرسال الرد"}
                  </button>
                </div>
              </form>
            )}
          </>
        )}
      </Screen>
    </AppShell>
  );
}

function RatingPanel({ issueId, initialRating, onRated }: { issueId: string; initialRating: number | null; onRated: () => void }) {
  const [rating, setRating] = useState<number | null>(initialRating);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(value: 1 | 5) {
    if (busy || rating != null) return;
    setBusy(true);
    setError(null);
    try {
      await rateIssue(issueId, value);
      setRating(value);
      onRated();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (rating != null) {
    return (
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-center">
        <div className="inline-flex items-center gap-2 text-sm font-bold text-emerald-200">
          <Check className="size-4" /> شكراً لتقييمك — يساعدنا على تحسين الدعم.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-surface/60 p-4 text-center">
      <p className="font-display text-sm font-bold text-foreground">هل ساعدك هذا الرد؟</p>
      <p className="mt-1 text-[11px] text-muted-foreground">تقييمك يساعد فريق إرث على تحسين جودة الدعم.</p>
      <div className="mt-3 flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => void submit(5)}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs font-bold text-emerald-200 transition hover:bg-emerald-500/20 disabled:opacity-50"
        >
          <ThumbsUp className="size-4" /> نعم
        </button>
        <button
          type="button"
          onClick={() => void submit(1)}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-xs font-bold text-rose-200 transition hover:bg-rose-500/20 disabled:opacity-50"
        >
          <ThumbsDown className="size-4" /> لا
        </button>
      </div>
      {error && <p className="mt-2 text-[11px] text-rose-300">{error}</p>}
      <p className="mt-3 text-[10px] text-muted-foreground/70">هذه المحادثة مغلقة. افتح مساهمة جديدة إن احتجت.</p>
    </div>
  );
}

function MessageBubble({ message }: { message: FeedbackMessage }) {
  const isAdmin = message.author_role === "admin";
  return (
    <li className={`flex ${isAdmin ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[85%] rounded-2xl border p-3 ${
          isAdmin
            ? "border-gold/30 bg-gold/10 text-foreground"
            : "border-white/10 bg-surface/70 text-foreground"
        } ${message.is_internal ? "opacity-70 ring-1 ring-amber-500/30" : ""}`}
      >
        <div className="mb-1 inline-flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground">
          {isAdmin ? <><Sparkles className="size-3 text-gold" /> فريق إرث</> : <>أنت</>}
          {message.is_internal && <span className="rounded-full bg-amber-500/20 px-1.5 text-amber-200">داخلي</span>}
          <span>·</span>
          <span>{new Date(message.created_at).toLocaleString("ar", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
        </div>
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.body}</p>
      </div>
    </li>
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
  if (ctx.app_version) chips.push(`إصدار: ${String(ctx.app_version)}`);
  return chips;
}

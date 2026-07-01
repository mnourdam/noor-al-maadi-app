import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell, Screen } from "@/components/AppShell";
import { listMyIssues } from "@/lib/feedback/api";
import { CATEGORY_MAP, STATUS_LABELS, type FeedbackIssue } from "@/lib/feedback/types";
import { Plus, MessageSquare, Inbox, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/feedback/")({
  head: () => ({ meta: [{ title: "رسائلي — إرث" }] }),
  component: FeedbackInbox,
});

function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "الآن";
  if (min < 60) return `قبل ${min} د`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `قبل ${hr} س`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `قبل ${day} ي`;
  return new Date(iso).toLocaleDateString("ar", { month: "short", day: "numeric" });
}

function FeedbackInbox() {
  const [rows, setRows] = useState<FeedbackIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listMyIssues()
      .then((r) => setRows(r))
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AppShell>
      <Screen title="مساهماتي" subtitle="محادثاتك مع فريق إرث">
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            كل مساهمة تفتح محادثة مباشرة مع الفريق.
          </p>
          <Link
            to="/feedback/new"
            className="inline-flex items-center gap-2 rounded-xl bg-gold px-3 py-2 text-xs font-bold text-slate-950 hover:bg-gold/90"
          >
            <Plus className="size-4" /> مساهمة جديدة
          </Link>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-white/10 bg-surface/40 p-6 text-center text-sm text-muted-foreground">
            جاري التحميل…
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
            تعذر التحميل: {error}
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/15 bg-surface/40 p-8 text-center">
            <Inbox className="mx-auto mb-3 size-8 text-muted-foreground" />
            <p className="font-display text-sm font-bold text-foreground">لا توجد مساهمات بعد</p>
            <p className="mt-1 text-xs text-muted-foreground">شارك أول ملاحظة أو اقتراح لمساعدة إرث على النمو.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => {
              const cat = CATEGORY_MAP[r.category];
              const st = STATUS_LABELS[r.status];
              const Icon = cat?.icon ?? MessageSquare;
              return (
                <li key={r.id}>
                  <Link
                    to="/feedback/$id"
                    params={{ id: r.id }}
                    className="flex items-start gap-3 rounded-2xl border border-white/10 bg-surface/60 p-3 transition hover:border-gold/30"
                  >
                    <div className={`grid size-10 shrink-0 place-items-center rounded-xl ${cat?.accentBg ?? "bg-white/10"} ${cat?.accent ?? ""}`}>
                      <Icon className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="min-w-0 flex-1 truncate font-display text-sm font-bold text-foreground">
                          {r.title}
                        </p>
                        {r.player_unread && <span className="size-2 shrink-0 rounded-full bg-gold" aria-label="غير مقروء" />}
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${st.chip}`}>
                          <span className={`size-1.5 rounded-full ${st.dot}`} />
                          {st.label}
                        </span>
                        <span>{cat?.label}</span>
                        <span>·</span>
                        <span>{relativeTime(r.last_reply_at ?? r.created_at)}</span>
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Screen>
    </AppShell>
  );
}

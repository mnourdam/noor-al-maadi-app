import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { AppShell, Screen } from "@/components/AppShell";
import { AdminGate } from "@/lib/admin-guard";
import { adminListIssues, getIssueThread, replyToIssue, setIssueStatus, type AdminIssueRow } from "@/lib/feedback/api";
import { CATEGORY_MAP, FEEDBACK_CATEGORIES, STATUS_LABELS, type FeedbackCategory, type FeedbackMessage, type FeedbackStatus } from "@/lib/feedback/types";
import { Search, RefreshCw, MessageSquare, Send, MapPin, X, ExternalLink } from "lucide-react";

const STATUS_ORDER: FeedbackStatus[] = ["new", "review", "planned", "fixed", "closed"];

export const Route = createFileRoute("/admin/community")({
  head: () => ({ meta: [{ title: "مركز مساهمات المجتمع — إرث" }] }),
  component: AdminCommunity,
});

function AdminCommunity() {
  const [status, setStatus] = useState<FeedbackStatus | "all">("all");
  const [category, setCategory] = useState<FeedbackCategory | "all">("all");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<AdminIssueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await adminListIssues({
        status: status === "all" ? undefined : status,
        category: category === "all" ? undefined : category,
        search: search.trim() || undefined,
      });
      setRows(list);
    } finally {
      setLoading(false);
    }
  }, [status, category, search]);

  useEffect(() => { void load(); }, [load]);

  return (
    <AdminGate>
      <AppShell>
        <Screen title="مساهمات المجتمع" subtitle="حوار مباشر مع اللاعبين">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void load(); }}
                placeholder="ابحث في العنوان أو الوصف…"
                className="w-full rounded-xl border border-white/10 bg-background/60 py-2 pr-9 pl-3 text-sm outline-none focus:border-gold/40"
              />
            </div>
            <button onClick={() => void load()} className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-background/60 px-3 py-2 text-xs hover:border-gold/30">
              <RefreshCw className="size-3.5" /> تحديث
            </button>
          </div>

          <div className="mb-3 flex flex-wrap gap-1.5">
            <FilterChip active={status === "all"} onClick={() => setStatus("all")}>كل الحالات</FilterChip>
            {STATUS_ORDER.map((s) => (
              <FilterChip key={s} active={status === s} onClick={() => setStatus(s)}>{STATUS_LABELS[s].label}</FilterChip>
            ))}
          </div>
          <div className="mb-4 flex flex-wrap gap-1.5">
            <FilterChip active={category === "all"} onClick={() => setCategory("all")}>كل الأنواع</FilterChip>
            {FEEDBACK_CATEGORIES.map((c) => (
              <FilterChip key={c.key} active={category === c.key} onClick={() => setCategory(c.key)}>{c.label}</FilterChip>
            ))}
          </div>

          {loading ? (
            <div className="rounded-2xl border border-white/10 bg-surface/40 p-6 text-center text-sm text-muted-foreground">جاري التحميل…</div>
          ) : rows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/15 bg-surface/40 p-8 text-center text-sm text-muted-foreground">
              لا توجد مساهمات مطابقة.
            </div>
          ) : (
            <ul className="space-y-2">
              {rows.map((r) => {
                const cat = CATEGORY_MAP[r.category];
                const st = STATUS_LABELS[r.status];
                const Icon = cat?.icon ?? MessageSquare;
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => setActiveId(r.id)}
                      className="flex w-full items-start gap-3 rounded-2xl border border-white/10 bg-surface/60 p-3 text-right transition hover:border-gold/30"
                    >
                      <div className={`grid size-10 shrink-0 place-items-center rounded-xl ${cat?.accentBg ?? "bg-white/10"} ${cat?.accent ?? ""}`}>
                        <Icon className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="min-w-0 flex-1 truncate font-display text-sm font-bold text-foreground">{r.title}</p>
                          {r.admin_unread && <span className="size-2 shrink-0 rounded-full bg-rose-400" title="جديد" />}
                        </div>
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{r.description}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${st.chip}`}>
                            <span className={`size-1.5 rounded-full ${st.dot}`} />
                            {st.label}
                          </span>
                          <span>{cat?.label}</span>
                          <span>·</span>
                          <span>{r.reporter?.display_name ?? r.reporter?.username ?? "زائر"}</span>
                          <span>·</span>
                          <span>{new Date(r.created_at).toLocaleDateString("ar", { day: "numeric", month: "short" })}</span>
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Screen>

        {activeId && (
          <AdminIssueDrawer
            id={activeId}
            onClose={() => { setActiveId(null); void load(); }}
          />
        )}
      </AppShell>
    </AdminGate>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-[11px] transition ${
        active ? "border-gold/50 bg-gold/15 text-gold" : "border-white/10 bg-background/40 text-muted-foreground hover:border-white/20"
      }`}
    >
      {children}
    </button>
  );
}

function AdminIssueDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const [data, setData] = useState<{ issue: AdminIssueRow; messages: FeedbackMessage[] } | null>(null);
  const [reply, setReply] = useState("");
  const [internal, setInternal] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await getIssueThread(id);
    setData(res as unknown as { issue: AdminIssueRow; messages: FeedbackMessage[] });
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  async function send() {
    if (!reply.trim()) return;
    setBusy(true);
    try {
      await replyToIssue(id, reply.trim(), internal);
      setReply("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(status: FeedbackStatus) {
    setBusy(true);
    try {
      await setIssueStatus(id, status);
      await load();
    } finally {
      setBusy(false);
    }
  }

  const issue = data?.issue;
  const cat = issue ? CATEGORY_MAP[issue.category] : null;
  const ctx = (issue?.context ?? {}) as Record<string, unknown>;
  const jumpLink = buildJumpLink(ctx);

  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true">
      <button aria-label="إغلاق" className="flex-1 bg-black/60" onClick={onClose} />
      <aside className="flex h-full w-full max-w-lg flex-col overflow-hidden border-l border-white/10 bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 p-4">
          <p className="font-display text-sm font-bold">تفاصيل المساهمة</p>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-white/5"><X className="size-4" /></button>
        </div>

        {!issue ? (
          <div className="p-6 text-center text-sm text-muted-foreground">جاري التحميل…</div>
        ) : (
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="space-y-3 border-b border-white/10 p-4">
              <div className="flex items-start gap-3">
                {cat && (
                  <div className={`grid size-10 shrink-0 place-items-center rounded-xl ${cat.accentBg} ${cat.accent}`}>
                    <cat.icon className="size-4" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-display text-sm font-bold text-foreground">{issue.title}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {issue.reporter?.display_name ?? issue.reporter?.username ?? "زائر"} · {new Date(issue.created_at).toLocaleString("ar", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] text-muted-foreground">الحالة:</span>
                {STATUS_ORDER.map((s) => (
                  <button
                    key={s}
                    disabled={busy}
                    onClick={() => void changeStatus(s)}
                    className={`rounded-full border px-2 py-0.5 text-[10px] transition ${
                      issue.status === s
                        ? `${STATUS_LABELS[s].chip}`
                        : "border-white/10 bg-background/40 text-muted-foreground hover:border-white/25"
                    }`}
                  >
                    {STATUS_LABELS[s].label}
                  </button>
                ))}
              </div>

              {Object.keys(ctx).length > 0 && (
                <div className="rounded-xl border border-white/10 bg-surface/40 p-2.5">
                  <p className="mb-1 inline-flex items-center gap-1 text-[10px] font-bold text-muted-foreground">
                    <MapPin className="size-3" /> السياق
                  </p>
                  <div className="flex flex-wrap gap-1 text-[10px]">
                    {Object.entries(ctx).map(([k, v]) => (
                      <span key={k} className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-muted-foreground">
                        {k}: {String(v)}
                      </span>
                    ))}
                  </div>
                  {jumpLink && (
                    <a href={jumpLink} className="mt-2 inline-flex items-center gap-1 text-[11px] text-gold hover:underline">
                      <ExternalLink className="size-3" /> فتح المحتوى المرتبط
                    </a>

                  )}
                </div>
              )}
            </div>

            <ul className="flex-1 space-y-3 overflow-y-auto p-4">
              {data!.messages.map((m) => (
                <li key={m.id} className={`flex ${m.author_role === "admin" ? "justify-start" : "justify-end"}`}>
                  <div className={`max-w-[85%] rounded-2xl border p-3 ${m.author_role === "admin" ? "border-gold/30 bg-gold/10" : "border-white/10 bg-surface/70"} ${m.is_internal ? "ring-1 ring-amber-500/40" : ""}`}>
                    <div className="mb-1 inline-flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground">
                      {m.author_role === "admin" ? "فريق إرث" : "اللاعب"}
                      {m.is_internal && <span className="rounded-full bg-amber-500/20 px-1.5 text-amber-200">ملاحظة داخلية</span>}
                      <span>·</span>
                      <span>{new Date(m.created_at).toLocaleString("ar", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{m.body}</p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="border-t border-white/10 p-3">
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                rows={3}
                maxLength={5000}
                placeholder="اكتب ردك للّاعب أو ملاحظة داخلية…"
                className="w-full resize-none rounded-xl border border-white/10 bg-background/60 p-3 text-sm text-foreground outline-none focus:border-gold/50"
              />
              <div className="mt-2 flex items-center justify-between gap-2">
                <label className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
                  ملاحظة داخلية (لا يراها اللاعب)
                </label>
                <button
                  onClick={() => void send()}
                  disabled={busy || !reply.trim()}
                  className="inline-flex items-center gap-2 rounded-xl bg-gold px-3 py-2 text-xs font-bold text-slate-950 disabled:opacity-50 hover:bg-gold/90"
                >
                  <Send className="size-3.5" /> إرسال
                </button>
              </div>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

function buildJumpLink(ctx: Record<string, unknown>): string | null {
  if (typeof ctx.encyclopedia_entity_id === "string") return `/encyclopedia/entity/${ctx.encyclopedia_entity_id}`;
  if (typeof ctx.entity_id === "string") return `/encyclopedia/entity/${ctx.entity_id}`;
  if (typeof ctx.campaign_id === "string") return `/campaigns/imported/${ctx.campaign_id}`;
  if (typeof ctx.investigation_id === "string") return `/investigation/${ctx.investigation_id}`;
  if (typeof ctx.atlas_entity_id === "string") return `/map?focus=${ctx.atlas_entity_id}`;
  if (typeof ctx.route === "string" && ctx.route.startsWith("/")) return ctx.route;
  return null;
}

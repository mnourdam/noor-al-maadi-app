import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminGate } from "@/lib/admin-guard";
import { supabase } from "@/integrations/supabase/client";
import { useFeedbackPresence } from "@/lib/feedback/usePresence";
import { FeedbackPresenceBadge } from "@/components/feedback/FeedbackPresenceBadge";
import {
  adminFeedbackStats,
  adminListIssues,
  getIssueThread,
  replyToIssue,
  setIssueStatus,
  type AdminFeedbackStats,
  type AdminIssueRow,
} from "@/lib/feedback/api";
import {
  CATEGORY_MAP,
  FEEDBACK_CATEGORIES,
  STATUS_LABELS,
  type FeedbackCategory,
  type FeedbackMessage,
  type FeedbackStatus,
} from "@/lib/feedback/types";
import {
  Search,
  RefreshCw,
  MessageSquare,
  Send,
  MapPin,
  X,
  ExternalLink,
  Clock,
  CheckCircle2,
  Star,
  Inbox,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";

const STATUS_ORDER: FeedbackStatus[] = ["new", "review", "planned", "fixed", "closed"];

export const Route = createFileRoute("/admin/community")({
  head: () => ({ meta: [{ title: "مساهمات المجتمع — إدارة إرث" }] }),
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

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AdminGate>
      <AdminLayout
        title="مساهمات المجتمع"
        subtitle="إدارة البلاغات والاقتراحات وتصحيحات المعلومات والتواصل مع اللاعبين."
        breadcrumbs={[{ label: "مساهمات المجتمع" }]}
        actions={
          <button
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900/60 px-2.5 py-1 text-xs text-slate-200 hover:border-amber-400/40 hover:text-amber-100"
          >
            <RefreshCw className="h-3.5 w-3.5" /> تحديث
          </button>
        }
      >
        <StatsDashboard refreshKey={rows.length} />

        {/* Filters + search */}
        <section className="mb-4 rounded-lg border border-slate-800 bg-slate-900/60 p-3">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[240px] flex-1">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void load();
                }}
                placeholder="بحث في العنوان أو الوصف…"
                className="w-full rounded-md border border-slate-700 bg-slate-950/60 py-2 pr-9 pl-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-amber-400/40"
              />
            </div>
          </div>

          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-bold text-slate-500">الحالة:</span>
            <FilterChip active={status === "all"} onClick={() => setStatus("all")}>
              الكل
            </FilterChip>
            {STATUS_ORDER.map((s) => (
              <FilterChip key={s} active={status === s} onClick={() => setStatus(s)}>
                {STATUS_LABELS[s].label}
              </FilterChip>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-bold text-slate-500">النوع:</span>
            <FilterChip active={category === "all"} onClick={() => setCategory("all")}>
              الكل
            </FilterChip>
            {FEEDBACK_CATEGORIES.map((c) => (
              <FilterChip key={c.key} active={category === c.key} onClick={() => setCategory(c.key)}>
                {c.label}
              </FilterChip>
            ))}
          </div>
        </section>

        {/* Table */}
        <section className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900/60">
          <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
            <div className="inline-flex items-center gap-2 text-xs text-slate-300">
              <Inbox className="h-3.5 w-3.5 text-amber-300" />
              <span>قائمة المساهمات</span>
              <span className="text-slate-500">({rows.length})</span>
            </div>
          </div>

          {loading ? (
            <div className="p-8 text-center text-sm text-slate-400">جاري التحميل…</div>
          ) : rows.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-400">لا توجد مساهمات مطابقة.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse text-right text-sm">
                <thead className="bg-slate-950/60 text-[11px] uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-3 py-2 font-semibold">الحالة</th>
                    <th className="px-3 py-2 font-semibold">النوع</th>
                    <th className="px-3 py-2 font-semibold">المُبلِّغ</th>
                    <th className="px-3 py-2 font-semibold">الموضوع</th>
                    <th className="px-3 py-2 font-semibold">آخر رد</th>
                    <th className="px-3 py-2 font-semibold">تاريخ الإنشاء</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const cat = CATEGORY_MAP[r.category];
                    const st = STATUS_LABELS[r.status];
                    const Icon = cat?.icon ?? MessageSquare;
                    const isActive = activeId === r.id;
                    return (
                      <tr
                        key={r.id}
                        onClick={() => setActiveId(r.id)}
                        className={`cursor-pointer border-t border-slate-800/60 transition ${
                          isActive ? "bg-amber-500/5" : "hover:bg-slate-800/40"
                        }`}
                      >
                        <td className="px-3 py-2.5">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${st.chip}`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
                            {st.label}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="inline-flex items-center gap-1.5 text-xs text-slate-300">
                            <Icon className={`h-3.5 w-3.5 ${cat?.accent ?? "text-slate-400"}`} />
                            {cat?.label ?? r.category}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-slate-300">
                          {r.reporter?.display_name ?? r.reporter?.username ?? "زائر"}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            {r.admin_unread && (
                              <span className="h-2 w-2 shrink-0 rounded-full bg-rose-400" title="جديد" />
                            )}
                            <div className="min-w-0">
                              <p className="truncate font-medium text-slate-100">
                                {r.title}
                                {r.player_rating != null && (
                                  <span
                                    className={`ms-2 inline-flex items-center gap-0.5 align-middle ${r.player_rating >= 4 ? "text-emerald-300" : "text-rose-300"}`}
                                    title={`تقييم اللاعب: ${r.player_rating}/5`}
                                  >
                                    {r.player_rating >= 4 ? <ThumbsUp className="h-3 w-3" /> : <ThumbsDown className="h-3 w-3" />}
                                  </span>
                                )}
                              </p>
                              <p className="truncate text-[11px] text-slate-500">{r.description}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-[11px] text-slate-400">
                          {r.last_reply_at
                            ? `${r.last_reply_by === "admin" ? "الإدارة" : "اللاعب"} · ${new Date(
                                r.last_reply_at,
                              ).toLocaleDateString("ar", { day: "numeric", month: "short" })}`
                            : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-[11px] text-slate-400">
                          {new Date(r.created_at).toLocaleDateString("ar", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {activeId && (
          <AdminIssueDrawer
            id={activeId}
            onClose={() => {
              setActiveId(null);
              void load();
            }}
          />
        )}
      </AdminLayout>
    </AdminGate>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md border px-2.5 py-1 text-[11px] transition ${
        active
          ? "border-amber-400/50 bg-amber-500/10 text-amber-100"
          : "border-slate-700 bg-slate-950/40 text-slate-300 hover:border-slate-600"
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
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  const { otherOnline, otherTyping, markTyping } = useFeedbackPresence({
    issueId: id,
    role: "admin",
    userId,
  });

  const load = useCallback(async () => {
    const res = await getIssueThread(id);
    setData(res as unknown as { issue: AdminIssueRow; messages: FeedbackMessage[] });
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

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
    <div dir="rtl" className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true">
      <button aria-label="إغلاق" className="flex-1 bg-black/70" onClick={onClose} />
      <aside className="flex h-full w-full max-w-xl flex-col overflow-hidden border-l border-amber-500/20 bg-slate-950 text-slate-100 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/70 px-4 py-3">
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold text-amber-100">تفاصيل المساهمة</p>
            <FeedbackPresenceBadge viewerRole="admin" otherOnline={otherOnline} otherTyping={otherTyping} />
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {!issue ? (
          <div className="p-6 text-center text-sm text-slate-400">جاري التحميل…</div>
        ) : (
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="space-y-3 border-b border-slate-800 bg-slate-900/40 p-4">
              <div className="flex items-start gap-3">
                {cat && (
                  <div
                    className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${cat.accentBg} ${cat.accent}`}
                  >
                    <cat.icon className="h-4 w-4" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-100">{issue.title}</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    {issue.reporter?.display_name ?? issue.reporter?.username ?? "زائر"} ·{" "}
                    {new Date(issue.created_at).toLocaleString("ar", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                  {issue.player_rating != null && (
                    <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-bold text-amber-100">
                      {issue.player_rating >= 4 ? (
                        <ThumbsUp className="h-3 w-3" />
                      ) : (
                        <ThumbsDown className="h-3 w-3" />
                      )}
                      تقييم اللاعب: {issue.player_rating >= 4 ? "مفيد" : "غير مفيد"}
                      {issue.player_rating_at && (
                        <span className="font-normal text-amber-200/70">
                          · {new Date(issue.player_rating_at).toLocaleDateString("ar", { day: "numeric", month: "short" })}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-bold text-slate-500">الحالة:</span>
                {STATUS_ORDER.map((s) => (
                  <button
                    key={s}
                    disabled={busy}
                    onClick={() => void changeStatus(s)}
                    className={`rounded-md border px-2 py-0.5 text-[10px] transition ${
                      issue.status === s
                        ? `${STATUS_LABELS[s].chip}`
                        : "border-slate-700 bg-slate-950/40 text-slate-400 hover:border-slate-600"
                    }`}
                  >
                    {STATUS_LABELS[s].label}
                  </button>
                ))}
              </div>

              {Object.keys(ctx).length > 0 && (
                <div className="rounded-md border border-slate-800 bg-slate-950/60 p-2.5">
                  <p className="mb-1 inline-flex items-center gap-1 text-[10px] font-bold text-slate-400">
                    <MapPin className="h-3 w-3" /> السياق
                  </p>
                  <div className="flex flex-wrap gap-1 text-[10px]">
                    {Object.entries(ctx).map(([k, v]) => (
                      <span
                        key={k}
                        className="rounded-full border border-slate-700 bg-slate-900/60 px-2 py-0.5 text-slate-400"
                      >
                        {k}: {String(v)}
                      </span>
                    ))}
                  </div>
                  {jumpLink && (
                    <a
                      href={jumpLink}
                      className="mt-2 inline-flex items-center gap-1 text-[11px] text-amber-300 hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" /> فتح المحتوى المرتبط
                    </a>
                  )}
                </div>
              )}
            </div>

            <ul className="flex-1 space-y-3 overflow-y-auto bg-slate-950 p-4">
              {data!.messages.map((m) => {
                // Canonical classifier — never infer authorship from order.
                const isAdmin = isStaffMessage(m, data!.issue.reporter_id ?? null);

                return (
                  <li key={m.id} className={`flex ${isAdmin ? "justify-start" : "justify-end"}`}>
                    <div
                      className={`max-w-[85%] rounded-lg border p-3 ${
                        isAdmin
                          ? "border-amber-500/30 bg-amber-500/10"
                          : "border-slate-700 bg-slate-900/70"
                      } ${m.is_internal ? "ring-1 ring-amber-400/50" : ""}`}
                    >
                      <div className="mb-1 inline-flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
                        {isAdmin ? "فريق إرث" : "اللاعب"}
                        {m.is_internal && (
                          <span className="rounded-full bg-amber-500/25 px-1.5 text-amber-100">
                            ملاحظة داخلية
                          </span>
                        )}
                        <span>·</span>
                        <span>
                          {new Date(m.created_at).toLocaleString("ar", {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-100">
                        {m.body}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="border-t border-slate-800 bg-slate-900/60 p-3">
              <textarea
                value={reply}
                onChange={(e) => { setReply(e.target.value); markTyping(); }}
                rows={3}
                maxLength={5000}
                placeholder="اكتب ردك للّاعب أو ملاحظة داخلية…"
                className="w-full resize-none rounded-md border border-slate-700 bg-slate-950/60 p-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-amber-400/40"
              />
              <div className="mt-2 flex items-center justify-between gap-2">
                <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-300">
                  <input
                    type="checkbox"
                    checked={internal}
                    onChange={(e) => setInternal(e.target.checked)}
                  />
                  ملاحظة داخلية (لا يراها اللاعب)
                </label>
                <button
                  onClick={() => void send()}
                  disabled={busy || !reply.trim()}
                  className="inline-flex items-center gap-2 rounded-md bg-amber-500 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" /> إرسال
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
  if (typeof ctx.encyclopedia_entity_id === "string")
    return `/encyclopedia/entity/${ctx.encyclopedia_entity_id}`;
  if (typeof ctx.entity_id === "string") return `/encyclopedia/entity/${ctx.entity_id}`;
  if (typeof ctx.campaign_id === "string") return `/campaigns/imported/${ctx.campaign_id}`;
  if (typeof ctx.investigation_id === "string") return `/investigation/${ctx.investigation_id}`;
  if (typeof ctx.atlas_entity_id === "string") return `/map?focus=${ctx.atlas_entity_id}`;
  if (typeof ctx.route === "string" && ctx.route.startsWith("/")) return ctx.route;
  return null;
}

function formatDuration(seconds: number): string {
  if (!seconds || !isFinite(seconds) || seconds <= 0) return "—";
  const h = seconds / 3600;
  if (h < 1) return `${Math.max(1, Math.round(seconds / 60))} د`;
  if (h < 48) return `${h.toFixed(1)} س`;
  return `${(h / 24).toFixed(1)} ي`;
}

function StatsDashboard({ refreshKey }: { refreshKey: number }) {
  const [stats, setStats] = useState<AdminFeedbackStats | null>(null);
  useEffect(() => {
    adminFeedbackStats().then(setStats).catch(() => setStats(null));
  }, [refreshKey]);

  const counts = stats?.counts ?? {};
  const total = STATUS_ORDER.reduce((sum, s) => sum + (counts[s] ?? 0), 0);

  return (
    <section className="mb-4 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-bold text-amber-100">لوحة القيادة</p>
        <span className="text-[10px] text-slate-400">إجمالي: {total}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {STATUS_ORDER.map((s) => {
          const st = STATUS_LABELS[s];
          const n = counts[s] ?? 0;
          return (
            <div key={s} className={`rounded-md border p-3 ${st.chip}`}>
              <div className="inline-flex items-center gap-1.5 text-[10px] font-bold opacity-80">
                <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} /> {st.label}
              </div>
              <p className="mt-1 text-2xl font-bold">{n}</p>
            </div>
          );
        })}
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <MetricPill
          icon={Clock}
          label="متوسط أول رد"
          value={formatDuration(stats?.avg_first_response_seconds ?? 0)}
        />
        <MetricPill
          icon={CheckCircle2}
          label="متوسط زمن الحل"
          value={formatDuration(stats?.avg_resolution_seconds ?? 0)}
        />
        <MetricPill
          icon={Star}
          label="جودة الدعم"
          value={
            stats && stats.rating_count > 0
              ? `${stats.avg_rating.toFixed(1)} / 5 · ${stats.rating_count} تقييم`
              : "—"
          }
        />
      </div>
    </section>
  );
}

function MetricPill({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-slate-800 bg-slate-950/60 p-3">
      <div className="grid h-8 w-8 place-items-center rounded-md bg-amber-500/15 text-amber-300">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-slate-400">{label}</p>
        <p className="text-sm font-bold text-slate-100">{value}</p>
      </div>
    </div>
  );
}

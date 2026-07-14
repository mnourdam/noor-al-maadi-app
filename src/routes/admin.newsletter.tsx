import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Search, Download, Ban, RotateCcw, ShieldAlert, AlertTriangle, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { AdminGate } from "@/lib/admin-guard";
import {
  fetchNewsletterStats, listNewsletterSubscribers,
  adminUnsubscribeNewsletter, adminResubscribeNewsletter,
  NEWSLETTER_DOI_ENABLED,
  type NewsletterStats, type AdminSubscriberRow, type NewsletterFilter,
} from "@/lib/newsletter";
import { maskEmail } from "@/lib/authDialog";

export const Route = createFileRoute("/admin/newsletter")({
  head: () => ({
    meta: [
      { title: "إدارة النشرة البريدية — إرث" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => <AdminGate><NewsletterAdminPage /></AdminGate>,
});

const FILTER_LABELS: Record<NewsletterFilter, string> = {
  all: "الكل",
  active: "نشِط ومؤكَّد",
  confirmed: "مؤكَّد",
  unconfirmed: "غير مؤكَّد",
  unsubscribed: "ألغى الاشتراك",
  anonymous: "بدون حساب",
  authenticated: "بحساب",
  suppressed: "على قائمة الحظر",
};

function NewsletterAdminPage() {
  const [stats, setStats] = useState<NewsletterStats | null>(null);
  const [rows, setRows] = useState<AdminSubscriberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filter, setFilter] = useState<NewsletterFilter>("all");
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [revealEmails, setRevealEmails] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [s, r] = await Promise.all([
        fetchNewsletterStats(),
        listNewsletterSubscribers({
          filter,
          search: search.trim() || null,
          source: source.trim() || null,
          from: fromDate ? new Date(fromDate).toISOString() : null,
          to: toDate ? new Date(toDate).toISOString() : null,
          limit: 500,
        }),
      ]);
      setStats(s); setRows(r);
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      if (/forbidden/i.test(msg)) toast.error("لا تملك صلاحية إدارة النشرة");
    } finally { setLoading(false); }
  }, [filter, search, source, fromDate, toDate]);

  useEffect(() => { void load(); }, [load]);

  const sources = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.source) set.add(r.source);
    return Array.from(set).sort();
  }, [rows]);

  

  async function onUnsubscribe(row: AdminSubscriberRow) {
    const reason = window.prompt("سبب إلغاء الاشتراك (سيُسجَّل في سجل الأدمِن):", "طلب المستخدم");
    if (reason === null) return;
    try {
      await adminUnsubscribeNewsletter(row.id, reason);
      toast.success("تم إلغاء الاشتراك");
      void load();
    } catch (e) { toast.error((e as Error).message); }
  }

  async function onResubscribe(row: AdminSubscriberRow) {
    const evidence = window.prompt(
      "أدخل دليل الموافقة الصريحة (رابط، تذكرة دعم، أو ملاحظة ≥ 8 أحرف):",
      "",
    );
    if (!evidence) return;
    if (evidence.trim().length < 8) { toast.error("دليل الموافقة قصير جدًا"); return; }
    try {
      await adminResubscribeNewsletter(row.id, evidence.trim());
      toast.success("تمت إعادة الاشتراك");
      void load();
    } catch (e) { toast.error((e as Error).message); }
  }

  function exportCsv(mode: "marketing" | "all") {
    const eligible = mode === "marketing"
      ? rows.filter(r => r.subscribed && r.confirmed && !r.unsubscribed_at && !r.is_suppressed)
      : rows;
    const cols = mode === "marketing"
      ? ["email", "source", "subscribed_at", "user_id"]
      : ["email", "user_id", "subscribed", "confirmed", "source", "confirmed_at",
         "unsubscribed_at", "created_at", "updated_at", "is_suppressed", "suppression_reason"];
    const header = cols.join(",");
    const esc = (v: unknown) => {
      if (v == null) return "";
      const s = String(v).replace(/"/g, '""');
      return /[",\n]/.test(s) ? `"${s}"` : s;
    };
    const lines = eligible.map(r => {
      if (mode === "marketing") {
        return [r.email, r.source ?? "", r.confirmed_at ?? r.created_at, r.user_id ?? ""].map(esc).join(",");
      }
      return [r.email, r.user_id ?? "", r.subscribed, r.confirmed, r.source ?? "",
              r.confirmed_at ?? "", r.unsubscribed_at ?? "", r.created_at, r.updated_at,
              r.is_suppressed, r.suppression_reason ?? ""].map(esc).join(",");
    });
    const csv = [header, ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `newsletter-${mode}-${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div dir="rtl" className="min-h-screen bg-background text-foreground p-4 space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">إدارة النشرة البريدية</h1>
          <p className="text-xs text-muted-foreground">
            جمع وإدارة اشتراكات <code>newsletter_subscribers</code>. لا تُرسل الحملات من هنا؛ الغرض جمع الموافقة وتصدير القائمة للإرسال عبر مزوّد خارجي لاحقًا.
          </p>
        </div>
        <button onClick={load} className="inline-flex items-center gap-1 rounded border border-white/10 px-3 py-1.5 text-xs">
          <RefreshCw className="h-3.5 w-3.5" /> تحديث
        </button>
      </header>

      {error && (
        <div className="flex items-start gap-2 rounded border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200">
          <ShieldAlert className="h-4 w-4 shrink-0" /> <span>{error}</span>
        </div>
      )}

      <DoiStatusPanel />

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <StatBig
          label="إجمالي المشتركين"
          value={stats?.total}
          hint="كل من ضغط الاشتراك في أي وقت (يشمل من ألغى لاحقًا)."
        />
        <StatBig
          label={NEWSLETTER_DOI_ENABLED ? "نشِط ومؤكَّد" : "نشِط"}
          value={
            NEWSLETTER_DOI_ENABLED
              ? stats?.active
              : (stats ? Math.max(0, (stats.total ?? 0) - (stats.unsubscribed ?? 0) - (stats.suppressed ?? 0)) : undefined)
          }
          hint={NEWSLETTER_DOI_ENABLED
            ? "subscribed=true و confirmed=true و ليسوا على قائمة الحظر. هذه القائمة الوحيدة الآمنة للتصدير التسويقي."
            : "مشتركون حاليًا، لم يُلغوا ولم يُحظروا. لا يُعتبرون موافقة صريحة قابلة للتسويق حتى يُفعَّل DOI."}
          tone="emerald"
        />
        {NEWSLETTER_DOI_ENABLED && (
          <>
            <StatBig
              label="مؤكَّدون (Confirmed)"
              value={stats?.confirmed}
              hint="أكّدوا اشتراكهم عبر رابط البريد. مؤهَّلون للتصدير التسويقي."
              tone="emerald"
            />
            <StatBig
              label="بانتظار التأكيد (Pending)"
              value={stats?.unconfirmed}
              hint="أُرسل لهم رابط تأكيد ولم يضغطوا بعد. غير مؤهَّلين للتسويق."
              tone="amber"
            />
          </>
        )}
        <StatBig
          label="ألغوا الاشتراك"
          value={stats?.unsubscribed}
          hint="ضغطوا 'إلغاء الاشتراك' أو أُلغي يدويًا من الإدارة. لا يجوز إعادة إرسال شيء لهم."
          tone="rose"
        />
        <StatBig
          label="محظورون (Suppressed)"
          value={stats?.suppressed}
          hint="Bounce/complaint. يمنعهم مزود البريد من الاستقبال — يجب استبعادهم دائمًا."
          tone="rose"
        />
        <StatBig
          label="ضيوف (Anonymous)"
          value={stats?.anonymous}
          hint="اشتركوا بدون تسجيل دخول (user_id فارغ). البريد فقط."
        />
        <StatBig
          label="أعضاء (Authenticated)"
          value={stats?.authenticated}
          hint="اشتركوا وهم مسجّلون داخل التطبيق (user_id مربوط)."
        />
        <StatBig
          label="آخر ٧ أيام"
          value={stats?.last7}
          hint="عدد الاشتراكات الجديدة في آخر أسبوع."
        />
        <StatBig
          label="آخر ٣٠ يومًا"
          value={stats?.last30}
          hint="عدد الاشتراكات الجديدة في آخر شهر."
        />
      </section>

      <section className="rounded border border-white/10 bg-slate-900/40 p-3 space-y-2">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="block text-[10px] text-muted-foreground">مرشِّح</label>
            <select value={filter} onChange={e => setFilter(e.target.value as NewsletterFilter)}
              className="rounded border border-white/10 bg-background px-2 py-1 text-xs">
              {Object.entries(FILTER_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-muted-foreground">المصدر</label>
            <input list="src-list" value={source} onChange={e => setSource(e.target.value)}
              className="rounded border border-white/10 bg-background px-2 py-1 text-xs" placeholder="أي مصدر" />
            <datalist id="src-list">
              {sources.map(s => <option key={s} value={s} />)}
            </datalist>
          </div>
          <div>
            <label className="block text-[10px] text-muted-foreground">من تاريخ</label>
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
              className="rounded border border-white/10 bg-background px-2 py-1 text-xs" />
          </div>
          <div>
            <label className="block text-[10px] text-muted-foreground">إلى تاريخ</label>
            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
              className="rounded border border-white/10 bg-background px-2 py-1 text-xs" />
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="block text-[10px] text-muted-foreground">بحث (بريد / user_id)</label>
            <div className="flex items-center rounded border border-white/10 bg-background px-2">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") void load(); }}
                className="w-full bg-transparent px-2 py-1 text-xs outline-none" />
            </div>
          </div>
          <button onClick={() => setRevealEmails(v => !v)}
            className="inline-flex items-center gap-1 rounded border border-white/10 px-3 py-1.5 text-xs">
            {revealEmails ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {revealEmails ? "إخفاء البريد" : "إظهار البريد"}
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <button onClick={() => exportCsv("marketing")}
            className="inline-flex items-center gap-1 rounded bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-950">
            <Download className="h-3.5 w-3.5" /> تصدير التسويقي (نشِط + مؤكَّد + غير محظور)
          </button>
          <button onClick={() => exportCsv("all")}
            className="inline-flex items-center gap-1 rounded border border-white/10 px-3 py-1.5 text-xs">
            <Download className="h-3.5 w-3.5" /> تصدير كل السجلات
          </button>
        </div>
      </section>

      <section className="overflow-x-auto rounded border border-white/10">
        <table className="w-full text-xs">
          <thead className="bg-slate-900/60 text-right">
            <tr>
              <th className="p-2">البريد</th>
              <th className="p-2">المستخدم</th>
              <th className="p-2">الحالة</th>
              <th className="p-2">مؤكَّد</th>
              <th className="p-2">المصدر</th>
              <th className="p-2">تاريخ الاشتراك</th>
              <th className="p-2">آخر تحديث</th>
              <th className="p-2">إجراء</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="p-4 text-center text-muted-foreground"><RefreshCw className="inline h-4 w-4 animate-spin" /></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={8} className="p-4 text-center text-muted-foreground">لا نتائج</td></tr>
            ) : rows.map(r => {
              const status = r.unsubscribed_at ? "ألغى" : r.subscribed ? "مشترك" : "متوقّف";
              return (
                <tr key={r.id} className="border-t border-white/5">
                  <td className="p-2 font-mono ltr" dir="ltr">
                    <div>{revealEmails ? r.email : maskEmail(r.email)}</div>
                    {r.is_suppressed && (
                      <div className="mt-0.5 inline-flex items-center gap-1 rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] text-red-300">
                        <AlertTriangle className="h-3 w-3" /> محظور: {r.suppression_reason}
                      </div>
                    )}
                  </td>
                  <td className="p-2 font-mono text-[10px]" dir="ltr">
                    {r.user_id ? r.user_id.slice(0, 8) + "…" : <span className="text-muted-foreground">ضيف</span>}
                  </td>
                  <td className="p-2">{status}</td>
                  <td className="p-2">{r.confirmed ? "نعم" : "لا"}</td>
                  <td className="p-2">{r.source ?? "—"}</td>
                  <td className="p-2 whitespace-nowrap">{new Date(r.created_at).toLocaleDateString("ar")}</td>
                  <td className="p-2 whitespace-nowrap">{new Date(r.updated_at).toLocaleDateString("ar")}</td>
                  <td className="p-2 space-x-1 space-x-reverse whitespace-nowrap">
                    {r.subscribed && !r.unsubscribed_at ? (
                      <button onClick={() => onUnsubscribe(r)}
                        className="inline-flex items-center gap-1 rounded bg-red-500/20 px-2 py-1 text-[11px] text-red-200">
                        <Ban className="h-3 w-3" /> إلغاء
                      </button>
                    ) : (
                      <button onClick={() => onResubscribe(r)}
                        disabled={r.is_suppressed}
                        title={r.is_suppressed ? "على قائمة الحظر — يمنع إعادة الاشتراك" : ""}
                        className="inline-flex items-center gap-1 rounded bg-emerald-500/20 px-2 py-1 text-[11px] text-emerald-200 disabled:opacity-40">
                        <RotateCcw className="h-3 w-3" /> إعادة (بموافقة)
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <p className="text-[10px] leading-6 text-muted-foreground">
        كل إجراءات الإدارة تُسجَّل في <code>admin_audit_log</code>. إعادة الاشتراك اليدوية تتطلّب دليل موافقة صريح ولا تعمل مع عناوين محظورة.
      </p>
    </div>
  );
}

function StatBig({
  label, value, hint, tone = "gold",
}: {
  label: string; value: number | undefined; hint: string;
  tone?: "gold" | "emerald" | "amber" | "rose";
}) {
  const toneClass = {
    gold: "border-amber-500/20 text-amber-200",
    emerald: "border-emerald-500/30 text-emerald-200",
    amber: "border-amber-500/40 text-amber-100",
    rose: "border-rose-500/30 text-rose-200",
  }[tone];
  return (
    <div className={`rounded-lg border ${toneClass} bg-slate-900/50 p-3 space-y-1`}>
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-xs font-semibold">{label}</div>
        <div className="text-2xl font-bold tabular-nums">{value ?? "—"}</div>
      </div>
      <p className="text-[11px] leading-5 text-muted-foreground">{hint}</p>
    </div>
  );
}

function DoiStatusPanel() {
  if (NEWSLETTER_DOI_ENABLED) {
    return (
      <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4 text-xs leading-6 text-emerald-100 space-y-2">
        <div className="flex items-center gap-2 font-bold text-sm">
          <ShieldAlert className="h-4 w-4" /> Double Opt-In مُفعَّل
        </div>
        <p>
          عندما يشترك اللاعب من داخل التطبيق، يُرسَل له بريد تأكيد يحتوي على رابط فريد. لا يُعتبر <b>مؤكَّدًا</b> ولا يدخل ضمن قوائم التصدير التسويقي حتى يضغط الرابط.
        </p>
        <ol className="ms-4 list-decimal space-y-1">
          <li>اللاعب يفعّل خانة النشرة → تُنشأ صفوف <code>subscribed=true, confirmed=false</code>.</li>
          <li>يُرسَل بريد تأكيد عبر Resend يحتوي رمزًا موقّعًا محدود الصلاحية.</li>
          <li>يضغط الرابط → endpoint التأكيد يعيّن <code>confirmed=true, confirmed_at=now()</code>.</li>
          <li>لوحة الإدارة تعكس ذلك تلقائيًا.</li>
        </ol>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-xs leading-6 text-amber-100 space-y-2">
      <div className="flex items-center gap-2 font-bold text-sm">
        <AlertTriangle className="h-4 w-4" /> Double Opt-In غير مُفعَّل حاليًا
      </div>
      <p>
        عندما يشترك اللاعب اليوم، يصبح الاشتراك ساريًا فورًا بدون بريد تأكيد. لذلك عمود <code>confirmed</code> يبقى false ولا يجوز تصدير القائمة لأي مزوّد تسويقي خارجي بوصفها موافقة صريحة.
      </p>
      <div className="rounded border border-amber-400/30 bg-black/20 p-2 space-y-1">
        <div className="font-semibold text-amber-200">التدفّق الحالي (DOI مُعطَّل):</div>
        <ol className="ms-4 list-decimal">
          <li>اللاعب يفعّل خانة النشرة.</li>
          <li>يُنشأ صف <code>subscribed=true, confirmed=false</code> فورًا.</li>
          <li>لا يُرسَل بريد تأكيد.</li>
        </ol>
      </div>
      <div className="rounded border border-emerald-400/20 bg-black/20 p-2 space-y-1">
        <div className="font-semibold text-emerald-200">التدفّق عند تفعيل DOI مستقبلاً:</div>
        <ol className="ms-4 list-decimal">
          <li>اللاعب يفعّل خانة النشرة → <code>subscribed=true, confirmed=false</code>.</li>
          <li>يُرسَل بريد تأكيد عبر Resend مع رمز فريد ينتهي بعد ٢٤ ساعة.</li>
          <li>الضغط على الرابط يستدعي endpoint التأكيد.</li>
          <li>يُحدَّث الصف إلى <code>confirmed=true, confirmed_at=now()</code>.</li>
          <li>يصبح مؤهَّلاً للتصدير التسويقي.</li>
        </ol>
      </div>
      <p className="text-[11px]">
        للتفعيل لاحقًا: عيِّن <code>VITE_NEWSLETTER_DOI_ENABLED=1</code> بعد بناء endpoint التأكيد وقالب البريد. الواجهة الإدارية جاهزة تلقائيًا.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className="rounded border border-white/10 bg-slate-900/40 p-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-lg font-bold text-amber-200">{value ?? "—"}</div>
    </div>
  );
}

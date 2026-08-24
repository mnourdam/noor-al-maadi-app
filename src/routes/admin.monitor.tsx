import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Database,
  Gauge,
  HardDrive,
  HelpCircle,
  MemoryStick,
  Network,
  RefreshCw,
  Server,
  ShieldCheck,
  Timer,
  Zap,
} from "lucide-react";
import { AdminGate } from "@/lib/admin-guard";
import { getAdminSystemHealth } from "@/lib/admin-monitor.functions";

export const Route = createFileRoute("/admin/monitor")({
  head: () => ({
    meta: [
      { title: "مراقبة النظام — إرث" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => (
    <AdminGate>
      <MonitorPage />
    </AdminGate>
  ),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SlowQuery = { mean_ms: number; calls: number; query: string };

type HealthSnapshot = {
  connections: number;
  max_connections: number;
  waiting_backends: number;
  lock_waiting_backends: number;
  longest_active_query_seconds: number;
  db_size_bytes: number;
  deadlocks: number;
  xact_rollback: number;
  xact_commit: number;
  stats_reset_at: string | null;
  pg_stat_statements_available: boolean;
  slowest_queries: SlowQuery[];
  snapshot_ms: number;
  server_time: string;
};

type HealthResult = {
  snapshot: HealthSnapshot;
  latencyMs: number;
  fetchedAt: string;
};

type Level = "healthy" | "moderate" | "high" | "critical" | "unavailable";

// Last manually confirmed instance size. NOT live telemetry — the platform
// does not expose instance size to SQL. Update this constant after any resize.
const KNOWN_INSTANCE_SIZE = "Large";

// Minimum auto-refresh interval — the monitor must never become a source of
// meaningful backend load. Auto refresh is OFF by default.
const AUTO_REFRESH_MS = 60_000;

// ---------------------------------------------------------------------------
// Thresholds (per spec)
// ---------------------------------------------------------------------------

function connectionLevel(pct: number): Level {
  if (pct >= 90) return "critical";
  if (pct >= 75) return "high";
  if (pct >= 60) return "moderate";
  return "healthy";
}

function latencyLevel(ms: number): Level {
  if (ms > 1000) return "critical";
  if (ms > 300) return "high";
  if (ms > 100) return "moderate";
  return "healthy";
}

const LEVEL_META: Record<Level, { label: string; dot: string; text: string; border: string }> = {
  healthy: { label: "سليم", dot: "bg-emerald-400", text: "text-emerald-300", border: "border-emerald-500/30" },
  moderate: { label: "ضغط متوسط", dot: "bg-amber-400", text: "text-amber-300", border: "border-amber-500/30" },
  high: { label: "ضغط مرتفع", dot: "bg-orange-400", text: "text-orange-300", border: "border-orange-500/30" },
  critical: { label: "حرج", dot: "bg-red-500", text: "text-red-300", border: "border-red-500/40" },
  unavailable: { label: "غير متاح", dot: "bg-slate-500", text: "text-slate-400", border: "border-slate-600/40" },
};

const RANK: Record<Level, number> = { healthy: 0, moderate: 1, high: 2, critical: 3, unavailable: 4 };

function worst(levels: Level[]): Level {
  const real = levels.filter((l) => l !== "unavailable");
  if (!real.length) return "unavailable";
  return real.reduce((a, b) => (RANK[b] > RANK[a] ? b : a), "healthy");
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function fmtBytes(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function fmtPct(part: number, whole: number): string {
  if (!whole) return "—";
  return `${((part / whole) * 100).toFixed(1)}%`;
}

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ar-EG");
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function MonitorPage() {
  const fetchHealth = useServerFn(getAdminSystemHealth);
  const [result, setResult] = useState<HealthResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const inFlight = useRef(false);

  // Load once on open; manual refresh only afterwards. Failures never
  // propagate — the monitor renders an isolated error panel instead.
  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    try {
      const res = (await fetchHealth()) as HealthResult;
      setResult(res);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "unknown");
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, [fetchHealth]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(refresh, AUTO_REFRESH_MS);
    return () => clearInterval(t);
  }, [autoRefresh, refresh]);

  const snap = result?.snapshot ?? null;
  const connPct = snap && snap.max_connections > 0 ? (snap.connections / snap.max_connections) * 100 : null;
  const connLevel = connPct != null ? connectionLevel(connPct) : "unavailable";
  const latLevel = result ? latencyLevel(result.latencyMs) : "unavailable";
  const waitLevel: Level = snap
    ? snap.lock_waiting_backends > 0
      ? "high"
      : snap.waiting_backends > 10
        ? "moderate"
        : "healthy"
    : "unavailable";
  const overall: Level = error ? "unavailable" : !snap ? "unavailable" : worst([connLevel, latLevel, waitLevel]);

  // Alerts — informational only, never triggers any action.
  const alerts: { level: Level; text: string }[] = [];
  if (snap && connPct != null && connPct >= 90) {
    alerts.push({ level: "critical", text: `🚨 الخادم يقترب من طاقته القصوى — استخدام الاتصالات وصل إلى ${connPct.toFixed(0)}%. راجع Lovable Cloud قبل تأثر المستخدمين.` });
  } else if (snap && connPct != null && connPct >= 75) {
    alerts.push({ level: "high", text: `⚠️ ضغط مرتفع على قاعدة البيانات — استخدام الاتصالات وصل إلى ${connPct.toFixed(0)}%.` });
  }
  if (result && result.latencyMs > 1000) {
    alerts.push({ level: "critical", text: `🚨 زمن استجابة قاعدة البيانات حرج (${Math.round(result.latencyMs)}ms).` });
  } else if (result && result.latencyMs > 300) {
    alerts.push({ level: "high", text: `⚠️ زمن استجابة قاعدة البيانات مرتفع (${Math.round(result.latencyMs)}ms).` });
  }
  if (snap && snap.lock_waiting_backends > 0) {
    alerts.push({ level: "high", text: `⚠️ يوجد ${snap.lock_waiting_backends} استعلامًا ينتظر أقفالًا حاليًا.` });
  }

  // Capacity headroom (advisory only — no automatic resizing).
  const connFree = connPct != null ? 100 - connPct : null;
  const advisory: { label: string; level: Level } = (() => {
    if (overall === "critical") return { label: "حرج", level: "critical" };
    if (overall === "high") return { label: "اقترب من الحد", level: "high" };
    if (overall === "moderate") return { label: "يحتاج مراقبة", level: "moderate" };
    if (overall === "healthy") {
      return connFree != null && connFree >= 90 && latLevel === "healthy"
        ? { label: "ممتاز", level: "healthy" }
        : { label: "جيد", level: "healthy" };
    }
    return { label: "غير متاح", level: "unavailable" };
  })();

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4 py-10 text-slate-100">
      <div className="mx-auto max-w-6xl space-y-8">
        {/* Header */}
        <header className="flex flex-wrap items-center gap-3 border-b border-amber-500/20 pb-4">
          <Gauge className="h-7 w-7 text-amber-400" />
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-amber-100">مراقبة النظام</h1>
            <p className="text-sm text-slate-400">مراقبة صحة الخادم وقاعدة البيانات</p>
          </div>
          <div className={`flex items-center gap-2 rounded-full border px-4 py-1.5 ${LEVEL_META[overall].border}`}>
            <span className={`h-2.5 w-2.5 rounded-full ${LEVEL_META[overall].dot} ${overall === "healthy" ? "animate-pulse" : ""}`} />
            <span className={`text-sm font-bold ${LEVEL_META[overall].text}`}>{LEVEL_META[overall].label}</span>
          </div>
        </header>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-200 transition hover:bg-amber-500/20 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            تحديث الفحص
          </button>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="h-4 w-4 accent-amber-500"
            />
            تحديث تلقائي كل 60 ثانية
          </label>
          <span>
            آخر تحديث:{" "}
            <span className="text-slate-200">{result ? fmtTime(result.fetchedAt) : "—"}</span>
          </span>
        </div>

        {/* Isolated failure panel — the monitor never affects the app */}
        {error && (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-5 text-center">
            <AlertTriangle className="mx-auto h-8 w-8 text-red-400" />
            <p className="mt-2 text-sm font-semibold text-red-200">تعذر جلب بيانات المراقبة</p>
            <p dir="ltr" className="mt-1 text-xs text-red-300/70">{error}</p>
          </div>
        )}

        {/* Alert panel */}
        {!error && alerts.length > 0 && (
          <section className="space-y-2">
            {alerts.map((a, i) => (
              <div
                key={i}
                className={`rounded-xl border p-4 text-sm font-semibold ${
                  a.level === "critical"
                    ? "border-red-500/50 bg-red-500/10 text-red-200"
                    : "border-orange-500/40 bg-orange-500/10 text-orange-200"
                }`}
              >
                {a.text}
              </div>
            ))}
          </section>
        )}

        {/* Core health cards */}
        <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {/* 1. Instance */}
          <Card icon={<Server className="h-5 w-5" />} title="حجم الخادم" live={false}>
            <div className="text-2xl font-bold text-amber-300" dir="ltr">{KNOWN_INSTANCE_SIZE}</div>
            <p className="mt-1 text-[11px] text-slate-500">
              قيمة مرجعية يدوية — حجم الخادم لا يُقرأ من القياس المباشر. تُحدَّث بعد أي تغيير حجم.
            </p>
          </Card>

          {/* 2. Database connections */}
          <Card icon={<Database className="h-5 w-5" />} title="اتصالات قاعدة البيانات" live={!!snap} level={connLevel}>
            {snap ? (
              <>
                <div className="text-2xl font-bold text-amber-300" dir="ltr">
                  {snap.connections} / {snap.max_connections}
                </div>
                <div className={`mt-1 text-sm font-semibold ${LEVEL_META[connLevel].text}`} dir="ltr">
                  {fmtPct(snap.connections, snap.max_connections)}
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  خامل/منتظر: {snap.waiting_backends} — بانتظار أقفال: {snap.lock_waiting_backends}
                </p>
              </>
            ) : (
              <Unavailable />
            )}
          </Card>

          {/* 3. PgBouncer */}
          <Card icon={<Network className="h-5 w-5" />} title="PgBouncer (تجميع الاتصالات)" live={false}>
            <Unavailable reason="إحصاءات PgBouncer (العملاء النشطون وزمن المصادقة) غير معروضة داخل قاعدة البيانات ولا يمكن قراءتها من التطبيق." />
          </Card>

          {/* 4. Memory */}
          <Card icon={<MemoryStick className="h-5 w-5" />} title="الذاكرة" live={false}>
            <Unavailable reason="استهلاك ذاكرة الخادم مقياس على مستوى المنصة وغير متاح من داخل قاعدة البيانات." />
          </Card>

          {/* 5. CPU / DB pressure */}
          <Card icon={<Cpu className="h-5 w-5" />} title="المعالج / ضغط قاعدة البيانات" live={false} level={snap ? waitLevel : "unavailable"}>
            <Unavailable reason="نسبة المعالج غير متاحة من داخل قاعدة البيانات." />
            {snap && (
              <div className="mt-3 rounded-lg border border-slate-700/60 bg-slate-950/50 p-3 text-xs">
                <div className="mb-1 font-semibold text-slate-300">مؤشر ضغط غير مباشر (مباشر):</div>
                <div className="text-slate-400">
                  استعلامات منتظرة: <span className="text-slate-200">{snap.waiting_backends}</span>
                  {" — "}بانتظار أقفال: <span className="text-slate-200">{snap.lock_waiting_backends}</span>
                </div>
                <div className="mt-1 text-slate-400">
                  أطول استعلام نشط: <span className="text-slate-200" dir="ltr">{snap.longest_active_query_seconds}s</span>
                </div>
              </div>
            )}
          </Card>

          {/* 6. Storage */}
          <Card icon={<HardDrive className="h-5 w-5" />} title="تخزين قاعدة البيانات" live={!!snap}>
            {snap ? (
              <>
                <div className="text-2xl font-bold text-amber-300" dir="ltr">{fmtBytes(snap.db_size_bytes)}</div>
                <p className="mt-1 text-[11px] text-slate-500">
                  نسبة القرص الكلية غير متاحة من داخل قاعدة البيانات — يُعرض حجم قاعدة البيانات الفعلي فقط.
                </p>
              </>
            ) : (
              <Unavailable />
            )}
          </Card>

          {/* 7. Latency */}
          <Card icon={<Timer className="h-5 w-5" />} title="زمن استجابة قاعدة البيانات" live={!!result} level={latLevel}>
            {result ? (
              <>
                <div className={`text-2xl font-bold ${LEVEL_META[latLevel].text}`} dir="ltr">
                  {Math.round(result.latencyMs)}ms
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  زمن استعلام فحص خفيف عبر المسار الحقيقي للتطبيق (شامل بوابة API). يُقاس عند الطلب فقط.
                </p>
              </>
            ) : (
              <Unavailable />
            )}
          </Card>

          {/* 8. Error health */}
          <Card icon={<AlertTriangle className="h-5 w-5" />} title="صحة الأخطاء" live={!!snap}>
            {snap ? (
              <div className="space-y-1 text-xs text-slate-300">
                <Row label="Deadlocks" value={String(snap.deadlocks)} />
                <Row label="معاملات متراجعة" value={String(snap.xact_rollback)} />
                <Row label="انتهاءات مهلة الاستعلام" value="غير متاح (يتطلب سجلات المنصة)" muted />
                <Row label="إعادة تعيين الاتصالات" value="غير متاح (يتطلب سجلات المنصة)" muted />
                <p className="pt-1 text-[11px] text-slate-500">
                  العدّادات تراكمية منذ: {fmtTime(snap.stats_reset_at)}
                </p>
                {snap.pg_stat_statements_available && snap.slowest_queries.length > 0 && (
                  <div className="pt-2">
                    <div className="mb-1 font-semibold text-slate-300">أبطأ الاستعلامات (متوسط زمن التنفيذ):</div>
                    <ul className="space-y-1" dir="ltr">
                      {snap.slowest_queries.slice(0, 5).map((q, i) => (
                        <li key={i} className="rounded bg-slate-950/60 px-2 py-1 font-mono text-[10px] text-slate-400">
                          <span className="text-amber-300">{q.mean_ms}ms</span> × {q.calls} — {q.query}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {!snap.pg_stat_statements_available && (
                  <Row label="الاستعلامات البطيئة" value="غير متاح (pg_stat_statements غير مفعّل)" muted />
                )}
              </div>
            ) : (
              <Unavailable />
            )}
          </Card>

          {/* 9. Auth health */}
          <Card icon={<ShieldCheck className="h-5 w-5" />} title="صحة المصادقة" live={false}>
            <div className="flex items-center gap-2 text-slate-400">
              <HelpCircle className="h-5 w-5" />
              <span className="text-lg font-semibold">غير معروف</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              سجلات المصادقة غير متاحة من داخل قاعدة البيانات — لا نستنتج «سليم» دون قياس فعلي.
            </p>
          </Card>

          {/* 10. Realtime health */}
          <Card icon={<Zap className="h-5 w-5" />} title="صحة Realtime" live={false}>
            <div className="flex items-center gap-2 text-slate-400">
              <HelpCircle className="h-5 w-5" />
              <span className="text-lg font-semibold">غير معروف</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              تأخر النسخ ومقاييس Realtime غير معروضة داخل قاعدة البيانات.
            </p>
          </Card>
        </section>

        {/* Capacity headroom */}
        <section className="rounded-xl border border-amber-500/20 bg-slate-900/60 p-5">
          <div className="mb-3 flex items-center gap-2 text-amber-300">
            <Activity className="h-4 w-4" />
            <h2 className="text-sm font-semibold">هامش القدرة الحالي</h2>
          </div>
          <div className="grid gap-2 text-xs text-slate-300 md:grid-cols-3">
            <div className="rounded-lg bg-slate-950/50 p-3">
              اتصالات قاعدة البيانات:{" "}
              <span className="font-bold text-slate-100" dir="ltr">
                {connFree != null ? `${connFree.toFixed(0)}% حر` : "—"}
              </span>
            </div>
            <div className="rounded-lg bg-slate-950/50 p-3">
              PgBouncer: <span className="text-slate-500">غير متاح</span>
            </div>
            <div className="rounded-lg bg-slate-950/50 p-3">
              الذاكرة: <span className="text-slate-500">غير متاح</span>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3 border-t border-slate-800 pt-4">
            <span className="text-sm text-slate-400">التقييم الاستشاري:</span>
            <span className={`rounded-full border px-3 py-1 text-sm font-bold ${LEVEL_META[advisory.level].border} ${LEVEL_META[advisory.level].text}`}>
              {advisory.label}
            </span>
            <span className="text-[11px] text-slate-500">
              معلوماتي فقط — مبني على المقاييس المباشرة المتاحة، ولا يُجري أي تغيير تلقائي على البنية التحتية.
            </span>
          </div>
        </section>

        {/* Telemetry legend */}
        <section className="rounded-xl border border-slate-700/50 bg-slate-900/40 p-4 text-[11px] leading-5 text-slate-500">
          <span className="font-semibold text-slate-400">مصادر القياس:</span>{" "}
          <span className="text-emerald-400">● مباشر</span> = مقروء الآن من قاعدة بيانات الإنتاج.{" "}
          <span className="text-slate-400">● غير متاح</span> = لا توفره قاعدة البيانات ويتطلب لوحة المنصة — يُعرض كما هو دون تخمين.
          هذه الصفحة للقراءة فقط، وتعمل بمعزل كامل عن تشغيل التطبيق، ولا تُجري أي استطلاع متكرر إلا بطلب يدوي (60 ثانية كحد أدنى).
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// UI atoms
// ---------------------------------------------------------------------------

function Card({
  icon,
  title,
  live,
  level,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  live: boolean;
  level?: Level;
  children: React.ReactNode;
}) {
  const border = level ? LEVEL_META[level].border : "border-amber-500/20";
  return (
    <div className={`rounded-xl border bg-slate-900/60 p-5 shadow-sm ${border}`}>
      <div className="mb-3 flex items-center gap-2 text-amber-300">
        {icon}
        <h2 className="text-sm font-semibold">{title}</h2>
        <span
          className={`mr-auto rounded-full px-2 py-0.5 text-[10px] font-bold ${
            live ? "bg-emerald-500/10 text-emerald-300" : "bg-slate-700/40 text-slate-400"
          }`}
        >
          {live ? "مباشر" : "غير متاح"}
        </span>
      </div>
      {children}
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-slate-400">{label}</span>
      <span className={muted ? "text-slate-500" : "font-semibold text-slate-100"} dir="auto">
        {value}
      </span>
    </div>
  );
}

function Unavailable({ reason }: { reason?: string }) {
  return (
    <div>
      <div className="flex items-center gap-2 text-slate-500">
        <CheckCircle2 className="h-4 w-4 opacity-0" />
        <span className="text-lg font-semibold">غير متاح</span>
      </div>
      {reason && <p className="mt-1 text-[11px] text-slate-500">{reason}</p>}
    </div>
  );
}

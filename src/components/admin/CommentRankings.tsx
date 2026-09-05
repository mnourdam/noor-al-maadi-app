import { useEffect, useState } from "react";
import { ChevronDown, Trophy, Users, Flag, BookOpen, Sparkles } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { fmtNum } from "@/lib/formatNumber";
import {
  adminContentCommentRankings,
  type AdminCommentRankings,
  type AdminCommentRankRow,
} from "@/lib/adminComments";

/**
 * Admin — participation rankings for player comments & reflections.
 * Activity volume only; this is NOT a quality ranking.
 * Aggregated server-side over the full dataset via
 * `admin_content_comment_rankings_v1` (read-only).
 */
export function CommentRankings() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<AdminCommentRankings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await adminContentCommentRankings();
      if (alive) {
        setData(res);
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const s = data?.stats;

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/50" dir="rtl">
      {/* Stats strip */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-t-2xl bg-slate-800 sm:grid-cols-4">
        <StatTile icon={<Trophy className="h-3.5 w-3.5" />} label="إجمالي التعليقات والتأملات" value={s?.total} loading={loading} />
        <StatTile icon={<Users className="h-3.5 w-3.5" />} label="اللاعبون المشاركون" value={s?.participants} loading={loading} />
        <StatTile icon={<Flag className="h-3.5 w-3.5" />} label="الحملات" value={s?.campaigns} loading={loading} />
        <StatTile icon={<BookOpen className="h-3.5 w-3.5" />} label="القصص والموسوعة" value={s?.stories_encyclopedia} loading={loading} />
      </div>

      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-xs font-medium text-amber-200/90 hover:text-amber-200"
      >
        <Trophy className="h-3.5 w-3.5" />
        الأكثر تفاعلًا في إرث
        <span className="text-slate-500">— ترتيب حسب حجم المشاركة، لا جودة النص</span>
        <ChevronDown className={`ms-auto h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="space-y-5 border-t border-slate-800 p-4">
          {data && !data.ok && (
            <p className="text-xs text-red-300">تعذّر تحميل الترتيب{data.reason ? `: ${data.reason}` : ""}</p>
          )}
          <RankBlock title="🏆 الأكثر تفاعلًا في إرث" subtitle="إجمالي المشاركات عبر كل المصادر" rows={data?.overall ?? []} podium showBreakdown />
          <div className="grid gap-5 lg:grid-cols-3">
            <RankBlock title="الأنشط في الحملات" subtitle="تأملات الحملات" rows={data?.campaigns ?? []} metric="campaigns" />
            <RankBlock title="الأنشط في القصص" subtitle="تعليقات وتأملات القصص (بدون تكرار للقصة نفسها)" rows={data?.stories ?? []} metric="stories" />
            <RankBlock title="الأنشط في الموسوعة" subtitle="تعليقات صفحات الموسوعة" rows={data?.encyclopedia ?? []} metric="encyclopedia" />
          </div>
          <RankBlock
            title="الأكثر تنوعًا"
            subtitle="نشاط موزّع بين الحملات والقصص والموسوعة"
            rows={data?.diverse ?? []}
            showBreakdown
            icon={<Sparkles className="h-3.5 w-3.5" />}
          />
        </div>
      )}
    </section>
  );
}

function StatTile({ icon, label, value, loading }: { icon: React.ReactNode; label: string; value?: number; loading: boolean }) {
  return (
    <div className="bg-slate-900/80 p-3">
      <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
        <span className="text-amber-300/70">{icon}</span>
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold text-slate-100 tabular-nums">
        {loading ? "…" : fmtNum(value ?? 0)}
      </div>
    </div>
  );
}

const PODIUM = [
  "border-amber-400/60 bg-amber-500/10 text-amber-200",
  "border-slate-400/50 bg-slate-400/10 text-slate-200",
  "border-orange-700/60 bg-orange-800/15 text-orange-200",
];

function RankBlock({
  title,
  subtitle,
  rows,
  podium = false,
  showBreakdown = false,
  metric,
  icon,
}: {
  title: string;
  subtitle: string;
  rows: AdminCommentRankRow[];
  podium?: boolean;
  showBreakdown?: boolean;
  metric?: "campaigns" | "stories" | "encyclopedia";
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
        {icon}
        {title}
      </h3>
      <p className="mb-2 mt-0.5 text-[11px] text-slate-500">{subtitle}</p>
      {rows.length === 0 ? (
        <p className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-[11px] text-slate-500">لا بيانات كافية بعد.</p>
      ) : (
        <ol className="space-y-1.5">
          {rows.map((r, i) => (
            <li
              key={r.user_id}
              className={`flex items-center gap-2.5 rounded-xl border px-2.5 py-2 ${
                podium && i < 3 ? PODIUM[i] : "border-slate-800 bg-slate-900/60 text-slate-300"
              }`}
            >
              <span className="w-5 shrink-0 text-center text-xs font-bold tabular-nums opacity-80">{i + 1}</span>
              <Avatar avatarId={r.avatar_id} size="sm" artSize="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">{r.name || r.username || "لاعب"}</p>
                {showBreakdown && (
                  <p className="truncate text-[10px] text-slate-500">
                    حملات {fmtNum(r.campaigns)} · قصص {fmtNum(r.stories)} · موسوعة {fmtNum(r.encyclopedia)}
                  </p>
                )}
              </div>
              <span className="shrink-0 text-sm font-semibold tabular-nums">
                {fmtNum(metric ? r[metric] : r.total)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell, Screen } from "@/components/AppShell";
import { buildAuditReport } from "@/lib/content-audit";
import { entityHref } from "@/components/EncyclopediaCard";
import type { PackEntity } from "@/lib/packs/types";

export const Route = createFileRoute("/content-audit")({
  head: () => ({ meta: [{ title: "تدقيق المحتوى — أدوات المطوّر" }] }),
  component: ContentAuditPage,
});

type GapKey =
  | "noDescription" | "noRelations" | "noTimeline"
  | "noImage" | "noAtlas" | "orphans" | "unused" | "unreachable";

const GAP_LABELS: Record<GapKey, string> = {
  noDescription: "بدون وصف",
  noRelations:   "بدون كيانات مرتبطة",
  noTimeline:    "بدون موقع على الخط الزمني",
  noImage:       "بدون رمز/صورة",
  noAtlas:       "بدون ارتباط بالخارطة",
  orphans:       "كيانات يتيمة (لا واردة ولا صادرة)",
  unused:        "غير مستخدمة في الحملات",
  unreachable:   "غير قابلة للوصول (مقفلة)",
};

function ContentAuditPage() {
  const report = useMemo(() => buildAuditReport(), []);
  const [openGap, setOpenGap] = useState<GapKey | null>(null);

  const t = report.totals;

  return (
    <AppShell>
      <Screen title="تدقيق المحتوى" subtitle="نظرة شاملة على كل كيانات إرث">
        {/* Health */}
        <section className="mb-6 rounded-3xl border border-gold/25 bg-surface p-5 shadow-elegant">
          <p className="text-[10px] text-gold">صحة المحتوى الإجمالية</p>
          <div className="mt-1 flex items-end gap-2">
            <span className="font-display text-4xl font-bold">{report.health.overall}%</span>
            <span className="mb-1 text-xs text-muted-foreground">من 100</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full bg-gradient-gold" style={{ width: `${report.health.overall}%` }} />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <HealthChip label="اكتمال" value={report.health.completeness} />
            <HealthChip label="ارتباطات" value={report.health.relationships} />
            <HealthChip label="وصول" value={report.health.navigation} />
          </div>
        </section>

        {/* Globals */}
        <h2 className="font-display mb-2 text-sm font-bold">إحصاءات عامة</h2>
        <div className="mb-6 grid grid-cols-3 gap-2">
          <Stat label="دول" value={t.state} />
          <Stat label="شخصيات" value={t.figure} />
          <Stat label="علماء" value={t.scholar} />
          <Stat label="مدن" value={t.city} />
          <Stat label="معارك" value={t.battle} />
          <Stat label="أحداث" value={t.event} />
          <Stat label="معالم" value={t.landmark} />
          <Stat label="آثار" value={t.artifact} />
          <Stat label="إنجازات" value={t.achievement + t.achievementsLegacy} />
          <Stat label="حملات" value={t.campaigns} />
          <Stat label="كيانات" value={t.entitiesTotal} />
          <Stat label="علاقات" value={t.relationships} />
        </div>

        {/* Packs */}
        <h2 className="font-display mb-2 text-sm font-bold">حِزَم المحتوى</h2>
        <div className="mb-6 space-y-3">
          {report.packs.map(ps => (
            <div key={ps.pack.id} className="rounded-2xl border border-white/10 bg-surface p-4">
              <div className="flex items-baseline justify-between">
                <p className="font-display text-base font-bold">{ps.pack.title}</p>
                <span className="text-[11px] text-gold">{ps.total} كيان</span>
              </div>
              {ps.pack.subtitle && (
                <p className="text-[11px] text-muted-foreground">{ps.pack.subtitle}</p>
              )}
              <div className="mt-3 grid grid-cols-4 gap-1.5 text-center">
                <MiniStat label="شخصيات" value={ps.buckets.figure + ps.buckets.scholar} />
                <MiniStat label="مدن" value={ps.buckets.city} />
                <MiniStat label="معارك" value={ps.buckets.battle} />
                <MiniStat label="أحداث" value={ps.buckets.event} />
                <MiniStat label="معالم" value={ps.buckets.landmark} />
                <MiniStat label="آثار" value={ps.buckets.artifact} />
                <MiniStat label="إنجازات" value={ps.buckets.achievement} />
                <MiniStat label="حملات" value={ps.campaigns} />
              </div>
              <p className="mt-2 text-[10px] text-muted-foreground">
                {ps.relationships} علاقة معلنة
              </p>
            </div>
          ))}
        </div>

        {/* Coverage */}
        <h2 className="font-display mb-2 text-sm font-bold">تغطية الأنظمة</h2>
        <div className="mb-6 grid grid-cols-2 gap-2">
          <Coverage label="الخط الزمني" value={report.coverage.timeline} total={report.coverage.total} />
          <Coverage label="الخارطة الإسلامية" value={report.coverage.atlas} total={report.coverage.total} />
          <Coverage label="الحملات" value={report.coverage.campaign} total={report.coverage.total} />
          <Coverage label="المتحف/المجموعة" value={report.coverage.museum} total={report.coverage.total} />
        </div>

        {/* Quick actions / gaps */}
        <h2 className="font-display mb-2 text-sm font-bold">إجراءات سريعة</h2>
        <div className="mb-6 grid grid-cols-2 gap-2">
          {(Object.keys(GAP_LABELS) as GapKey[]).map(k => (
            <button
              key={k}
              onClick={() => setOpenGap(openGap === k ? null : k)}
              className={`rounded-2xl border p-3 text-right text-[11px] transition ${
                openGap === k
                  ? "border-gold/50 bg-gold/10"
                  : "border-white/10 bg-surface hover:border-gold/30"
              }`}
            >
              <div className="font-display text-base font-bold text-foreground">
                {report.gaps[k].length}
              </div>
              <div className="text-muted-foreground">{GAP_LABELS[k]}</div>
            </button>
          ))}
        </div>

        {openGap && (
          <div className="mb-6 rounded-2xl border border-gold/30 bg-surface p-4">
            <p className="font-display mb-2 text-sm font-bold text-gold">
              {GAP_LABELS[openGap]} — {report.gaps[openGap].length}
            </p>
            {report.gaps[openGap].length === 0 ? (
              <p className="text-[11px] text-muted-foreground">لا توجد عناصر هنا. ممتاز.</p>
            ) : (
              <ul className="space-y-1">
                {report.gaps[openGap].slice(0, 50).map(e => (
                  <EntityRow key={e.id} entity={e} />
                ))}
                {report.gaps[openGap].length > 50 && (
                  <li className="pt-1 text-[10px] text-muted-foreground">
                    … و {report.gaps[openGap].length - 50} كيانًا آخر
                  </li>
                )}
              </ul>
            )}
          </div>
        )}

        {/* Developer Report */}
        <h2 className="font-display mb-2 text-sm font-bold">تقرير المطوّر</h2>
        <div className="space-y-2 rounded-2xl border border-white/10 bg-surface p-4 text-[12px]">
          <Row k="إجمالي الكيانات" v={String(t.entitiesTotal)} />
          <Row k="إجمالي الحِزَم" v={String(t.packs)} />
          <Row k="إجمالي العلاقات" v={String(t.relationships)} />
          <Row k="أكبر حزمة" v={report.largestPack ? `${report.largestPack.pack.title} (${report.largestPack.total})` : "—"} />
          <Row
            k="أكثر كيان ترابطًا"
            v={report.mostConnected ? `${report.mostConnected.entity.title} · ${report.mostConnected.degree} علاقة` : "—"}
          />
          <Row
            k="أقل كيان ترابطًا"
            v={report.leastConnected ? `${report.leastConnected.entity.title} · ${report.leastConnected.degree} علاقة` : "—"}
          />
        </div>

        <p className="mt-6 text-center text-[10px] text-muted-foreground">
          أداة داخلية — تُحدَّث تلقائيًا عند إضافة أي حزمة محتوى جديدة.
        </p>
      </Screen>
    </AppShell>
  );
}

function HealthChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-background/40 p-2">
      <div className="font-display text-lg font-bold text-gold">{value}%</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-surface p-2 text-center">
      <div className="font-display text-base font-bold">{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-white/10 bg-background/40 p-1.5">
      <div className="font-display text-sm font-bold text-gold">{value}</div>
      <div className="text-[9px] text-muted-foreground">{label}</div>
    </div>
  );
}

function Coverage({ label, value, total }: { label: string; value: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((value / total) * 100);
  return (
    <div className="rounded-2xl border border-white/10 bg-surface p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="font-display mt-1 text-base font-bold">
        {value}
        <span className="text-[10px] text-muted-foreground"> / {total}</span>
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full bg-gradient-gold" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-[10px] text-gold">{pct}%</p>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/5 pb-1.5 last:border-0 last:pb-0">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-display text-foreground">{v}</span>
    </div>
  );
}

function EntityRow({ entity }: { entity: PackEntity }) {
  return (
    <li>
      <a
        href={entityHref(entity)}
        className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-white/5"
      >
        <span className="text-base">{entity.image?.glyph ?? "·"}</span>
        <span className="flex-1 truncate text-[12px] text-foreground">{entity.title}</span>
        <span className="text-[9px] text-muted-foreground">{entity.type}</span>
      </a>
    </li>
  );
}

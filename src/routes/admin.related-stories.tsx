// ============================================================
// Admin · Related Stories Diagnostics
// ------------------------------------------------------------
// Audits the Smart Related Stories engine for any encyclopedia
// entity: candidate stories, final score, which signals matched,
// why a candidate was rejected, and broken relation targets.
//
// Admin-only. Never exposed in player UI.
// ============================================================

import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertTriangle, Search } from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";
import { AdminGate } from "@/lib/admin-guard";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { useEncyclopediaIndex } from "@/lib/encyclopedia/index-store";
import { normalizeArabicSearch } from "@/lib/encyclopedia-search";
import { useRelatedStories } from "@/lib/stories/related/useRelatedStories";
import { MIN_RELATED_SCORE, REASON_BADGE } from "@/lib/stories/related/scorer";
import type { SupabaseEncyclopediaEntity } from "@/lib/encyclopedia-source";

export const Route = createFileRoute("/admin/related-stories")({
  head: () => ({
    meta: [
      { title: "تشخيص القصص ذات الصلة — إرث" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => (
    <AdminGate>
      <AppShell>
        <Screen title="تشخيص القصص ذات الصلة">
          <Breadcrumbs
            items={[{ label: "الإدارة", to: "/admin" }, { label: "القصص ذات الصلة" }]}
          />
          <RelatedStoriesDiagnostics />
        </Screen>
      </AppShell>
    </AdminGate>
  ),
});

function RelatedStoriesDiagnostics() {
  const [q, setQ] = useState("بغداد");
  const [selected, setSelected] = useState<SupabaseEncyclopediaEntity | null>(null);
  const { index } = useEncyclopediaIndex();

  const matches = useMemo(() => {
    const rows = index.rows ?? [];
    const key = normalizeArabicSearch(q);
    if (!key) return [];
    return rows
      .filter((r) => normalizeArabicSearch(`${r.title} ${r.slug}`).includes(key))
      .slice(0, 12);
  }, [index, q]);


  const { all, context, index: relIndex, isLoading } = useRelatedStories(selected, 6);

  const scored = useMemo(
    () => [...all].sort((a, b) => b.scored.score - a.scored.score),
    [all],
  );

  return (
    <div dir="rtl" className="space-y-4">
      <div className="rounded-xl border border-border bg-surface/40 p-3">
        <label className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
          <Search className="size-3.5" /> ابحث عن كيان موسوعي
        </label>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          placeholder="بغداد، دمشق، هولاكو…"
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {matches.map((m) => (
            <button
              key={m.id}
              onClick={() => setSelected(m)}
              className={`rounded-full border px-2.5 py-1 text-[11px] ${
                selected?.id === m.id
                  ? "border-gold bg-gold/15 text-gold"
                  : "border-border text-muted-foreground"
              }`}
            >
              {m.title} · {m.entity_type}
            </button>
          ))}
        </div>
      </div>

      {selected && (
        <div className="rounded-xl border border-border bg-surface/40 p-3 text-xs">
          <div className="font-bold">{selected.title}</div>
          <div className="mt-1 font-mono text-[10px] text-muted-foreground break-all">
            id: {selected.id} · slug: {selected.slug} · type: {selected.entity_type}
          </div>
          {context && (
            <div className="mt-2 text-[11px] text-muted-foreground">
              عالم: {context.world ?? "—"} · دولة: {context.state ?? "—"} · حقبة:{" "}
              {context.era ?? "—"} · حملات: {[...context.campaignRefs].join(", ") || "—"} · جيران
              أقوياء: {context.strongNeighborIds.size} · جيران أضعف: {context.weakNeighborIds.size}
            </div>
          )}
          <div className="mt-1 text-[11px] text-muted-foreground">
            علاقات مفهرسة: {relIndex.relationCount} · حدّ القبول: {MIN_RELATED_SCORE}
          </div>
        </div>
      )}

      {relIndex.brokenRefs.length > 0 && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
          <div className="mb-1 flex items-center gap-1.5 font-bold text-amber-500">
            <AlertTriangle className="size-3.5" /> مراجع علاقات غير قابلة للحل (
            {relIndex.brokenRefs.length})
          </div>
          <ul className="space-y-0.5 font-mono text-[10px] text-muted-foreground">
            {relIndex.brokenRefs.slice(0, 20).map((b, i) => (
              <li key={i}>
                {b.story_id} → {b.target_id}
              </li>
            ))}
          </ul>
        </div>
      )}

      {selected && isLoading && (
        <div className="p-4 text-center text-sm text-muted-foreground">جاري الحساب…</div>
      )}

      {selected && !isLoading && (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-right text-[11px]">
            <thead className="bg-surface/60 text-muted-foreground">
              <tr>
                <th className="p-2">القصة</th>
                <th className="p-2">النتيجة</th>
                <th className="p-2">السبب</th>
                <th className="p-2">الإشارات</th>
                <th className="p-2">الرفض</th>
              </tr>
            </thead>
            <tbody>
              {scored.map(({ story, scored: s }) => (
                <tr
                  key={story.id}
                  className={`border-t border-border/60 ${s.rejected ? "opacity-60" : ""}`}
                >
                  <td className="p-2">{story.title_ar}</td>
                  <td className="p-2 font-mono">{s.score}</td>
                  <td className="p-2">{s.reason ? REASON_BADGE[s.reason] : "—"}</td>
                  <td className="p-2 text-muted-foreground">
                    {s.signals.map((g) => `${g.code}+${g.points}`).join(" · ") || "—"}
                  </td>
                  <td className="p-2 text-muted-foreground">{s.rejected ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

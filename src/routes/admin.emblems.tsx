// ============================================================
// /admin/emblems — read-only Emblem Registry inspector
// ------------------------------------------------------------
// Phase 9 / Phase 0 deliverable. Shows every emblem in the
// canonical registry with its category, rarity, status, whether
// a Premium asset has been uploaded, visual/asset versions, and
// the legacy SVG fallback key. No CRUD, no upload pipeline yet.
// ============================================================

import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AdminGate } from "@/lib/admin-guard";
import { EMBLEM_REGISTRY, SIGNATURE_EMBLEMS } from "@/lib/emblems/registry";
import { hasAnyAsset } from "@/lib/emblems/asset-manifest";
import { RARITY_LABEL_AR } from "@/lib/emblems/rarity";
import { EmblemArt } from "@/components/EmblemArt";
import { EmblemRarityFrame } from "@/components/EmblemRarityFrame";

export const Route = createFileRoute("/admin/emblems")({
  head: () => ({
    meta: [
      { title: "شعارات اللاعبين — لوحة الإدارة | إرث" },
      { name: "description", content: "قائمة الشعارات التاريخية الفاخرة داخل نظام إرث." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => (
    <AdminGate>
      <EmblemsAdminPage />
    </AdminGate>
  ),
});

function EmblemsAdminPage() {
  const [onlyMissing, setOnlyMissing] = useState(false);
  const rows = useMemo(() => {
    const list = [...EMBLEM_REGISTRY].sort(
      (a, b) => a.display_order - b.display_order,
    );
    return onlyMissing ? list.filter((r) => !hasAnyAsset(r)) : list;
  }, [onlyMissing]);
  const signatureIds = new Set(SIGNATURE_EMBLEMS.map((e) => e.id));
  const withAssets = EMBLEM_REGISTRY.filter(hasAnyAsset).length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8" dir="rtl">
      <header className="mb-6 flex flex-col gap-2">
        <h1 className="font-display text-2xl font-bold text-foreground">
          شعارات اللاعبين (Premium Historical Emblems)
        </h1>
        <p className="text-sm text-muted-foreground">
          Phase 9 · Foundation. لا تعديل ولا رفع أصول من هنا الآن — عرض فقط.
        </p>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
            الإجمالي: {EMBLEM_REGISTRY.length}
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
            المميّزة (Signature): {SIGNATURE_EMBLEMS.length}
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
            بأصول Premium: {withAssets} / {EMBLEM_REGISTRY.length}
          </span>
          <label className="ms-auto inline-flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={onlyMissing}
              onChange={(e) => setOnlyMissing(e.target.checked)}
            />
            <span>عرض الشعارات بدون أصول Premium فقط</span>
          </label>
        </div>
      </header>

      <div className="overflow-x-auto rounded-2xl border border-white/10 bg-surface/40">
        <table className="min-w-full text-sm">
          <thead className="bg-white/5 text-xs text-muted-foreground">
            <tr>
              <th className="p-3 text-start">المعاينة</th>
              <th className="p-3 text-start">المعرّف</th>
              <th className="p-3 text-start">الاسم</th>
              <th className="p-3 text-start">الفئة</th>
              <th className="p-3 text-start">الندرة</th>
              <th className="p-3 text-start">الحالة</th>
              <th className="p-3 text-start">Premium</th>
              <th className="p-3 text-start">v.asset / v.visual</th>
              <th className="p-3 text-start">Signature</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-white/5">
                <td className="p-3">
                  <EmblemRarityFrame rarity={r.rarity} animated={false} className="size-10">
                    <EmblemArt avatarId={r.id} size="sm" className="size-8" />
                  </EmblemRarityFrame>
                </td>
                <td className="p-3 font-mono text-xs">{r.id}</td>
                <td className="p-3">{r.name_ar}</td>
                <td className="p-3">{r.category}</td>
                <td className="p-3">{RARITY_LABEL_AR[r.rarity]}</td>
                <td className="p-3">{r.status}</td>
                <td className="p-3">
                  {hasAnyAsset(r) ? (
                    <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-xs text-emerald-300">متوفر</span>
                  ) : (
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-muted-foreground">بانتظار الرفع</span>
                  )}
                </td>
                <td className="p-3 font-mono text-xs">
                  v{r.asset_version} / v{r.visual_version}
                </td>
                <td className="p-3">
                  {signatureIds.has(r.id) ? (
                    <span className="rounded-full bg-[#d4af37]/20 px-2 py-0.5 text-xs text-[#d4af37]">Signature</span>
                  ) : (
                    <span className="text-muted-foreground/60">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

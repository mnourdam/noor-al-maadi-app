// ============================================================
// /admin/artifacts — Artifact classification workbench
// ------------------------------------------------------------
// Scope is deliberately narrow: published artifacts only, and the
// ONLY field this page ever writes is `metadata.rarity` (through the
// audited `admin_set_artifact_rarity` RPC). Titles, bodies, images and
// every other artifact field are untouched.
//
// Workflow: export CSV/JSON → review offline → import the same file →
// bulk apply the reviewed rarities in one pass.
// ============================================================

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Loader2, RefreshCw, Upload } from "lucide-react";
import { AdminGate } from "@/lib/admin-guard";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/artifacts")({
  head: () => ({
    meta: [
      { title: "تصنيف الآثار — لوحة الإدارة | إرث" },
      { name: "description", content: "مراجعة وتصحيح تصنيف ندرة الآثار المعتمدة في إرث دفعة واحدة." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => (
    <AdminGate>
      <ArtifactsAdminPage />
    </AdminGate>
  ),
});

const RARITIES = ["common", "rare", "epic", "legendary"] as const;
type Rarity = (typeof RARITIES)[number];

const RARITY_LABEL: Record<string, string> = {
  common: "شائع",
  rare: "نادر",
  epic: "ملحمي",
  legendary: "أسطوري",
  "": "غير مصنّف",
};

interface ArtifactRow {
  id: string;
  slug: string;
  title: string;
  entity_type: string;
  rarity: string;
}

interface ImportRow {
  id: string;
  rarity: Rarity;
}

function csvEscape(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function download(name: string, mime: string, body: string) {
  const url = URL.createObjectURL(new Blob([body], { type: `${mime};charset=utf-8` }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** Tiny CSV reader: handles quoted fields and CRLF. Header row required. */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === ",") { row.push(field); field = ""; continue; }
    if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; continue; }
    if (c === "\r") continue;
    field += c;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  const [header, ...body] = rows.filter((r) => r.some((c) => c.trim() !== ""));
  if (!header) return [];
  const keys = header.map((h) => h.trim());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
}

function ArtifactsAdminPage() {
  const [rows, setRows] = useState<ArtifactRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [rarityFilter, setRarityFilter] = useState<string>("all");
  const [pending, setPending] = useState<ImportRow[] | null>(null);
  const [importName, setImportName] = useState<string>("");
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setRows(null);
    setError(null);
    const { data, error: err } = await supabase
      .from("encyclopedia_entities")
      .select("id, slug, title, entity_type, metadata")
      .eq("entity_type", "artifact")
      .eq("enabled", true)
      .order("title", { ascending: true });
    if (err) { setError(err.message); setRows([]); return; }
    setRows(
      (data ?? []).map((r) => ({
        id: String(r.id),
        slug: String(r.slug ?? ""),
        title: String(r.title ?? ""),
        entity_type: String(r.entity_type ?? "artifact"),
        rarity: String((r.metadata as Record<string, unknown> | null)?.rarity ?? ""),
      })),
    );
  };

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const list = rows ?? [];
    const needle = q.trim().toLowerCase();
    return list.filter((r) => {
      if (rarityFilter !== "all" && r.rarity !== (rarityFilter === "none" ? "" : rarityFilter)) return false;
      if (!needle) return true;
      return r.title.toLowerCase().includes(needle) || r.slug.toLowerCase().includes(needle);
    });
  }, [rows, q, rarityFilter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { common: 0, rare: 0, epic: 0, legendary: 0, "": 0 };
    for (const r of rows ?? []) c[r.rarity in c ? r.rarity : ""] += 1;
    return c;
  }, [rows]);

  const exportJson = () => {
    download(
      "irth-artifacts-classification.json",
      "application/json",
      JSON.stringify({ exported_at: new Date().toISOString(), items: rows ?? [] }, null, 2),
    );
  };

  const exportCsv = () => {
    const header = ["id", "slug", "title", "entity_type", "rarity"];
    const body = (rows ?? []).map((r) =>
      [r.id, r.slug, r.title, r.entity_type, r.rarity].map(csvEscape).join(","),
    );
    download("irth-artifacts-classification.csv", "text/csv", [header.join(","), ...body].join("\n"));
  };

  const onFile = async (file: File) => {
    setResult(null);
    setImportName(file.name);
    const text = await file.text();
    let raw: Record<string, unknown>[] = [];
    try {
      if (file.name.toLowerCase().endsWith(".json")) {
        const parsed = JSON.parse(text);
        raw = Array.isArray(parsed) ? parsed : (parsed?.items ?? []);
      } else {
        raw = parseCsv(text);
      }
    } catch (e) {
      setResult(`تعذّر قراءة الملف: ${(e as Error).message}`);
      return;
    }
    const known = new Map((rows ?? []).map((r) => [r.id, r]));
    const next: ImportRow[] = [];
    let ignored = 0;
    for (const item of raw) {
      const id = String(item.id ?? "").trim();
      const rarity = String(item.rarity ?? "").trim().toLowerCase() as Rarity;
      if (!id || !RARITIES.includes(rarity) || !known.has(id)) { ignored++; continue; }
      if (known.get(id)!.rarity === rarity) continue; // no change
      next.push({ id, rarity });
    }
    setPending(next);
    setResult(
      next.length === 0
        ? `لا توجد تغييرات قابلة للتطبيق في هذا الملف${ignored ? ` (تم تجاهل ${ignored} صفًا)` : ""}.`
        : `جاهز للتطبيق: ${next.length} تغييرًا${ignored ? ` — تم تجاهل ${ignored} صفًا` : ""}.`,
    );
  };

  const applyPending = async () => {
    if (!pending || pending.length === 0) return;
    setApplying(true);
    setResult(null);
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];
    // The RPC applies one rarity per call, so group the reviewed file by
    // target rarity — at most four audited calls for the whole batch.
    for (const rarity of RARITIES) {
      const ids = pending.filter((p) => p.rarity === rarity).map((p) => p.id);
      if (ids.length === 0) continue;
      const { data, error: err } = await supabase.rpc("admin_set_artifact_rarity", {
        _ids: ids,
        _rarity: rarity,
      });
      if (err) { errors.push(`${rarity}: ${err.message}`); continue; }
      const out = (data ?? {}) as { updated?: number; skipped?: number };
      updated += out.updated ?? 0;
      skipped += out.skipped ?? 0;
    }
    setApplying(false);
    setPending(null);
    if (fileRef.current) fileRef.current.value = "";
    setResult(
      errors.length > 0
        ? `تم تحديث ${updated} — أخطاء: ${errors.join(" | ")}`
        : `تم تحديث ${updated} أثرًا${skipped ? ` (تخطّي ${skipped})` : ""}.`,
    );
    await load();
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8" dir="rtl">
      <header className="mb-6 space-y-2">
        <h1 className="font-display text-2xl font-bold text-foreground">تصنيف الآثار</h1>
        <p className="text-sm text-muted-foreground">
          الآثار المعتمدة فقط. هذه الصفحة تعدّل حقل الندرة فقط — لا تمس أي بيانات أخرى للأثر.
        </p>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
            الإجمالي: {rows?.length ?? "—"}
          </span>
          {RARITIES.map((r) => (
            <span key={r} className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
              {RARITY_LABEL[r]}: {counts[r]}
            </span>
          ))}
          <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-amber-300">
            غير مصنّف: {counts[""]}
          </span>
        </div>
      </header>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <button
          onClick={exportCsv}
          className="inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/10 px-3 py-1.5 text-xs text-gold hover:bg-gold/20"
        >
          <Download className="size-3.5" /> تصدير CSV
        </button>
        <button
          onClick={exportJson}
          className="inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/10 px-3 py-1.5 text-xs text-gold hover:bg-gold/20"
        >
          <Download className="size-3.5" /> تصدير JSON
        </button>
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-foreground hover:bg-white/10">
          <Upload className="size-3.5" /> استيراد ملف مُراجَع
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
            }}
          />
        </label>
        <button
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className="size-3.5" /> تحديث
        </button>
      </div>

      {(pending || result) && (
        <div className="mb-5 rounded-2xl border border-gold/25 bg-gold/5 p-4 text-xs">
          {importName && <div className="mb-1 text-muted-foreground">الملف: {importName}</div>}
          {result && <div className="text-foreground/90">{result}</div>}
          {pending && pending.length > 0 && (
            <button
              onClick={() => void applyPending()}
              disabled={applying}
              className="mt-3 inline-flex items-center gap-2 rounded-full border border-gold/50 bg-gold/20 px-4 py-2 text-xs font-semibold text-gold disabled:opacity-50"
            >
              {applying && <Loader2 className="size-3.5 animate-spin" />}
              تطبيق {pending.length} تغييرًا
            </button>
          )}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="بحث بالاسم أو الـslug…"
          className="w-64 rounded-full border border-white/10 bg-background/60 px-4 py-2 text-xs outline-none focus:border-gold/40"
        />
        <select
          value={rarityFilter}
          onChange={(e) => setRarityFilter(e.target.value)}
          className="rounded-full border border-white/10 bg-background/60 px-3 py-2 text-xs outline-none focus:border-gold/40"
        >
          <option value="all">كل الندرات</option>
          {RARITIES.map((r) => (
            <option key={r} value={r}>{RARITY_LABEL[r]}</option>
          ))}
          <option value="none">غير مصنّف</option>
        </select>
        <span className="text-xs text-muted-foreground">النتائج: {filtered.length}</span>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-300">{error}</div>
      )}

      {rows === null ? (
        <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> جارٍ التحميل…
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full text-right text-xs">
            <thead className="bg-white/5 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">الاسم</th>
                <th className="px-3 py-2 font-medium">slug</th>
                <th className="px-3 py-2 font-medium">النوع</th>
                <th className="px-3 py-2 font-medium">الندرة</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t border-white/5">
                  <td className="px-3 py-2 text-foreground">{r.title}</td>
                  <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">{r.slug}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.entity_type}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] ${
                        r.rarity ? "border border-gold/30 bg-gold/10 text-gold" : "border border-amber-400/30 bg-amber-400/10 text-amber-300"
                      }`}
                    >
                      {RARITY_LABEL[r.rarity] ?? r.rarity}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

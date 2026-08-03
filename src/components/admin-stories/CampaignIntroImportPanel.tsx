// ============================================================
// Campaign Intro import panel (admin only)
// ------------------------------------------------------------
// Campaign intros are Stories with metadata.kind = 'campaign_intro'
// and metadata.campaign_id. They are NOT library stories and never
// show in the public catalog. This panel reuses the frozen v2
// importer RPCs, adds an intro-specific guard layer, and accepts
// legacy v1 export files by normalizing them to v2 client-side.
// ============================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { Upload, PlayCircle, ShieldCheck, AlertTriangle, Film } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  adminImportStoriesV2Preview,
  adminImportStoriesV2Apply,
  type StoryExportEnvelopeV2,
  type StoryImportPreviewReportV2,
} from "@/lib/stories/import-v2";
import {
  normalizeStoryEnvelope,
  isEnvelopeV2,
  validateCampaignIntroEnvelope,
  campaignIdOfItem,
  INTRO_ISSUE_LABEL,
  type IntroValidationIssue,
} from "@/lib/stories/envelope";
/** Renders the server-side issue payload without swallowing its detail. */
function serverIssueDetail(issue: Record<string, unknown>): string {
  const rest = Object.fromEntries(Object.entries(issue).filter(([k]) => k !== "code"));
  const keys = Object.keys(rest);
  if (keys.length === 0) return "";
  const short = rest.message ?? rest.detail ?? rest.value ?? rest.id ?? rest.ids ?? rest.field;
  if (typeof short === "string" || typeof short === "number") return `— ${short}`;
  return `— ${JSON.stringify(rest)}`;
}


export function CampaignIntroImportPanel() {
  const [envelope, setEnvelope] = useState<StoryExportEnvelopeV2 | null>(null);
  const [wasV1, setWasV1] = useState(false);
  const [issues, setIssues] = useState<IntroValidationIssue[] | null>(null);
  const [preview, setPreview] = useState<StoryImportPreviewReportV2 | null>(null);
  const [allowReplace, setAllowReplace] = useState(false);
  const [busy, setBusy] = useState<null | "preview" | "apply">(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [campaignIds, setCampaignIds] = useState<Set<string>>(new Set());
  const [publishedIntros, setPublishedIntros] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    void (async () => {
      const [{ data: camps }, { data: intros }] = await Promise.all([
        supabase.from("admin_campaigns" as never).select("id,slug"),
        supabase.from("stories" as never).select("id,status,metadata"),
      ]);
      const ids = new Set<string>();
      ((camps as unknown as { id: string; slug: string | null }[]) ?? []).forEach((c) => {
        if (c.id) ids.add(c.id);
        if (c.slug) ids.add(c.slug);
      });
      setCampaignIds(ids);
      const map = new Map<string, string>();
      ((intros as unknown as { id: string; status: string; metadata: Record<string, unknown> }[]) ?? [])
        .filter((s) => s.metadata?.kind === "campaign_intro" && s.status === "published")
        .forEach((s) => {
          const cid = typeof s.metadata?.campaign_id === "string" ? s.metadata.campaign_id : null;
          if (cid) map.set(cid, s.id);
        });
      setPublishedIntros(map);
    })().catch(() => { /* read-only enrichment */ });
  }, []);

  const revalidate = (env: StoryExportEnvelopeV2, replace: boolean) => {
    const res = validateCampaignIntroEnvelope(env, {
      knownCampaignIds: campaignIds,
      publishedIntroByCampaign: publishedIntros,
      allowReplace: replace,
    });
    setIssues(res.issues);
    return res.ok;
  };

  const onFile = async (f: File | null) => {
    if (!f) return;
    setPreview(null);
    setMsg(null);
    try {
      const raw = JSON.parse(await f.text());
      const v1 = !isEnvelopeV2(raw);
      const env = normalizeStoryEnvelope(raw);
      setWasV1(v1);
      setEnvelope(env);
      revalidate(env, allowReplace);
      setMsg({ kind: "ok", text: v1 ? "ملف بصيغة قديمة — تم تحويله إلى v2 تلقائيًا." : "تم تحميل حزمة v2." });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : String(e) });
    }
  };

  const runPreview = async () => {
    if (!envelope) return;
    if (!revalidate(envelope, allowReplace)) {
      setMsg({ kind: "err", text: "توجد مشكلات في التحقق من الافتتاحية." });
      return;
    }
    setBusy("preview");
    try {
      setPreview(await adminImportStoriesV2Preview(envelope, {
        allow_intro_replace: allowReplace,
      }));
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : String(e) });
    } finally { setBusy(null); }
  };

  const runApply = async () => {
    if (!envelope || !preview?.ok) return;
    setBusy("apply");
    try {
      const res = await adminImportStoriesV2Apply(envelope, {
        allow_intro_replace: allowReplace,
      });
      if (res.ok) {
        setMsg({ kind: "ok", text: `تم: أُنشئت ${res.totals.created} / حُدِّثت ${res.totals.updated} / بلا تغيير ${res.totals.unchanged}.` });
      } else {
        setMsg({ kind: "err", text: "فشل التحقق قبل الكتابة. لم تُكتب أي بيانات." });
      }
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : String(e) });
    } finally { setBusy(null); }
  };

  const summary = useMemo(
    () => (envelope?.stories ?? []).map((s) => ({
      id: s.id,
      title: s.title_ar,
      campaign: campaignIdOfItem(s) ?? "—",
      scenes: s.scenes.length,
      status: s.status,
    })),
    [envelope],
  );

  return (
    <section dir="rtl" className="space-y-3 rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <Film className="h-4 w-4 text-primary" />
        <h2 className="text-base font-semibold">استيراد افتتاحيات الحملات</h2>
      </div>
      <p className="text-xs leading-6 text-muted-foreground">
        خاص بالقصص التي تحمل <code className="rounded bg-muted px-1">metadata.kind = "campaign_intro"</code> ومعرّف الحملة.
        يقبل ملفات v2 ويحوّل ملفات v1 القديمة تلقائيًا. الافتتاحيات لا تظهر في مكتبة القصص العامة،
        ويُسمح بالملفات بلا صور بعد (<code className="rounded bg-muted px-1">media: []</code>).
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm">
          <Upload className="h-4 w-4" /> اختيار ملف افتتاحية
        </button>
        <input ref={fileRef} type="file" accept="application/json" className="hidden"
          onChange={(e) => void onFile(e.target.files?.[0] ?? null)} />
        <label className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <input type="checkbox" checked={allowReplace}
            onChange={(e) => { setAllowReplace(e.target.checked); setPreview(null); if (envelope) revalidate(envelope, e.target.checked); }} />
          استبدال الافتتاحية المنشورة الحالية للحملة
        </label>
        <button onClick={() => void runPreview()} disabled={!envelope || busy !== null}
          className="ml-auto rounded-md border px-3 py-1.5 text-sm disabled:opacity-50">معاينة</button>
        <button onClick={() => void runApply()} disabled={!preview?.ok || busy !== null}
          className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-sm text-white disabled:opacity-50">
          <PlayCircle className="h-4 w-4" /> استيراد الافتتاحية
        </button>
      </div>

      {wasV1 && envelope && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700">
          تم تحويل الملف من الصيغة القديمة (v1) إلى Envelope v2 قبل المعاينة.
        </div>
      )}

      {msg && (
        <div className={`rounded-md border p-2 text-sm ${msg.kind === "ok"
          ? "border-emerald-500/40 bg-emerald-500/10"
          : "border-destructive/40 bg-destructive/10 text-destructive"}`}>{msg.text}</div>
      )}

      {issues && issues.length > 0 && (
        <ul className="space-y-1 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
          {issues.map((i, n) => (
            <li key={n} className="flex items-start gap-1">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <span><span className="font-mono">{i.storyId}</span> — {INTRO_ISSUE_LABEL[i.code]} {i.detail ?? ""}</span>
            </li>
          ))}
        </ul>
      )}

      {summary.length > 0 && (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-xs">
            <thead className="bg-muted/40">
              <tr>
                <th className="p-2 text-right">القصة</th>
                <th className="p-2 text-right">الحملة</th>
                <th className="p-2 text-right">المشاهد</th>
                <th className="p-2 text-right">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="p-2">{r.title}<div className="font-mono text-[10px] text-muted-foreground">{r.id}</div></td>
                  <td className="p-2 font-mono text-[11px]">{r.campaign}</td>
                  <td className="p-2">{r.scenes}</td>
                  <td className="p-2">{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {preview && (
        <div className="space-y-2 rounded-md border p-2 text-sm">
          <div className="flex items-center gap-2">
            {preview.ok ? <ShieldCheck className="h-4 w-4 text-emerald-500" /> : <AlertTriangle className="h-4 w-4 text-destructive" />}
            <span>{preview.ok ? "المعاينة نظيفة — التطبيق مسموح." : "المعاينة غير صالحة — التفاصيل أدناه."}</span>
          </div>

          {(preview.intro_link_issues ?? []).length > 0 && (
            <ul className="space-y-1 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
              {(preview.intro_link_issues ?? []).map((i, n) => (
                <li key={n} className="font-mono leading-relaxed">
                  ربط الحملة — {i.code}
                  <span className="text-muted-foreground"> {serverIssueDetail(i)}</span>
                </li>
              ))}
            </ul>
          )}

          {preview.items.some((it) => it.issues.length > 0) && (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-xs">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="p-2 text-right">القصة</th>
                    <th className="p-2 text-right">النوع</th>
                    <th className="p-2 text-right">الأخطاء</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.items.filter((it) => it.issues.length > 0).map((it) => (
                    <tr key={it.id ?? it.slug ?? Math.random()} className="border-t align-top">
                      <td className="p-2 font-mono text-[11px]">{it.id ?? it.slug ?? "—"}</td>
                      <td className="p-2">{it.kind}</td>
                      <td className="p-2">
                        <ul className="space-y-1">
                          {it.issues.map((i, n) => (
                            <li key={n} className="font-mono text-[11px] leading-relaxed">
                              <span className="text-destructive">{i.code}</span>
                              <span className="text-muted-foreground"> {serverIssueDetail(i)}</span>
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

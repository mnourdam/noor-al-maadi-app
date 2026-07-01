import { useEffect, useState } from "react";
import { History, RotateCcw, FileEdit } from "lucide-react";
import { listCampaignVersions, restoreCampaignVersion, type CampaignVersion } from "@/lib/adminCampaignsApi";

export function VersionHistory({ campaignId, onRestored }: {
  campaignId: string;
  onRestored: () => void;
}) {
  const [rows, setRows] = useState<CampaignVersion[] | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    listCampaignVersions(campaignId).then(setRows).catch(e => setErr(e.message));
  }, [campaignId]);

  const restore = async (version: number, asDraft: boolean) => {
    const msg = asDraft
      ? `استعادة النسخة ${version} كمسودة؟ لن يتأثر ما يراه اللاعبون حتى تنشرها.`
      : `تحذير: استعادة النسخة ${version} كإصدار منشور مباشرة. سيراها اللاعبون فوراً. تقدّم اللاعبين لن يُمس.`;
    if (!confirm(msg)) return;
    setBusy(version);
    try {
      await restoreCampaignVersion(campaignId, version, asDraft);
      onRestored();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  };

  if (err) {
    return <p className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">{err}</p>;
  }
  if (!rows) return <p className="text-sm text-slate-400">جارٍ التحميل…</p>;
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-700 bg-slate-900/30 p-6 text-center text-sm text-slate-500">
        <History className="mx-auto mb-2 h-5 w-5 opacity-60" />
        لا توجد نسخ منشورة سابقة بعد. أول نشر ينشئ النسخة الأولى.
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {rows.map(v => (
        <li key={v.version} className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900/40 p-3">
          <div>
            <div className="text-sm font-semibold text-amber-100">
              النسخة #{v.version} — {v.title || "بدون عنوان"}
            </div>
            <div className="text-[11px] text-slate-500">
              {new Date(v.created_at).toLocaleString("ar-EG")}
              {v.editor_email && <> · {v.editor_email}</>}
              {v.note && <> · {v.note}</>}
            </div>
          </div>
          <div className="flex gap-1">
            <button onClick={() => restore(v.version, true)} disabled={busy === v.version}
              className="rounded-md border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:border-amber-400 hover:text-amber-300">
              <FileEdit className="me-1 inline h-3 w-3" /> استعادة كمسودة
            </button>
            <button onClick={() => restore(v.version, false)} disabled={busy === v.version}
              className="rounded-md border border-red-400/30 px-2 py-1 text-[11px] text-red-300 hover:bg-red-500/10">
              <RotateCcw className="me-1 inline h-3 w-3" /> نشر النسخة الآن
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

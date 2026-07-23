import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  BookOpenText, Plus, Pencil, ExternalLink, RefreshCw,
  CheckCircle2, AlertTriangle, X,
} from "lucide-react";
import { AdminGate } from "@/lib/admin-guard";
import {
  adminListStories,
  adminUpsertStory,
  adminSetStoryStatus,
  type AdminStorySummary,
} from "@/lib/stories/admin";
import type { StoryStatus } from "@/lib/stories/types";

export const Route = createFileRoute("/admin/stories/")({
  head: () => ({
    meta: [
      { title: "إدارة القصص — إرث" },
      { name: "description", content: "لوحة إدارة قصص إرث." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => (
    <AdminGate>
      <AdminStoriesPage />
    </AdminGate>
  ),
});

type Toast = { kind: "ok" | "err"; msg: string };

const STATUS_LABEL: Record<StoryStatus, string> = {
  draft: "مسودة",
  published: "منشورة",
  archived: "مؤرشفة",
};

function AdminStoriesPage() {
  const [rows, setRows] = useState<AdminStorySummary[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [filter, setFilter] = useState<"all" | StoryStatus>("all");
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);

  const notify = (kind: Toast["kind"], msg: string) => {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 3500);
  };

  const refresh = async () => {
    try {
      setErr(null);
      const data = await adminListStories();
      setRows(data);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => { void refresh(); }, []);

  const visible = useMemo(() => {
    const list = rows ?? [];
    const needle = q.trim().toLowerCase();
    return list
      .filter((r) => filter === "all" || r.status === filter)
      .filter((r) =>
        !needle ||
        r.id.toLowerCase().includes(needle) ||
        r.slug.toLowerCase().includes(needle) ||
        r.title_ar.toLowerCase().includes(needle) ||
        (r.title_en?.toLowerCase().includes(needle) ?? false),
      );
  }, [rows, filter, q]);

  const setStatus = async (r: AdminStorySummary, next: StoryStatus) => {
    try {
      const res = await adminSetStoryStatus(r.id, next);
      if (!res.ok) {
        if (res.reason === "validation_failed" && res.validation) {
          const first = res.validation.issues[0]?.message ?? "لا يمكن النشر.";
          notify("err", `فشل التحقق قبل النشر: ${first}`);
        } else {
          notify("err", res.reason ?? "تعذر تغيير الحالة.");
        }
        return;
      }
      notify("ok", `الحالة الآن: ${STATUS_LABEL[next]}.`);
      await refresh();
    } catch (e) {
      notify("err", e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div dir="rtl" className="mx-auto max-w-6xl p-4 space-y-4">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BookOpenText className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-semibold">إدارة القصص</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> قصة جديدة
          </button>
          <button
            onClick={() => void refresh()}
            className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
          >
            <RefreshCw className="h-4 w-4" /> تحديث
          </button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {(["all", "draft", "published", "archived"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`rounded-full border px-3 py-1 text-xs ${
              filter === k ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"
            }`}
          >
            {k === "all" ? "الكل" : STATUS_LABEL[k]}
          </button>
        ))}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="بحث بالمعرف أو العنوان..."
          className="mr-auto rounded-md border bg-background px-3 py-1.5 text-sm"
        />
      </div>

      {err && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {err}
        </div>
      )}

      {rows === null ? (
        <div className="text-sm text-muted-foreground">جاري التحميل...</div>
      ) : visible.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          لا توجد قصص مطابقة.
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs">
              <tr>
                <th className="px-3 py-2 text-right">المعرف</th>
                <th className="px-3 py-2 text-right">العنوان</th>
                <th className="px-3 py-2">الحالة</th>
                <th className="px-3 py-2">المشاهد</th>
                <th className="px-3 py-2">آخر تحديث</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-2 font-mono text-xs">{r.id}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{r.title_ar}</div>
                    {r.title_en && (
                      <div className="text-xs text-muted-foreground">{r.title_en}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
                        r.status === "published"
                          ? "bg-emerald-500/15 text-emerald-600"
                          : r.status === "draft"
                          ? "bg-amber-500/15 text-amber-600"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {STATUS_LABEL[r.status]}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center">{r.scene_count}</td>
                  <td className="px-3 py-2 text-center text-xs text-muted-foreground">
                    {new Date(r.updated_at).toLocaleDateString("ar")}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap items-center justify-end gap-1">
                      <Link
                        to="/admin/stories/$id/edit"
                        params={{ id: r.id }}
                        className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted"
                      >
                        <Pencil className="h-3.5 w-3.5" /> تحرير
                      </Link>
                      {r.status !== "published" ? (
                        <button
                          onClick={() => void setStatus(r, "published")}
                          className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 px-2 py-1 text-xs text-emerald-600 hover:bg-emerald-500/10"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" /> نشر
                        </button>
                      ) : (
                        <button
                          onClick={() => void setStatus(r, "draft")}
                          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted"
                        >
                          إرجاع لمسودة
                        </button>
                      )}
                      {r.status !== "archived" && (
                        <button
                          onClick={() => void setStatus(r, "archived")}
                          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                        >
                          أرشفة
                        </button>
                      )}
                      {r.status === "published" && (
                        <Link
                          to="/story/$id"
                          params={{ id: r.id }}
                          target="_blank"
                          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted"
                        >
                          <ExternalLink className="h-3.5 w-3.5" /> فتح
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating && (
        <CreateStoryModal
          onClose={() => setCreating(false)}
          onCreated={async (id) => {
            setCreating(false);
            notify("ok", `تم إنشاء القصة ${id}.`);
            await refresh();
          }}
          onError={(m) => notify("err", m)}
        />
      )}

      {toast && (
        <div
          className={`fixed bottom-4 left-4 z-50 flex items-start gap-2 rounded-md border px-3 py-2 text-sm shadow-md ${
            toast.kind === "ok"
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700"
              : "border-destructive/40 bg-destructive/10 text-destructive"
          }`}
        >
          {toast.kind === "ok" ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <AlertTriangle className="h-4 w-4" />
          )}
          <span>{toast.msg}</span>
          <button
            onClick={() => setToast(null)}
            className="ml-2 opacity-60 hover:opacity-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function CreateStoryModal({
  onClose,
  onCreated,
  onError,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
  onError: (msg: string) => void;
}) {
  const [id, setId] = useState("");
  const [slug, setSlug] = useState("");
  const [titleAr, setTitleAr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    if (!id.trim() || !slug.trim() || !titleAr.trim()) {
      onError("جميع الحقول مطلوبة.");
      return;
    }
    if (!/^[a-z0-9_-]{3,80}$/.test(id.trim())) {
      onError("المعرف يجب أن يكون 3-80 حرفًا: أحرف صغيرة، أرقام، شرطات.");
      return;
    }
    setBusy(true);
    try {
      const row = await adminUpsertStory({
        id: id.trim(),
        slug: slug.trim(),
        title_ar: titleAr.trim(),
      });
      onCreated(row.id);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg border bg-background p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">قصة جديدة</h2>
          <button onClick={onClose} className="opacity-60 hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3">
          <label className="block text-xs">
            المعرف الثابت
            <input
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="story_hijra_v1"
              className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 font-mono text-sm"
            />
          </label>
          <label className="block text-xs">
            الرابط (slug)
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="hijra"
              className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 font-mono text-sm"
            />
          </label>
          <label className="block text-xs">
            العنوان بالعربية
            <input
              value={titleAr}
              onChange={(e) => setTitleAr(e.target.value)}
              placeholder="رحلة الهجرة"
              className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
            />
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
            إلغاء
          </button>
          <button
            onClick={() => void submit()}
            disabled={busy}
            className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
          >
            {busy ? "جاري الإنشاء..." : "إنشاء"}
          </button>
        </div>
      </div>
    </div>
  );
}

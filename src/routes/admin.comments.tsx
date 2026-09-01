import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminGate } from "@/lib/admin-guard";
import {
  adminListContentComments,
  commentAnchorHref,
  sourceLabelAr,
  type AdminCommentRow,
  type CommentSourceFilter,
} from "@/lib/adminComments";
import { MessageSquareQuote, RefreshCw, Search, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/admin/comments")({
  head: () => ({ meta: [{ title: "تعليقات وتأملات اللاعبين — إدارة إرث" }] }),
  component: AdminComments,
});

const FILTERS: { key: CommentSourceFilter; label: string }[] = [
  { key: "all", label: "الكل" },
  { key: "encyclopedia", label: "الموسوعة" },
  { key: "story", label: "القصص" },
  { key: "campaign", label: "الحملات" },
];

const PAGE_SIZE = 25;

function AdminComments() {
  const [source, setSource] = useState<CommentSourceFilter>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<AdminCommentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminListContentComments({
        source,
        search,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      });
      if (!res.ok) {
        setError(res.reason ?? "unknown");
        setRows([]);
        setTotal(0);
      } else {
        setRows(res.items);
        setTotal(res.total);
      }
    } finally {
      setLoading(false);
    }
  }, [source, search, page]);

  useEffect(() => {
    void load();
  }, [load]);

  // Reset to first page whenever filters/search change.
  useEffect(() => {
    setPage(1);
  }, [source, search]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageNumbers = buildPageNumbers(page, pageCount);

  return (
    <AdminGate>
      <AdminLayout
        title="تعليقات وتأملات اللاعبين"
        subtitle="كل التعليقات على محتوى الموسوعة والقصص وتأملات الحملات في مكان واحد — للقراءة فقط."
        breadcrumbs={[{ label: "التعليقات والتأملات" }]}
      >
        <div className="space-y-4" dir="rtl">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setSource(f.key)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  source === f.key
                    ? "border-amber-400 bg-amber-500/15 text-amber-200"
                    : "border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-500"
                }`}
              >
                {f.label}
              </button>
            ))}
            <div className="relative ms-auto">
              <Search className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="بحث في النص أو اللاعب أو المحتوى…"
                className="w-64 rounded-lg border border-slate-700 bg-slate-900 py-1.5 pe-3 ps-8 text-xs text-slate-200 placeholder:text-slate-500 focus:border-amber-500/50 focus:outline-none"
              />
            </div>
            <button
              onClick={() => void load()}
              className="rounded-lg border border-slate-700 bg-slate-900 p-1.5 text-slate-400 hover:text-amber-300"
              title="تحديث"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>

          <p className="text-xs text-slate-500">
            {loading ? "جارٍ التحميل…" : `${total.toLocaleString("ar")} نتيجة`}
          </p>

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
              تعذّر التحميل: {error}
            </div>
          )}

          {/* List */}
          <div className="space-y-2">
            {!loading && rows.length === 0 && !error && (
              <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-8 text-center text-sm text-slate-500">
                لا توجد نتائج مطابقة.
              </div>
            )}
            {rows.map((row) => {
              const href = commentAnchorHref(row);
              return (
                <article
                  key={row.id}
                  className="rounded-xl border border-slate-800 bg-slate-900/60 p-4"
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 font-medium text-amber-300">
                      <MessageSquareQuote className="h-3 w-3" />
                      {sourceLabelAr(row.source)}
                    </span>
                    <span className="rounded-full bg-slate-800 px-2 py-0.5 text-slate-400">
                      {row.kind === "reflection" ? "تأمّل" : "تعليق"}
                    </span>
                    {row.status && row.status !== "visible" && row.status !== "private" && (
                      <span className="rounded-full bg-slate-800 px-2 py-0.5 text-slate-500">
                        {row.status}
                      </span>
                    )}
                    <time className="ms-auto text-slate-500" dateTime={row.created_at}>
                      {new Date(row.created_at).toLocaleString("ar")}
                    </time>
                  </div>

                  <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-200">
                    {row.body}
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-slate-800 pt-2 text-xs text-slate-500">
                    <span className="text-slate-300">
                      {row.author_name || row.author_username || "لاعب"}
                      {row.author_username && row.author_name ? (
                        <span className="text-slate-500"> @{row.author_username}</span>
                      ) : null}
                    </span>
                    {row.anchor_title && (
                      href ? (
                        <a
                          href={href}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-amber-300/90 hover:text-amber-200 hover:underline"
                        >
                          {row.anchor_title}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span>{row.anchor_title}</span>
                      )
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </AdminLayout>
    </AdminGate>
  );
}

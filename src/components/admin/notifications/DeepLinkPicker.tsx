/**
 * DeepLinkPicker — searchable destination picker that auto-builds the
 * `deep_link` URL and structured `payload` for the composer. When a
 * destination needs params (campaign slug, artifact id…), the picker
 * renders the right inputs dynamically.
 *
 * An "Advanced" toggle keeps the legacy free-text path for power users.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Link as LinkIcon, Search, X } from "lucide-react";
import {
  DEEP_LINKS, DEEP_LINK_GROUPS, findDeepLink, searchDeepLinks,
  type DeepLinkDef, type DeepLinkParamSource,
} from "@/lib/notifications/admin/deep-links";
import {
  searchDestinationOptions, type DestinationOption,
} from "@/lib/notifications/admin/destination-search";

export interface DeepLinkPickerProps {
  /** Currently selected destination id (or empty for free-text mode). */
  destinationId: string;
  /** Param values for the selected destination. */
  params: Record<string, string>;
  /** Raw free-text deep link (only used when destinationId === "advanced"). */
  rawDeepLink: string;
  onChange: (next: {
    destinationId: string;
    params: Record<string, string>;
    rawDeepLink: string;
    /** Built deep link + payload, ready to send. */
    deep_link: string;
    payload: Record<string, unknown>;
  }) => void;
}

export function DeepLinkPicker({
  destinationId, params, rawDeepLink, onChange,
}: DeepLinkPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const selected = findDeepLink(destinationId);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const built = useMemo(() => buildOutput(destinationId, params, rawDeepLink), [destinationId, params, rawDeepLink]);

  const setDestination = (def: DeepLinkDef | "advanced" | "none") => {
    if (def === "none") {
      onChange({ destinationId: "", params: {}, rawDeepLink: "", deep_link: "", payload: {} });
      setOpen(false);
      return;
    }
    if (def === "advanced") {
      onChange({ destinationId: "advanced", params: {}, rawDeepLink, deep_link: rawDeepLink, payload: {} });
      setOpen(false);
      return;
    }
    const next = { ...params };
    // Drop param keys that don't exist on the new destination.
    for (const k of Object.keys(next)) if (!def.params.find((p) => p.key === k)) delete next[k];
    const out = buildOutput(def.id, next, rawDeepLink);
    onChange({ destinationId: def.id, params: next, rawDeepLink, ...out });
    setOpen(false);
  };

  const setParam = (key: string, value: string) => {
    const next = { ...params, [key]: value };
    const out = buildOutput(destinationId, next, rawDeepLink);
    onChange({ destinationId, params: next, rawDeepLink, ...out });
  };

  const setRaw = (value: string) => {
    onChange({ destinationId: "advanced", params: {}, rawDeepLink: value, deep_link: value, payload: {} });
  };

  const filtered = searchDeepLinks(query);

  return (
    <div ref={ref} className="relative space-y-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-right text-sm"
      >
        <span className="flex items-center gap-2">
          <LinkIcon className="size-4 text-muted-foreground" />
          <span className={selected || destinationId === "advanced" ? "text-foreground" : "text-muted-foreground"}>
            {selected
              ? `${selected.group} • ${selected.label}`
              : destinationId === "advanced"
              ? "رابط مخصّص"
              : "اختر وجهة"}
          </span>
        </span>
        <ChevronDown className="size-4 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 max-h-96 w-full overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-lg">
          <div className="flex items-center gap-2 border-b border-border px-2 py-1.5">
            <Search className="size-4 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث عن وجهة…"
              className="flex-1 bg-transparent text-sm outline-none"
            />
            {(selected || destinationId === "advanced") && (
              <button
                type="button"
                onClick={() => setDestination("none")}
                className="grid size-6 place-items-center rounded text-muted-foreground hover:bg-muted"
                title="إزالة"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto p-1">
            {DEEP_LINK_GROUPS.map((g) => {
              const inGroup = filtered.filter((d) => d.group === g);
              if (inGroup.length === 0) return null;
              return (
                <div key={g} className="mb-2">
                  <p className="px-2 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{g}</p>
                  <div className="space-y-0.5">
                    {inGroup.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => setDestination(d)}
                        className={`w-full rounded px-2 py-1.5 text-right text-sm hover:bg-accent ${
                          d.id === destinationId ? "bg-primary/10 text-primary" : ""
                        }`}
                      >
                        <div className="font-medium">{d.label}</div>
                        {d.description && (
                          <div className="text-[11px] text-muted-foreground">{d.description}</div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            <button
              type="button"
              onClick={() => setDestination("advanced")}
              className={`mt-1 w-full rounded border-t border-border px-2 py-2 text-right text-xs hover:bg-accent ${
                destinationId === "advanced" ? "bg-primary/10 text-primary" : "text-muted-foreground"
              }`}
            >
              متقدّم — رابط مخصّص يدوي
            </button>
          </div>
        </div>
      )}

      {selected && selected.params.length > 0 && (
        <div className="grid gap-2 rounded-md border border-border bg-muted/20 p-3">
          {selected.params.map((p) => (
            <div key={p.key}>
              <label className="mb-1 block text-xs font-medium">
                {p.label}{p.required && <span className="text-destructive"> *</span>}
              </label>
              {p.source ? (
                <ContentParamPicker
                  source={p.source}
                  value={params[p.key] ?? ""}
                  onPick={(v) => setParam(p.key, v)}
                />
              ) : (
                <input
                  value={params[p.key] ?? ""}
                  onChange={(e) => setParam(p.key, e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                  placeholder={p.placeholder}
                  dir="ltr"
                />
              )}
              {p.hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{p.hint}</p>}
            </div>
          ))}
        </div>
      )}


      {destinationId === "advanced" && (
        <input
          value={rawDeepLink}
          onChange={(e) => setRaw(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
          placeholder="/campaigns/imported/prophetic-mission"
          dir="ltr"
        />
      )}

      {built.deep_link && (
        <div className="rounded border border-border bg-muted/20 px-2 py-1 text-[11px]" dir="ltr">
          <span className="text-muted-foreground">URL: </span>
          <span className="font-mono">{built.deep_link}</span>
        </div>
      )}
    </div>
  );
}

export function buildOutput(
  destinationId: string,
  params: Record<string, string>,
  rawDeepLink: string,
): { deep_link: string; payload: Record<string, unknown> } {
  if (!destinationId) return { deep_link: "", payload: {} };
  if (destinationId === "advanced") return { deep_link: rawDeepLink.trim(), payload: {} };
  const def = findDeepLink(destinationId);
  if (!def) return { deep_link: "", payload: {} };
  // Don't break the URL when required params are still empty — just don't
  // build yet. Composer-level validation will block the send.
  for (const p of def.params) {
    if (p.required && !(params[p.key] ?? "").trim()) return { deep_link: "", payload: {} };
  }
  return def.build(params);
}

export { DEEP_LINKS };

/**
 * Searchable content selector for destinations that need a real
 * campaign / story / entity / atlas location / investigation.
 * The manual value stays editable so an admin can always paste an id.
 */
function ContentParamPicker({
  source, value, onPick,
}: {
  source: DeepLinkParamSource;
  value: string;
  onPick: (value: string) => void;
}) {
  const [q, setQ] = useState("");
  const [options, setOptions] = useState<DestinationOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      void searchDestinationOptions(source, q).then((res) => {
        if (!cancelled) { setOptions(res); setLoading(false); }
      });
    }, 250);
    return () => { cancelled = true; clearTimeout(t); setLoading(false); };
  }, [source, q]);

  return (
    <div className="space-y-1.5">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="ابحث في المحتوى…"
        className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
      />
      <div className="max-h-44 overflow-y-auto rounded-md border border-border">
        {loading && <p className="px-2 py-1.5 text-[11px] text-muted-foreground">جارٍ البحث…</p>}
        {!loading && options.length === 0 && (
          <p className="px-2 py-1.5 text-[11px] text-muted-foreground">لا نتائج — يمكنك لصق المعرّف يدويًا.</p>
        )}
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onPick(o.value)}
            className={`block w-full px-2 py-1.5 text-right text-sm hover:bg-accent ${
              o.value === value ? "bg-primary/10 text-primary" : ""
            }`}
          >
            <span className="font-medium">{o.label}</span>
            {o.hint && <span className="block text-[11px] text-muted-foreground" dir="ltr">{o.hint}</span>}
          </button>
        ))}
      </div>
      <input
        value={value}
        onChange={(e) => onPick(e.target.value)}
        className="w-full rounded-md border border-input bg-background px-3 py-1.5 font-mono text-xs"
        placeholder="القيمة المختارة"
        dir="ltr"
      />
    </div>
  );
}

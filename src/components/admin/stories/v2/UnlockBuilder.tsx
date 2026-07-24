// ============================================================
// Stories M5 — Unlock Spec v2 visual builder.
// ------------------------------------------------------------
// Frozen contract (M3):
//   envelope { version: 2, expr: Node }
//   logical: all/any (children in "of"), not (child)
//   leaves: 11 kinds (always, campaign_complete,
//     campaign_chapter_complete, investigation_complete,
//     entity_discovered, entities_discovered, artifact_owned,
//     atlas_location_visited, achievement_unlocked, player_level,
//     story_complete, date_window)
// Validation uses the shared validator; no client-side rules.
// ============================================================

import { useMemo } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  UNLOCK_NODE_TYPES, ALWAYS_SPEC, type UnlockNode, type UnlockSpecV2,
} from "@/lib/stories/unlock/spec";
import { validateUnlockSpec } from "@/lib/stories/unlock/validate";

const TYPE_LABEL: Record<string, string> = {
  all: "الكل (AND)", any: "أي (OR)", not: "نفي (NOT)",
  always: "دائمًا مفتوح", campaign_complete: "إتمام حملة",
  campaign_chapter_complete: "إتمام فصل حملة",
  investigation_complete: "إتمام تحقيق",
  entity_discovered: "اكتشاف مدخل موسوعة",
  entities_discovered: "اكتشاف عدد من المداخل",
  artifact_owned: "امتلاك قطعة أثرية",
  atlas_location_visited: "زيارة موقع في الأطلس",
  achievement_unlocked: "إحراز إنجاز",
  player_level: "المستوى الأدنى للاعب",
  story_complete: "إتمام قصة",
  date_window: "نافذة تاريخية",
};

function newLeaf(t: string): UnlockNode {
  switch (t) {
    case "all": return { type: "all", of: [{ type: "always" }] };
    case "any": return { type: "any", of: [{ type: "always" }] };
    case "not": return { type: "not", child: { type: "always" } };
    case "always": return { type: "always" };
    case "campaign_complete": return { type: "campaign_complete", campaign_id: "" };
    case "campaign_chapter_complete": return { type: "campaign_chapter_complete", campaign_id: "", chapter_id: "" };
    case "investigation_complete": return { type: "investigation_complete", investigation_id: "" };
    case "entity_discovered": return { type: "entity_discovered", entity_id: "" };
    case "entities_discovered": return { type: "entities_discovered", ids: [""], min: 1 };
    case "artifact_owned": return { type: "artifact_owned", artifact_id: "" };
    case "atlas_location_visited": return { type: "atlas_location_visited", location_id: "" };
    case "achievement_unlocked": return { type: "achievement_unlocked", achievement_id: "" };
    case "player_level": return { type: "player_level", min: 1 };
    case "story_complete": return { type: "story_complete", story_id: "" };
    case "date_window": return { type: "date_window", start: "" };
    default: return { type: "always" };
  }
}

function TypeSelect({ value, onChange }: { value: string; onChange: (t: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="rounded-md border bg-background px-1.5 py-0.5 text-xs">
      {UNLOCK_NODE_TYPES.map((t) => (
        <option key={t} value={t}>{TYPE_LABEL[t] ?? t}</option>
      ))}
    </select>
  );
}

function NodeEditor({
  node, onChange, onRemove, depth = 1,
}: {
  node: UnlockNode;
  onChange: (n: UnlockNode) => void;
  onRemove?: () => void;
  depth?: number;
}) {
  const changeType = (t: string) => onChange(newLeaf(t));
  const setField = (patch: Record<string, unknown>) => onChange({ ...(node as unknown as Record<string, unknown>), ...patch } as UnlockNode);

  return (
    <div className="rounded-md border bg-muted/30 p-2" style={{ marginInlineStart: depth > 1 ? 8 : 0 }}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <TypeSelect value={node.type} onChange={changeType} />
        {onRemove && (
          <button onClick={onRemove} className="rounded border p-1 text-destructive hover:bg-destructive/10">
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>

      {(node.type === "all" || node.type === "any") && (
        <div className="space-y-1">
          {node.of.map((k, i) => (
            <NodeEditor
              key={i}
              node={k}
              depth={depth + 1}
              onChange={(nk) => {
                const of = node.of.slice(); of[i] = nk;
                onChange({ ...node, of });
              }}
              onRemove={() => {
                const of = node.of.filter((_, j) => j !== i);
                onChange({ ...node, of: of.length ? of : [{ type: "always" }] });
              }}
            />
          ))}
          <button
            onClick={() => onChange({ ...node, of: [...node.of, { type: "always" }] })}
            className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] hover:bg-muted">
            <Plus className="h-3 w-3" /> إضافة شرط
          </button>
        </div>
      )}
      {node.type === "not" && (
        <NodeEditor node={node.child} depth={depth + 1}
          onChange={(nk) => onChange({ ...node, child: nk })} />
      )}
      {node.type === "campaign_complete" && (
        <StringField label="campaign_id" value={node.campaign_id}
          onChange={(v) => setField({ campaign_id: v })} />
      )}
      {node.type === "campaign_chapter_complete" && (
        <>
          <StringField label="campaign_id" value={node.campaign_id}
            onChange={(v) => setField({ campaign_id: v })} />
          <StringField label="chapter_id" value={node.chapter_id}
            onChange={(v) => setField({ chapter_id: v })} />
        </>
      )}
      {node.type === "investigation_complete" && (
        <StringField label="investigation_id" value={node.investigation_id}
          onChange={(v) => setField({ investigation_id: v })} />
      )}
      {node.type === "entity_discovered" && (
        <StringField label="entity_id" value={node.entity_id}
          onChange={(v) => setField({ entity_id: v })} />
      )}
      {node.type === "entities_discovered" && (
        <>
          <label className="block text-[11px]">
            <span className="text-muted-foreground">ids (سطر لكل معرّف)</span>
            <textarea rows={3} value={node.ids.join("\n")}
              onChange={(e) => setField({ ids: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })}
              className="mt-0.5 w-full rounded-md border bg-background px-2 py-1 font-mono text-xs" />
          </label>
          <label className="block text-[11px]">
            <span className="text-muted-foreground">min</span>
            <input type="number" min={1} value={node.min}
              onChange={(e) => setField({ min: Math.max(1, Math.trunc(Number(e.target.value) || 1)) })}
              className="mt-0.5 w-full rounded-md border bg-background px-2 py-1 text-xs" />
          </label>
        </>
      )}
      {node.type === "artifact_owned" && (
        <StringField label="artifact_id" value={node.artifact_id}
          onChange={(v) => setField({ artifact_id: v })} />
      )}
      {node.type === "atlas_location_visited" && (
        <StringField label="location_id" value={node.location_id}
          onChange={(v) => setField({ location_id: v })} />
      )}
      {node.type === "achievement_unlocked" && (
        <StringField label="achievement_id" value={node.achievement_id}
          onChange={(v) => setField({ achievement_id: v })} />
      )}
      {node.type === "story_complete" && (
        <StringField label="story_id" value={node.story_id}
          onChange={(v) => setField({ story_id: v })} />
      )}
      {node.type === "player_level" && (
        <label className="block text-[11px]">
          <span className="text-muted-foreground">min</span>
          <input type="number" min={1} value={node.min}
            onChange={(e) => setField({ min: Math.max(1, Math.trunc(Number(e.target.value) || 1)) })}
            className="mt-0.5 w-full rounded-md border bg-background px-2 py-1 text-xs" />
        </label>
      )}
      {node.type === "date_window" && (
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-[11px]">
            <span className="text-muted-foreground">start (ISO)</span>
            <input dir="ltr" value={node.start ?? ""}
              onChange={(e) => setField({ start: e.target.value })}
              className="mt-0.5 w-full rounded-md border bg-background px-2 py-1 text-xs" />
          </label>
          <label className="block text-[11px]">
            <span className="text-muted-foreground">end (ISO)</span>
            <input dir="ltr" value={node.end ?? ""}
              onChange={(e) => setField({ end: e.target.value })}
              className="mt-0.5 w-full rounded-md border bg-background px-2 py-1 text-xs" />
          </label>
        </div>
      )}
    </div>
  );
}

function StringField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block text-[11px]">
      <span className="text-muted-foreground">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)}
        className="mt-0.5 w-full rounded-md border bg-background px-2 py-1 font-mono text-xs" />
    </label>
  );
}

export function UnlockBuilder({
  spec, onChange,
}: { spec: UnlockSpecV2; onChange: (next: UnlockSpecV2) => void }) {
  const result = useMemo(() => validateUnlockSpec(spec), [spec]);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">مواصفة الفتح (Unlock Spec v2)</div>
        <button onClick={() => onChange(ALWAYS_SPEC)}
          className="text-[11px] text-muted-foreground underline">تصفير إلى «دائمًا مفتوح»</button>
      </div>
      <NodeEditor node={spec.expr} onChange={(n) => onChange({ version: 2, expr: n })} />
      <div className={`rounded-md border p-2 text-[11px] ${result.ok ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-700" : "border-destructive/40 bg-destructive/5 text-destructive"}`}>
        {result.ok
          ? <>صالحة — {result.nodeCount} عقدة، عمق {result.depth}.</>
          : <ul className="space-y-0.5">
              {result.errors.map((e, i) => (<li key={i} className="font-mono">{e.path}: {e.code}</li>))}
            </ul>}
      </div>
    </div>
  );
}

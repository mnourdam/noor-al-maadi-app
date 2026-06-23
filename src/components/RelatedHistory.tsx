// ============================================================
// RelatedHistory — Supabase-only stub
// ------------------------------------------------------------
// The original component derived suggestions from bundled era
// packs. After the legacy runtime purge, related content is
// resolved through encyclopedia_entities + atlas_entities; this
// component renders nothing until that surface is wired in.
// ============================================================

type EntityRef = { kind: string; id: string };
type Props = { entity: EntityRef; title?: string };

export function RelatedHistory(_props: Props) {
  return null;
}

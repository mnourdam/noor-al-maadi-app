
import { supabaseAdmin } from "./src/integrations/supabase/client.server";

async function findReplacements() {
  const { data: entities, error } = await supabaseAdmin
    .from("encyclopedia_entities")
    .select("id, slug, title, entity_type, metadata, image_path, enabled")
    .is("image_path", null)
    .eq("enabled", true);

  if (error) {
    console.error(error);
    return;
  }

  const eligible = entities.filter(e => {
    const meta = (e.metadata as any) || {};
    return !meta.archived && !meta.redirect_to && !meta.canonical_id;
  });

  // Find an Event from a different era (e.g., Umayyad, Ottoman, Abbasid) - non-Seerah
  const events = eligible.filter(e => e.entity_type === "Event" && (e.metadata as any)?.era !== "Prophetic Era");
  console.log("Candidate Events:", events.slice(0, 5).map(e => ({ title: e.title, slug: e.slug, era: (e.metadata as any)?.era })));

  // Find an Artifact without Arabic dependency
  const artifacts = eligible.filter(e => e.entity_type === "Artifact");
  console.log("Candidate Artifacts:", artifacts.slice(0, 5).map(e => ({ title: e.title, slug: e.slug })));
}

findReplacements();

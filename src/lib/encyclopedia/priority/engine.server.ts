import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { 
  EntityPriorityReport, 
  EntityType, 
  ScoreBreakdown, 
  ProductionStatus,
  PriorityAuditResult
} from "./types";

/**
 * Priority Engine V1 - Server-side ranking logic.
 * This is an audit tool, not a data modifier.
 */

export async function generatePriorityAudit(): Promise<PriorityAuditResult> {
  // 1. Fetch relations for scoring
  // Using admin client to bypass RLS and access admin tables
  const [
    { data: entities, error: entitiesError },
    { data: storyRelations },
    { data: campaigns },
    { data: investigations },
    { data: stories }
  ] = await Promise.all([
    supabaseAdmin.from("encyclopedia_entities").select("id, slug, title, entity_type, metadata, image_path"),
    supabaseAdmin.from("story_relations").select("story_id, target_id, target_type, role"),
    supabaseAdmin.from("admin_campaigns").select("id, data"),
    supabaseAdmin.from("investigations").select("id, related_entities"),
    supabaseAdmin.from("stories").select("id, unlock_spec")
  ]);

  if (entitiesError) throw entitiesError;

  const report: EntityPriorityReport[] = [];

  // 2. Pre-process relations for efficient lookup
  const entityCampaigns = new Map<string, Set<string>>(); // entityId -> Set of campaignIds (supporting)
  const entityCoreCampaigns = new Map<string, Set<string>>(); // entityId -> Set of campaignIds (core)
  const entityStories = new Map<string, Set<string>>(); // entityId -> Set of storyIds
  const entityInvestigations = new Map<string, Set<string>>(); // entityId -> Set of investigationIds
  const entityUnlocks = new Map<string, Set<string>>(); // entityId -> Set of storyIds

  // Process Campaigns
  campaigns?.forEach(c => {
    const data = c.data as any;
    if (Array.isArray(data?.core_entities)) {
      data.core_entities.forEach((id: string) => {
        if (!entityCoreCampaigns.has(id)) entityCoreCampaigns.set(id, new Set());
        entityCoreCampaigns.get(id)!.add(c.id);
      });
    }
    if (Array.isArray(data?.related_entities)) {
      data.related_entities.forEach((id: string) => {
        if (!entityCampaigns.has(id)) entityCampaigns.set(id, new Set());
        entityCampaigns.get(id)!.add(c.id);
      });
    }
  });

  // Process Story Relations
  storyRelations?.forEach(rel => {
    if (rel.target_type === "encyclopedia_entity") {
      const id = rel.target_id;
      if (!entityStories.has(id)) entityStories.set(id, new Set());
      entityStories.get(id)!.add(rel.story_id);
    }
  });

  // Process Investigations
  investigations?.forEach(inv => {
    const related = inv.related_entities as any;
    if (Array.isArray(related)) {
      related.forEach((id: string) => {
        if (!entityInvestigations.has(id)) entityInvestigations.set(id, new Set());
        entityInvestigations.get(id)!.add(inv.id);
      });
    }
  });

  // Process Stories for Unlock Specs
  stories?.forEach(s => {
    const spec = s.unlock_spec as any;
    if (!spec) return;

    const findEntityIds = (obj: any): string[] => {
      const ids: string[] = [];
      if (!obj || typeof obj !== 'object') return ids;
      if (obj.type === 'discovery' && obj.entity_id) ids.push(obj.entity_id);
      if (obj.conditions && Array.isArray(obj.conditions)) {
        obj.conditions.forEach((c: any) => ids.push(...findEntityIds(c)));
      }
      return ids;
    };
    
    const ids = findEntityIds(spec);
    ids.forEach(id => {
      if (!entityUnlocks.has(id)) entityUnlocks.set(id, new Set());
      entityUnlocks.get(id)!.add(s.id);
    });
  });

  // 3. Calculate Scores
  entities?.forEach(entity => {
    const id = entity.id;
    const metadata = (entity.metadata as any) || {};
    
    const breakdown: ScoreBreakdown = {
      mandatoryUnlock: (entityUnlocks.get(id)?.size || 0) * 50,
      coreCampaign: (entityCoreCampaigns.get(id)?.size || 0) * 40,
      supportingCampaign: (entityCampaigns.get(id)?.size || 0) * 15,
      storyPrimary: (entityStories.get(id)?.size || 0) * 25,
      investigationRelation: (entityInvestigations.get(id)?.size || 0) * 15,
      curatedImportance: metadata.importance === 'core' ? 30 : (metadata.importance === 'major' ? 15 : 0),
      structuralAnchor: metadata.is_structural_anchor ? 20 : 0,
      crossSystemBonus: 0
    };

    let systems = 0;
    if ((entityCampaigns.get(id)?.size || 0) > 0 || (entityCoreCampaigns.get(id)?.size || 0) > 0) systems++;
    if ((entityStories.get(id)?.size || 0) > 0) systems++;
    if ((entityInvestigations.get(id)?.size || 0) > 0) systems++;
    if ((entityUnlocks.get(id)?.size || 0) > 0) systems++;

    if (systems === 2) breakdown.crossSystemBonus = 10;
    else if (systems === 3) breakdown.crossSystemBonus = 25;
    else if (systems >= 4) breakdown.crossSystemBonus = 40;

    const finalScore = Object.values(breakdown).reduce((a, b) => a + b, 0);
    const hasImage = !!entity.image_path;

    let productionStatus: ProductionStatus = "READY_FOR_VISUAL_PRODUCTION";
    if (hasImage) productionStatus = "HAS_EXISTING_IMAGE";
    else if (finalScore === 0) productionStatus = "LOW_SIGNAL";
    else if (metadata.needs_review) productionStatus = "NEEDS_MANUAL_PRIORITY_REVIEW";

    report.push({
      rankWithinType: 0,
      id: entity.id,
      slug: entity.slug,
      titleAr: entity.title, // 'title' stores the Arabic name
      type: entity.entity_type as EntityType,
      worldSlug: (metadata.world_slug as string) || undefined,
      era: (metadata.era as string) || undefined,
      finalScore,
      scoreBreakdown: breakdown,
      campaignCount: (entityCampaigns.get(id)?.size || 0) + (entityCoreCampaigns.get(id)?.size || 0),
      storyCount: entityStories.get(id)?.size || 0,
      investigationCount: entityInvestigations.get(id)?.size || 0,
      unlockDependencyCount: entityUnlocks.get(id)?.size || 0,
      curatedImportance: (metadata.importance as string) || null,
      distinctSystemsCount: systems,
      hasImage,
      imagePath: entity.image_path || undefined,
      productionStatus
    });
  });

  // 4. Map DB types to canonical UI types and rank
  const canonicalMap: Record<string, EntityType> = {
    'figure': 'Figure',
    'person': 'Figure',
    'character': 'Figure',
    'event': 'Event',
    'battle': 'Battle',
    'city': 'City',
    'landmark': 'Landmark',
    'state': 'State',
    'artifact': 'Artifact'
  };

  const types: EntityType[] = ["Figure", "Event", "City", "Battle", "Landmark", "State", "Artifact"];
  const distribution: Record<EntityType, number> = {
    Figure: 0, Event: 0, City: 0, Battle: 0, Landmark: 0, State: 0, Artifact: 0
  };
  const shortlists: Record<EntityType, EntityPriorityReport[]> = {
    Figure: [], Event: [], City: [], Battle: [], Landmark: [], State: [], Artifact: []
  };

  // Pre-calculate full rankings for all entities
  report.forEach(e => {
    const dbType = String(e.type).toLowerCase().trim();
    const canonical = canonicalMap[dbType] || (types.includes(e.type as any) ? e.type : null);
    if (canonical) {
      e.type = canonical as EntityType;
      distribution[e.type]++;
    }
  });

  types.forEach(type => {
    const typedEntities = report.filter(e => e.type === type);
    typedEntities.sort((a, b) => b.finalScore - a.finalScore || a.titleAr.localeCompare(b.titleAr));
    
    typedEntities.forEach((e, i) => {
      e.rankWithinType = i + 1;
    });

    // Return Top 100 for all types to support category tabs
    shortlists[type] = typedEntities.slice(0, 100);
  });

  const top25Overall = [...report]
    .filter(e => !e.hasImage)
    .sort((a, b) => b.finalScore - a.finalScore)
    .slice(0, 25);

  // Diagnostic logging (Server-side)
  console.log(`[PriorityAudit] Total Ranked: \${report.length}`);
  console.log(`[PriorityAudit] Distribution:`, distribution);

  return {
    scoringLogic: "Deterministic additive scoring: Mandatory Unlock (+50), Core Campaign (+40), Supporting Campaign (+15), Story (+25), Investigation (+15), Curated Core (+30), Major (+15), Structural (+20). Cross-system bonuses: 2 systems (+10), 3 (+25), 4+ (+40).",
    unavailableSignals: [],
    distribution,
    top25Overall,
    shortlists,
    anomalies: [],
    assessment: `Priority Engine V1 is operational. Found \${report.length} ranked entities across \${types.length} categories.`
  };
}

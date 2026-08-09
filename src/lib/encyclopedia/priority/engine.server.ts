import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { 
  EntityPriorityReport, 
  EntityType, 
  ScoreBreakdown, 
  ProductionStatus,
  PriorityAuditResult,
  HistoricalVisualImportance
} from "./types";

/**
 * Priority Engine V2 - Server-side ranking logic.
 * Implements "Gameplay Gravity" + "Historical Visual Importance".
 * Identifies the "Eligible Universe" for visual production.
 */

export async function generatePriorityAudit(): Promise<PriorityAuditResult> {
  // 1. Fetch relations and entities
  // Fetching all relevant signals to calculate gravity and importance
  const [
    { data: entities, error: entitiesError },
    { data: storyRelations },
    { data: campaigns },
    { data: investigations },
    { data: stories }
  ] = await Promise.all([
    supabaseAdmin.from("encyclopedia_entities").select("id, slug, title, entity_type, metadata, image_path, enabled, created_at, updated_at"),
    supabaseAdmin.from("story_relations").select("story_id, target_id, target_type, role"),
    supabaseAdmin.from("admin_campaigns").select("id, data"),
    supabaseAdmin.from("investigations").select("id, related_entities"),
    supabaseAdmin.from("stories").select("id, unlock_spec")
  ]);

  if (entitiesError) throw entitiesError;

  const report: EntityPriorityReport[] = [];
  let archivedOrRedirectedCount = 0;
  const eraBias: Record<string, number> = {};

  // 2. Pre-process relations for efficient lookup
  const entityCampaigns = new Map<string, Set<string>>(); 
  const entityCoreCampaigns = new Map<string, Set<string>>(); 
  const entityStories = new Map<string, Set<string>>(); 
  const entityInvestigations = new Map<string, Set<string>>(); 
  const entityUnlocks = new Map<string, Set<string>>(); 

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

  storyRelations?.forEach(rel => {
    if (rel.target_type === "encyclopedia_entity") {
      const id = rel.target_id;
      if (!entityStories.has(id)) entityStories.set(id, new Set());
      entityStories.get(id)!.add(rel.story_id);
    }
  });

  investigations?.forEach(inv => {
    const related = inv.related_entities as any;
    if (Array.isArray(related)) {
      related.forEach((id: string) => {
        if (!entityInvestigations.has(id)) entityInvestigations.set(id, new Set());
        entityInvestigations.get(id)!.add(inv.id);
      });
    }
  });

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

  // 3. Score and Classify
  entities?.forEach(entity => {
    const id = entity.id;
    const metadata = (entity.metadata as any) || {};
    
    // Canonical Audit Logic (Derived from existing patterns in index-store.ts)
    const isArchived = metadata.archived === true || metadata.hidden_duplicate === true;
    const isRedirect = !!(metadata.canonical_id || metadata.merged_into || metadata.converted_to || metadata.redirect_to);
    
    if (isArchived || isRedirect) {
      archivedOrRedirectedCount++;
    }

    // Historical Importance Bonus Calculation
    const importance = (metadata.importance?.toString().toUpperCase() as HistoricalVisualImportance) || "UNREVIEWED";
    let importanceBonus = 0;
    if (importance === "CORE") importanceBonus = 100;
    else if (importance === "MAJOR") importanceBonus = 60;
    else if (importance === "NORMAL") importanceBonus = 20;

    const breakdown: ScoreBreakdown = {
      mandatoryUnlock: (entityUnlocks.get(id)?.size || 0) * 50,
      coreCampaign: (entityCoreCampaigns.get(id)?.size || 0) * 40,
      supportingCampaign: (entityCampaigns.get(id)?.size || 0) * 15,
      storyPrimary: (entityStories.get(id)?.size || 0) * 25,
      investigationRelation: (entityInvestigations.get(id)?.size || 0) * 15,
      structuralAnchor: metadata.is_structural_anchor ? 20 : 0,
      crossSystemBonus: 0,
      gameplayGravity: 0,
      historicalImportanceBonus: importanceBonus
    };

    let systems = 0;
    if ((entityCampaigns.get(id)?.size || 0) > 0 || (entityCoreCampaigns.get(id)?.size || 0) > 0) systems++;
    if ((entityStories.get(id)?.size || 0) > 0) systems++;
    if ((entityInvestigations.get(id)?.size || 0) > 0) systems++;
    if ((entityUnlocks.get(id)?.size || 0) > 0) systems++;

    if (systems === 2) breakdown.crossSystemBonus = 10;
    else if (systems === 3) breakdown.crossSystemBonus = 25;
    else if (systems >= 4) breakdown.crossSystemBonus = 40;

    const gravity = breakdown.mandatoryUnlock + breakdown.coreCampaign + breakdown.supportingCampaign + 
                    breakdown.storyPrimary + breakdown.investigationRelation + breakdown.structuralAnchor + 
                    breakdown.crossSystemBonus;
    
    breakdown.gameplayGravity = gravity;
    const finalScore = gravity + importanceBonus;
    
    const hasImage = !!entity.image_path;
    let productionStatus: ProductionStatus = "READY_FOR_VISUAL_PRODUCTION";
    if (isArchived) productionStatus = "DUPLICATE_Archived";
    else if (isRedirect) productionStatus = "DUPLICATE_Redirected";
    else if (hasImage) productionStatus = "HAS_EXISTING_IMAGE";
    else if (finalScore === 0) productionStatus = "LOW_SIGNAL";
    else if (metadata.needs_review) productionStatus = "NEEDS_MANUAL_PRIORITY_REVIEW";

    const era = (metadata.era as string) || "Unknown";
    eraBias[era] = (eraBias[era] || 0) + 1;

    report.push({
      rankWithinType: 0,
      id: entity.id,
      slug: entity.slug,
      titleAr: entity.title,
      type: entity.entity_type as EntityType,
      worldSlug: (metadata.world_slug as string) || undefined,
      era: era === "Unknown" ? undefined : era,
      finalScore,
      gameplayGravity: gravity,
      historicalImportance: importance,
      scoreBreakdown: breakdown,
      campaignCount: (entityCampaigns.get(id)?.size || 0) + (entityCoreCampaigns.get(id)?.size || 0),
      storyCount: entityStories.get(id)?.size || 0,
      investigationCount: entityInvestigations.get(id)?.size || 0,
      unlockDependencyCount: entityUnlocks.get(id)?.size || 0,
      distinctSystemsCount: systems,
      hasImage,
      imagePath: entity.image_path || undefined,
      productionStatus,
      canonical: {
        isEligible: !isArchived && !isRedirect && entity.enabled !== false,
        status: entity.enabled ? 'enabled' : 'disabled',
        isRedirect,
        isArchived,
        canonicalId: (metadata.canonical_id || metadata.merged_into || metadata.redirect_to) as string
      }
    });
  });

  // 4. Ranking and Distribution
  const canonicalMap: Record<string, EntityType> = {
    'figure': 'Figure', 'person': 'Figure', 'character': 'Figure',
    'event': 'Event', 'battle': 'Battle', 'city': 'City',
    'landmark': 'Landmark', 'state': 'State', 'artifact': 'Artifact'
  };

  const types: EntityType[] = ["Figure", "Event", "City", "Battle", "Landmark", "State", "Artifact"];
  const distribution: Record<EntityType, number> = {
    Figure: 0, Event: 0, City: 0, Battle: 0, Landmark: 0, State: 0, Artifact: 0
  };
  const shortlists: Record<EntityType, EntityPriorityReport[]> = {
    Figure: [], Event: [], City: [], Battle: [], Landmark: [], State: [], Artifact: []
  };

  report.forEach(e => {
    const dbType = String(e.type).toLowerCase().trim();
    const canonical = canonicalMap[dbType] || (types.includes(e.type as any) ? e.type : null);
    if (canonical) {
      e.type = canonical as EntityType;
      if (e.canonical.isEligible) {
        distribution[e.type]++;
      }
    }
  });

  const eligibleUniverse = report.filter(e => e.canonical.isEligible);
  const eligibleMissingImage = eligibleUniverse.filter(e => !e.hasImage);

  types.forEach(type => {
    const typedEligible = eligibleUniverse.filter(e => e.type === type);
    const typedMissing = typedEligible.filter(e => !e.hasImage);
    
    typedEligible.sort((a, b) => b.finalScore - a.finalScore || a.titleAr.localeCompare(b.titleAr));
    typedEligible.forEach((e, i) => { e.rankWithinType = i + 1; });
    
    // For visual production planning, we need the top candidates MISSING images
    typedMissing.sort((a, b) => b.finalScore - a.finalScore || a.titleAr.localeCompare(b.titleAr));
    shortlists[type] = typedMissing.slice(0, 100);
    
    // Update distribution to reflect MISSING images for production planning
    distribution[type] = typedMissing.length;
  });

  const top50Overall = [...eligibleMissingImage]
    .sort((a, b) => b.finalScore - a.finalScore)
    .slice(0, 50);

  return {
    scoringLogic: "CPS Engine V2: Gameplay Gravity (Unlock/Campaign/Story/Investigation) + Historical Importance Bonus (Core: +100, Major: +60, Normal: +20).",
    eligibleUniverseCount: eligibleMissingImage.length,
    archivedOrRedirectedCount,
    distribution,
    eraBias,
    top50Overall,
    shortlists,
    anomalies: [],
    assessment: `Audit complete. Identified ${eligibleMissingImage.length} canonical entities missing images for production.`
  };
}

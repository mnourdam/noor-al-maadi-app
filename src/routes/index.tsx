import { createFileRoute } from '@tanstack/react-router';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { fetchPublishedCampaigns } from '@/lib/supabaseCampaigns';
import { buildProgressLookup } from '@/lib/campaignRecommendationService';
import { getCampaignProgress } from '@/lib/importedCampaignProgress';
import { useEffect, useState, useMemo } from 'react';
import { useProfile } from '@/lib/profile';
import { unionCompletedIds } from '@/lib/campaigns/completions';

export const Route = createFileRoute('/')({
  component: AuditTool,
});

function AuditTool() {
  const { profile } = useProfile();
  const userId = "ed51f39a-c187-4a2b-afdc-f7a060413fd3";
  
  const { data: campaigns = [], isSuccess: campaignsReady } = useQuery({
    queryKey: ["audit-campaigns"],
    queryFn: fetchPublishedCampaigns,
  });

  const [cloudMap, setCloudMap] = useState<Map<string, Set<string>>>(new Map());
  const [unionIds, setUnionIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [{ data: progressRows }, unionSet] = await Promise.all([
          supabase.from("user_campaign_progress").select("campaign_id,chapter_id,completed_at").eq("user_id", userId),
          unionCompletedIds(profile.campaignsCompleted)
        ]);

        if (cancelled) return;
        
        const nextMap = new Map<string, Set<string>>();
        for (const r of (progressRows ?? []) as any[]) {
          if (!r.campaign_id || !r.chapter_id || !r.completed_at) continue;
          let s = nextMap.get(r.campaign_id);
          if (!s) { s = new Set(); nextMap.set(r.campaign_id, s); }
          s.add(r.chapter_id);
        }
        setCloudMap(nextMap);
        setUnionIds(unionSet);
      } finally {
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId, profile.campaignsCompleted]);

  const audit = useMemo(() => {
    if (!campaignsReady || !campaigns.length || loading) return null;
    
    const yarmoukId = 'great-conquests-yarmouk-qadisiyyah';
    const madainId = 'madain-and-nihawand';
    
    const progressLookup = buildProgressLookup(cloudMap);
    const yarmoukLookup = progressLookup(yarmoukId);
    const localStore = getCampaignProgress(yarmoukId);
    
    const yarmoukRow = campaigns.find(c => c.id === yarmoukId);
    const madainRow = campaigns.find(c => c.id === madainId);

    // Progression Engine logic for Mada'in
    const yarmoukIsCompleted = unionIds.has(yarmoukId) || unionIds.has(yarmoukRow?.slug || '');
    
    return {
      report: "FORENSIC HYDRATION AUDIT",
      identity: { userId },
      yarmouk: {
        id: yarmoukId,
        inUnionCompletedIds: yarmoukIsCompleted,
        lookupCompletedFlag: yarmoukLookup.completedFlag,
        lookupCompletedChapters: Array.from(yarmoukLookup.completedChapterIds),
        localStoreCompleted: localStore.completed,
        localStoreChaptersCount: Object.keys(localStore.chapters || {}).length,
        cloudProgressCount: cloudMap.get(yarmoukId)?.size || 0
      },
      madain: {
        id: madainId,
        status: madainRow?.status,
        locked: !yarmoukIsCompleted,
        prerequisiteId: 'great-conquests-yarmouk-qadisiyyah (sequential next)',
      },
      env: {
        isCapacitor: !!(window as any).Capacitor,
        userAgent: navigator.userAgent
      }
    };
  }, [campaigns, campaignsReady, cloudMap, loading, unionIds, userId, profile.campaignsCompleted]);

  return (
    <div style={{ padding: '20px', backgroundColor: '#050505', color: '#00ff41', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
      <h1>Forensic Audit: Android vs Web</h1>
      <pre id="audit-projection-result">{JSON.stringify(audit, null, 2)}</pre>
    </div>
  );
}

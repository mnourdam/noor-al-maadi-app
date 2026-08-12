import { createFileRoute } from '@tanstack/react-router';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { fetchPublishedCampaigns } from '@/lib/supabaseCampaigns';
import { buildProgressLookup, pickCampaignRecommendation } from '@/lib/campaignRecommendationService';
import { getCampaignProgress } from '@/lib/importedCampaignProgress';
import { useEffect, useState, useMemo } from 'react';

export const Route = createFileRoute('/')({
  component: AuditTool,
});

function useCloudCampaignProgressLocal(userId: string) {
  const [map, setMap] = useState<Map<string, Set<string>>>(() => new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from("user_campaign_progress")
          .select("campaign_id,chapter_id,completed_at")
          .eq("user_id", userId);
        if (cancelled) return;
        const next = new Map<string, Set<string>>();
        for (const r of (data ?? []) as any[]) {
          if (!r.campaign_id || !r.chapter_id || !r.completed_at) continue;
          let s = next.get(r.campaign_id);
          if (!s) { s = new Set(); next.set(r.campaign_id, s); }
          s.add(r.chapter_id);
        }
        setMap(next);
      } finally {
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  return { map, loading };
}

function AuditTool() {
  const userId = "ed51f39a-c187-4a2b-afdc-f7a060413fd3";
  const { data: campaigns = [], isSuccess: campaignsReady } = useQuery({
    queryKey: ["audit-campaigns"],
    queryFn: fetchPublishedCampaigns,
  });

  const { map: cloudMap, loading: cloudLoading } = useCloudCampaignProgressLocal(userId);
  
  const audit = useMemo(() => {
    if (!campaignsReady || !campaigns.length || cloudLoading) return null;
    
    const yarmoukId = 'great-conquests-yarmouk-qadisiyyah';
    const madainId = 'madain-and-nihawand';
    
    const progressLookup = buildProgressLookup(cloudMap);
    const yarmoukProgress = progressLookup(yarmoukId);
    const localProgress = getCampaignProgress(yarmoukId);
    
    const rec = pickCampaignRecommendation({
      campaigns,
      getProgress: progressLookup
    });

    const yarmoukRow = campaigns.find(c => c.id === yarmoukId);
    const madainRow = campaigns.find(c => c.id === madainId);

    return {
      userId,
      yarmoukProgress: {
        completedFlag: yarmoukProgress.completedFlag,
        completedChapters: Array.from(yarmoukProgress.completedChapterIds),
        hasAnyActivity: yarmoukProgress.hasAnyActivity,
        localStore: {
          completed: localProgress.completed,
          chaptersCount: Object.keys(localProgress.chapters || {}).length
        }
      },
      recommendation: rec ? {
        type: rec.type,
        priority: rec.priority,
        campaignId: rec.campaign.id,
        chapterId: rec.chapter?.id
      } : null,
      madain: madainRow ? {
        id: madainRow.id,
        status: madainRow.status,
        // @ts-ignore
        prerequisiteId: madainRow.unlock?.campaignId || madainRow.prerequisite_campaign_id
      } : 'NOT_FOUND',
      yarmoukRow: yarmoukRow ? {
        id: yarmoukRow.id,
        slug: yarmoukRow.slug
      } : 'NOT_FOUND'
    };
  }, [campaigns, campaignsReady, cloudMap, cloudLoading]);

  return (
    <div style={{ padding: '20px', backgroundColor: '#111', color: '#0f0', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
      <h1>Forensic Projection Audit v4</h1>
      <pre id="audit-projection-result">{JSON.stringify(audit, null, 2)}</pre>
    </div>
  );
}

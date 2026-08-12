import { createFileRoute } from '@tanstack/react-router';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { fetchPublishedCampaigns } from '@/lib/supabaseCampaigns';
import { useCampaignLockMap, useProgressionState } from '@/lib/campaigns/useCampaignProgression';
import { groupFeedIntoSections, buildFeed, dividersFromRows } from '@/lib/campaignDividers';
import { useEffect, useState, useMemo } from 'react';

export const Route = createFileRoute('/')({
  component: FinalAuditTool,
});

function FinalAuditTool() {
  const userId = "ed51f39a-c187-4a2b-afdc-f7a060413fd3";
  const { data: campaigns = [], isSuccess: campaignsReady } = useQuery({
    queryKey: ["audit-campaigns-final"],
    queryFn: fetchPublishedCampaigns,
  });

  const { data: rawDividers } = useQuery({
    queryKey: ["audit-dividers"],
    queryFn: async () => {
      const { data } = await supabase.from("admin_campaigns").select("*").like("id", "div_%");
      return data || [];
    }
  });

  const progression = useProgressionState();
  
  const sections = useMemo(() => {
    if (!campaignsReady || !campaigns.length) return [];
    const feed = buildFeed(campaigns as any, dividersFromRows(rawDividers as any));
    return groupFeedIntoSections(feed);
  }, [campaigns, campaignsReady, rawDividers]);

  const lockMap = useCampaignLockMap(sections as any);

  const audit = useMemo(() => {
    if (!campaignsReady || !progression.hydrated) return { status: "hydrating", progression };
    
    const yarmoukId = 'great-conquests-yarmouk-qadisiyyah';
    const madainId = 'madain-and-nihawand';
    
    const yarmoukLock = lockMap.get(yarmoukId);
    const madainLock = lockMap.get(madainId);
    const yarmoukCompleted = progression.completedCampaignIds.has(yarmoukId);

    return {
      report: "FINAL PROGRESSION AUDIT",
      identity: { userId },
      progression: {
        hydrated: progression.hydrated,
        completedCount: progression.completedCampaignIds.size,
        yarmoukCompleted,
      },
      yarmouk: {
        id: yarmoukId,
        locked: yarmoukLock?.locked,
        reason: yarmoukLock?.reason
      },
      madain: {
        id: madainId,
        locked: madainLock?.locked,
        reason: madainLock?.reason,
        prerequisiteSatisfied: yarmoukCompleted
      },
      integrity: {
        campaignsCount: campaigns.length,
        lockMapSize: lockMap.size
      }
    };
  }, [campaignsReady, progression, lockMap, campaigns.length]);

  return (
    <div style={{ padding: '20px', backgroundColor: '#050505', color: '#00ff41', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
      <h1>Final Progression Audit: ed51f39a-c187-4a2b-afdc-f7a060413fd3</h1>
      <pre id="audit-result">{JSON.stringify(audit, null, 2)}</pre>
      <div style={{ marginTop: '20px', border: '1px solid #00ff41', padding: '10px' }}>
        <h3>Hydration Status: {progression.hydrated ? '✅ COMPLETE' : '⏳ PENDING'}</h3>
        <h3>Yarmouk: {progression.completedCampaignIds.has('great-conquests-yarmouk-qadisiyyah') ? '✅ COMPLETED' : '❌ NOT COMPLETED'}</h3>
        <h3>Mada'in Lock: {audit.madain?.locked ? '🔒 LOCKED' : '🔓 UNLOCKED'}</h3>
      </div>
    </div>
  );
}

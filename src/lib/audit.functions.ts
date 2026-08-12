import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getAccountForensics = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ userId: z.string().optional(), email: z.string().optional() }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const audit: any = { timestamp: new Date().toISOString() };

    try {
      const db = supabaseAdmin as any;
      let userId = data.userId;

      if (!userId && data.email) {
        const { data: users, error: userError } = await db.auth.admin.listUsers();
        if (userError) throw new Error("User list error: " + userError.message);
        const user = (users?.users || []).find((u: any) => u.email === data.email);
        if (user) userId = user.id;
      }

      if (!userId) {
        return { error: "User identity required (id or email)" };
      }
      
      audit.userId = userId;

      // 1. Fetch Campaign Definitions
      const { data: allCampaigns } = await db
        .from('campaigns_public')
        .select('*');

      const campaignList = (allCampaigns || []) as any[];
      const yarmouk = campaignList.find(c => c.slug === 'great-conquests-yarmouk-qadisiyyah');
      const madain = campaignList.find(c => c.slug === 'great-conquests-madain-nihawand');
      audit.campaignDefinitions = { yarmouk, madain };

      // 2. Inspect YARMOUK Data
      if (yarmouk) {
        const [completions, profile, progressRows, chapters, chapterProgress] = await Promise.all([
          db.from('user_campaign_completions').select('*').eq('user_id', userId).eq('campaign_id', yarmouk.id),
          db.from('profiles').select('*').eq('id', userId).maybeSingle(),
          db.from('user_campaign_progress').select('*').eq('user_id', userId).eq('campaign_id', yarmouk.id),
          db.from('chapters').select('*').eq('campaign_id', yarmouk.id).order('order_index', { ascending: true }),
          db.from('user_chapter_progress').select('*').eq('user_id', userId)
        ]);

        const yarmoukChapters = (chapters.data || []) as any[];
        const yarmoukChapterIds = new Set(yarmoukChapters.map(c => c.id));
        const relevantChapterProgress = (chapterProgress.data || []).filter((cp: any) => yarmoukChapterIds.has(cp.chapter_id));
        
        audit.yarmoukAudit = {
          campaignId: yarmouk.id,
          campaignSlug: yarmouk.slug,
          totalChapters: yarmoukChapters.length,
          completedChaptersCount: relevantChapterProgress.filter((cp: any) => cp.completed).length,
          userCampaignCompletions: completions.data, // server ledger
          userCampaignProgress: progressRows.data, // legacy/progress record
          profileRecord: profile.data,
          chapterStatus: yarmoukChapters.map(ch => ({
            id: ch.id,
            slug: ch.slug,
            completed: !!relevantChapterProgress.find((cp: any) => cp.chapter_id === ch.id && cp.completed)
          }))
        };
      }

      // 3. Inspect MADA'IN Data
      if (madain) {
        audit.madainAudit = {
          campaignId: madain.id,
          campaignSlug: madain.slug,
          unlockRule: madain.unlock_rule,
          prerequisiteCampaignId: madain.prerequisite_campaign_id
        };
      }

      return audit;
    } catch (e: any) {
      console.error("Audit error:", e);
      return { error: e.message };
    }
  });

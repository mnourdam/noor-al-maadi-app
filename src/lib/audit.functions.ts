import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getAccountForensics = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ email: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = data.email;
    const audit: any = { timestamp: new Date().toISOString(), targetEmail: email };

    try {
      const db = supabaseAdmin as any;
      // 1. Resolve User ID
      const { data: users, error: userError } = await db.auth.admin.listUsers();
      if (userError) throw new Error("User list error: " + userError.message);
      
      const user = (users?.users || []).find((u: any) => u.email === email);
      if (!user) {
        return { error: "User not found: " + email };
      }
      
      const userId = user.id;
      audit.userId = userId;

      // 2. Fetch Campaign Definitions
      const { data: campaigns } = await db
        .from('campaigns_public')
        .select('*')
        .in('slug', ['great-conquests-yarmouk-qadisiyyah', 'great-conquests-madain-nihawand']);

      const campaignList = (campaigns || []) as any[];
      const yarmouk = campaignList.find(c => c.slug === 'great-conquests-yarmouk-qadisiyyah');
      const madain = campaignList.find(c => c.slug === 'great-conquests-madain-nihawand');
      audit.campaigns = { yarmouk, madain };

      if (yarmouk) {
        // 3. Inspect Completion Data
        const [completions, profile, legacy, chapters, userChapters] = await Promise.all([
          db.from('user_campaign_completions').select('*').eq('user_id', userId).eq('campaign_id', yarmouk.id),
          db.from('profiles').select('*').eq('id', userId).maybeSingle(),
          db.from('user_campaign_progress').select('*').eq('user_id', userId).eq('campaign_id', yarmouk.id),
          db.from('chapters').select('*').eq('campaign_id', yarmouk.id).order('order_index', { ascending: true }),
          db.from('user_chapter_progress').select('*').eq('user_id', userId)
        ]);

        const chapterList = (chapters.data || []) as any[];
        const yarmoukChapterIds = new Set(chapterList.map(c => c.id) || []);
        const userChapterList = (userChapters.data || []) as any[];
        const yarmoukUserChapters = userChapterList.filter((uc: any) => yarmoukChapterIds.has(uc.chapter_id)) || [];
        const profileRow = (profile.data || {}) as any;

        audit.yarmoukAudit = {
          serverCompletions: completions.data,
          profileData: {
            campaigns_completed_count: profileRow.campaigns_completed,
            campaigns_completed_list: profileRow.campaignsCompleted,
            xp: profileRow.xp,
            dinars: profileRow.dinars
          },
          legacyProgress: legacy.data,
          chaptersCount: chapterList.length,
          completedChaptersCount: yarmoukUserChapters.filter((uc: any) => uc.completed).length,
          chapterDetail: chapterList.map(ch => ({
            title: ch.title,
            completed: yarmoukUserChapters.find((uc: any) => uc.chapter_id === ch.id)?.completed || false
          }))
        };
      }

      return audit;
    } catch (e: any) {
      return { error: e.message };
    }
  });

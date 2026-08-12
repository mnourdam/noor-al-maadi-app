
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getAccountForensics = createServerFn({ method: "POST" })
  .input(z.object({ email: z.string() }))
  .handler(async ({ input }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = input.email;
    const audit: any = { timestamp: new Date().toISOString(), targetEmail: email };

    try {
      // 1. Resolve User ID
      const { data: users, error: userError } = await supabaseAdmin.auth.admin.listUsers();
      const user = users?.users.find(u => u.email === email);
      
      if (!user) {
        return { error: "User not found: " + email };
      }
      
      const userId = user.id;
      audit.userId = userId;

      // 2. Fetch Campaign Definitions
      const { data: campaigns } = await supabaseAdmin
        .from('campaigns')
        .select('*')
        .in('slug', ['great-conquests-yarmouk-qadisiyyah', 'great-conquests-madain-nihawand']);

      const yarmouk = campaigns?.find(c => c.slug === 'great-conquests-yarmouk-qadisiyyah');
      const madain = campaigns?.find(c => c.slug === 'great-conquests-madain-nihawand');
      audit.campaigns = { yarmouk, madain };

      if (yarmouk) {
        // 3. Inspect Completion Data
        const [completions, profile, legacy, chapters, userChapters] = await Promise.all([
          supabaseAdmin.from('user_campaign_completions').select('*').eq('user_id', userId).eq('campaign_id', yarmouk.id),
          supabaseAdmin.from('profiles').select('*').eq('id', userId).maybeSingle(),
          supabaseAdmin.from('user_campaign_progress').select('*').eq('user_id', userId).eq('campaign_id', yarmouk.id),
          supabaseAdmin.from('chapters').select('*').eq('campaign_id', yarmouk.id).order('order_index', { ascending: true }),
          supabaseAdmin.from('user_chapter_progress').select('*').eq('user_id', userId)
        ]);

        const yarmoukChapterIds = new Set(chapters.data?.map(c => c.id) || []);
        const yarmoukUserChapters = userChapters.data?.filter(uc => yarmoukChapterIds.has(uc.chapter_id)) || [];

        audit.yarmoukAudit = {
          serverCompletions: completions.data,
          profileData: {
            campaignsCompleted: profile.data?.campaignsCompleted,
            points: profile.data?.points
          },
          legacyProgress: legacy.data,
          chaptersCount: chapters.data?.length,
          completedChaptersCount: yarmoukUserChapters.filter(uc => uc.completed).length,
          chapterDetail: chapters.data?.map(ch => ({
            title: ch.title,
            completed: yarmoukUserChapters.find(uc => uc.chapter_id === ch.id)?.completed || false
          }))
        };
      }

      return audit;
    } catch (e: any) {
      return { error: e.message };
    }
  });

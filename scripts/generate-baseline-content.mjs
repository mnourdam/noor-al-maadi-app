import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Use environment variables for Supabase connection
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.sb_publishable_weJU0PgNA9b3rdVc2HaHTg_pjvSRzFY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function generateBaseline() {
  console.log('Generating Baseline Content...');

  // 1. Fetch Published Games
  const { data: games, error: gamesError } = await supabase
    .from('games')
    .select('*')
    .eq('status', 'published')
    .order('id', { ascending: true });

  if (gamesError) {
    console.error('Error fetching games:', gamesError);
    process.exit(1);
  }
  console.log(`Fetched ${games.length} published games.`);

  // 2. Fetch Published Stories (Excluding Campaign Intros)
  // We use the category filter as discussed in audit ('event' usually covers intros, but we'll check metadata too)
  const { data: stories, error: storiesError } = await supabase
    .from('stories')
    .select('*')
    .eq('status', 'published')
    .order('id', { ascending: true });

  if (storiesError) {
    console.error('Error fetching stories:', storiesError);
    process.exit(1);
  }

  // Filter out campaign intros based on metadata kind
  const libraryStories = stories.filter(s => {
    const isIntro = s.metadata?.kind === 'campaign_intro' || s.category === 'event';
    return !isIntro;
  });
  console.log(`Fetched ${stories.length} stories, keeping ${libraryStories.length} library stories.`);

  // 3. Fetch Scenes for these stories
  const storyIds = libraryStories.map(s => s.id);
  const { data: scenes, error: scenesError } = await supabase
    .from('story_scenes')
    .select('*')
    .in('story_id', storyIds)
    .order('story_id', { ascending: true })
    .order('scene_index', { ascending: true });

  if (scenesError) {
    console.error('Error fetching scenes:', scenesError);
    process.exit(1);
  }
  console.log(`Fetched ${scenes.length} scenes for library stories.`);

  // 4. Fetch Verified Media for these stories
  const { data: media, error: mediaError } = await supabase
    .from('story_media')
    .select('*')
    .in('story_id', storyIds)
    .eq('verified', true);

  if (mediaError) {
    console.error('Error fetching media:', mediaError);
    process.exit(1);
  }
  console.log(`Fetched ${media.length} verified media records.`);

  const baseline = {
    version: Date.now(),
    generated_at: new Date().toISOString(),
    collections: {
      games,
      stories: libraryStories,
      story_scenes: scenes,
      story_media: media
    }
  };

  const outputPath = path.join(process.cwd(), 'public', 'baseline-content.json');
  fs.writeFileSync(outputPath, JSON.stringify(baseline, null, 2));
  
  const stats = fs.statSync(outputPath);
  console.log(`Baseline content generated at: ${outputPath}`);
  console.log(`File size: ${(stats.size / 1024).toFixed(2)} KB`);
}

generateBaseline().catch(err => {
  console.error(err);
  process.exit(1);
});

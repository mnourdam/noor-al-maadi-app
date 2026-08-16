import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

async function generateBaseline() {
  console.log('Generating Baseline Content via psql...');

  // 1. Fetch Published Games
  const gamesJson = execSync(`psql -t -c "SELECT json_agg(t) FROM (SELECT * FROM public.games WHERE status = 'published' ORDER BY id ASC) t;"`).toString().trim();
  const games = JSON.parse(gamesJson || '[]');
  console.log(`Fetched ${games.length} published games.`);

  // 2. Fetch Published Stories (Excluding Campaign Intros)
  const storiesJson = execSync(`psql -t -c "SELECT json_agg(t) FROM (SELECT * FROM public.stories WHERE status = 'published' ORDER BY id ASC) t;"`).toString().trim();
  const stories = JSON.parse(storiesJson || '[]');
  
  const libraryStories = stories.filter(s => {
    const isIntro = s.metadata?.kind === 'campaign_intro' || s.category === 'event';
    return !isIntro;
  });
  console.log(`Fetched ${stories.length} stories, keeping ${libraryStories.length} library stories.`);

  // 3. Fetch Scenes for these stories
  const storyIds = libraryStories.map(s => s.id);
  const storyIdsList = storyIds.map(id => `'${id}'`).join(',');
  const scenesJson = execSync(`psql -t -c "SELECT json_agg(t) FROM (SELECT * FROM public.story_scenes WHERE story_id IN (${storyIdsList}) ORDER BY story_id ASC, scene_index ASC) t;"`).toString().trim();
  const scenes = JSON.parse(scenesJson || '[]');
  console.log(`Fetched ${scenes.length} scenes for library stories.`);

  // 4. Fetch Verified Media for these stories
  const mediaJson = execSync(`psql -t -c "SELECT json_agg(t) FROM (SELECT * FROM public.story_media WHERE story_id IN (${storyIdsList}) AND verified = true) t;"`).toString().trim();
  const media = JSON.parse(mediaJson || '[]');
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

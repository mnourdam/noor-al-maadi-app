import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

async function streamPsqlToJson(query) {
  return new Promise((resolve, reject) => {
    const psql = spawn('psql', ['-t', '-c', query]);
    let data = '';
    psql.stdout.on('data', (chunk) => {
      data += chunk;
    });
    psql.stderr.on('data', (chunk) => {
      console.error('psql error:', chunk.toString());
    });
    psql.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`psql process exited with code ${code}`));
        return;
      }
      try {
        const trimmed = data.trim();
        resolve(JSON.parse(trimmed || '[]'));
      } catch (e) {
        console.error('Failed to parse JSON from psql output. Data length:', data.length);
        reject(e);
      }
    });
  });
}

async function generateBaseline() {
  console.log('Generating Baseline Content via streaming psql...');

  // 1. Fetch Published Games
  const games = await streamPsqlToJson("SELECT json_agg(t) FROM (SELECT * FROM public.games WHERE status = 'published' ORDER BY id ASC) t;");
  console.log(`Fetched ${games.length} published games.`);

  // 2. Fetch Published Stories (Excluding Campaign Intros)
  const stories = await streamPsqlToJson("SELECT json_agg(t) FROM (SELECT * FROM public.stories WHERE status = 'published' ORDER BY id ASC) t;");
  
  const libraryStories = stories.filter(s => {
    const isIntro = s.metadata?.kind === 'campaign_intro' || s.category === 'event';
    return !isIntro;
  });
  console.log(`Fetched ${stories.length} stories, keeping ${libraryStories.length} library stories.`);

  // 3. Fetch Scenes for these stories
  const storyIds = libraryStories.map(s => s.id);
  const storyIdsList = storyIds.map(id => `'${id}'`).join(',');
  const scenes = await streamPsqlToJson(`SELECT json_agg(t) FROM (SELECT * FROM public.story_scenes WHERE story_id IN (${storyIdsList}) ORDER BY story_id ASC, scene_index ASC) t;`);
  console.log(`Fetched ${scenes.length} scenes for library stories.`);

  // 4. Fetch Verified Media for these stories
  const media = await streamPsqlToJson(`SELECT json_agg(t) FROM (SELECT * FROM public.story_media WHERE story_id IN (${storyIdsList}) AND verified = true) t;`);
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

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

async function streamPsqlToFile(query, tempFile) {
  return new Promise((resolve, reject) => {
    // -A removes alignment, -t removes headers, -q is quiet
    const psql = spawn('psql', ['-Atq', '-c', query]);
    const writeStream = fs.createWriteStream(tempFile);
    
    psql.stdout.pipe(writeStream);
    
    psql.stderr.on('data', (chunk) => {
      console.error('psql error:', chunk.toString());
    });
    
    psql.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`psql process exited with code ${code}`));
        return;
      }
      resolve();
    });
  });
}

async function generateBaseline() {
  console.log('Generating Baseline Content via safe file streaming...');

  const tempDir = path.join(process.cwd(), 'tmp');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

  const queries = {
    games: "SELECT json_agg(t) FROM (SELECT * FROM public.games WHERE status = 'published' ORDER BY id ASC) t;",
    stories: "SELECT json_agg(t) FROM (SELECT * FROM public.stories WHERE status = 'published' ORDER BY id ASC) t;",
    collections: "SELECT json_agg(t) FROM (SELECT * FROM public.story_collections ORDER BY display_order ASC) t;",
  };

  await streamPsqlToFile(queries.games, 'tmp/games.json');
  await streamPsqlToFile(queries.stories, 'tmp/stories.json');
  await streamPsqlToFile(queries.collections, 'tmp/collections.json');
  
  // Also fetch campaign intros to know what to exclude
  const campaignQuery = "SELECT json_agg(intro_id) FROM (SELECT data->>'intro_story_id' as intro_id FROM public.admin_campaigns WHERE data->>'intro_story_id' IS NOT NULL) t;";
  await streamPsqlToFile(campaignQuery, 'tmp/intros.json');

  const games = JSON.parse(fs.readFileSync('tmp/games.json', 'utf8') || '[]');
  const stories = JSON.parse(fs.readFileSync('tmp/stories.json', 'utf8') || '[]');
  const storyCollections = JSON.parse(fs.readFileSync('tmp/collections.json', 'utf8') || '[]');
  const introIdsFromCampaigns = JSON.parse(fs.readFileSync('tmp/intros.json', 'utf8') || '[]');
  const introSet = new Set(introIdsFromCampaigns.filter(id => !!id));

  const libraryStories = stories.filter(s => {
    const kind = s.metadata?.kind;
    const tags = Array.isArray(s.tags) ? s.tags : [];
    const isIntroMarker = kind === 'campaign_intro' || tags.includes('campaign-intro');
    const isLinkedIntro = introSet.has(s.id);
    return !(isIntroMarker || isLinkedIntro);
  });
  console.log(`Fetched ${stories.length} stories, identified ${stories.length - libraryStories.length} intros, keeping ${libraryStories.length} library stories.`);

  const storyIds = libraryStories.map(s => s.id);
  const storyIdsList = storyIds.map(id => `'${id}'`).join(',');

  const queries2 = {
    scenes: `SELECT json_agg(t) FROM (SELECT * FROM public.story_scenes WHERE story_id IN (${storyIdsList}) ORDER BY story_id ASC, scene_index ASC) t;`,
    media: `SELECT json_agg(t) FROM (SELECT * FROM public.story_media WHERE story_id IN (${storyIdsList}) AND verified = true) t;`
  };

  await streamPsqlToFile(queries2.scenes, 'tmp/scenes.json');
  await streamPsqlToFile(queries2.media, 'tmp/media.json');

  const scenes = JSON.parse(fs.readFileSync('tmp/scenes.json', 'utf8') || '[]');
  const media = JSON.parse(fs.readFileSync('tmp/media.json', 'utf8') || '[]');

  console.log(`Fetched ${games.length} games, ${libraryStories.length} library stories, ${storyCollections.length} collections, ${scenes.length} scenes, ${media.length} media.`);

  const baseline = {
    version: Date.now(),
    generated_at: new Date().toISOString(),
    collections: {
      games,
      stories: libraryStories,
      story_scenes: scenes,
      story_media: media,
      story_collections: storyCollections
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
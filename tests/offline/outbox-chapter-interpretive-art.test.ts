import { expect, it, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import sharp from 'sharp';
import { INTERPRETIVE_CHAPTER_IMAGES, chapterImageForDisplay } from '@/lib/campaign-art/interpretive-chapters';
import { localChapterImagePathForUrl } from '@/lib/campaign-art/offline-pack';
import { OFFLINE_CHAPTER_IMAGE_PATHS } from '@/lib/campaign-art/chapter-pack.generated';
import { resolveImageUrl } from '@/lib/image-cache';
const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
afterEach(()=>vi.unstubAllGlobals());
it('binds exactly three reviewed composite IDs to manifest/full decoded bytes and source chapters',async()=>{
 const manifest=JSON.parse(readFileSync('public/campaign-key-art/interpretive-chapters.manifest.json','utf8'));
 const snapshot=JSON.parse(gunzipSync(readFileSync('public/offline-snapshot.json.gz')).toString());
 expect(INTERPRETIVE_CHAPTER_IMAGES.map(x=>[x.campaignId,x.chapterId])).toEqual([['cordoba-golden-age','ch5'],['ottoman-golden-age','ch10'],['rise-of-the-ottoman-state','ch2']]);
 expect(manifest.records).toHaveLength(3);expect(new Set(INTERPRETIVE_CHAPTER_IMAGES.map(item=>item.path)).size).toBe(3);let total=0;
 for(const [index,item] of INTERPRETIVE_CHAPTER_IMAGES.entries()){
  expect(OFFLINE_CHAPTER_IMAGE_PATHS).not.toContain(item.path);
  const row=manifest.records[index],bytes=readFileSync(`public/campaign-key-art/${item.path}`);total+=bytes.length;
  expect([row.campaign_id,row.chapter_id,row.path]).toEqual([item.campaignId,item.chapterId,item.path]);expect(bytes.length).toBe(row.bytes);expect(sha(bytes)).toBe(row.sha256);expect(bytes.length).toBeLessThan(320*1024);
  const decoded=await sharp(bytes).raw().toBuffer({resolveWithObject:true});expect([decoded.info.width,decoded.info.height]).toEqual([1600,900]);
  const campaign=snapshot.collections.admin_campaigns.find((r:any)=>r.id===item.campaignId).data;expect(campaign.id).toBe(item.campaignId);
  const chapter=campaign.chapters.find((c:any)=>c.id===item.chapterId);expect(sha(Buffer.from(JSON.stringify(chapter)))).toBe(row.source_chapter_sha256);expect(chapter.title).toBe(row.chapter_title);expect(chapter.imageUrl==null).toBe(true);
 }
 expect(total).toBe(682680);
});
it('uses only null/undefined fallbacks, preserving all authored strings and unknown IDs',()=>{
 for(const item of INTERPRETIVE_CHAPTER_IMAGES){
  for(const absent of [null,undefined])expect(chapterImageForDisplay(item.campaignId,item.chapterId,absent)).toBe(`/campaign-key-art/${item.path}`);
  for(const authored of ['', ' ', 'https://example.test/authored.webp'])expect(chapterImageForDisplay(item.campaignId,item.chapterId,authored)).toBe(authored);
  expect(chapterImageForDisplay('unknown',item.chapterId,null)).toBeNull();expect(chapterImageForDisplay(item.campaignId,'unknown',undefined)).toBeUndefined();
 }
});
it('resolves the exact local inventory offline without network/cache and rejects path lookalikes',async()=>{
 const fetch=vi.fn(),open=vi.fn();vi.stubGlobal('navigator',{onLine:false});vi.stubGlobal('fetch',fetch);vi.stubGlobal('caches',{open});
 for(const item of INTERPRETIVE_CHAPTER_IMAGES){const local=`/campaign-key-art/${item.path}`;expect(await resolveImageUrl(local)).toBe(local);
  for(const bad of [local+'?x=1',local+'/extra',local.replace('/chapters/','/chapters/../chapters/'),local.replace('interpretive-v1','unknown')])expect(localChapterImagePathForUrl(bad)).toBeNull();
 }
 expect(fetch).not.toHaveBeenCalled();expect(open).not.toHaveBeenCalled();
});

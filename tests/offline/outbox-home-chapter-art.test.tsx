import React from 'react';
import { render, cleanup, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { INTERPRETIVE_CHAPTER_IMAGES } from '@/lib/campaign-art/interpretive-chapters';
const state = vi.hoisted(() => ({ stash: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@tanstack/react-router', () => ({ createFileRoute: () => (x: unknown) => x, Link: ({children, params}: any) => <a href={`/campaigns/imported/${params.id}`}>{children}</a> }));
vi.mock('@/lib/navigation', () => ({ useStashCurrentAsOrigin: () => state.stash }));
vi.mock('@/lib/campaignArtwork', () => ({ useCampaignArtworkUrl: () => ({url:'/campaign-cover.webp'}), sanitizedCoverImage: () => null }));
import { ContinueJourneyCard } from '@/routes/index';
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); state.stash.mockClear(); });

for (const row of INTERPRETIVE_CHAPTER_IMAGES) {
  it(`mounted Home card resolves ${row.campaignId}/${row.chapterId} without progress or navigation writes`, async () => {
    await check(row.campaignId, row.chapterId, null, `/campaign-key-art/${row.path}`);
  });
}
it('keeps unknown campaign/chapter and absent chapter on campaign art', async () => {
  await check('unknown','ch5',null,'/campaign-cover.webp'); cleanup();
  await check('cordoba-golden-age','unknown',null,'/campaign-cover.webp'); cleanup();
  await check('cordoba-golden-age',null,null,'/campaign-cover.webp');
});
it('keeps authored URL and intentional empty/whitespace campaign fallback', async () => {
  await check('cordoba-golden-age','ch5',' /authored.webp ','/authored.webp'); cleanup();
  await check('cordoba-golden-age','ch5','','/campaign-cover.webp'); cleanup();
  await check('cordoba-golden-age','ch5','   ','/campaign-cover.webp');
});
async function check(cid: string, chid: string|null, imageUrl: string|null, expected: string) {
  const chapter = {id:chid, title:'فصل اختبار', imageUrl, order:2, activities:[]};
  const sel: any = {campaign:{id:cid,title:'حملة اختبار',chapters:[chapter, {id:'other'}]}, nextChapter:chid ? chapter:null, completedChapters:1, hasStarted:true,isComplete:false};
  const before=JSON.stringify(sel); const storage=JSON.stringify({...localStorage});
  const fetch=vi.fn(); vi.stubGlobal('fetch',fetch);
  const open=vi.fn(); vi.stubGlobal('caches',{open});
  const view=render(<ContinueJourneyCard sel={sel}/>);
  await waitFor(() => expect(view.container.querySelector('img')?.getAttribute('src')).toBe(expected));
  expect(view.getByText('1/2')).toBeTruthy();
  expect(view.container.querySelector('a')?.getAttribute('href')).toBe(`/campaigns/imported/${cid}`);
  expect(JSON.stringify(sel)).toBe(before); expect(JSON.stringify({...localStorage})).toBe(storage);
  expect(state.stash).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled(); if (expected.startsWith('/campaign-key-art/')) expect(open).not.toHaveBeenCalled();
}

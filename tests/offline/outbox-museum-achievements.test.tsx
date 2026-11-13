import React from 'react';
import { render, cleanup, waitFor, act } from '@testing-library/react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const state=vi.hoisted(()=>({uid:'alice',query:vi.fn(),session:vi.fn(),claim:vi.fn(),repair:vi.fn()}));
vi.mock('@/lib/profile',()=>({useProfile:()=>({hydrated:true,userId:state.uid,profile:{points:0,dinars:0,streak:0,longestStreak:0,titlesEarned:[],campaignsCompleted:[],loggedIn:true}})}));
vi.mock('@/lib/investigations/progress',()=>({useCanonicalInvestigationProgress:()=>({completedIds:[],count:0})}));
vi.mock('@/lib/campaigns/completions',()=>({localCompletedIds:()=>[],fetchServerCompletedIds:async()=>({userId:state.uid,ids:[]})}));
vi.mock('@/lib/diag-trace',()=>({recordTrace:vi.fn()}));
vi.mock('@/lib/achievements/v2/claim.functions',()=>({fetchUserAchievements:async()=>[],claimAchievements:state.claim,repairHistoricalAchievements:state.repair}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getUser: async () => ({ data: { user: { id: state.uid } } }),
      getSession: state.session,
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    from: (table: string) => ({ select: (columns: string) => ({ eq: (field: string, uid: string) => ({ abortSignal: (signal: AbortSignal) => state.query({ table, columns, field, uid, signal }) }) }) }),
  },
}));

import { AchievementEngineBoot,useAchievementViews } from '@/lib/achievements/v2/driver';
import { setActiveOwnerInternal } from '@/lib/identity/owner';
import { getSnapshot,getPersisted } from '@/lib/achievements/v2/engine';
import { refreshMuseumPresentation, projectMuseumViews } from '@/lib/achievements/v2/museum-presentation';
import { buildViews } from '@/lib/achievements/v2/viewModel';
import { registry } from '@/lib/achievements/v2/index';
import { getEvaluation } from '@/lib/achievements/v2/engine';
function MuseumView(){const views=useAchievementViews();const v=views.find(x=>x.id==='ach_artifact_10');return <output data-testid="museum">{v?.state}:{v?.progress}</output>}
function rows(n:number){return Array.from({length:n},(_,i)=>({item_id:`artifact-${i}`,item_type:'artifact'}));}
function result(n:number){return {data:rows(n),error:null};}
function deferred<T>(){let resolve!:(v:T)=>void;const promise=new Promise<T>(r=>resolve=r);return {promise,resolve};}
let sequence=0;
beforeEach(()=>{state.uid=`case-${++sequence}`;setActiveOwnerInternal(`user:${state.uid}`);state.query.mockReset().mockResolvedValue(result(10));state.session.mockReset().mockImplementation(async()=>({data:{session:{user:{id:state.uid}}}}));state.claim.mockReset().mockResolvedValue({inserted:[],alreadyClaimed:[]});state.repair.mockReset().mockImplementation(async({data})=>({repaired:data.ids,existing:[],rejected:[]}));});
afterEach(()=>{cleanup();vi.useRealTimers()});
it('confirmed ten owned museum items reach the actual shared Profile view without any reward replay',async()=>{const view=render(<><AchievementEngineBoot/><MuseumView/></>);await waitFor(()=>expect(view.getByTestId('museum').textContent).toBe('unlocked:1'));expect(state.claim).not.toHaveBeenCalled();expect(state.repair.mock.calls.flatMap(([x])=>x.data.ids)).not.toContain('ach_artifact_10');expect(getSnapshot().museum.totalOwned).toBe(0);expect(getPersisted().has('ach_artifact_10')).toBe(false);});
it('preserves existing thresholds, deduplicates confirmed rows and ignores malformed entries',async()=>{state.query.mockResolvedValue({data:[...rows(9),...rows(9),null,{item_id:'',item_type:'artifact'}],error:null});const view=render(<MuseumView/>);await waitFor(()=>expect(view.getByTestId('museum').textContent).toBe('locked-visible:0.9'));});
it('empty confirmed collection does not infer ownership from profile or pending grants',async()=>{state.query.mockResolvedValue(result(0));const view=render(<MuseumView/>);await act(async()=>{await refreshMuseumPresentation()});expect(view.getByTestId('museum').textContent).toBe('locked-visible:0');expect(state.claim).not.toHaveBeenCalled();});
it.each([false,true])('rejects delayed old-account rows, ABA=%s',async(aba)=>{const pending=deferred<any>();state.query.mockReturnValueOnce(pending.promise);const view=render(<MuseumView/>);await waitFor(()=>expect(state.query).toHaveBeenCalledTimes(1));const old=state.uid;await act(async()=>{state.uid='replacement';setActiveOwnerInternal('user:replacement');if(aba){state.uid=old;setActiveOwnerInternal(`user:${old}`)}state.query.mockResolvedValue(result(0));});await waitFor(()=>expect(state.query).toHaveBeenCalledTimes(2));await act(async()=>{pending.resolve(result(100));await Promise.resolve()});expect(view.getByTestId('museum').textContent).toBe('locked-visible:0');});
it('guest never queries server collection or borrows prior confirmed ownership',async()=>{const view=render(<MuseumView/>);await waitFor(()=>expect(view.getByTestId('museum').textContent).toBe('unlocked:1'));const calls=state.query.mock.calls.length;act(()=>setActiveOwnerInternal('guest:device'));expect(view.getByTestId('museum').textContent).toBe('locked-visible:0');expect(state.query).toHaveBeenCalledTimes(calls);});
it('mismatched auth session does not start ownership query',async()=>{state.session.mockResolvedValue({data:{session:{user:{id:'different'}}}});const view=render(<MuseumView/>);await act(async()=>{await refreshMuseumPresentation()});expect(state.query).not.toHaveBeenCalled();expect(view.getByTestId('museum').textContent).toBe('locked-visible:0');});
it('same-owner remount refreshes and offline failure preserves only memory-confirmed view',async()=>{let view=render(<MuseumView/>);await waitFor(()=>expect(view.getByTestId('museum').textContent).toBe('unlocked:1'));view.unmount();state.query.mockRejectedValue(new Error('offline'));view=render(<MuseumView/>);await act(async()=>{await refreshMuseumPresentation()});expect(view.getByTestId('museum').textContent).toBe('unlocked:1');expect(state.claim).not.toHaveBeenCalled();});
it('multiple surfaces share one flight and collection change refreshes confirmed rows',async()=>{state.query.mockResolvedValue(result(9));const view=render(<><MuseumView/><MuseumView/></>);await waitFor(()=>expect(view.getAllByTestId('museum')[0].textContent).toBe('locked-visible:0.9'));expect(state.query).toHaveBeenCalledTimes(1);state.query.mockResolvedValue(result(10));await act(async()=>window.dispatchEvent(new Event('irth:collection:changed')));await waitFor(()=>expect(view.getAllByTestId('museum')[1].textContent).toBe('unlocked:1'));expect(state.query).toHaveBeenCalledTimes(2);expect(state.claim).not.toHaveBeenCalled();});
it('timed-out response cannot update views and retry can proceed',async()=>{vi.useFakeTimers();const pending=deferred<any>();state.query.mockReturnValueOnce(pending.promise);const view=render(<MuseumView/>);await act(async()=>{await Promise.resolve();await Promise.resolve()});await act(async()=>vi.advanceTimersByTimeAsync(8000));state.query.mockResolvedValue(result(1));await act(async()=>{await refreshMuseumPresentation()});expect(view.getByTestId('museum').textContent).toBe('locked-visible:0.1');await act(async()=>{pending.resolve(result(100));await Promise.resolve()});expect(view.getByTestId('museum').textContent).toBe('locked-visible:0.1');});

it('synchronous auth error releases the exact slot for a healthy retry', async () => {
 state.session.mockImplementationOnce(() => { throw new Error('sync SDK failure'); });
 const view=render(<MuseumView/>);
 await act(async()=>{await refreshMuseumPresentation()}); expect(state.query).not.toHaveBeenCalled();
 await act(async()=>{await refreshMuseumPresentation()}); expect(state.query).toHaveBeenCalledTimes(1);
 expect(view.getByTestId('museum').textContent).toBe('unlocked:1');
});
it('never-settling auth resolves refresh at deadline without querying or retaining a flight', async () => {
 vi.useFakeTimers(); state.session.mockReturnValueOnce(new Promise(()=>{}));
 const view=render(<MuseumView/>); let finished=false;
 const task=refreshMuseumPresentation().then(()=>{finished=true});
 await act(async()=>vi.advanceTimersByTimeAsync(8000)); await task;
 expect(finished).toBe(true);expect(state.query).not.toHaveBeenCalled();
 await act(async()=>{await refreshMuseumPresentation()});expect(view.getByTestId('museum').textContent).toBe('unlocked:1');
});

it('a collection mutation supersedes a pre-mutation read rather than reusing it', async () => {
 const old=deferred<any>();state.query.mockReturnValueOnce(old.promise);
 const view=render(<MuseumView/>);await waitFor(()=>expect(state.query).toHaveBeenCalledTimes(1));
 state.query.mockResolvedValue(result(10));await act(async()=>window.dispatchEvent(new Event('irth:collection:changed')));
 await waitFor(()=>expect(view.getByTestId('museum').textContent).toBe('unlocked:1'));
 await act(async()=>{old.resolve(result(1));await Promise.resolve()});
 expect(view.getByTestId('museum').textContent).toBe('unlocked:1');expect(state.query).toHaveBeenCalledTimes(2);
});

it('preserves already-claimed records and marks display evidence without inventing a receipt', () => {
 const views=buildViews({registry,evaluation:getEvaluation(),persisted:new Map()});
 const base=views.find(v=>v.id==='ach_artifact_10')!;
 const claimed={...base,state:'claimed' as const,claimedAt:'2026-01-01',unlockedAt:'2026-01-01'};
 expect(projectMuseumViews([claimed],[],getSnapshot())[0]).toBe(claimed);
 const projected=projectMuseumViews([{...base,state:'locked-visible',progress:0}],rows(10).map(r=>r.item_id),getSnapshot())[0];
 expect(projected.state).toBe('unlocked');expect(projected.ownershipPresentationOnly).toBe(true);
 expect(projected.claimedAt).toBeNull();expect(projected.unlockedAt).toBeNull();expect(projected.rewards).toBe(base.rewards);
});

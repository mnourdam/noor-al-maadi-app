import React, { useEffect } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { ProfileProvider, useProfile } from '@/lib/profile';
import { useProfileWriter } from '@/lib/profile-writer';
import type { ProfileState } from '@/lib/profile';
import { __resetIdentityForTests, setActiveOwnerInternal } from '@/lib/identity/owner';
vi.mock('@/lib/diag-trace',()=>({recordTrace:()=>{}}));
vi.mock('@/lib/androidFreezeDiagnostics',()=>({androidMeasure:()=>{},recordAndroidAction:()=>{}}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{auth:{getSession:async()=>({data:{session:null}})}}}));
const key='hakaya.profile.v2';
const initial={loggedIn:false,points:100,dinars:50,hearts:3,heartsAt:Date.now()} as ProfileState;
class Boundary extends React.Component<{children:React.ReactNode},{failed:boolean}>{
 state={failed:false};static getDerivedStateFromError(){return {failed:true}};
 render(){return this.state.failed?<p>APP CRASHED</p>:this.props.children}
}
function bytes(){return Object.fromEntries(Object.keys(localStorage).sort().map(k=>[k,localStorage.getItem(k)]));}
beforeEach(()=>{localStorage.clear();sessionStorage.clear();__resetIdentityForTests();setActiveOwnerInternal('guest:synthetic');
 localStorage.setItem(key,JSON.stringify(initial));
 for(const name of ['irth.daily-challenges.2026-11-13','irth.daily-quest.history','irth.diag-trace','irth.outbox.fallback.v1','irth_campaign_grants_v2','irth.reflections'])localStorage.setItem(name,JSON.stringify({synthetic:'retained',value:'x'.repeat(512)}));
 vi.spyOn(Storage.prototype,'removeItem');vi.spyOn(Storage.prototype,'clear');
 vi.spyOn(console,'error').mockImplementation(()=>{});
});
afterEach(()=>{expect(Storage.prototype.removeItem).not.toHaveBeenCalled();expect(Storage.prototype.clear).not.toHaveBeenCalled();cleanup();vi.restoreAllMocks();__resetIdentityForTests()});
function full(){const capacity=JSON.stringify(bytes()).length;const original=Storage.prototype.setItem;
 return vi.spyOn(Storage.prototype,'setItem').mockImplementation(function(this:Storage,k,v){
  const next={...bytes(),[k]:v};if(JSON.stringify(next).length>capacity)throw new DOMException('Synthetic full storage','QuotaExceededError');
  original.call(this,k,v);
 });}
it('explicit post-mount profile update under full storage leaves app mounted, reports failed and preserves every player key',async()=>{
 const before=bytes();full();let api!:ReturnType<typeof useProfile>;
 function Probe(){api=useProfile();return <p>PLAYER APP</p>}
 const view=render(<Boundary><ProfileProvider><Probe/></ProfileProvider></Boundary>);
 await act(async()=>{api.applyServerStats({xp:100000000000});});expect(view.queryByText('APP CRASHED')).toBeNull();expect(view.getByText('PLAYER APP')).toBeTruthy();
 expect(api.getPersistence().outcome).toBe('failed');expect(bytes()).toEqual(before);
});
it('conditional quota returns false without unmount or deleting history, and remount retains saved balance',async()=>{
 const before=bytes();let writer!:ReturnType<typeof useProfileWriter>;
 function Probe(){writer=useProfileWriter(initial);useEffect(()=>writer.hydrate(report=>{report(true);return JSON.parse(localStorage.getItem(key)!)}),[]);return <p>WRITER APP</p>}
 const view=render(<Boundary><Probe/></Boundary>);full();let result!:Promise<boolean>;
 await act(async()=>{result=writer.prepareConditional().apply(p=>({...p,name:'synthetic-long-name-that-cannot-fit'}))});
 expect(await result).toBe(false);expect(view.queryByText('APP CRASHED')).toBeNull();expect(writer.getPersistence().outcome).toBe('failed');expect(bytes()).toEqual(before);
 view.unmount();render(<Boundary><Probe/></Boundary>);expect(writer.profile.points).toBe(100);expect(writer.profile.dinars).toBe(50);
});

it('failed write does not auto retry; explicit later update can persist after storage is available',async()=>{
 let writer!:ReturnType<typeof useProfileWriter>;
 function Probe(){writer=useProfileWriter(initial);useEffect(()=>writer.hydrate(report=>{report(true);return initial}),[]);return <p>alive</p>}
 const view=render(<Boundary><Probe/></Boundary>);const fault=full();let result!:Promise<boolean>;
 await act(async()=>{result=writer.prepareConditional().apply(p=>({...p,name:'oversized-synthetic-name'}))});expect(await result).toBe(false);
 const attempts=fault.mock.calls.length;await act(async()=>{});expect(fault).toHaveBeenCalledTimes(attempts);
 fault.mockRestore();await act(async()=>{writer.setProfile(p=>({...p,points:101}))});
 expect(await result).toBe(false);expect(writer.getPersistence().outcome).toBe('written');expect(JSON.parse(localStorage.getItem(key)!).points).toBe(101);expect(view.getByText('alive')).toBeTruthy();
});
it('owner ABA after quota cannot reuse a captured conditional capability',async()=>{
 let writer!:ReturnType<typeof useProfileWriter>;
 function Probe(){writer=useProfileWriter(initial);useEffect(()=>writer.hydrate(report=>{report(true);return initial}),[]);return <p>alive</p>}
 render(<Boundary><Probe/></Boundary>);full();let result!:Promise<boolean>;
 await act(async()=>{result=writer.prepareConditional().apply(p=>({...p,name:'oversized-synthetic-name'}))});expect(await result).toBe(false);
 const before=bytes(),capability=writer.prepareConditional();act(()=>{setActiveOwnerInternal('guest:bob');setActiveOwnerInternal('guest:synthetic')});
 expect(await capability.apply(p=>({...p,points:999}))).toBe(false);expect(bytes()).toEqual(before);
});

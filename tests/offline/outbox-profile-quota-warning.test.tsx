import React, { useEffect } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { ProfileProvider, useProfile } from '@/lib/profile';
import { useProfileWriter } from '@/lib/profile-writer';
import { AppShell } from '@/components/AppShell';
import { setUiLanguage } from '@/lib/ui-language/store';
import type { ProfileState } from '@/lib/profile';
import { __resetIdentityForTests, setActiveOwnerInternal } from '@/lib/identity/owner';
vi.mock('@tanstack/react-router',()=>({useRouterState:()=> '/', Link:({children}:any)=><a>{children}</a>}));
vi.mock('@/components/HUD',()=>({HUD:()=>null}));
vi.mock('@/components/UiLanguageChooser',()=>({UiLanguageChooser:()=>null}));
vi.mock('@/components/FriendNotificationsPoller',()=>({FriendNotificationsPoller:()=>null}));
vi.mock('@/lib/androidQuietMode',()=>({isSectionEnabled:()=>false}));
vi.mock('@/lib/diag-trace',()=>({recordTrace:()=>{}}));
vi.mock('@/lib/androidFreezeDiagnostics',()=>({androidMeasure:()=>{},recordAndroidAction:()=>{},androidMark:()=>{},isAndroidUltraStableMode:()=>true}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{auth:{getSession:async()=>({data:{session:null}})}}}));
const key='hakaya.profile.v2';
const initial={loggedIn:false,points:100,dinars:50,hearts:3,heartsAt:Date.now()} as ProfileState;
class Boundary extends React.Component<{children:React.ReactNode},{failed:boolean}>{
 state={failed:false};static getDerivedStateFromError(){return {failed:true}};
 render(){return this.state.failed?<p>APP CRASHED</p>:this.props.children}
}
function bytes(){return Object.fromEntries(Object.keys(localStorage).sort().map(k=>[k,localStorage.getItem(k)]));}
beforeEach(()=>{localStorage.clear();sessionStorage.clear();__resetIdentityForTests();setActiveOwnerInternal('guest:synthetic');
 setUiLanguage('ar');localStorage.setItem(key,JSON.stringify(initial));
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

it('actual shell shows one reactive quota status, retains it on unresolved write, clears only verified write',async()=>{
 let api!:ReturnType<typeof useProfile>;
 function Probe(){api=useProfile();return <AppShell><p>Player page</p></AppShell>}
 const view=render(<ProfileProvider><Probe/></ProfileProvider>);const fault=full();
 await act(async()=>api.applyServerStats({xp:100000000000}));
 expect(view.getAllByRole('status')).toHaveLength(1);expect(view.getByRole('status').textContent).toContain('بعض التغييرات');
 await act(async()=>api.applyServerStats({xp:100000000001}));expect(view.getAllByRole('status')).toHaveLength(1);
 act(()=>setUiLanguage('en'));expect(view.getByRole('status').textContent).toContain('Some changes could not be saved');expect(view.getByRole('status').getAttribute('dir')).toBe('ltr');
 fault.mockImplementation(()=>{});await act(async()=>api.applyServerStats({xp:100000000002}));expect(api.getPersistence().outcome).toBe('unresolved');expect(view.getByRole('status')).toBeTruthy();
 fault.mockRestore();await act(async()=>api.applyServerStats({xp:101}));expect(api.getPersistence().outcome).toBe('written');expect(view.queryByRole('status')).toBeNull();
});
it('warning masks synchronously for owner change and ABA without stale-account display',async()=>{
 let api!:ReturnType<typeof useProfile>;
 function Probe(){api=useProfile();return <AppShell><p>Player page</p></AppShell>}
 const view=render(<ProfileProvider><Probe/></ProfileProvider>);full();await act(async()=>api.applyServerStats({xp:100000000000}));expect(view.getByRole('status')).toBeTruthy();
 act(()=>setActiveOwnerInternal('guest:bob'));expect(view.queryByRole('status')).toBeNull();
 act(()=>setActiveOwnerInternal('guest:synthetic'));expect(view.queryByRole('status')).toBeNull();
});
it('same-owner hydrate does not claim quota recovery; fresh mount has no durable warning journal',async()=>{
 let api!:ReturnType<typeof useProfileWriter>;
 function Probe(){api=useProfileWriter(initial);useEffect(()=>api.hydrate(r=>{r(true);return initial}),[]);return <p>{api.quotaExceeded?'quota':'clear'}</p>}
 const view=render(<Probe/>);full();await act(async()=>api.setProfile(p=>({...p,name:'oversized synthetic name'})));expect(view.getByText('quota')).toBeTruthy();
 act(()=>api.hydrate(r=>{r(true);return initial}));expect(view.getByText('quota')).toBeTruthy();
 view.unmount();const next=render(<Probe/>);expect(next.getByText('clear')).toBeTruthy();
});

it('actual shell without profile provider has no persistence notice',()=>{
 const view=render(<AppShell><p>Standalone shell</p></AppShell>);expect(view.getByText('Standalone shell')).toBeTruthy();expect(view.queryByRole('status')).toBeNull();
});
it('retired conditional success/failure attempts cannot erase successor quota warning',async()=>{
 let api!:ReturnType<typeof useProfileWriter>;
 function Probe(){api=useProfileWriter(initial);useEffect(()=>api.hydrate(r=>{r(true);return initial}),[]);return <p>{api.quotaExceeded?'quota':'clear'}</p>}
 const view=render(<Probe/>);const oldSuccess=api.prepareConditional();
 act(()=>{setActiveOwnerInternal('guest:bob');api.hydrate(r=>{r(true);return initial})});const fault=full();
 await act(async()=>api.setProfile(p=>({...p,name:'oversized synthetic successor name'})));expect(view.getByText('quota')).toBeTruthy();
 fault.mockRestore();const reducer=vi.fn(p=>({...p,points:101}));expect(await oldSuccess.apply(reducer)).toBe(false);expect(reducer).not.toHaveBeenCalled();expect(view.getByText('quota')).toBeTruthy();
 expect(await oldSuccess.apply(()=>{throw Error('retired failure')})).toBe(false);expect(view.getByText('quota')).toBeTruthy();
});

it('no-quota hydrate and verified reset do not schedule extra warning renders',async()=>{
 let api!:ReturnType<typeof useProfileWriter>, renders=0;
 function Probe(){renders++;api=useProfileWriter(initial);useEffect(()=>api.hydrate(r=>{r(true);return initial}),[]);return <p>{api.quotaExceeded?'quota':'clear'}</p>}
 const view=render(<Probe/>);
 let before=renders;
 await act(async()=>api.hydrate(r=>{r(true);return initial}));
 expect(renders-before).toBe(1);expect(view.getByText('clear')).toBeTruthy();
 before=renders;
 await act(async()=>api.reset({...initial,points:101}));
 expect(renders-before).toBe(1);expect(api.getPersistence().outcome).toBe('written');expect(view.getByText('clear')).toBeTruthy();
});

import React,{useState} from 'react';
import {render,act,fireEvent,cleanup,waitFor} from '@testing-library/react';
import {it,expect,vi,afterEach,beforeEach} from 'vitest';
import {NotificationThumbnail} from '@/components/notifications/NotificationThumbnail';
import {__resetIdentityForTests,setActiveOwnerInternal} from '@/lib/identity/owner';
const originalDescriptors = {
 createObjectURL: Object.getOwnPropertyDescriptor(URL, 'createObjectURL'),
 revokeObjectURL: Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL'),
 online: Object.getOwnPropertyDescriptor(navigator, 'onLine'),
};
function restoreDescriptor(target: object, key: string, descriptor?: PropertyDescriptor) {
 if (descriptor) Object.defineProperty(target, key, descriptor);
 else Reflect.deleteProperty(target, key);
}
const SIZE=65536;
const notices=Array.from({length:150},(_,i)=>({id:i,title:`Synthetic notice ${i}`,image_url:`https://synthetic.invalid/image-${i}.png`}));
function Fixture(){const [clicks,setClicks]=useState(0);return <><button onClick={()=>setClicks(n=>n+1)}>Action {clicks}</button>{notices.map(n=><article key={n.id}><p>{n.title}</p><NotificationThumbnail src={n.image_url} notificationId={String(n.id)} /></article>)}</>}
function harness(){
 const stored=new Map<string,any>();let requested=0,active=0,peak=0,bytes=0;const pending:Array<()=>void>=[];
 const response=()=>({ok:true,status:200,clone:()=>response(),blob:async()=>new Blob([new Uint8Array(SIZE)],{type:'image/png'})});
 vi.stubGlobal('caches',{open:async()=>({match:async(k:string)=>stored.get(k)?.clone(),put:async(k:string,r:any)=>{stored.set(k,r.clone())}})});
 vi.stubGlobal('fetch',vi.fn((url:string)=>{if(!url.startsWith('https://synthetic.invalid/'))throw new Error('unexpected network destination');requested++;active++;peak=Math.max(peak,active);return new Promise(resolve=>pending.push(()=>{active--;bytes+=SIZE;resolve(response())}))}));
 const observers: Array<{target?: Element; callback: IntersectionObserverCallback; disconnect: ReturnType<typeof vi.fn>; fire:()=>void}> = [];
 vi.stubGlobal('IntersectionObserver',class {
  target?: Element; disconnect=vi.fn();
  constructor(public callback:IntersectionObserverCallback){observers.push(this)}
  observe(target:Element){this.target=target}
  fire(){this.callback([{target:this.target,isIntersecting:true}] as IntersectionObserverEntry[],this as unknown as IntersectionObserver)}
 });
 Object.defineProperty(URL,'createObjectURL',{configurable:true,value:vi.fn(()=>`blob:synthetic-${Math.random()}`)});
 Object.defineProperty(URL,'revokeObjectURL',{configurable:true,value:vi.fn()});
 Object.defineProperty(navigator,'onLine',{configurable:true,value:true});
 return {pending,stored,observers,stats:()=>({requested,active,peak,bytes})};
}
beforeEach(()=>{__resetIdentityForTests();setActiveOwnerInternal("user:synthetic-a")});
afterEach(()=>{cleanup();__resetIdentityForTests();vi.unstubAllGlobals();vi.restoreAllMocks();
 restoreDescriptor(URL,'createObjectURL',originalDescriptors.createObjectURL);
 restoreDescriptor(URL,'revokeObjectURL',originalDescriptors.revokeObjectURL);
 restoreDescriptor(navigator,'onLine',originalDescriptors.online);
});

it('holds 150 cold offscreen images, fetches only five admitted, and reuses warm cache',async()=>{
 const h=harness();const v=render(<Fixture/>);
 await act(async()=>{});expect(h.stats().requested).toBe(0);expect(h.observers).toHaveLength(150);
 expect(v.container.querySelectorAll('span[aria-hidden="true"]')).toHaveLength(150);
 fireEvent.click(v.getByText('Action 0'));expect(v.getByText('Action 1')).toBeTruthy();
 act(()=>h.observers.slice(0,5).forEach(o=>o.fire()));
 await waitFor(()=>expect(h.stats().requested).toBe(5));expect(h.stats().peak).toBe(5);
 expect(v.container.querySelectorAll('img')).toHaveLength(0);
 await act(async()=>h.pending.splice(0).forEach(f=>f()));
 await waitFor(()=>expect(v.container.querySelectorAll('img')).toHaveLength(5));expect(h.stats().bytes).toBe(327680);
 expect(h.observers.slice(0,5).every(o=>o.disconnect.mock.calls.length>0)).toBe(true);
 v.unmount();const warm=render(<Fixture/>);act(()=>h.observers.slice(150,155).forEach(o=>o.fire()));
 await waitFor(()=>expect(warm.container.querySelectorAll('img')).toHaveLength(5));expect(h.stats().requested).toBe(5);
});
it('retires source and notification identity callbacks and never displays the previous resolved image',async()=>{
 const h=harness();const v=render(<NotificationThumbnail src="https://synthetic.invalid/a" notificationId="a"/>);
 const old=h.observers[0];v.rerender(<NotificationThumbnail src="https://synthetic.invalid/b" notificationId="a"/>);
 act(()=>old.fire());await act(async()=>{});expect(h.stats().requested).toBe(0);
 act(()=>h.observers[1].fire());await waitFor(()=>expect(h.stats().requested).toBe(1));
 await act(async()=>h.pending.splice(0).forEach(f=>f()));await waitFor(()=>expect(v.container.querySelector('img')).not.toBeNull());
 v.rerender(<NotificationThumbnail src="https://synthetic.invalid/b" notificationId="b"/>);
 expect(v.container.querySelector('img')).toBeNull();expect(h.observers[1].disconnect).toHaveBeenCalled();
});
it('retires owner and ABA callbacks, and unmounted callbacks cannot start work',async()=>{
 const h=harness();const v=render(<NotificationThumbnail src="https://synthetic.invalid/a" notificationId="a"/>);
 const old=h.observers[0];act(()=>{setActiveOwnerInternal('user:synthetic-b');setActiveOwnerInternal('user:synthetic-a')});
 act(()=>old.fire());await act(async()=>{});expect(h.stats().requested).toBe(0);
 const current=h.observers.at(-1)!;v.unmount();act(()=>current.fire());await act(async()=>{});
 expect(h.stats().requested).toBe(0);expect(current.disconnect).toHaveBeenCalled();
});
it.each(['missing','constructor','observe'])('preserves eager compatibility when observer is %s',async(mode)=>{
 const h=harness();
 vi.stubGlobal('IntersectionObserver',mode==='missing'?undefined:class {constructor(){if(mode==='constructor')throw new Error('unsupported')}observe(){throw new Error('unsupported')}disconnect(){}});
 const v=render(<NotificationThumbnail src="https://synthetic.invalid/a" notificationId="a"/>);
 await waitFor(()=>expect(h.stats().requested).toBe(1));await act(async()=>h.pending.splice(0).forEach(f=>f()));
 await waitFor(()=>expect(v.container.querySelector('img')).not.toBeNull());expect(v.container.querySelector('img')?.alt).toBe('');
 expect(v.container.querySelector('[tabindex],button,a')).toBeNull();
});
it('does not publish late cache results after source replacement, but does not claim fetch cancellation',async()=>{
 const h=harness();const v=render(<NotificationThumbnail src="https://synthetic.invalid/a" notificationId="a"/>);
 act(()=>h.observers[0].fire());await waitFor(()=>expect(h.stats().requested).toBe(1));
 v.rerender(<NotificationThumbnail src="https://synthetic.invalid/b" notificationId="a"/>);
 await act(async()=>h.pending.splice(0).forEach(f=>f()));expect(v.container.querySelector('img')).toBeNull();
 expect(h.stored.size).toBe(1);expect(URL.revokeObjectURL).toHaveBeenCalled();
});
it('ignores nonintersecting/foreign entries and cleans StrictMode replay observers',async()=>{
 const h=harness();const v=render(<React.StrictMode><NotificationThumbnail src="https://synthetic.invalid/a" notificationId="a"/></React.StrictMode>);
 const retired=h.observers[0],current=h.observers.at(-1)!;
 expect(retired.disconnect).toHaveBeenCalled();
 act(()=>{retired.fire();current.callback([{target:current.target,isIntersecting:false},{target:document.body,isIntersecting:true}] as IntersectionObserverEntry[],{} as IntersectionObserver)});
 await act(async()=>{});expect(h.stats().requested).toBe(0);
 // The unchanged cache hook runs twice under development StrictMode replay.
 act(()=>current.fire());await waitFor(()=>expect(h.stats().requested).toBe(2));
 v.unmount();await act(async()=>h.pending.splice(0).forEach(f=>f()));expect(current.disconnect).toHaveBeenCalled();
});

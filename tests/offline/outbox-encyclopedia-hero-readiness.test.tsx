import React from 'react';
import {render,act,cleanup,waitFor} from '@testing-library/react';
import {it,expect,vi,beforeEach,afterEach} from 'vitest';
vi.mock('@tanstack/react-router',()=>({Link:({children}:any)=><a>{children}</a>}));
import {EncyclopediaHero} from '@/components/encyclopedia/EncyclopediaHero';
const online=Object.getOwnPropertyDescriptor(navigator,'onLine');
const createURL=Object.getOwnPropertyDescriptor(URL,'createObjectURL'), revokeURL=Object.getOwnPropertyDescriptor(URL,'revokeObjectURL');
let probes:any[];let cached:Map<string,any>;let fetcher:ReturnType<typeof vi.fn>;
const response=()=>({ok:true,type:'basic',headers:{get:()=>null},clone:()=>response(),blob:async()=>new Blob(['synthetic'],{type:'image/png'})});
const a='https://synthetic.invalid/a.png',b='https://synthetic.invalid/b.png';
const hero=(src:string|null)=><EncyclopediaHero imageUrl={src} Icon={()=>null} title="Synthetic title" eyebrow="Synthetic" fallback={<div data-testid="fallback">original layout</div>}/>;
beforeEach(()=>{
 probes=[];cached=new Map();Object.defineProperty(navigator,'onLine',{configurable:true,value:true});
 vi.stubGlobal('Image',class {onload:any;onerror:any;decoding='';src='';constructor(){probes.push(this)}});
 vi.stubGlobal('caches',{open:async()=>({match:async(k:string)=>cached.get(k),put:async(k:string,r:any)=>{cached.set(k,r)}})});
 fetcher=vi.fn(async(url:string)=>{if(![a,b].includes(url))throw Error('unexpected destination');return response()});vi.stubGlobal('fetch',fetcher);
 Object.defineProperty(URL,'createObjectURL',{configurable:true,writable:true,value:vi.fn()});Object.defineProperty(URL,'revokeObjectURL',{configurable:true,writable:true,value:vi.fn()});vi.spyOn(URL,'createObjectURL').mockImplementation(()=>`blob:synthetic-${probes.length}-${Math.random()}`);vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{});
});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();if(online)Object.defineProperty(navigator,'onLine',online);else Reflect.deleteProperty(navigator,'onLine');for(const [key,descriptor] of [['createObjectURL',createURL],['revokeObjectURL',revokeURL]] as const){if(descriptor)Object.defineProperty(URL,key,descriptor);else Reflect.deleteProperty(URL,key)}});
async function ready(){await waitFor(()=>expect(probes.length).toBeGreaterThan(0));act(()=>probes.at(-1).onload());}
it('null retains exact no-image layout without a fetch/probe',()=>{const v=render(hero(null));expect(v.getByTestId('fallback')).toBeTruthy();expect(fetcher).not.toHaveBeenCalled();expect(probes).toHaveLength(0)});
it('valid source keeps fallback until probe succeeds',async()=>{const v=render(hero(a));await waitFor(()=>expect(probes).toHaveLength(1));expect(v.queryByTestId('fallback')).not.toBeNull();expect(v.container.querySelector('img')).toBeNull();act(()=>probes[0].onload());expect(v.queryByTestId('fallback')).toBeNull();expect(v.container.querySelector('img')).not.toBeNull()});
it('failed probe preserves original fallback',async()=>{const v=render(hero(a));await waitFor(()=>expect(probes).toHaveLength(1));act(()=>probes[0].onerror());expect(v.queryByTestId('fallback')).not.toBeNull();expect(v.container.querySelector('img')).toBeNull()});
it('replacement pending cache resolution cannot inherit previous readiness',async()=>{const v=render(hero(a));await ready();fetcher.mockImplementation(()=>new Promise(()=>{}));v.rerender(hero(b));expect(v.queryByTestId('fallback')).not.toBeNull();expect(v.container.querySelector('img')).toBeNull()});
it('offline uncached replacement restores fallback without new network',async()=>{const v=render(hero(a));await ready();Object.defineProperty(navigator,'onLine',{configurable:true,value:false});v.rerender(hero(b));await act(async()=>{});expect(v.queryByTestId('fallback')).not.toBeNull();expect(v.container.querySelector('img')).toBeNull();expect(fetcher).toHaveBeenCalledOnce()});
it('late retired probe callback cannot enable replacement',async()=>{const v=render(hero(a));await waitFor(()=>expect(probes).toHaveLength(1));const old=probes[0].onload;fetcher.mockImplementation(()=>new Promise(()=>{}));v.rerender(hero(b));act(()=>old());expect(v.queryByTestId('fallback')).not.toBeNull();expect(v.container.querySelector('img')).toBeNull()});
it('good to null to same source requires new probe before image layout',async()=>{const v=render(hero(a));await ready();v.rerender(hero(null));expect(v.queryByTestId('fallback')).not.toBeNull();v.rerender(hero(a));expect(v.queryByTestId('fallback')).not.toBeNull();await waitFor(()=>expect(probes.length).toBe(2));act(()=>probes[1].onload());expect(v.queryByTestId('fallback')).toBeNull()});
it('offline cached source uses real resolver cache path without fetch',async()=>{cached.set(a,response());Object.defineProperty(navigator,'onLine',{configurable:true,value:false});const v=render(hero(a));await ready();expect(fetcher).not.toHaveBeenCalled();expect(v.container.querySelector('img')).not.toBeNull();expect(v.queryByTestId('fallback')).toBeNull()});

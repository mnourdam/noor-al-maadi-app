import React, {useLayoutEffect} from 'react';
import {render,screen,waitFor,cleanup,act} from '@testing-library/react';
import {it,expect,vi,beforeEach,afterEach} from 'vitest';
import {CachedImage} from '@/components/CachedImage';
import {OFFLINE_CHAPTER_IMAGE_PATHS} from '@/lib/campaign-art/chapter-pack.generated';
const response = () => ({blob:async()=>new Blob(['synthetic'])});
function deferred() { let resolve!:(value:unknown)=>void;const promise=new Promise(r=>{resolve=r});return {promise,resolve}; }
let create = vi.fn((_object: Blob | MediaSource): string => ""), revoke = vi.fn((_url: string): void => {});
beforeEach(()=>{
 let n=0;create=vi.fn((_object: Blob | MediaSource): string=>`blob:owned-${++n}`);revoke=vi.fn((_url: string): void=>{});
 vi.stubGlobal('URL',class extends URL {static createObjectURL=create;static revokeObjectURL=revoke});
 vi.stubGlobal('fetch',vi.fn(()=>{throw Error('network prohibited')}));
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks()});
const old='https://synthetic.invalid/old.webp', next='https://synthetic.invalid/new.webp';
function image(src:string|null,alt='chapter') {return <CachedImage src={src} alt={alt} fallback={<span>pending {alt}</span>}/>;}
it('masks revoked old URL synchronously and throughout replacement, preserving same-source result',async()=>{
 const gate=deferred();const match=vi.fn(async(key:string)=>key===next?gate.promise:response());
 vi.stubGlobal('caches',{open:async()=>({match})});
 const observed:(string|null)[]=[];
 function Surface({src}:{src:string}) {useLayoutEffect(()=>{observed.push(document.querySelector('img')?.getAttribute('src')??null)},[src]);return image(src);}
 const view=render(<Surface src={old}/>);
 await waitFor(()=>expect(screen.getByAltText('chapter').getAttribute('src')).toBe('blob:owned-1'));
 const node=screen.getByAltText('chapter');view.rerender(<Surface src={old}/>);
 expect(screen.getByAltText('chapter')).toBe(node);expect(match).toHaveBeenCalledTimes(1);expect(revoke).not.toHaveBeenCalled();
 view.rerender(<Surface src={next}/>);
 expect(observed.at(-1)).toBeNull();expect(screen.queryByAltText('chapter')).toBeNull();expect(screen.getByText('pending chapter')).toBeTruthy();
 expect(revoke).toHaveBeenCalledWith('blob:owned-1');
 await act(async()=>gate.resolve(response()));
 await waitFor(()=>expect(screen.getByAltText('chapter').getAttribute('src')).toBe('blob:owned-2'));
});
it('resolved A→pending B→A does not resurrect revoked first A',async()=>{
 const b=deferred(),a2=deferred();let calls=0;
 vi.stubGlobal('caches',{open:async()=>({match:async(key:string)=>key===next?b.promise:++calls===1?response():a2.promise})});
 const view=render(image(old));await screen.findByAltText('chapter');
 view.rerender(image(next));view.rerender(image(old));
 expect(screen.queryByAltText('chapter')).toBeNull();
 await act(async()=>a2.resolve(response()));await waitFor(()=>expect(screen.getByAltText('chapter').getAttribute('src')).toBe('blob:owned-2'));
 await act(async()=>b.resolve(response()));expect(screen.getByAltText('chapter').getAttribute('src')).toBe('blob:owned-2');expect(revoke).toHaveBeenCalledWith('blob:owned-3');
});
it('pending first A cannot replace final A after ABA; null/removal retires all owned handles',async()=>{
 const a1=deferred(),b=deferred();let calls=0;
 vi.stubGlobal('caches',{open:async()=>({match:async(key:string)=>key===next?b.promise:++calls===1?a1.promise:response()})});
 const view=render(image(old));await act(async()=>{});view.rerender(image(next));await act(async()=>{});view.rerender(image(old));
 await waitFor(()=>expect(screen.getByAltText('chapter').getAttribute('src')).toBe('blob:owned-1'));
 await act(async()=>a1.resolve(response()));expect(screen.getByAltText('chapter').getAttribute('src')).toBe('blob:owned-1');expect(revoke).toHaveBeenCalledWith('blob:owned-2');
 view.rerender(image(null));expect(screen.queryByAltText('chapter')).toBeNull();expect(revoke).toHaveBeenCalledWith('blob:owned-1');
 await act(async()=>b.resolve(response()));expect(screen.queryByAltText('chapter')).toBeNull();expect(revoke).toHaveBeenCalledWith('blob:owned-3');
});
it('independent consumers receive distinct owned URLs; unmount cannot revoke another consumer',async()=>{
 vi.stubGlobal('caches',{open:async()=>({match:async()=>response()})});
 function Pair({first}:{first:boolean}) {return <>{first&&<CachedImage key="first" src={old} alt="first"/>}<CachedImage key="second" src={old} alt="second"/></>;}
 const view=render(<Pair first/>);await screen.findByAltText('second');const first=screen.getByAltText('first').getAttribute('src'),second=screen.getByAltText('second').getAttribute('src');
 expect(first).not.toBe(second);view.rerender(<Pair first={false}/>);expect(revoke).toHaveBeenCalledWith(first);expect(revoke).not.toHaveBeenCalledWith(second);expect(screen.getByAltText('second').getAttribute('src')).toBe(second);
 view.unmount();expect(revoke).toHaveBeenCalledWith(second);
});
it('direct caller blob/data URLs are immediate and never owned or revoked',()=>{
 const view=render(image('blob:borrowed'));expect(screen.getByAltText('chapter').getAttribute('src')).toBe('blob:borrowed');
 view.rerender(image('data:image/png;base64,c3ludGhldGlj'));expect(screen.getByAltText('chapter').getAttribute('src')).toBe('data:image/png;base64,c3ludGhldGlj');
 view.rerender(image(null));view.unmount();expect(revoke).not.toHaveBeenCalled();expect(create).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
});
it('packaged chapter path still resolves offline and unknown offline image uses fallback',async()=>{
 const path=OFFLINE_CHAPTER_IMAGE_PATHS[0];expect(path).toBeTruthy();vi.stubGlobal('navigator',{onLine:false});
 const open=vi.fn(async()=>({match:async()=>null}));vi.stubGlobal('caches',{open});
 const view=render(image(`https://synthetic.invalid/storage/v1/object/sign/campaign-key-art/${path}?token=synthetic`));
 await waitFor(()=>expect(screen.getByAltText('chapter').getAttribute('src')).toBe(`/campaign-key-art/${path}`));expect(open).not.toHaveBeenCalled();
 view.rerender(image(next));await waitFor(()=>expect(open).toHaveBeenCalled());expect(screen.queryByAltText('chapter')).toBeNull();expect(screen.getByText('pending chapter')).toBeTruthy();expect(fetch).not.toHaveBeenCalled();expect(revoke).not.toHaveBeenCalled();
});

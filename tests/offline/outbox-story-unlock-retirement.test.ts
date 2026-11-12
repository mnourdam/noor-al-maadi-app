import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {persistUnlockedIds} from '@/lib/stories/unlock-cache';
beforeEach(()=>localStorage.clear());
afterEach(()=>vi.unstubAllGlobals());
it('does not overwrite bytes when retired during actual signing continuation',async()=>{
 let resolve!:(v:ArrayBuffer)=>void;
 const sign=vi.fn(()=>new Promise<ArrayBuffer>(r=>{resolve=r}));
 vi.stubGlobal('crypto',{subtle:{importKey:async()=>({}),sign}});
 localStorage.setItem('irth.stories.unlock.secret','a'.repeat(64));
 const key='irth.stories.unlock.v1:alice';localStorage.setItem(key,'newer-bytes');
 let current=true;const pending=persistUnlockedIds('alice',['old'],()=>current);
 await vi.waitFor(()=>expect(sign).toHaveBeenCalledTimes(1));
 current=false;resolve(new Uint8Array([1,2]).buffer);await pending;
 expect(localStorage.getItem(key)).toBe('newer-bytes');
});
it('preserves legacy no-guard signing and persistence',async()=>{
 vi.stubGlobal('crypto',{subtle:{importKey:async()=>({}),sign:async()=>new Uint8Array([1,2]).buffer}});
 localStorage.setItem('irth.stories.unlock.secret','a'.repeat(64));
 await persistUnlockedIds('alice',['story']);
 expect(JSON.parse(localStorage.getItem('irth.stories.unlock.v1:alice')!).p.ids).toEqual(['story']);
});
it('does not even create a secret for a retired call',async()=>{
 await persistUnlockedIds('alice',['story'],()=>false);
 expect(localStorage.length).toBe(0);
});

import {it,expect,vi} from 'vitest';
import {getActiveUserId,setActiveOwnerInternal,__resetIdentityForTests} from '@/lib/identity/owner';
const gate=vi.hoisted(()=>({entered:false,release:()=>{}}));
vi.mock('@/lib/diag-trace',()=>({recordTrace:()=>{}}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:async()=>({data:[{id:'story',slug:'story',completed:false,unlocked:false}],error:null}),auth:{getSession:async()=>({data:{session:{user:{id:getActiveUserId()}}}})}}}));
vi.mock('@/lib/stories/progress-mirror',async()=>{
 gate.entered=true;await new Promise<void>(r=>{gate.release=r});
 return vi.importActual('@/lib/stories/progress-mirror');
});
import {listStoriesSummary} from '@/lib/stories/summary';
it('retires while the real mirror module acquisition is delayed',async()=>{
 localStorage.clear();__resetIdentityForTests();setActiveOwnerInternal('user:alice');
 const mirror=await vi.importActual<typeof import('@/lib/stories/progress-mirror')>('@/lib/stories/progress-mirror');
 const pending=listStoriesSummary('import');await vi.waitFor(()=>expect(gate.entered).toBe(true));
 setActiveOwnerInternal('user:bob');setActiveOwnerInternal('user:alice');
 mirror.mergeAuthoritativeRows('alice',[{id:'story',completed:true}]);
 const bytes=localStorage.getItem(mirror.mirrorKey('alice'));
 gate.release();expect(await pending).toEqual([]);
 expect(localStorage.getItem(mirror.mirrorKey('alice'))).toBe(bytes);
});

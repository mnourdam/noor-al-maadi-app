import {describe,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:state.rpc}}));
import {unreadNotificationCount} from '@/lib/notifications/personal';
describe('personal count transport cancellation',()=>{
 it('passes the same signal to the SDK request',async()=>{
  const abortSignal=vi.fn().mockResolvedValue({data:3,error:null});state.rpc.mockReturnValue({abortSignal});
  const controller=new AbortController();expect(await unreadNotificationCount(controller.signal)).toBe(3);
  expect(abortSignal).toHaveBeenCalledExactlyOnceWith(controller.signal);
 });
 it('preserves the existing signal-free API for other callers',async()=>{
  state.rpc.mockResolvedValue({data:2,error:null});expect(await unreadNotificationCount()).toBe(2);
 });
});

import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const sdk = vi.hoisted(() => ({ getUser: vi.fn(), removeChannel: vi.fn(), channels: [] as any[] }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  auth: { getUser: sdk.getUser }, removeChannel: sdk.removeChannel,
  channel(name: string) { const c = { name, callback: () => {}, on(_event: string, filter: unknown, cb: () => void) { c.callback = cb; return c; }, subscribe() { return c; } }; sdk.channels.push(c); return c; },
} }));
let releases: Array<() => void> = [];
const flush = async () => { for (let i=0;i<8;i++) await Promise.resolve(); };
beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); sdk.channels.length=0; Object.defineProperty(navigator,'onLine',{configurable:true,value:true}); });
afterEach(() => { for (const release of releases) release(); releases=[]; });
it('retires old callbacks and refreshes a stable subscriber on owner switch', async () => {
 const identity=await import('@/lib/identity/owner');identity.setActiveOwnerInternal('user:alice');sdk.getUser.mockResolvedValue({data:{user:{id:'alice'}}});
 const {subscribeToMyNotifications}=await import('@/lib/notifications/server');const listener=vi.fn();releases.push(subscribeToMyNotifications(listener));await flush();
 expect(sdk.channels.map(c=>c.name)).toEqual(['notif-deliveries-alice','notif-inserts-alice']);const old=[...sdk.channels];
 sdk.getUser.mockResolvedValue({data:{user:{id:'bob'}}});identity.setActiveOwnerInternal('user:bob');await flush();listener.mockClear();old.forEach(c=>c.callback());
 expect(listener).not.toHaveBeenCalled();expect(sdk.removeChannel).toHaveBeenCalledWith(old[0]);expect(sdk.channels.slice(2).map(c=>c.name)).toEqual(['notif-deliveries-bob','notif-inserts-bob']);
 sdk.channels[2].callback();expect(listener).toHaveBeenCalledTimes(1);
});
it('does not install delayed authentication channels for a retired identity', async () => {
 const identity=await import('@/lib/identity/owner');identity.setActiveOwnerInternal('user:alice');let resolve!: (v:unknown)=>void;
 sdk.getUser.mockImplementationOnce(()=>new Promise(r=>{resolve=r;})).mockResolvedValue({data:{user:{id:'bob'}}});
 const {subscribeToMyNotifications}=await import('@/lib/notifications/server');releases.push(subscribeToMyNotifications(vi.fn()));await flush();identity.setActiveOwnerInternal('user:bob');await flush();
 resolve({data:{user:{id:'alice'}}});await flush();expect(sdk.channels.map(c=>c.name)).toEqual(['notif-deliveries-bob','notif-inserts-bob']);
});
it('fences ABA and each listener during synchronous owner retirement', async () => {
 const identity=await import('@/lib/identity/owner');identity.setActiveOwnerInternal('user:alice');sdk.getUser.mockResolvedValue({data:{user:{id:'alice'}}});
 const {subscribeToMyNotifications}=await import('@/lib/notifications/server');const second=vi.fn();
 releases.push(subscribeToMyNotifications(()=>{identity.setActiveOwnerInternal('guest:device');identity.setActiveOwnerInternal('user:alice');}));releases.push(subscribeToMyNotifications(second));await flush();
 const old=[...sdk.channels];old[0].callback();expect(second).not.toHaveBeenCalled();await flush();expect(sdk.channels).toHaveLength(4);
 old[1].callback();expect(second).not.toHaveBeenCalled();expect(sdk.removeChannel.mock.calls.map(c=>c[0])).toEqual(old);
});
it('shares the pair, releases once and cancels owner observation at last release', async () => {
 const identity=await import('@/lib/identity/owner');identity.setActiveOwnerInternal('user:alice');sdk.getUser.mockResolvedValue({data:{user:{id:'alice'}}});
 const {subscribeToMyNotifications}=await import('@/lib/notifications/server');const a=vi.fn(),b=vi.fn(),ua=subscribeToMyNotifications(a),ub=subscribeToMyNotifications(b);releases.push(ua,ub);await flush();expect(sdk.channels).toHaveLength(2);
 ua();ua();expect(sdk.removeChannel).not.toHaveBeenCalled();sdk.channels[0].callback();expect(a).not.toHaveBeenCalled();expect(b).toHaveBeenCalledTimes(1);
 ub();ub();expect(sdk.removeChannel).toHaveBeenCalledTimes(2);const calls=sdk.getUser.mock.calls.length;identity.setActiveOwnerInternal('user:bob');await flush();expect(sdk.getUser).toHaveBeenCalledTimes(calls);
 sdk.channels[0].callback();expect(b).toHaveBeenCalledTimes(1);
});
it.each(['mismatch','error','reject','guest','released'])('does not admit channels for %s',async(mode)=>{
 const identity=await import('@/lib/identity/owner');identity.setActiveOwnerInternal(mode==='guest'?'guest:device':'user:alice');let resolve!:(v:unknown)=>void;
 if(mode==='reject')sdk.getUser.mockRejectedValue(new Error('synthetic'));
 else if(mode==='released')sdk.getUser.mockImplementation(()=>new Promise(r=>{resolve=r;}));
 else sdk.getUser.mockResolvedValue({data:{user:{id:mode==='mismatch'?'bob':'alice'}},error:mode==='error'?{}:null});
 const {subscribeToMyNotifications}=await import('@/lib/notifications/server');const release=subscribeToMyNotifications(vi.fn());releases.push(release);await flush();
 if(mode==='released'){release();resolve({data:{user:{id:'alice'}}});await flush();}
 expect(sdk.channels).toHaveLength(0);if(mode==='guest')expect(sdk.getUser).not.toHaveBeenCalled();
});
it('retires channels when subscribe synchronously switches owner',async()=>{
 const identity=await import('@/lib/identity/owner');identity.setActiveOwnerInternal('user:alice');sdk.getUser.mockResolvedValue({data:{user:{id:'alice'}}});
 // Same actual channel API boundary; subscribe can synchronously invoke application code.
 const originalPush=sdk.channels.push.bind(sdk.channels);const push=vi.spyOn(sdk.channels,'push').mockImplementation((c:any)=>{c.subscribe=()=>{identity.setActiveOwnerInternal('guest:device');return c;};return originalPush(c);});
 try{const {subscribeToMyNotifications}=await import('@/lib/notifications/server');releases.push(subscribeToMyNotifications(vi.fn()));await flush();expect(sdk.channels).toHaveLength(1);expect(sdk.removeChannel).toHaveBeenCalledWith(sdk.channels[0]);}finally{push.mockRestore();}
});
it('does not duplicate a successor during synchronous removal reentry',async()=>{
 const identity=await import('@/lib/identity/owner');identity.setActiveOwnerInternal('user:alice');sdk.getUser.mockResolvedValue({data:{user:{id:'alice'}}});
 const {subscribeToMyNotifications}=await import('@/lib/notifications/server');releases.push(subscribeToMyNotifications(vi.fn()));await flush();const old=[...sdk.channels];
 sdk.getUser.mockResolvedValue({data:{user:{id:'carol'}}});sdk.removeChannel.mockImplementationOnce(()=>{identity.setActiveOwnerInternal('user:carol');return Promise.resolve();});
 identity.setActiveOwnerInternal('user:bob');await flush();expect(sdk.channels.map(c=>c.name)).toEqual(['notif-deliveries-alice','notif-inserts-alice','notif-deliveries-carol','notif-inserts-carol']);expect(sdk.removeChannel.mock.calls.map(c=>c[0])).toEqual(old);
});
it('does not duplicate channels or owner watchers for the same callback',async()=>{
 const identity=await import('@/lib/identity/owner');identity.setActiveOwnerInternal('user:alice');sdk.getUser.mockResolvedValue({data:{user:{id:'alice'}}});
 const {subscribeToMyNotifications}=await import('@/lib/notifications/server');const listener=vi.fn(),a=subscribeToMyNotifications(listener),b=subscribeToMyNotifications(listener);releases.push(a,b);await flush();
 expect(sdk.channels).toHaveLength(2);expect(sdk.getUser).toHaveBeenCalledTimes(1);
 sdk.getUser.mockResolvedValue({data:{user:{id:'bob'}}});identity.setActiveOwnerInternal('user:bob');await flush();expect(sdk.channels).toHaveLength(4);expect(sdk.getUser).toHaveBeenCalledTimes(2);
 // Existing Set semantics: either registration's release removes that callback.
 a();b();expect(sdk.removeChannel).toHaveBeenCalledTimes(4);identity.setActiveOwnerInternal('user:carol');await flush();expect(sdk.getUser).toHaveBeenCalledTimes(2);
});

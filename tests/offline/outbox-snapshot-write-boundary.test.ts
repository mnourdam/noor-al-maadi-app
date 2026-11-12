import { beforeEach, afterEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  options: null as any, handler: null as any, request: null as any,
  claims: vi.fn(), rpc: vi.fn(), client: vi.fn(), legacyWrite: vi.fn(), open: vi.fn(), write: vi.fn(), sync: vi.fn(), close: vi.fn(), rename: vi.fn(), unlink: vi.fn(),
  target: "original-snapshot", temporary: "", sequence: [] as string[],
}));
// Observe the real builder and execute its middleware/handler callbacks. This
// does not test compiled HTTP dispatch; all auth clients and filesystem calls
// are replaced, and no network or disk writes are possible in this suite.
vi.mock("@tanstack/react-start", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-start")>();
  const observe = (builder: any): any => new Proxy(builder, { get(target, key) {
    if (key === "middleware" || key === "validator") return (...args: unknown[]) => observe(target[key](...args));
    if (key === "handler") return (...args: unknown[]) => { state.options=target.options; state.handler=args[0]; return target.handler(...args); };
    return Reflect.get(target,key);
  } });
  return {...actual,createServerFn:(...args:Parameters<typeof actual.createServerFn>) => observe(actual.createServerFn(...args))};
});
vi.mock("@tanstack/react-start/server", () => ({ getRequest: () => state.request }));
vi.mock("@supabase/supabase-js", () => ({ createClient: (...args: unknown[]) => {
  state.client(...args); return {auth:{getClaims:state.claims},rpc:state.rpc};
} }));
vi.mock("node:fs/promises", () => ({open:state.open,rename:state.rename,unlink:state.unlink,writeFile:state.legacyWrite}));
vi.mock("node:crypto", () => ({ randomUUID: () => "synthetic-test-uuid" }));
import { writeBundledSnapshotFile } from "@/lib/offline-snapshot-write.functions";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
void writeBundledSnapshotFile;

async function invoke(payload: unknown = {json:'{"items":[]}'}): Promise<any> {
  const middleware=state.options.middleware ?? [];
  const next = async (index: number, context: any): Promise<any> => index < middleware.length
    ? middleware[index].options.server({context,next: (extra:any={}) => next(index+1,{...context,...extra.context})})
    : state.handler({data:state.options.validator(payload),context});
  return next(0,{});
}
function expectNoIO() { expect(state.legacyWrite).not.toHaveBeenCalled(); expect(state.open).not.toHaveBeenCalled(); expect(state.rename).not.toHaveBeenCalled(); expect(state.unlink).not.toHaveBeenCalled(); }
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("NODE_ENV","development");
  vi.stubEnv("SUPABASE_URL","https://synthetic.invalid"); vi.stubEnv("SUPABASE_PUBLISHABLE_KEY","synthetic-not-a-key");
  state.request={headers:new Headers({authorization:"Bearer synthetic-not-a-token"})};
  state.claims.mockResolvedValue({data:{claims:{sub:"synthetic-manager"}},error:null});
  state.rpc.mockResolvedValue({data:true,error:null}); state.target="original-snapshot";state.temporary="";state.sequence=[];
  state.legacyWrite.mockImplementation(async (_path:string,text:string) => {state.target=text;});
  state.open.mockImplementation(async () => {state.sequence.push("open");return {writeFile:state.write,sync:state.sync,close:state.close};});
  state.write.mockImplementation(async (text:string) => {state.sequence.push("write");state.temporary=text;});
  state.sync.mockImplementation(async () => {state.sequence.push("sync");});
  state.close.mockImplementation(async () => {state.sequence.push("close");});
  state.rename.mockImplementation(async () => {state.sequence.push("rename");state.target=state.temporary;state.temporary="";});
  state.unlink.mockImplementation(async () => {state.sequence.push("unlink");state.temporary="";});
});
afterEach(() => vi.unstubAllEnvs());
it("installs development guard before the existing authenticated middleware", () => {
  expect(state.options.middleware).toHaveLength(2);
  expect(state.options.middleware[1]).toBe(requireSupabaseAuth);
});
it.each([undefined,"production","test","preview","Development",""])("denies NODE_ENV %s before auth or filesystem", async (env) => {
  if(env===undefined) delete process.env.NODE_ENV; else vi.stubEnv("NODE_ENV",env);
  await expect(invoke()).rejects.toThrow("snapshot_write_disabled"); expect(state.client).not.toHaveBeenCalled();expect(state.rpc).not.toHaveBeenCalled();expectNoIO();
});
it("denies unauthenticated development requests before manager query or IO", async () => {
  state.request={headers:new Headers()}; await expect(invoke()).rejects.toThrow("Unauthorized");expect(state.client).not.toHaveBeenCalled();expect(state.rpc).not.toHaveBeenCalled();expectNoIO();
});
it("denies invalid verified claims before manager query or IO", async () => {
  state.claims.mockResolvedValue({data:null,error:{message:"invalid"}}); await expect(invoke()).rejects.toThrow("Unauthorized");expect(state.rpc).not.toHaveBeenCalled();expectNoIO();
});
it.each([false,null,"true",{role:"owner"}])("requires literal manager true, not %s", async (manager) => {
  state.rpc.mockResolvedValue({data:manager,error:null});await expect(invoke()).rejects.toThrow("snapshot_write_forbidden");expectNoIO();
});
it("fails closed on permission RPC errors", async () => {
  state.rpc.mockResolvedValue({data:true,error:{message:"failure"}});await expect(invoke()).rejects.toThrow("snapshot_write_forbidden");expectNoIO();
});
it("fails closed when permission request rejects", async () => {
  state.rpc.mockRejectedValue(new Error("offline"));await expect(invoke()).rejects.toThrow("snapshot_write_forbidden");expectNoIO();
});
it("rechecks development after awaited permission response", async () => {
  state.rpc.mockImplementation(async () => {process.env.NODE_ENV="production";return {data:true,error:null};});await expect(invoke()).rejects.toThrow("snapshot_write_disabled");expectNoIO();
});
it.each([null,{}, {json:""},{json:"{"},{json:"undefined"},{json:5}])("rejects invalid payload %j before writes", async payload => {
  await expect(invoke(payload)).rejects.toThrow();expectNoIO();
});
it("bounds UTF-8 bytes, not merely JavaScript character count", async () => {
  const json='"'+"ا".repeat(26*1024*1024)+'"';
  expect(json.length).toBeLessThan(50*1024*1024);expect(()=>state.options.validator({json})).toThrow("too_large");expectNoIO();
});
it.each(['{"items":[]}',"null",'"نص"',"[1,2]"])("allows authenticated manager valid JSON %s without inventing schema", async json => {
  const result=await invoke({json}); expect(state.rpc).toHaveBeenCalledWith("is_user_manager");expect(state.target).toBe(json);
  expect(state.sequence).toEqual(["open","write","sync","close","rename"]);
  const temp=state.open.mock.calls[0][0], target=state.rename.mock.calls[0][1];
  expect(temp).toMatch(/\/public\/\.offline-snapshot\.synthetic-test-uuid\.tmp$/); expect(target).toMatch(/\/public\/offline-snapshot\.json$/);
  expect(state.open).toHaveBeenCalledWith(temp,"wx",0o600);expect(state.rename).toHaveBeenCalledWith(temp,target);
  expect(result).toEqual({ok:true,path:target,bytes:new TextEncoder().encode(json).byteLength});expect(state.unlink).not.toHaveBeenCalled();
});
it("failed exclusive create never deletes someone else's temp", async () => {
  state.temporary="another-writer";state.open.mockRejectedValue(new Error("EEXIST"));await expect(invoke()).rejects.toThrow("EEXIST");
  expect(state.unlink).not.toHaveBeenCalled();expect(state.temporary).toBe("another-writer");expect(state.target).toBe("original-snapshot");
});
it.each(["write","sync","close","rename"] as const)("%s failure preserves old target and cleans only owned temp", async failure => {
  state[failure].mockRejectedValue(new Error(failure));await expect(invoke()).rejects.toThrow(failure);
  expect(state.target).toBe("original-snapshot");expect(state.unlink).toHaveBeenCalledWith(state.open.mock.calls[0][0]);
  if(failure!=="close" && failure!=="rename")expect(state.close).toHaveBeenCalledTimes(1);
});
it("cleanup failure does not conceal the original write failure", async () => {
  state.write.mockRejectedValue(new Error("write"));state.unlink.mockRejectedValue(new Error("cleanup"));await expect(invoke()).rejects.toThrow("write");expect(state.target).toBe("original-snapshot");
});

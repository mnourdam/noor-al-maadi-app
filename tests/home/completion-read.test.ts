import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(()=>({owner:"user:A",epoch:0,result:{data:[] as unknown[],error:null as unknown},query:vi.fn()}));
vi.mock("@/lib/identity/owner",()=>({getActiveOwner:()=>state.owner,getIdentityEpoch:()=>state.epoch}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{from:()=>({select:()=>({eq:()=>({abortSignal:(signal:AbortSignal)=>state.query(signal)})})})}}));
import {readHomeCompletionIds} from "@/lib/stats/home-completion-read";
beforeEach(()=>{state.owner="user:A";state.epoch=0;state.result={data:[],error:null};state.query.mockReset().mockImplementation(async()=>state.result);});
describe("strict Home completion reads",()=>{
 it.each(["campaigns","stories"] as const)("accepts real zero %s",async kind=>{expect(await readHomeCompletionIds(kind,"A","user:A",0,new AbortController().signal)).toEqual([]);});
 it.each(["campaigns","stories"] as const)("throws server failure %s instead of returning zero",async kind=>{state.result.error={message:"network"};await expect(readHomeCompletionIds(kind,"A","user:A",0,new AbortController().signal)).rejects.toThrow();});
 it("rejects malformed payload",async()=>{state.result.data=null as never;await expect(readHomeCompletionIds("stories","A","user:A",0,new AbortController().signal)).rejects.toThrow();});
 it("matches canonical campaign normalization and story ID preservation",async()=>{state.result.data=[{campaign_id:" Foo Bar "},{campaign_id:"Foo Bar"}];expect(await readHomeCompletionIds("campaigns","A","user:A",0,new AbortController().signal)).toEqual(["foo bar","foo-bar"]);state.result.data=[{story_id:"StoryID"}];expect(await readHomeCompletionIds("stories","A","user:A",0,new AbortController().signal)).toEqual(["StoryID"]);});
 it.each(["abort","switch","aba"])("rejects late %s response",async mode=>{let resolve!:(x:unknown)=>void;state.query.mockImplementation(()=>new Promise(r=>{resolve=r;}));const controller=new AbortController();const promise=readHomeCompletionIds("stories","A","user:A",0,controller.signal);if(mode==="abort")controller.abort();else {state.epoch++;if(mode==="switch")state.owner="user:B";}resolve({data:[{story_id:"secret"}],error:null});await expect(promise).rejects.toThrow();});
 it("rejects uid and owner mismatch before network",async()=>{await expect(readHomeCompletionIds("stories","B","user:A",0,new AbortController().signal)).rejects.toThrow();expect(state.query).not.toHaveBeenCalled();});
});

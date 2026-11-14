import React from 'react';
import { Blob as NodeBlob } from 'node:buffer';
import { render, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import { it, expect, vi, beforeEach, afterEach } from 'vitest';
const sdk=vi.hoisted(()=>({session:vi.fn(),from:vi.fn(),download:vi.fn(),create:vi.fn(),revoke:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{auth:{getSession:sdk.session},storage:{from:sdk.from}}}));
// Neither the component nor its actual download/validation functions are mocked.
import { FeedbackImages } from '@/components/feedback/FeedbackImages';
import { getActiveUserId, getIdentityEpoch, setActiveOwnerInternal } from '@/lib/identity/owner';
const owner='11111111-1111-4111-8111-111111111111',other='44444444-4444-4444-8444-444444444444';
const id='33333333-3333-4333-8333-333333333333';
const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWNQSusAAAG+AREbRSghAAAAAElFTkSuQmCC','base64');
const blob=(data:Uint8Array=bytes,mime='image/png')=>new NodeBlob([data],{type:mime}) as unknown as Blob;
const attachment={id,path:`${owner}/22222222-2222-4222-8222-222222222222/${id}`,mime:'image/png',bytes:bytes.length};
beforeEach(()=>{
 vi.resetAllMocks();setActiveOwnerInternal(`user:${owner}`);
 sdk.session.mockImplementation(async()=>({data:{session:{user:{id:getActiveUserId()}}},error:null}));
 sdk.from.mockReturnValue({download:sdk.download});sdk.download.mockResolvedValue({data:blob(),error:null});
 sdk.create.mockReturnValue('blob:isolated-image');vi.stubGlobal('URL',class extends URL {static createObjectURL=sdk.create;static revokeObjectURL=sdk.revoke;});
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('explicit click joins actual downloader validation to renderer and revokes on unmount',async()=>{
 const exact=blob();sdk.download.mockResolvedValue({data:exact,error:null});const v=render(<FeedbackImages attachments={[attachment]}/>);
 expect(sdk.download).not.toHaveBeenCalled();expect(sdk.session).not.toHaveBeenCalled();
 fireEvent.click(v.getByRole('button'));await waitFor(()=>expect(v.getByRole('img').getAttribute('src')).toBe('blob:isolated-image'));
 expect(sdk.from).toHaveBeenCalledExactlyOnceWith('feedback-images');expect(sdk.download).toHaveBeenCalledExactlyOnceWith(attachment.path);
 expect(sdk.create).toHaveBeenCalledExactlyOnceWith(exact);expect(sdk.session).toHaveBeenCalledTimes(3);
 v.unmount();expect(sdk.revoke).toHaveBeenCalledExactlyOnceWith('blob:isolated-image');
});
it.each(['mime','size','signature'] as const)('invalid %s is not displayed and same-owner retry validates exact bytes',async(kind)=>{
 const bad=kind==='mime'?blob(bytes,'image/jpeg'):kind==='size'?blob(bytes.subarray(0,-1)):blob(new Uint8Array(bytes.length));
 const good=blob();sdk.download.mockResolvedValueOnce({data:bad,error:null}).mockResolvedValueOnce({data:good,error:null});
 const v=render(<FeedbackImages attachments={[attachment]}/>);fireEvent.click(v.getByRole('button'));
 await waitFor(()=>expect(v.getByRole('button').textContent).toBe('تعذر التحميل؛ حاول مجدداً'));
 expect(v.queryByRole('img')).toBeNull();expect(sdk.create).not.toHaveBeenCalled();
 fireEvent.click(v.getByRole('button'));await waitFor(()=>expect(v.getByRole('img')).toBeTruthy());
 expect(sdk.create).toHaveBeenCalledExactlyOnceWith(good);expect(sdk.download).toHaveBeenCalledTimes(2);
 expect(sdk.download.mock.calls.every(([path])=>path===attachment.path)).toBe(true);
});
it.each(['switch','ABA'] as const)('pending actual download cannot create a URL after %s retirement',async(mode)=>{
 let resolve!:(value:{data:Blob,error:null})=>void;const pending=new Promise<{data:Blob,error:null}>(r=>{resolve=r;});sdk.download.mockReturnValueOnce(pending);
 const v=render(<FeedbackImages attachments={[attachment]}/>);fireEvent.click(v.getByRole('button'));await waitFor(()=>expect(sdk.download).toHaveBeenCalledTimes(1));
 const epoch=getIdentityEpoch();act(()=>{setActiveOwnerInternal(mode==='switch'?`user:${other}`:'guest:test');if(mode==='ABA')setActiveOwnerInternal(`user:${owner}`);});
 expect(getIdentityEpoch()).toBeGreaterThan(epoch);if(mode==='ABA')expect(getActiveUserId()).toBe(owner);
 await act(async()=>{resolve({data:blob(),error:null});await pending;});
 expect(sdk.create).not.toHaveBeenCalled();expect(v.queryByRole('img')).toBeNull();expect(sdk.download).toHaveBeenCalledTimes(1);
});
it('loaded image is revoked when actual owner notification remounts the scope',async()=>{
 const v=render(<FeedbackImages attachments={[attachment]}/>);fireEvent.click(v.getByRole('button'));await waitFor(()=>expect(v.getByRole('img')).toBeTruthy());
 act(()=>setActiveOwnerInternal(`user:${other}`));expect(v.queryByRole('img')).toBeNull();expect(sdk.revoke).toHaveBeenCalledExactlyOnceWith('blob:isolated-image');expect(sdk.download).toHaveBeenCalledTimes(1);
});
it('invalid descriptors are filtered before any session or Storage call',()=>{
 const v=render(<FeedbackImages attachments={[{...attachment,path:'https://invalid.example/image'},{...attachment,path:`${owner}/${id}`},{...attachment,mime:'image/svg+xml'}]}/>);
 expect(v.queryByRole('button')).toBeNull();expect(v.queryByRole('img')).toBeNull();expect(sdk.session).not.toHaveBeenCalled();expect(sdk.from).not.toHaveBeenCalled();expect(sdk.download).not.toHaveBeenCalled();expect(sdk.create).not.toHaveBeenCalled();
});

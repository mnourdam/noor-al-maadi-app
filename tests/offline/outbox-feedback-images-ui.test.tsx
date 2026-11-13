// Newly reconstructed recovery tests; not claimed byte-identical to lost suite.
import React from 'react';
import {render,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {it,expect,vi,beforeEach,afterEach} from 'vitest';
const api=vi.hoisted(()=>({enabled:true,reply:vi.fn(),prepare:vi.fn(),send:vi.fn(),scope:'one',draft:vi.fn()}));
vi.mock('@/lib/feedback/api',()=>({replyToIssue:api.reply}));
vi.mock('@/lib/feedback/images',()=>({currentImageScope:()=>api.scope,get feedbackImagesEnabled(){return api.enabled},FEEDBACK_IMAGE_COUNT:3,prepareFeedbackImage:api.prepare,sendFeedbackImages:api.send,makeImageDraft:api.draft}));
import {FeedbackReplyComposer} from '@/components/feedback/FeedbackReplyComposer';
beforeEach(()=>{vi.resetAllMocks();api.enabled=true;api.scope='one';api.prepare.mockResolvedValue({id:'image',blob:new Blob(['a']),uploaded:false});api.draft.mockImplementation((issueId,body,internal,images)=>({id:'stable',issueId,body,internal,images}));api.send.mockResolvedValue(undefined);api.reply.mockResolvedValue(undefined);});
afterEach(cleanup);
async function pick(v:ReturnType<typeof render>){fireEvent.change(v.getByLabelText('إرفاق صور بالمحادثة'),{target:{files:[new File(['x'],'x.jpg')]}});await waitFor(()=>expect(v.getByLabelText('إزالة الصورة 1')).toBeTruthy());}
it('preserves text-only reply path',async()=>{const done=vi.fn();const v=render(<FeedbackReplyComposer issueId='thread' onSent={done}/>);fireEvent.change(v.getByLabelText('نص الرد'),{target:{value:' hi '}});fireEvent.submit(v.container.querySelector('form')!);await waitFor(()=>expect(api.reply).toHaveBeenCalledWith('thread','hi',false));expect(api.send).not.toHaveBeenCalled();});
it('sends image-only after explicit submission',async()=>{const v=render(<FeedbackReplyComposer issueId='thread' onSent={()=>{}}/>);await pick(v);expect(api.send).not.toHaveBeenCalled();fireEvent.submit(v.container.querySelector('form')!);await waitFor(()=>expect(api.send).toHaveBeenCalledTimes(1));});
it('freezes uncertain draft and retries same object',async()=>{api.send.mockRejectedValueOnce(new Error('uncertain'));const v=render(<FeedbackReplyComposer issueId='thread' onSent={()=>{}}/>);await pick(v);fireEvent.submit(v.container.querySelector('form')!);await waitFor(()=>expect(v.getByRole('alert')).toBeTruthy());expect((v.getByLabelText('نص الرد') as HTMLTextAreaElement).disabled).toBe(true);fireEvent.submit(v.container.querySelector('form')!);await waitFor(()=>expect(api.send).toHaveBeenCalledTimes(2));expect(api.send.mock.calls[0][0]).toBe(api.send.mock.calls[1][0]);});
it('locks duplicate synchronous submissions',async()=>{api.send.mockReturnValue(new Promise(()=>{}));const v=render(<FeedbackReplyComposer issueId='thread' onSent={()=>{}}/>);await pick(v);fireEvent.submit(v.container.querySelector('form')!);fireEvent.submit(v.container.querySelector('form')!);expect(api.send).toHaveBeenCalledTimes(1);});
it('invalidates captured send predicate after unmount',async()=>{api.send.mockReturnValue(new Promise(()=>{}));const v=render(<FeedbackReplyComposer issueId='thread' onSent={()=>{}}/>);await pick(v);fireEvent.submit(v.container.querySelector('form')!);const alive=api.send.mock.calls[0][1];expect(alive()).toBe(true);v.unmount();expect(alive()).toBe(false);});
it('preserves staff internal choice',async()=>{const v=render(<FeedbackReplyComposer issueId='thread' staff onSent={()=>{}}/>);await pick(v);fireEvent.click(v.getByRole('checkbox'));fireEvent.submit(v.container.querySelector('form')!);expect(api.draft).toHaveBeenCalledWith('thread','',true,expect.any(Array));});
it('rejects more than three selected images before preparation',()=>{const v=render(<FeedbackReplyComposer issueId='thread' onSent={()=>{}}/>);fireEvent.change(v.getByLabelText('إرفاق صور بالمحادثة'),{target:{files:Array.from({length:4},()=>new File(['x'],'x.jpg'))}});expect(v.getByRole('alert')).toBeTruthy();expect(api.prepare).not.toHaveBeenCalled();});

it('OFF picker preserves internal text failure draft and committed reply refresh failure without image calls',async()=>{
  api.enabled=false;
  api.reply.mockRejectedValueOnce(new Error('send failed'));
  const done=vi.fn().mockRejectedValueOnce(new Error('refresh failed'));
  const v=render(<FeedbackReplyComposer issueId='staff-thread' staff onSent={done}/>);
  expect(v.queryByLabelText('إرفاق صور بالمحادثة')).toBeNull();
  const input=v.getByLabelText('نص الرد') as HTMLTextAreaElement;
  fireEvent.change(input,{target:{value:' internal message '}});fireEvent.click(v.getByRole('checkbox'));
  fireEvent.submit(v.container.querySelector('form')!);
  await waitFor(()=>expect(v.getByRole('alert').textContent).toBe('send failed'));
  expect(input.value).toBe(' internal message ');expect(done).not.toHaveBeenCalled();
  expect(api.reply).toHaveBeenLastCalledWith('staff-thread','internal message',true);
  fireEvent.submit(v.container.querySelector('form')!);
  await waitFor(()=>expect(v.getByRole('alert').textContent).toBe('تم إرسال الرسالة؛ تعذر تحديث المحادثة الآن'));
  expect(api.reply).toHaveBeenCalledTimes(2);expect(done).toHaveBeenCalledTimes(1);expect(input.value).toBe('');
  expect(api.prepare).not.toHaveBeenCalled();expect(api.draft).not.toHaveBeenCalled();expect(api.send).not.toHaveBeenCalled();
});

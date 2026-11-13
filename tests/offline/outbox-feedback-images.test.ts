// Recovery: retained prefix; subsequent cases newly reconstructed.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Blob as NodeBlob } from "node:buffer";
const sdk = vi.hoisted(() => ({
  rpc: vi.fn(),
  session: vi.fn(),
  upload: vi.fn(),
  download: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: sdk.session },
    rpc: sdk.rpc,
    storage: { from: () => ({ upload: sdk.upload, download: sdk.download }) },
  },
}));
import { setActiveOwnerInternal } from "@/lib/identity/owner";
import {
  makeImageDraft,
  sendFeedbackImages,
  parseFeedbackImage,
  validateImageFile,
  FEEDBACK_IMAGE_LIMIT,
  downloadFeedbackImage,
} from "@/lib/feedback/images";
const uid = "11111111-1111-4111-8111-111111111111",
  issue = "22222222-2222-4222-8222-222222222222",
  id = "33333333-3333-4333-8333-333333333333";
const blob = () =>
  new NodeBlob([new Uint8Array([255, 216, 255, 0, 1])], { type: "image/jpeg" }) as unknown as Blob;
const draft = () => makeImageDraft(issue, "hello", false, [{ id, blob: blob(), uploaded: false }]);
beforeEach(() => {
  vi.resetAllMocks();
  setActiveOwnerInternal(`user:${uid}`);
  sdk.session.mockResolvedValue({ data: { session: { user: { id: uid } } }, error: null });
  sdk.upload.mockResolvedValue({ error: null });
  sdk.rpc.mockImplementation(async (name, args) =>
    name === "reserve_feedback_image"
      ? { data: `${uid}/${issue}/${args.p_id}`, error: null }
      : { data: args.p_message_id, error: null },
  );
});
describe("private feedback images", () => {
  it("validates image magic and rejects SVG/mime spoof/empty/oversize", async () => {
    await expect(validateImageFile(blob())).resolves.toBeUndefined();
    for (const b of [
      new NodeBlob(["<svg/>"], { type: "image/svg+xml" }),
      new NodeBlob(["<html>"], { type: "image/jpeg" }),
      new NodeBlob([], { type: "image/jpeg" }),
      new NodeBlob([new Uint8Array(FEEDBACK_IMAGE_LIMIT + 1)], { type: "image/jpeg" }),
    ])
      await expect(validateImageFile(b as unknown as Blob)).rejects.toThrow();
  });
  it("rejects arbitrary URL/path descriptors", () => {
    const good = { id, path: `${uid}/${issue}/${id}`, mime: "image/jpeg", bytes: 5 };
    expect(parseFeedbackImage(good)).toEqual(good);
    for (const path of ["https://evil/image", "../x", `${uid}/${issue}/${id}?x=1`])
      expect(parseFeedbackImage({ ...good, path })).toBeNull();
    expect(parseFeedbackImage({ ...good, mime: "image/svg+xml" })).toBeNull();
  });
  it("uploads without replacement then idempotently commits exact images", async () => {
    const d = draft();
    await sendFeedbackImages(d);
    expect(sdk.upload).toHaveBeenCalledWith(`${uid}/${issue}/${id}`, expect.anything(), {contentType:'image/jpeg',upsert:false});
    expect(sdk.rpc).toHaveBeenLastCalledWith('reply_with_feedback_images',expect.objectContaining({p_message_id:d.id,p_image_ids:[id]}));
  });
  it('retries uncertain finalization without uploading again',async()=>{
    const d=draft();sdk.rpc.mockImplementationOnce(async()=>({data:`${uid}/${issue}/${id}`,error:null})).mockImplementationOnce(async()=>({error:new Error('lost')}));
    await expect(sendFeedbackImages(d)).rejects.toThrow('lost');await sendFeedbackImages(d);expect(sdk.upload).toHaveBeenCalledTimes(1);
  });
  it('accepts only immutable conflict then requires server finalization',async()=>{
    sdk.upload.mockResolvedValue({error:{statusCode:'409'}});await sendFeedbackImages(draft());expect(sdk.rpc).toHaveBeenCalledTimes(2);
  });
  it('rejects changed identity before any work',async()=>{
    const d=draft();setActiveOwnerInternal('user:bob');await expect(sendFeedbackImages(d)).rejects.toThrow();expect(sdk.rpc).not.toHaveBeenCalled();
  });
  it('rejects mismatched authenticated session',async()=>{
    sdk.session.mockResolvedValue({data:{session:{user:{id:'bob'}}},error:null});await expect(sendFeedbackImages(draft())).rejects.toThrow();expect(sdk.upload).not.toHaveBeenCalled();
  });
  it('retires scope during reservation and does not upload',async()=>{
    sdk.rpc.mockImplementation(async()=>{setActiveOwnerInternal('user:bob');return {data:`${uid}/${issue}/${id}`,error:null};});await expect(sendFeedbackImages(draft())).rejects.toThrow();expect(sdk.upload).not.toHaveBeenCalled();
  });
  it('closed conversation cannot submit',async()=>{await expect(sendFeedbackImages(draft(),()=>false)).rejects.toThrow();expect(sdk.rpc).not.toHaveBeenCalled();});
  it('downloads only matching bytes',async()=>{
    sdk.download.mockResolvedValue({data:blob(),error:null});await expect(downloadFeedbackImage({id,path:`${uid}/${issue}/${id}`,mime:'image/jpeg',bytes:5})).resolves.toBeTruthy();
    await expect(downloadFeedbackImage({id,path:`${uid}/${issue}/${id}`,mime:'image/jpeg',bytes:6})).rejects.toThrow();
  });
  it('rejects invalid returned reservation path',async()=>{sdk.rpc.mockResolvedValue({data:'https://evil',error:null});await expect(sendFeedbackImages(draft())).rejects.toThrow();expect(sdk.upload).not.toHaveBeenCalled();});
});
it('retires download during byte validation',async()=>{
 const good=blob();const retired={type:good.type,size:good.size,slice:()=>({arrayBuffer:async()=>{setActiveOwnerInternal('user:bob');return good.arrayBuffer();}})} as unknown as Blob;
 sdk.download.mockResolvedValue({data:retired,error:null});await expect(downloadFeedbackImage({id,path:`${uid}/${issue}/${id}`,mime:'image/jpeg',bytes:5})).rejects.toThrow();
});
it('rejects A to B to A identity epoch change during reservation',async()=>{
 const d=draft();sdk.rpc.mockImplementation(async()=>{setActiveOwnerInternal('user:bob');setActiveOwnerInternal(`user:${uid}`);return {data:`${uid}/${issue}/${id}`,error:null};});
 await expect(sendFeedbackImages(d)).rejects.toThrow();expect(sdk.upload).not.toHaveBeenCalled();
});
it('does not finalize after nonconflict upload failure',async()=>{
 sdk.upload.mockResolvedValue({error:new Error('upload failed')});await expect(sendFeedbackImages(draft())).rejects.toThrow('upload failed');expect(sdk.rpc).toHaveBeenCalledTimes(1);
});

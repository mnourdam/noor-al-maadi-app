import React from "react";
import { render, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import { it, expect, vi, beforeEach, afterEach } from "vitest";
const api = vi.hoisted(() => ({ download: vi.fn(), create: vi.fn(), revoke: vi.fn() }));
vi.mock("@/lib/feedback/images", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/feedback/images")>();
  return { ...actual, downloadFeedbackImage: api.download };
});
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { FeedbackImages } from "@/components/feedback/FeedbackImages";
import { setActiveOwnerInternal } from "@/lib/identity/owner";
const id = "33333333-3333-4333-8333-333333333333";
const attachment = {
  id,
  path: `11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/${id}`,
  mime: "image/jpeg",
  bytes: 5,
};
beforeEach(() => {
  vi.resetAllMocks();
  setActiveOwnerInternal("user:alice");
  api.download.mockResolvedValue(new Blob(["fixture"], { type: "image/jpeg" }));
  api.create.mockReturnValue("blob:synthetic");
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL = api.create;
      static revokeObjectURL = api.revoke;
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("requires explicit action, renders local URL then revokes on unmount", async () => {
  const v = render(<FeedbackImages attachments={[attachment]} />);
  expect(api.download).not.toHaveBeenCalled();
  fireEvent.click(v.getByRole("button"));
  await waitFor(() =>
    expect(v.getByAltText("صورة مرفقة بالمحادثة").getAttribute("src")).toBe("blob:synthetic"),
  );
  v.unmount();
  expect(api.revoke).toHaveBeenCalledWith("blob:synthetic");
});
it.each([false, true])(
  "does not create image URLs after a retired download, unmount=%s",
  async (unmount) => {
    let resolve!: (v: Blob) => void;
    api.download.mockReturnValue(new Promise<Blob>((r) => (resolve = r)));
    const v = render(<FeedbackImages attachments={[attachment]} />);
    fireEvent.click(v.getByRole("button"));
    if (unmount) v.unmount();
    else act(() => setActiveOwnerInternal("user:bob"));
    await act(async () => resolve(new Blob(["fixture"])));
    expect(api.create).not.toHaveBeenCalled();
    expect(v.queryByRole("img")).toBeNull();
  },
);
it("revokes a visible URL on account change", async () => {
  const v = render(<FeedbackImages attachments={[attachment]} />);
  fireEvent.click(v.getByRole("button"));
  await waitFor(() => expect(v.getByRole("img")).toBeTruthy());
  act(() => setActiveOwnerInternal("user:bob"));
  expect(v.queryByRole("img")).toBeNull();
  expect(api.revoke).toHaveBeenCalledWith("blob:synthetic");
});
it("renders no remote HTML, SVG or malformed attachments", () => {
  const v = render(
    <FeedbackImages
      attachments={[
        { ...attachment, path: "https://attacker/image" },
        { ...attachment, mime: "image/svg+xml" },
        null,
      ]}
    />,
  );
  expect(v.queryByRole("button")).toBeNull();
  expect(api.download).not.toHaveBeenCalled();
  v.rerender(<FeedbackImages attachments={{ bad: true } as unknown as unknown[]} />);
  expect(v.queryByRole("button")).toBeNull();
});

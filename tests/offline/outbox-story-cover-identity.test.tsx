import React from "react";
import { renderHook, waitFor, cleanup, act } from "@testing-library/react";
import { it, expect, vi, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const m = vi.hoisted(() => ({ rpc: vi.fn(), resolve: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: m.rpc } }));
vi.mock("@/lib/stories/media/url", () => ({ resolveCachedStoryMediaUrl: m.resolve }));
import { useStoryCoverSrc } from "@/lib/stories/covers/resolve";
import { packagedCoverMediaId, localStoryCoverPath } from "@/lib/stories/covers/offline-pack";
const id = "story_abdallah_ibn_yasin_the_man_who_began_from_a_ribat";
let client: QueryClient;
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  m.rpc.mockReset();
  m.resolve.mockReset();
  m.rpc.mockResolvedValue({
    data: {
      ok: true,
      media: [
        {
          id: "new-media",
          storage_path: "new.webp",
          storage_bucket: "story-media",
          processing_version: 1,
        },
      ],
    },
    error: null,
  });
  m.resolve.mockResolvedValue("/new.webp");
});
afterEach(() => {
  cleanup();
  client.clear();
});
const wrapper = ({ children }: any) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
it.each([1, 2])("changed media ID rejects old pack even version %s", async (version) => {
  const { result, rerender } = renderHook(
    ({ media, v }) => useStoryCoverSrc({ id, cover_media_id: media, content_version: v }),
    { wrapper, initialProps: { media: packagedCoverMediaId(id)!, v: 1 } },
  );
  expect(result.current).toBe(localStoryCoverPath(id));
  rerender({ media: "new-media", v: version });
  await waitFor(() => expect(result.current).toBe("/new.webp"), { timeout: 200 });
  expect(m.rpc).toHaveBeenCalledTimes(1);
});
it("remote switch with same storage path but changed bucket resolves new row", async () => {
  m.rpc.mockImplementation(async (_n, args) => ({
    data: {
      ok: true,
      media: [
        {
          id: "new-media",
          storage_path: "same.webp",
          storage_bucket: args.p_story_id,
          processing_version: 1,
        },
      ],
    },
    error: null,
  }));
  m.resolve.mockImplementation(async (row) => "/" + row.storage_bucket + ".webp");
  const { result, rerender } = renderHook(
    ({ sid }) => useStoryCoverSrc({ id: sid, cover_media_id: "new-media", content_version: 1 }),
    { wrapper, initialProps: { sid: "remote-A" } },
  );
  await waitFor(() => expect(result.current).toBe("/remote-A.webp"));
  // Warm query cache makes the B row immediately available, exposing path-only effect deps.
  client.setQueryData(["story-cover-row:v3", "remote-B", "new-media"], {
    id: "new-media",
    storage_path: "same.webp",
    storage_bucket: "remote-B",
    processing_version: 1,
  });
  rerender({ sid: "remote-B" });
  await waitFor(() => expect(result.current).toBe("/remote-B.webp"), { timeout: 200 });
});
it("same remote row path changed processing version is resolved again", async () => {
  m.rpc.mockResolvedValue({
    data: {
      ok: true,
      media: [
        {
          id: "new-media",
          storage_path: "same.webp",
          storage_bucket: "bucket",
          processing_version: 1,
        },
      ],
    },
    error: null,
  });
  m.resolve.mockImplementation(async (row) => "/v" + row.processing_version + ".webp");
  const { result } = renderHook(
    () => useStoryCoverSrc({ id: "remote-A", cover_media_id: "new-media", content_version: 1 }),
    { wrapper },
  );
  await waitFor(() => expect(result.current).toBe("/v1.webp"));
  client.setQueryData(["story-cover-row:v3", "remote-A", "new-media"], {
    id: "new-media",
    storage_path: "same.webp",
    storage_bucket: "bucket",
    processing_version: 2,
  });
  await waitFor(() => expect(result.current).toBe("/v2.webp"), { timeout: 200 });
});
it("matching packaged ID keeps legitimate offline bundle with no request", () => {
  const { result } = renderHook(
    () => useStoryCoverSrc({ id, cover_media_id: packagedCoverMediaId(id), content_version: 1 }),
    { wrapper },
  );
  expect(result.current).toBe(localStoryCoverPath(id));
  expect(m.rpc).not.toHaveBeenCalled();
});
it("absent live media retains existing bundle policy rather than implying revocation", () => {
  const { result } = renderHook(
    () => useStoryCoverSrc({ id, cover_media_id: null, content_version: 1 }),
    { wrapper },
  );
  expect(result.current).toBe(localStoryCoverPath(id));
  expect(m.rpc).not.toHaveBeenCalled();
});
it("row media ID changes at the same path re-resolve and never show retired bytes", async () => {
  const row = (mid: string) => ({
    id: mid,
    storage_path: "same.webp",
    storage_bucket: "bucket",
    processing_version: 1,
  });
  client.setQueryData(["story-cover-row:v3", "remote-A", "new-media"], row("old-row"));
  let finish!: (v: string | null) => void;
  m.resolve.mockResolvedValueOnce("/old-row.webp").mockImplementationOnce(
    () =>
      new Promise((r) => {
        finish = r;
      }),
  );
  const { result } = renderHook(
    () => useStoryCoverSrc({ id: "remote-A", cover_media_id: "new-media", content_version: 1 }),
    { wrapper },
  );
  await waitFor(() => expect(result.current).toBe("/old-row.webp"));
  await act(async () => {
    client.setQueryData(["story-cover-row:v3", "remote-A", "new-media"], row("replacement-row"));
  });
  await waitFor(() => expect(m.resolve).toHaveBeenCalledTimes(2));
  expect(result.current).toBeNull();
  await act(async () => finish("/replacement.webp"));
  expect(result.current).toBe("/replacement.webp");
});
it("late retired resolver cannot overwrite a newer same-path cover", async () => {
  const row = (sid: string) => ({
    id: sid,
    storage_path: "same.webp",
    storage_bucket: "bucket",
    processing_version: 1,
  });
  for (const sid of ["remote-A", "remote-B"])
    client.setQueryData(["story-cover-row:v3", sid, "new-media"], row(sid));
  let oldFinish!: (v: string) => void;
  m.resolve.mockImplementation((r) =>
    r.id === "remote-A"
      ? new Promise((resolve) => {
          oldFinish = resolve;
        })
      : Promise.resolve("/B.webp"),
  );
  const { result, rerender } = renderHook(
    ({ sid }) => useStoryCoverSrc({ id: sid, cover_media_id: "new-media", content_version: 1 }),
    { wrapper, initialProps: { sid: "remote-A" } },
  );
  await waitFor(() => expect(m.resolve).toHaveBeenCalledTimes(1));
  rerender({ sid: "remote-B" });
  await waitFor(() => expect(result.current).toBe("/B.webp"));
  await act(async () => oldFinish("/late-A.webp"));
  expect(result.current).toBe("/B.webp");
});
it.each([null, undefined, ""])(
  "missing live media %s keeps unknown-version bundled compatibility",
  (media) => {
    const { result } = renderHook(
      () => useStoryCoverSrc({ id, cover_media_id: media, content_version: 900 }),
      { wrapper },
    );
    expect(result.current).toBe(localStoryCoverPath(id));
    expect(m.rpc).not.toHaveBeenCalled();
  },
);
it("matching mapped media with unknown version remains available offline after version bump", () => {
  const { result } = renderHook(
    () => useStoryCoverSrc({ id, cover_media_id: packagedCoverMediaId(id), content_version: 900 }),
    { wrapper },
  );
  expect(result.current).toBe(localStoryCoverPath(id));
  expect(m.rpc).not.toHaveBeenCalled();
});
it("null story masks an already resolved remote URL", async () => {
  const { result, rerender } = renderHook(
    ({ present }) =>
      useStoryCoverSrc(present ? { id: "remote-A", cover_media_id: "new-media" } : null),
    { wrapper, initialProps: { present: true } },
  );
  await waitFor(() => expect(result.current).toBe("/new.webp"));
  rerender({ present: false });
  expect(result.current).toBeNull();
});
it.each(["null", "reject"])(
  "new identity failure %s does not retain the old cover",
  async (mode) => {
    for (const sid of ["remote-A", "remote-B"])
      client.setQueryData(["story-cover-row:v3", sid, "new-media"], {
        id: sid,
        storage_path: "same.webp",
        storage_bucket: "bucket",
        processing_version: 1,
      });
    m.resolve
      .mockResolvedValueOnce("/A.webp")
      .mockImplementationOnce(() =>
        mode === "null" ? Promise.resolve(null) : Promise.reject(Error("synthetic")),
      );
    const { result, rerender } = renderHook(
      ({ sid }) => useStoryCoverSrc({ id: sid, cover_media_id: "new-media" }),
      { wrapper, initialProps: { sid: "remote-A" } },
    );
    await waitFor(() => expect(result.current).toBe("/A.webp"));
    rerender({ sid: "remote-B" });
    await waitFor(() => expect(m.resolve).toHaveBeenCalledTimes(2));
    expect(result.current).toBeNull();
  },
);
it("A-B-A resolver retirement keeps the last A even after both older completions", async () => {
  for (const sid of ["remote-A", "remote-B"])
    client.setQueryData(["story-cover-row:v3", sid, "new-media"], {
      id: sid, storage_path: "same.webp", storage_bucket: "bucket", processing_version: 1,
    });
  const finish: Array<(value: string) => void> = [];
  m.resolve.mockImplementation(() => new Promise<string>((resolve) => finish.push(resolve)));
  const { result, rerender } = renderHook(
    ({ sid }) => useStoryCoverSrc({ id: sid, cover_media_id: "new-media", content_version: 1 }),
    { wrapper, initialProps: { sid: "remote-A" } },
  );
  await waitFor(() => expect(finish).toHaveLength(1));
  rerender({ sid: "remote-B" });
  await waitFor(() => expect(finish).toHaveLength(2));
  rerender({ sid: "remote-A" });
  await waitFor(() => expect(finish).toHaveLength(3));
  expect(result.current).toBeNull();
  await act(async () => finish[2]("/last-A.webp"));
  expect(result.current).toBe("/last-A.webp");
  await act(async () => finish[1]("/retired-B.webp"));
  expect(result.current).toBe("/last-A.webp");
  await act(async () => finish[0]("/retired-first-A.webp"));
  expect(result.current).toBe("/last-A.webp");
  expect(m.rpc).not.toHaveBeenCalled();
});
it("content version re-resolves the same cached row without claiming server refresh", async () => {
  const row = { id: "same-row", storage_path: "same.webp", storage_bucket: "bucket", processing_version: 1 };
  client.setQueryData(["story-cover-row:v3", "remote-A", "new-media"], row);
  let finish!: (value: string) => void;
  m.resolve.mockResolvedValueOnce("/version-1.webp").mockImplementationOnce(
    () => new Promise<string>((resolve) => { finish = resolve; }),
  );
  const { result, rerender } = renderHook(
    ({ version }) => useStoryCoverSrc({ id: "remote-A", cover_media_id: "new-media", content_version: version }),
    { wrapper, initialProps: { version: 1 } },
  );
  await waitFor(() => expect(result.current).toBe("/version-1.webp"));
  rerender({ version: 2 });
  await waitFor(() => expect(m.resolve).toHaveBeenCalledTimes(2));
  expect(result.current).toBeNull();
  expect(m.resolve.mock.calls[0][0]).toEqual(row);
  expect(m.resolve.mock.calls[1][0]).toEqual(row);
  await act(async () => finish("/version-2.webp"));
  expect(result.current).toBe("/version-2.webp");
  expect(m.rpc).not.toHaveBeenCalled();
});

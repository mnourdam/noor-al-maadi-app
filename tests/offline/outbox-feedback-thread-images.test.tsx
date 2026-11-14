import React from "react";
import { render, fireEvent, waitFor, cleanup, within, act } from "@testing-library/react";
import { it, expect, vi, beforeEach, afterEach } from "vitest";
const api = vi.hoisted(() => ({
  get: vi.fn(),
  read: vi.fn(),
  reply: vi.fn(),
  rate: vi.fn(),
  user: vi.fn(),
  threadId: "thread-one",
  refresh: null as null | (() => void),
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  useParams: () => ({ id: api.threadId }),
  Link: ({ children, ...props }: any) => <a {...props}>{children}</a>,
}));
vi.mock("@/components/AppShell", () => ({
  AppShell: ({ children }: any) => <div>{children}</div>,
  Screen: ({ children }: any) => <section>{children}</section>,
}));
vi.mock("@/lib/feedback/api", () => ({
  getIssueThread: api.get,
  markIssueRead: api.read,
  replyToIssue: api.reply,
  rateIssue: api.rate,
}));
vi.mock("@/lib/feedback/usePresence", () => ({
  useFeedbackPresence: () => ({ otherOnline: false, otherTyping: false, markTyping: () => {} }),
}));
vi.mock("@/components/feedback/FeedbackPresenceBadge", () => ({
  FeedbackPresenceBadge: () => null,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: api.user },
    channel: () => ({
      on(_e: any, _f: any, cb: () => void) {
        api.refresh = cb;
        return this;
      },
      subscribe() {
        return this;
      },
    }),
    removeChannel: () => {},
  },
}));
import { Route } from "@/routes/feedback.$id";
import { setActiveOwnerInternal } from "@/lib/identity/owner";
const Thread = (Route as unknown as { options: { component: React.ComponentType } }).options
  .component;
function message(id: string, author: string, body: string, role = "player") {
  return {
    id,
    issue_id: api.threadId,
    author_id: author,
    body,
    author_role: role,
    created_at: "2026-11-12T00:00:00Z",
    is_internal: false,
    attachments: [],
  };
}
const issue = () => ({
  id: api.threadId,
  reporter_id: "alice",
  category: "bug",
  title: "fixture thread",
  status: "new",
  context: {},
  created_at: "2026-11-12T00:00:00Z",
});
beforeEach(() => {
  vi.resetAllMocks();
  api.threadId = "thread-one";
  setActiveOwnerInternal("user:alice");
  api.user.mockResolvedValue({ data: { user: { id: "alice" } } });
  api.read.mockResolvedValue(undefined);
  api.reply.mockResolvedValue(undefined);
  api.rate.mockResolvedValue(undefined);
});
afterEach(cleanup);
it("keeps legacy text attribution through staff reply, player follow-up, close and rating", async () => {
  let state = {
    issue: issue(),
    messages: [
      message("a", "alice", "initial"),
      message("a2", "alice", "second consecutive player reply", "admin"),
      message("b", "staff", "staff answer", "admin"),
      message("c", "alice", "legacy player follow-up", "admin"),
    ],
  };
  api.get.mockImplementation(async () => state);
  const v = render(<Thread />);
  await v.findByText("legacy player follow-up");
  for (const body of ["initial", "second consecutive player reply", "legacy player follow-up"]) {
    const bubble = within(v.getByText(body).closest("li")!);
    expect(bubble.getByText("أنت")).toBeTruthy();
    expect(bubble.queryByText("فريق إرث")).toBeNull();
  }
  expect(v.getByLabelText("نص الرد")).toBeTruthy();
  expect(v.queryByLabelText("إرفاق صور بالمحادثة")).toBeNull();
  expect(
    within(v.getByText("legacy player follow-up").closest("li")!).getByText("أنت"),
  ).toBeTruthy();
  expect(within(v.getByText("staff answer").closest("li")!).getByText("فريق إرث")).toBeTruthy();
  fireEvent.change(v.getByLabelText("نص الرد"), { target: { value: "new reply" } });
  fireEvent.submit(v.container.querySelector("form")!);
  await waitFor(() => expect(api.reply).toHaveBeenCalledWith("thread-one", "new reply", false));
  state = { ...state, issue: { ...state.issue, status: "closed" } };
  await act(async () => api.refresh?.());
  await v.findByText("هل ساعدك هذا الرد؟");
  expect(v.queryByLabelText("نص الرد")).toBeNull();
  fireEvent.click(v.getByRole("button", { name: "نعم" }));
  await waitFor(() => expect(api.rate).toHaveBeenCalledWith("thread-one", 5));
  await v.findByText("شكراً لتقييمك — يساعدنا على تحسين الدعم.");
});
it("presents two player replies, staff reply and player follow-up with per-message attribution", async () => {
  api.get.mockResolvedValue({ issue: issue(), messages: [
    message("p1", "alice", "sequence first"),
    message("p2", "alice", "sequence second"),
    message("s1", "staff", "sequence staff", "admin"),
    message("p3", "alice", "sequence follow-up"),
  ] });
  const v = render(<Thread />);
  await v.findByText("sequence follow-up");
  for (const body of ["sequence first", "sequence second", "sequence follow-up"]) {
    const bubble = within(v.getByText(body).closest("li")!);
    expect(bubble.getByText("أنت")).toBeTruthy();
    expect(bubble.queryByText("فريق إرث")).toBeNull();
  }
  const staff = within(v.getByText("sequence staff").closest("li")!);
  expect(staff.getByText("فريق إرث")).toBeTruthy();
  expect(staff.queryByText("أنت")).toBeNull();
});
it("retires loaded messages and draft when identity changes", async () => {
  api.get.mockImplementation(async () => ({
    issue: issue(),
    messages: [message("a", "alice", "old private text")],
  }));
  const v = render(<Thread />);
  await v.findByText("old private text");
  fireEvent.change(v.getByLabelText("نص الرد"), { target: { value: "unsent draft" } });
  api.get.mockResolvedValue({ issue: { ...issue(), reporter_id: "bob" }, messages: [] });
  act(() => setActiveOwnerInternal("user:bob"));
  await waitFor(() => expect(v.queryByText("old private text")).toBeNull());
  await waitFor(() => expect((v.getByLabelText("نص الرد") as HTMLTextAreaElement).value).toBe(""));
  expect(api.reply).not.toHaveBeenCalled();
});
it("isolates deep-linked thread navigation while keeping route ID in calls", async () => {
  api.get.mockImplementation(async (id: string) => ({
    issue: { ...issue(), id },
    messages: [message(id, "alice", id)],
  }));
  const v = render(<Thread />);
  await v.findByText("thread-one");
  fireEvent.change(v.getByLabelText("نص الرد"), { target: { value: "draft-one" } });
  api.threadId = "thread-two";
  v.rerender(<Thread />);
  await v.findByText("thread-two");
  expect(v.queryByText("thread-one")).toBeNull();
  expect((v.getByLabelText("نص الرد") as HTMLTextAreaElement).value).toBe("");
  expect(api.read).toHaveBeenLastCalledWith("thread-two");
});

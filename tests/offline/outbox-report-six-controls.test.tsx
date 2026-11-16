import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ReportCommentButton } from "@/components/social/ReportCommentButton";
import {
  REPORT_CONTROL_MESSAGES as dictionaries,
  reportErrorCopy,
} from "@/lib/ui-language/report-control-messages";
import { TARGET_LOCALES, type AppLocale } from "@/lib/ui-language/locale-policy";
import { REPORT_REASONS, reportErrorCopyAr } from "@/lib/social/reports";
import { UI_MESSAGES } from "@/lib/ui-language/messages";
const state = vi.hoisted(() => ({
  locale: "en" as AppLocale,
  online: true,
  report: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
}));
vi.mock("@/lib/ui-language/store", () => ({
  useUiLanguage: () => ({
    language: state.locale,
    direction: ["ar", "ur"].includes(state.locale) ? "rtl" : "ltr",
  }),
}));
vi.mock("@/hooks/useOnline", () => ({ useOnline: () => state.online }));
vi.mock("sonner", () => ({
  toast: { info: state.info, error: state.error, success: state.success },
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/social/reports", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/social/reports")>()),
  reportComment: state.report,
}));
vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverContent: ({ children, dir }: { children: ReactNode; dir: string }) => (
    <section dir={dir}>{children}</section>
  ),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  state.locale = "en";
  state.online = true;
});
const show = (currentUserId: string | null = "reader", authorId = "author") =>
  render(<ReportCommentButton commentId="c1" currentUserId={currentUserId} authorId={authorId} />);
it("covers 19 labels and keeps target languages gated", () => {
  const keys = Object.keys(dictionaries.ar).sort();
  expect(keys).toHaveLength(19);
  for (const locale of TARGET_LOCALES) {
    expect(Object.keys(dictionaries[locale]).sort()).toEqual(keys);
    for (const text of Object.values(dictionaries[locale])) expect(text.trim()).toBeTruthy();
  }
  expect(Object.keys(UI_MESSAGES).sort()).toEqual(["ar", "en"]);
});
it("preserves every Arabic error and frozen report reason label/order", () => {
  expect(REPORT_REASONS.map((x) => x.value)).toEqual([
    "spam",
    "harassment",
    "off_topic",
    "misinformation",
    "inappropriate",
    "other",
  ]);
  for (const reason of REPORT_REASONS) expect(dictionaries.ar[reason.value]).toBe(reason.labelAr);
  for (const code of [
    "auth_required",
    "cannot_report_own",
    "rate_limited",
    "not_found",
    "note_too_long",
    "unknown",
    undefined,
    "future",
  ])
    expect(reportErrorCopy("ar", code)).toBe(reportErrorCopyAr(code));
  expect(reportErrorCopy("en", "future")).toBe("Could not send the report.");
});
it("hides reporting for anonymous users and the original author", () => {
  const { unmount } = show(null);
  expect(screen.queryByRole("button")).toBeNull();
  unmount();
  show("author");
  expect(screen.queryByRole("button")).toBeNull();
  expect(state.report).not.toHaveBeenCalled();
});
it("offline reporting does not submit", () => {
  state.online = false;
  show();
  fireEvent.click(screen.getByText("Spam or advertising"));
  expect(state.report).not.toHaveBeenCalled();
  expect(state.info).toHaveBeenCalledWith(dictionaries.en.offline);
});
it("submits original note text with unchanged trim and reason value, not translated copy", async () => {
  state.report.mockResolvedValue({ ok: true });
  show();
  fireEvent.click(screen.getByText("Add an optional note"));
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "  نص اللاعب original  " } });
  fireEvent.click(screen.getByText("Inaccurate information"));
  await waitFor(() =>
    expect(state.report).toHaveBeenCalledWith("c1", "misinformation", "نص اللاعب original"),
  );
  await waitFor(() => expect(state.success).toHaveBeenCalledWith(dictionaries.en.success));
});
it("keeps the 500-character note limit and error result without exposing moderation status", async () => {
  state.report.mockResolvedValue({ ok: false, reason: "rate_limited" });
  show();
  fireEvent.click(screen.getByText("Add an optional note"));
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "x".repeat(501) } });
  expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toHaveLength(500);
  fireEvent.click(screen.getByText("Other reason"));
  await waitFor(() => expect(state.error).toHaveBeenCalledWith(dictionaries.en.rate_limited));
  expect(state.success).not.toHaveBeenCalled();
});
it("sets direction correctly in both Urdu and French", () => {
  state.locale = "ur";
  const { container, unmount } = show();
  expect(container.querySelector("section")?.getAttribute("dir")).toBe("rtl");
  unmount();
  state.locale = "fr";
  const result = show();
  expect(result.container.querySelector("section")?.getAttribute("dir")).toBe("ltr");
});

it("disables reason buttons while a report is pending", async () => {
  let finish: (value: { ok: boolean }) => void = () => {};
  state.report.mockImplementationOnce(
    () =>
      new Promise<{ ok: boolean }>((resolve) => {
        finish = resolve;
      }),
  );
  show();
  const button = screen.getByText("Spam or advertising") as HTMLButtonElement;
  fireEvent.click(button);
  expect(button.disabled).toBe(true);
  fireEvent.click(screen.getByText("Other reason"));
  expect(state.report).toHaveBeenCalledTimes(1);
  finish({ ok: true });
  await waitFor(() => expect(state.success).toHaveBeenCalledWith(dictionaries.en.success));
});

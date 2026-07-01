import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type FeedbackPresenceRole = "player" | "admin";

interface PresenceState {
  role: FeedbackPresenceRole;
  online_at: number;
  typing_at?: number;
  user_id?: string;
}

interface Options {
  issueId: string;
  role: FeedbackPresenceRole;
  userId?: string | null;
  enabled?: boolean;
}

interface Result {
  otherOnline: boolean;
  otherTyping: boolean;
  markTyping: () => void;
}

const TYPING_TIMEOUT_MS = 4000;
const ONLINE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Realtime presence for a feedback conversation thread.
 * Tracks the "other" party's online + typing state.
 */
export function useFeedbackPresence({ issueId, role, userId, enabled = true }: Options): Result {
  const [otherOnline, setOtherOnline] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastTypingSentRef = useRef<number>(0);
  const typingClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const otherRole: FeedbackPresenceRole = role === "player" ? "admin" : "player";

  useEffect(() => {
    if (!enabled || !issueId) return;

    const channel = supabase.channel(`feedback-presence:${issueId}`, {
      config: { presence: { key: `${role}:${userId ?? "anon"}` } },
    });
    channelRef.current = channel;

    const computeOther = () => {
      const state = channel.presenceState() as Record<string, PresenceState[]>;
      const now = Date.now();
      let online = false;
      let typing = false;
      for (const entries of Object.values(state)) {
        for (const p of entries ?? []) {
          if (p.role !== otherRole) continue;
          if (p.online_at && now - p.online_at < ONLINE_WINDOW_MS) online = true;
          if (p.typing_at && now - p.typing_at < TYPING_TIMEOUT_MS) typing = true;
        }
      }
      setOtherOnline(online);
      setOtherTyping(typing);
    };

    channel
      .on("presence", { event: "sync" }, computeOther)
      .on("presence", { event: "join" }, computeOther)
      .on("presence", { event: "leave" }, computeOther)
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ role, online_at: Date.now(), user_id: userId ?? null } satisfies PresenceState);
        }
      });

    // Heartbeat: keep online_at fresh so the 5-minute window rolls forward.
    const heartbeat = setInterval(() => {
      void channel.track({ role, online_at: Date.now(), user_id: userId ?? null } satisfies PresenceState);
      computeOther();
    }, 30_000);

    // Recompute periodically so typing expires visually without new events.
    const tick = setInterval(computeOther, 1500);

    return () => {
      clearInterval(heartbeat);
      clearInterval(tick);
      if (typingClearTimerRef.current) clearTimeout(typingClearTimerRef.current);
      void channel.untrack();
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [issueId, role, otherRole, userId, enabled]);

  const markTyping = useMemo(
    () => () => {
      const channel = channelRef.current;
      if (!channel) return;
      const now = Date.now();
      // Throttle to at most one presence update per 1.5s.
      if (now - lastTypingSentRef.current < 1500) return;
      lastTypingSentRef.current = now;
      void channel.track({
        role,
        online_at: now,
        typing_at: now,
        user_id: userId ?? null,
      } satisfies PresenceState);

      if (typingClearTimerRef.current) clearTimeout(typingClearTimerRef.current);
      typingClearTimerRef.current = setTimeout(() => {
        void channel.track({ role, online_at: Date.now(), user_id: userId ?? null } satisfies PresenceState);
      }, TYPING_TIMEOUT_MS);
    },
    [role, userId],
  );

  return { otherOnline, otherTyping, markTyping };
}

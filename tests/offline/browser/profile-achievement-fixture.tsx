/** Actual Profile route and projection; isolated synthetic backend boundary. */
import React from "react";
import { createRoot } from "react-dom/client";
import { Route } from "@/routes/profile";
import { setActiveOwnerInternal } from "@/lib/identity/owner";
import { setUiLanguage } from "@/lib/ui-language/store";
import { resetAchievementEngine, getSnapshot, getPersisted } from "@/lib/achievements/v2/engine";
import { state } from "./profile-achievement-boundary";
import "@/styles.css";
const Page = Route.options.component as React.ComponentType;
setActiveOwnerInternal(`user:${state.uid}`);
const api = {
  state,
  setLanguage: setUiLanguage,
  collectTen() {
    state.owned = 10;
    window.dispatchEvent(new Event("irth:collection:changed"));
  },
  async changeOwner() {
    state.uid = "synthetic-profile-bob";
    state.owned = 0;
    state.claimed = false;
    setActiveOwnerInternal(`user:${state.uid}`);
    await resetAchievementEngine(state.uid);
  },
  async claimedOwner() {
    state.uid = "synthetic-profile-carol";
    state.owned = 10;
    state.claimed = true;
    setActiveOwnerInternal(`user:${state.uid}`);
    await resetAchievementEngine(state.uid);
  },
  snapshot() {
    return {
      museum: getSnapshot().museum.totalOwned,
      receipts: getPersisted().size,
      mutations: state.mutations,
      reads: state.reads,
    };
  },
};
Object.assign(window, { profileAchievement: api });
createRoot(document.getElementById("app")!).render(<Page />);

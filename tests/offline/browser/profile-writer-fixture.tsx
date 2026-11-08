// Native diagnostic: real provider/partition, synthetic data, no account transport.
import React, { useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { ProfileProvider, useProfile } from "@/lib/profile";
import { getActiveOwner, setActiveOwnerInternal } from "@/lib/identity/owner";
import { installIdentityPartition } from "@/lib/identity/partition";
const w = window as any;
setActiveOwnerInternal("user:alice");
installIdentityPartition();
function seed(points: number) {
  localStorage.setItem(
    "hakaya.profile.v2",
    JSON.stringify({
      name: "synthetic",
      loggedIn: true,
      points,
      dinars: 500,
      hearts: 3,
      heartsAt: Date.now(),
    }),
  );
}
if (localStorage.getItem("hakaya.profile.v2") === null) seed(100);
w.before = localStorage.getItem("hakaya.profile.v2");
w.switchAt = null;
function Probe() {
  const api = useProfile();
  w.profileApi = api;
  useLayoutEffect(() => {
    if (api.profile.points === w.switchAt) {
      w.switchAt = null;
      setActiveOwnerInternal("user:bob");
      seed(200);
      window.dispatchEvent(new CustomEvent("irth:identity-changed"));
    }
  }, [api.profile.points]);
  useLayoutEffect(() => {
    if (api.hydrated) w.ready = true;
  }, [api.hydrated]);
  return null;
}
w.diag = {
  owner: getActiveOwner,
  switchAlice: () => {
    setActiveOwnerInternal("user:alice");
    window.dispatchEvent(new CustomEvent("irth:identity-changed"));
  },
  stored: () => JSON.parse(localStorage.getItem("hakaya.profile.v2")!),
};
createRoot(document.getElementById("app")!).render(
  <ProfileProvider>
    <Probe />
  </ProfileProvider>,
);

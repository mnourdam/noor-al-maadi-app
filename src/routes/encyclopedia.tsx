import { createFileRoute, Outlet } from "@tanstack/react-router";
import { EncyclopediaUpdateBanner } from "@/components/EncyclopediaUpdateBanner";

export const Route = createFileRoute("/encyclopedia")({
  component: EncyclopediaLayout,
});

function EncyclopediaLayout() {
  return (
    <>
      <div className="mx-auto w-full max-w-3xl px-3 pt-3 sm:px-6">
        <EncyclopediaUpdateBanner />
      </div>
      <Outlet />
    </>
  );
}

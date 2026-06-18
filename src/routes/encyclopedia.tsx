import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/encyclopedia")({
  component: Outlet,
});
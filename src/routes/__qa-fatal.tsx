import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/__qa-fatal")({
  component: () => { throw new Error("QA simulated fatal from Investigations→Home"); },
});

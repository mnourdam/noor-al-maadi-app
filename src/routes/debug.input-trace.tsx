import { createFileRoute } from "@tanstack/react-router";
import { InputTraceDebugView } from "../components/InputTraceDebugView";

export const Route = createFileRoute("/debug/input-trace")({
  head: () => ({ meta: [{ title: "Input Trace — Irth" }] }),
  component: InputTraceDebugView,
});

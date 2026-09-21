import { createFileRoute, Navigate } from "@tanstack/react-router";
// This index renders inside the support PluginGuard; the destination retains its own access guard.
export const Route = createFileRoute("/_authenticated/_admin/support/")({
  component: () => <Navigate to="/support/analytics" replace />,
});

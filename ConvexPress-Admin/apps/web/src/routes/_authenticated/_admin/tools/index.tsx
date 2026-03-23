/**
 * Tools Index - Redirects to Activity Log
 */

import { Navigate, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/_admin/tools/")({
  component: ToolsIndex,
});

function ToolsIndex() {
  return <Navigate to="/tools/activity" />;
}

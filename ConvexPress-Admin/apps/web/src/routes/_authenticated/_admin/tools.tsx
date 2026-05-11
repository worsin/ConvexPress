/**
 * Tools Layout Route
 *
 * Parent layout route for all tools pages (blueprint management).
 * Renders an Outlet for child routes.
 */

import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/_admin/tools")({
  component: ToolsLayout,
});

function ToolsLayout() {
  return <Outlet />;
}

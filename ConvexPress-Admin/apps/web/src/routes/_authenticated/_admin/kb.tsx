/**
 * KB Layout Route
 *
 * Parent layout route for all Knowledge Base pages.
 * Provides an error boundary so KB route failures don't crash the entire admin.
 */

import { Outlet, createFileRoute } from "@tanstack/react-router";
import { ErrorTemplate } from "@/templates/ErrorTemplate";

export const Route = createFileRoute("/_authenticated/_admin/kb")({
  component: KBLayout,
  errorComponent: ErrorTemplate,
});

function KBLayout() {
  return <Outlet />;
}

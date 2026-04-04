/**
 * Help Layout Route
 *
 * Parent layout route for all Help Center pages.
 * Provides an error boundary so help route failures don't crash the entire website.
 */

import { Outlet, createFileRoute } from "@tanstack/react-router";
import { ErrorTemplate } from "@/templates/ErrorTemplate";

export const Route = createFileRoute("/_marketing/help")({
  component: HelpLayout,
  errorComponent: ErrorTemplate,
});

function HelpLayout() {
  return <Outlet />;
}

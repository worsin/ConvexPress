/**
 * Custom Fields Layout Route
 *
 * Parent layout route for all custom field pages.
 * Renders an Outlet for child routes.
 */

import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/_admin/custom-fields")({
  component: CustomFieldsLayout,
});

function CustomFieldsLayout() {
  return <Outlet />;
}
